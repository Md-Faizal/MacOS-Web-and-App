/**
 * Vision AI Service using Google Gemini (gemini-2.5-flash)
 * Handles image processing, label recognition, and visual product matching.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Re-use existing Gemini API key from codebase setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Clean base64 string to standard format for Gemini inline data
 */
function cleanBase64(base64Data) {
  if (!base64Data) return { mimeType: 'image/jpeg', data: '' };
  
  let mimeType = 'image/jpeg';
  let data = base64Data;

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    mimeType = parts[0].replace('data:', '') || 'image/jpeg';
    data = parts[1];
  }

  return { mimeType, data };
}

/**
 * Vision identification using Gemini 2.5 Flash
 * 
 * @param {string} imageBase64 - Base64 encoded image string from camera snapshot
 * @param {Array} catalogContext - Compact list of active products and variants from DB
 * @param {Object} options - Additional context (mode, hint, etc.)
 */
async function identifyProductImage(imageBase64, catalogContext = [], options = {}) {
  try {
    const { mimeType, data } = cleanBase64(imageBase64);

    if (!data) {
      return {
        success: false,
        error: 'Invalid or empty image data provided.'
      };
    }

    // Prepare compact catalog reference for prompt
    const compactCatalog = catalogContext.map(item => ({
      id: item.id || item.product_id,
      name: item.name || item.title || item.product_name,
      code: item.code || item.sku || '',
      category: item.category || '',
      variants: Array.isArray(item.variants) ? item.variants.map(v => ({
        id: v.id || v.variant_id,
        name: v.name || v.variant_name || v.sku,
        sku: v.sku || ''
      })) : []
    }));

    const imagePart = {
      inlineData: {
        data: data,
        mimeType: mimeType
      }
    };

    const prompt = `[TASK]
You are a high-speed ERP product recognition AI. Analyze this product label / packaging photo and match it against the provided product catalog list.

[PRODUCT CATALOG DATABASE]
${JSON.stringify(compactCatalog.slice(0, 150), null, 2)}

[INSTRUCTIONS]
1. Read all text, brand names, product titles, variant sizes, batch numbers, expiry dates, and MRP from the image.
2. Compare visual packaging design and extracted text against the provided PRODUCT CATALOG DATABASE.
3. SMART ESTIMATION: If the detected product name/brand matches a catalog item, use that catalog item's typical details to estimate difficult-to-detect fields. For example, if the catalog MRP is 750 but you detect "5000" (maybe a smudge), smartly infer it should be 750 (or a nearby realistic value like 700 or 800) if it doesn't make sense. Do the same for batch formats (if standard batch is XYZ-123, adapt accordingly).
4. Determine the best matching product and variant ID from the catalog database.
5. If no exact match is found in the catalog database, set match_found to false.
6. Return BOTH the raw detected values (exactly what the camera sees) and the smart matched values (what you estimate based on catalog correlation).
7. Return ONLY a valid, raw JSON object (no markdown, no code block formatting) matching this exact schema:

{
  "match_found": true/false,
  "product_id": "matched catalog product id or null",
  "product_name": "matched product name or extracted title",
  "variant_id": "matched catalog variant id or null",
  "variant_name": "matched variant name or extracted variant size",
  "confidence_score": 0-100 integer,
  
  "raw_detected_batch": "raw text from image or null",
  "smart_matched_batch": "estimated batch corrected via catalog formats or null",
  
  "raw_detected_expiry": "raw expiry text or null",
  "smart_matched_expiry": "corrected expiry date format or null",
  
  "raw_detected_mrp": "raw MRP number or null",
  "smart_matched_mrp": "corrected MRP matching catalog or null",
  
  "reasoning": "brief 1-sentence reason for match or why unconfirmed"
}`;

    // Using gemini-2.5-flash for speed and multimodal visual capabilities
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().trim();

    // Clean JSON response (strip markdown wrappers if present)
    let jsonString = responseText;
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn('[Vision AI] JSON Parse warning, raw text:', responseText);
      parsedResult = {
        match_found: false,
        product_name: responseText.slice(0, 100),
        confidence_score: 40,
        reasoning: 'Parsed non-standard response format'
      };
    }

    return {
      success: true,
      data: parsedResult
    };

  } catch (error) {
    console.error('[Vision AI Error]:', error);
    return {
      success: false,
      error: error.message || 'Vision API processing failed'
    };
  }
}

module.exports = {
  identifyProductImage
};
