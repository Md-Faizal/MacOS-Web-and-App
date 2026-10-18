/**
 * Document Vault AI Engine
 * Provides:
 * 1. Zero-cost OCR & digital text extraction (PDFParse + Gemini Multimodal Vision)
 * 2. Auto-tagging & Executive Summary generation
 * 3. Smart virtual directory routing / auto-sorting
 * 4. In-Viewer conversational Copilot with citations
 * 5. SQLite FTS5 Full-Text Search integration
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFParse } = require('pdf-parse');

const GEMINI_API_KEY = 'AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Extract text from document file or structured content_json
 */
async function extractDocumentText(doc) {
  let extracted = '';

  // 1. If physical file exists
  if (doc.file_path) {
    const fullPath = path.isAbsolute(doc.file_path)
      ? doc.file_path
      : path.resolve(__dirname, '../../../../', doc.file_path);

    if (fs.existsSync(fullPath)) {
      const ext = path.extname(fullPath).toLowerCase();

      if (ext === '.pdf') {
        try {
          const buf = fs.readFileSync(fullPath);
          const parser = new PDFParse({ data: buf });
          const res = await parser.getText();
          await parser.destroy();
          if (res && res.text && res.text.trim().length > 50) {
            extracted = res.text.trim();
          }
        } catch (_) {}

        // If digital extract was empty/too small, file might be a scan.
        // Fallback to Gemini Multimodal Vision if needed
        if (!extracted || extracted.length < 50) {
          try {
            const buf = fs.readFileSync(fullPath);
            const base64Data = buf.toString('base64');
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const ocrResult = await model.generateContent([
              'Extract all readable text, titles, numbers, and dates from this document scan accurately. Return plain text.',
              { inlineData: { data: base64Data, mimeType: 'application/pdf' } }
            ]);
            extracted = ocrResult.response.text();
          } catch (_) {}
        }
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        try {
          const buf = fs.readFileSync(fullPath);
          const base64Data = buf.toString('base64');
          const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const ocrResult = await model.generateContent([
            'Extract all readable text, headings, names, dates, and numbers from this document scan. Return plain text.',
            { inlineData: { data: base64Data, mimeType } }
          ]);
          extracted = ocrResult.response.text();
        } catch (_) {}
      }
    }
  }

  // 2. If content_json exists (e.g. letters, drafted templates)
  if (!extracted && doc.content_json) {
    try {
      const c = typeof doc.content_json === 'string' ? JSON.parse(doc.content_json) : doc.content_json;
      const parts = [];
      if (c.subject) parts.push(`Subject: ${c.subject}`);
      if (c.salutation) parts.push(c.salutation);
      if (Array.isArray(c.paragraphs)) parts.push(...c.paragraphs);
      if (Array.isArray(c.clauses)) parts.push(...c.clauses.map(cl => `${cl.title || ''}: ${cl.body || ''}`));
      if (c.closing) parts.push(c.closing);
      extracted = parts.join('\n\n');
    } catch (_) {}
  }

  // 3. Fallback header text
  if (!extracted || extracted.length < 20) {
    extracted = [
      `Reference No: ${doc.doc_ref_no || 'N/A'}`,
      `Title: ${doc.title || 'Untitled'}`,
      `Department: ${doc.department || 'General'}`,
      `Subject: ${doc.subject || 'N/A'}`,
      `Sender: ${doc.sender_party || 'N/A'}`,
      `Recipient: ${doc.recipient_party || 'N/A'}`,
      `Issue Date: ${doc.issue_date || 'N/A'}`
    ].join('\n');
  }

  return extracted;
}

/**
 * Analyze document with Gemini 2.5 Flash: Auto-Tag, Executive Summary & Auto-Sort
 */
