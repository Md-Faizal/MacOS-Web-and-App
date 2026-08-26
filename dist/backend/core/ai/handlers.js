/**
 * AI Assistant Handlers using Google Gemini
 * Handles natural language queries and database interactions
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getAIContextString, generateDatabaseContext } = require('./db-context');

const GEMINI_API_KEY = 'AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Available models - from actual API listModels response
const AVAILABLE_MODELS = {
  'gemini-2.5-flash': 'gemini-2.5-flash',           // Latest, fastest
  'gemini-2.5-pro': 'gemini-2.5-pro',               // Smartest
  'gemini-2.0-flash': 'gemini-2.0-flash',           // Legacy
  'gemini-2.0-flash-001': 'gemini-2.0-flash-001',   // Legacy variant
  'gemini-2.0-flash-lite': 'gemini-2.0-flash-lite', // Lightweight
  'gemini-2.0-flash-lite-001': 'gemini-2.0-flash-lite-001', // Lightweight variant
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite', // Latest lightweight
  // Backward compatibility mappings
  'gemini-pro-vision': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-flash',
  'gemini-1.5-flash': 'gemini-2.5-flash'
};

// Conversation history for context
const conversationHistory = new Map();

module.exports = function(db) {
  return {
    /**
     * Main AI query handler
     * Processes natural language queries using Gemini
     */
    processAIQuery: async (req, res) => {
      try {
        const { query, sessionId = 'default', useContext = true, model = 'gemini-2.5-flash' } = req.body;

        if (!query || query.trim().length === 0) {
          return res.status(400).json({ 
            error: 'Query cannot be empty',
            response: ''
          });
        }

        // Get actual model name (handle old names)
        const actualModel = AVAILABLE_MODELS[model] || 'gemini-2.5-flash';

        // Get or initialize conversation history
        if (!conversationHistory.has(sessionId)) {
          conversationHistory.set(sessionId, []);
        }
        const history = conversationHistory.get(sessionId);

        try {
          // Get model instance
          const aiModel = genAI.getGenerativeModel({ model: actualModel });

          // Build the prompt with context
          let prompt = query;
          
          if (useContext) {
            const dbContext = generateDatabaseContext(db);
            const contextInfo = JSON.stringify(dbContext, null, 2);
            
            prompt = `[INSTRUCTIONS]
You are a helpful business assistant. You have access to a SQLite database. 
If the user's question requires querying, analyzing, or summarizing data from the database, you MUST write a single SQLite query inside a \`\`\`sqlite ... \`\`\` code block in your response. 
The system will run this query automatically and feed the results back to you so you can provide a friendly, data-driven answer. 
Write the query exactly, using the correct table and column names from the context. Do not use placeholders.

[DATABASE CONTEXT]
${contextInfo}

[USER QUERY]
${query}`;
          }

          // Build chat with history
          const chat = aiModel.startChat({
            history: history.map(msg => ({
              role: msg.role,
              parts: [{ text: msg.content }]
            }))
          });

          // Send message to Gemini
          const result = await chat.sendMessage(prompt);
          let responseText = result.response.text();
          let executedQuery = null;
          let queryResults = null;
          let queryError = null;

          // Check if response contains sqlite block
          const sqlRegex = /```sqlite\s*([\s\S]*?)\s*```/i;
          const match = responseText.match(sqlRegex);

          if (match) {
            executedQuery = match[1].trim();
            try {
              queryResults = db.prepare(executedQuery).all();
              
              // Send results back to Gemini for natural language summary
              const secondPrompt = `Here are the results of the query:\n${JSON.stringify(queryResults, null, 2)}\n\nPlease summarize these results and provide a friendly response to the user's original query. Do not output the SQL query again in your text response.`;
              const secondResult = await chat.sendMessage(secondPrompt);
              responseText = secondResult.response.text();
            } catch (dbError) {
              console.error('Database query execution failed:', dbError.message);
              queryError = dbError.message;
              
              // Feed error back to Gemini for explanation
              const secondPrompt = `The SQLite query failed with the following error: "${dbError.message}". Please explain this error or suggest a fix to the user.`;
              const secondResult = await chat.sendMessage(secondPrompt);
              responseText = secondResult.response.text();
            }
          }

          // Store in history
          history.push({
            role: 'user',
            content: query
          });
          history.push({
            role: 'model',
            content: responseText
          });

          // Keep history to last 20 exchanges to manage memory
          if (history.length > 40) {
            history.splice(0, 20);
          }

          res.json({
            success: true,
            response: responseText,
            query: executedQuery,
            results: queryResults,
            error: queryError,
            sessionId: sessionId,
            timestamp: new Date().toISOString()
          });

        } catch (geminiError) {
          console.error('Gemini API Error:', geminiError.message);
          
          // Check for quota/rate limit errors
          const isQuotaError = geminiError.message && (
            geminiError.message.includes('429') || 
            geminiError.message.includes('quota') ||
            geminiError.message.includes('exceeded')
          );
          
          const statusCode = isQuotaError ? 429 : 500;
          const errorMessage = isQuotaError 
            ? 'API quota or rate limit exceeded. Please try again in a moment.'
            : 'Sorry, I encountered an error processing your request. Please try again.';
          
          res.status(statusCode).json({
            error: 'AI processing error',
            response: errorMessage,
            details: geminiError.message
          });
        }

      } catch (error) {
        console.error('Query processing error:', error);
        res.status(500).json({
          error: 'Internal server error',
          response: 'An unexpected error occurred',
          details: error.message
        });
      }
    },

    /**
     * Database query handler
     * Generates SQL queries from natural language using AI
     */
    generateQuery: async (req, res) => {
      try {
        const { description, model: selectedModel = 'gemini-2.5-flash' } = req.body;

        if (!description || description.trim().length === 0) {
          return res.status(400).json({ 
            error: 'Description cannot be empty'
          });
        }

        const actualModel = AVAILABLE_MODELS[selectedModel] || 'gemini-2.5-flash';
        const aiModel = genAI.getGenerativeModel({ model: actualModel });

        const dbContext = generateDatabaseContext(db);
        
        const prompt = `Based on this database schema: ${JSON.stringify(dbContext, null, 2)}
        
Generate only a SQL query (and nothing else) for: "${description}"

Rules:
- Return ONLY the SQL statement
- Use SQLite syntax
- Do not include backticks or markdown
- Ensure the query is valid`;

        const result = await aiModel.generateContent(prompt);
        const sqlQuery = result.response.text().trim();

        // Execute the generated query
        try {
          const results = db.prepare(sqlQuery).all();
          res.json({
            success: true,
            query: sqlQuery,
            results: results,
            rowCount: results.length
          });
        } catch (dbError) {
          res.status(400).json({
            success: false,
            query: sqlQuery,
            error: 'Query execution failed',
            details: dbError.message
          });
        }

      } catch (error) {
        console.error('Query generation error:', error);
        
        // Check for quota/rate limit errors
        const isQuotaError = error.message && (
          error.message.includes('429') || 
          error.message.includes('quota') ||
          error.message.includes('exceeded')
        );
        
        const statusCode = isQuotaError ? 429 : 500;
        
        res.status(statusCode).json({
          error: isQuotaError ? 'API quota or rate limit exceeded' : 'Query generation error',
          details: error.message
        });
      }
    },

    /**
     * Get data insights
     * Analyzes data and provides business insights
     */
    getInsights: async (req, res) => {
      try {
        const { type = 'general', model: selectedModel = 'gemini-2.5-flash' } = req.query;

        const actualModel = AVAILABLE_MODELS[selectedModel] || 'gemini-2.5-flash';
        const aiModel = genAI.getGenerativeModel({ model: actualModel });

        let analysisPrompt = '';
        let data = {};

        switch(type) {
          case 'sales':
            data = db.prepare(`
              SELECT 
                COUNT(*) as total_orders,
                SUM(total) as total_revenue,
                AVG(total) as avg_order_value,
                MAX(created_at) as latest_order
              FROM orders
            `).get() || {};
            analysisPrompt = `Analyze these sales metrics and provide insights: ${JSON.stringify(data)}`;
            break;

          case 'products':
            data = db.prepare(`
              SELECT 
                COUNT(*) as total_products,
                AVG(quantity) as avg_stock,
                SUM(quantity) as total_inventory,
                COUNT(CASE WHEN quantity < 10 THEN 1 END) as low_stock_items
              FROM products
            `).get() || {};
            analysisPrompt = `Analyze these inventory metrics and suggest improvements: ${JSON.stringify(data)}`;
            break;

          case 'customers':
            data = db.prepare(`
              SELECT 
                COUNT(*) as total_customers,
                COUNT(DISTINCT customer_id) as unique_buyers,
                AVG(purchase_count) as avg_purchases
              FROM (
                SELECT customer_id, COUNT(*) as purchase_count FROM orders GROUP BY customer_id
              )
            `).get() || {};
            analysisPrompt = `Analyze these customer metrics: ${JSON.stringify(data)}`;
            break;

          default:
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            analysisPrompt = `Provide general business insights about this application with these tables: ${tables.map(t => t.name).join(', ')}`;
        }

        const result = await aiModel.generateContent(analysisPrompt);
        const insights = result.response.text();

        res.json({
          success: true,
          type: type,
          data: data,
          insights: insights,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Insights generation error:', error);
        
        // Check for quota/rate limit errors
        const isQuotaError = error.message && (
          error.message.includes('429') || 
          error.message.includes('quota') ||
          error.message.includes('exceeded')
        );
        
        const statusCode = isQuotaError ? 429 : 500;
        
        res.status(statusCode).json({
          error: isQuotaError ? 'API quota or rate limit exceeded' : 'Failed to generate insights',
          details: error.message
        });
      }
    },

    /**
     * Clear conversation history for a session
     */
    clearHistory: (req, res) => {
      const { sessionId = 'default' } = req.body;
      conversationHistory.delete(sessionId);
      res.json({
        success: true,
        message: 'Conversation history cleared',
        sessionId: sessionId
      });
    },

    /**
     * Process Camera Snapshot to Identify Product/Variant/Batch
     */
    processVisionIdentification: async (req, res) => {
      try {
        const { image, mode = 'pos', contextHint = '' } = req.body;

        if (!image) {
          return res.status(400).json({
            success: false,
            error: 'Image payload is required'
          });
        }

        // Fetch compact product & variant catalog context from DB
        let catalogContext = [];
        try {
          if (db && typeof db.prepare === 'function') {
            const productsStmt = db.prepare(`
              SELECT p.id, p.name, p.sku, p.category,
                     v.id as variant_id, v.name as variant_name, v.sku as variant_sku
              FROM products p
              LEFT JOIN variants v ON v.product_id = p.id
              LIMIT 200
            `);
            const rows = productsStmt.all();
            
            // Map rows into nested product-variant format
            const catalogMap = new Map();
            rows.forEach(row => {
              if (!catalogMap.has(row.id)) {
                catalogMap.set(row.id, {
                  id: row.id,
                  name: row.name,
                  sku: row.sku,
                  category: row.category,
                  variants: []
                });
              }
              if (row.variant_id) {
                catalogMap.get(row.id).variants.push({
                  id: row.variant_id,
                  name: row.variant_name,
                  sku: row.variant_sku
                });
              }
            });
            catalogContext = Array.from(catalogMap.values());
          }
        } catch (dbError) {
          console.warn('[Vision API] Catalog fetch fallback:', dbError.message);
        }

        const visionService = require('./vision-service');
        const visionResult = await visionService.identifyProductImage(image, catalogContext, { mode, contextHint });

        if (!visionResult.success) {
          return res.status(500).json({
            success: false,
            error: visionResult.error || 'Vision identification failed'
          });
        }

        return res.json({
          success: true,
          data: visionResult.data,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Vision handler error:', error);
        return res.status(500).json({
          success: false,
          error: error.message || 'Server error processing vision request'
        });
      }
    },

    /**
     * Store visual signature for training/remembering product packaging
     */
    learnProductLabel: async (req, res) => {
      try {
        const { productId, variantId, image, labelTitle, metadata } = req.body;

        if (!productId || !image) {
          return res.status(400).json({
            success: false,
            error: 'productId and image are required'
          });
        }

        try {
          if (db && typeof db.prepare === 'function') {
            db.prepare(`
              CREATE TABLE IF NOT EXISTS product_visual_signatures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                variant_id INTEGER,
                image_base64 TEXT NOT NULL,
                metadata TEXT,
                learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `).run();

            // Check if product exists
            const prodExists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
            if (!prodExists) {
              return res.status(404).json({ success: false, error: 'Product not found' });
            }

            db.prepare(`
              INSERT INTO product_visual_signatures (product_id, variant_id, image_base64, metadata)
              VALUES (?, ?, ?, ?)
            `).run(
              productId, 
              variantId || null, 
              image, 
              JSON.stringify({ labelTitle: labelTitle || 'Learned Label', ...metadata })
            );
          }
        } catch (dbErr) {
          console.error('[Vision AI] Learning DB write error:', dbErr);
          return res.status(500).json({ success: false, error: 'Failed to save to database' });
        }

        return res.json({
          success: true,
          message: 'Visual signature saved successfully. AI will recognize this item in future scans.',
          productId,
          variantId
        });

      } catch (error) {
        console.error('Learn product label error:', error);
        return res.status(500).json({
          success: false,
          error: error.message || 'Failed to save visual signature'
        });
      }
    },

    /**
     * Get all visual profiles
     */
    getVisionProfiles: async (req, res) => {
      try {
        if (!db || typeof db.prepare !== 'function') {
           return res.status(500).json({ success: false, error: 'Database connection not ready' });
        }

        db.prepare(`
          CREATE TABLE IF NOT EXISTS product_visual_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            variant_id INTEGER,
            image_base64 TEXT NOT NULL,
            metadata TEXT,
            learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        
        const profiles = db.prepare(`
          SELECT pvs.id, pvs.product_id, pvs.variant_id, pvs.image_base64, pvs.metadata, pvs.learned_at,
                 p.name as product_name, v.name as variant_name
          FROM product_visual_signatures pvs
          LEFT JOIN products p ON pvs.product_id = p.id
          LEFT JOIN variants v ON pvs.variant_id = v.id
          ORDER BY pvs.learned_at DESC
        `).all();

        return res.json({ success: true, data: profiles });
      } catch (error) {
        console.error('Get vision profiles error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    },

    /**
     * Delete a visual profile
     */
    deleteVisionProfile: async (req, res) => {
      try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, error: 'Profile ID required' });

        if (!db || typeof db.prepare !== 'function') {
           return res.status(500).json({ success: false, error: 'Database connection not ready' });
        }

        db.prepare('DELETE FROM product_visual_signatures WHERE id = ?').run(id);
        
        return res.json({ success: true, message: 'Profile deleted successfully' });
      } catch (error) {
        console.error('Delete vision profile error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  };
};