async function analyzeDocument(db, docId) {
  const doc = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?').get(docId);
  if (!doc) throw new Error('Document not found');

  const text = await extractDocumentText(doc);
  const truncatedText = text.substring(0, 12000); // Plenty for accurate classification

  // Fetch available directory slugs for folder suggestion
  const dirs = db.prepare('SELECT id, name, slug FROM vault_directories').all();
  const dirChoices = dirs.map(d => `"${d.slug}" (${d.name})`).join(', ');

  const prompt = `You are an elite statutory compliance and corporate legal AI for Utkal Chemical Aushadhalaya (Ayurvedic Pharmaceuticals).
Analyze the following document and output ONLY valid JSON (no markdown formatting, no code blocks):
{
  "summary": "2 to 3 concise, authoritative sentences detailing the document purpose, involved parties, statutory regulations cited (e.g. Rule 157, Form 25, Schedule T), and legal/operational effect.",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4"], // 3 to 6 high-precision tags (e.g. 'Schedule T', 'GMP Renewal', 'Form 25', 'Statutory License', 'HR')
  "suggested_folder_slug": "best matching slug from: [${dirChoices}]"
}

DOCUMENT TEXT:
${truncatedText}`;

  let summary = '';
  let tags = [];
  let suggestedSlug = '';

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      summary = parsed.summary || '';
      tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      suggestedSlug = parsed.suggested_folder_slug || '';
    }
  } catch (err) {
    console.warn(`[Vault AI] Gemini analysis fallback for doc #${docId}:`, err.message);
    summary = `${doc.title}. Ref: ${doc.doc_ref_no}. Issued on ${doc.issue_date || 'N/A'} for ${doc.department} compliance.`;
    tags = [doc.department || 'Corporate', doc.doc_type || 'DOCUMENT', 'Verified'];
  }

  // Resolve suggested_dir_id
  let suggestedDirId = null;
  if (suggestedSlug) {
    const matched = dirs.find(d => d.slug === suggestedSlug || d.name.toLowerCase().includes(suggestedSlug.toLowerCase()));
    if (matched) suggestedDirId = matched.id;
  }
  if (!suggestedDirId && dirs.length > 0) {
    suggestedDirId = dirs[0].id;
  }

  const tagsJson = JSON.stringify(tags);

  // Update DB
  db.prepare(`
    UPDATE company_vault_documents
    SET ai_summary = ?,
        tags = ?,
        suggested_dir_id = ?,
        extracted_text = ?,
        ai_processed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(summary, tagsJson, suggestedDirId, text, docId);

  // Sync into SQLite FTS5 table
  try {
    db.prepare('DELETE FROM vault_doc_fts WHERE doc_id = ?').run(docId);
    db.prepare(`
      INSERT INTO vault_doc_fts (doc_id, title, doc_ref_no, department, tags, ai_summary, extracted_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, doc.title, doc.doc_ref_no, doc.department, tagsJson, summary, text);
  } catch (_) {}

  const suggestedFolder = dirs.find(d => d.id === suggestedDirId);

  return {
    success: true,
    doc_id: docId,
    ai_summary: summary,
    tags,
    suggested_dir_id: suggestedDirId,
    suggested_folder_name: suggestedFolder ? suggestedFolder.name : null
  };
}

/**
 * Conversational AI Copilot for a specific document
 */
async function chatWithDocument(db, docId, question, history = []) {
  const doc = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?').get(docId);
  if (!doc) throw new Error('Document not found');

  const text = doc.extracted_text || await extractDocumentText(doc);
  const truncatedText = text.substring(0, 15000);

  const systemContext = `You are the AI Document Copilot inside the 3-Column macOS Document Viewer for Utkal Chemical Aushadhalaya.
You are assisting an executive inquiring about the following official document:
TITLE: ${doc.title}
REF NO: ${doc.doc_ref_no}
DATE: ${doc.issue_date || 'N/A'}
DEPARTMENT: ${doc.department || 'General'}
SENDER: ${doc.sender_party || 'N/A'}
RECIPIENT: ${doc.recipient_party || 'N/A'}
AI EXECUTIVE SUMMARY: ${doc.ai_summary || 'N/A'}

DOCUMENT FULL TEXT:
${truncatedText}

INSTRUCTIONS:
1. Provide authoritative, concise, and professional answers.
2. Directly cite clauses, numbers, page numbers (if visible), and effective dates.
3. If the user asks for summaries, extract key obligations, liabilities, or deadlines as bullet points.
4. If the question cannot be answered from this document, state that clearly and suggest where to look.`;

  // Format conversational prompt
  let promptHistory = '';
  if (Array.isArray(history) && history.length > 0) {
    promptHistory = '\nCONVERSATION HISTORY:\n' + history.map(h => `${h.role === 'user' ? 'User' : 'Copilot'}: ${h.text}`).join('\n') + '\n';
  }

  const fullPrompt = `${systemContext}\n${promptHistory}\nCURRENT USER QUESTION:\n${question}\n\nCopilot Response:`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(fullPrompt);
    const answer = result.response.text();

    return {
      success: true,
      doc_id: docId,
      answer,
      doc_ref_no: doc.doc_ref_no,
      title: doc.title
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      answer: `Unable to consult AI Copilot right now (${err.message}). Summary: ${doc.ai_summary || doc.title}`
    };
  }
}

/**
 * Full-Text Search using SQLite FTS5 with Snippet Highlights
 */
function searchVaultFts(db, query, limit = 10) {
  if (!query || !query.trim()) return [];

  // Sanitize query for FTS5 (strip punctuation that breaks MATCH)
  const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(' OR ');

  if (!cleanQuery) return [];

  try {
    const sql = `
      SELECT doc.*, d.name as directory_name,
             snippet(vault_doc_fts, 5, '<mark>', '</mark>', '...', 25) as summary_match,
             snippet(vault_doc_fts, 6, '<mark>', '</mark>', '...', 35) as text_match
      FROM vault_doc_fts fts
      JOIN company_vault_documents doc ON doc.id = fts.doc_id
      LEFT JOIN vault_directories d ON d.id = doc.dir_id
      WHERE vault_doc_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

    return db.prepare(sql).all(cleanQuery, limit);
  } catch (err) {
    console.warn('[Vault AI FTS5 Search Error]:', err.message);
    // Fallback to LIKE
    const term = `%${query.trim()}%`;
    return db.prepare(`
      SELECT doc.*, d.name as directory_name
      FROM company_vault_documents doc
      LEFT JOIN vault_directories d ON d.id = doc.dir_id
      WHERE doc.title LIKE ? OR doc.doc_ref_no LIKE ? OR doc.subject LIKE ? OR doc.ai_summary LIKE ?
      LIMIT ?
    `).all(term, term, term, term, limit);
  }
}

/**
 * Auto-sort a document to its suggested directory
 */
function autoSortDocument(db, docId) {
  const doc = db.prepare('SELECT id, dir_id, suggested_dir_id FROM company_vault_documents WHERE id = ?').get(docId);
  if (!doc) throw new Error('Document not found');
  if (!doc.suggested_dir_id) throw new Error('No suggested directory calculated for this document');

  db.prepare(`
    UPDATE company_vault_documents
    SET dir_id = suggested_dir_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(docId);

  const targetDir = db.prepare('SELECT id, name FROM vault_directories WHERE id = ?').get(doc.suggested_dir_id);

  return {
    success: true,
    doc_id: docId,
    new_dir_id: doc.suggested_dir_id,
    directory_name: targetDir ? targetDir.name : null
  };
}

/**
 * Batch auto-sort all unorganized documents that have a suggested_dir_id
 */
function autoSortAllPending(db) {
  const pending = db.prepare(`
    SELECT id, suggested_dir_id 
    FROM company_vault_documents 
    WHERE (dir_id IS NULL OR dir_id = 0) AND suggested_dir_id IS NOT NULL
  `).all();

  const updateStmt = db.prepare('UPDATE company_vault_documents SET dir_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  let moved = 0;

  pending.forEach(p => {
    updateStmt.run(p.suggested_dir_id, p.id);
    moved++;
  });

  return { success: true, count: moved };
}

module.exports = {
  extractDocumentText,
  analyzeDocument,
  chatWithDocument,
  searchVaultFts,
  autoSortDocument,
  autoSortAllPending
};
