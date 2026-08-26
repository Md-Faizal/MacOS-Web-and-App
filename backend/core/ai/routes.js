/**
 * AI Assistant Routes
 * Defines endpoints for AI interactions
 */

module.exports = function(router, handlers) {
  /**
   * POST /api/ai/query
   * Process natural language query using Gemini AI
   * Body: { query: string, sessionId?: string, useContext?: boolean }
   * Example: { query: "Show me top selling products", sessionId: "user123" }
   */
  router.post('/query', async (req, res) => {
    await handlers.processAIQuery(req, res);
  });

  /**
   * POST /api/ai/generate-query
   * Generate SQL query from natural language description
   * Body: { description: string }
   * Example: { description: "Get all customers who made purchases in 2026" }
   */
  router.post('/generate-query', async (req, res) => {
    await handlers.generateQuery(req, res);
  });

  /**
   * GET /api/ai/insights
   * Get business insights and analysis
   * Query: type (general|sales|products|customers)
   * Example: /api/ai/insights?type=sales
   */
  router.get('/insights', async (req, res) => {
    await handlers.getInsights(req, res);
  });

  /**
   * POST /api/ai/clear-history
   * Clear conversation history for a session
   * Body: { sessionId?: string }
   */
  router.post('/clear-history', (req, res) => {
    handlers.clearHistory(req, res);
  });

  /**
   * GET /api/ai/status
   * Check AI service status
   */
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      status: 'AI Assistant is online',
      service: 'Google Gemini',
      model: 'gemini-pro',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * POST /api/ai/vision/identify
   * Process camera snapshot and match against product catalog using Gemini Vision
   * Body: { image: "base64 string", mode?: "pos"|"batch", contextHint?: string }
   */
  router.post('/vision/identify', async (req, res) => {
    await handlers.processVisionIdentification(req, res);
  });

  /**
   * POST /api/ai/vision/learn
   * Store visual sample for training/remembering product packaging
   * Body: { productId: string, variantId?: string, image: "base64", labelTitle?: string, metadata?: object }
   */
  router.post('/vision/learn', async (req, res) => {
    await handlers.learnProductLabel(req, res);
  });

  /**
   * GET /api/ai/vision/profiles
   * Get all learned product visual profiles
   */
  router.get('/vision/profiles', async (req, res) => {
    await handlers.getVisionProfiles(req, res);
  });

  /**
   * DELETE /api/ai/vision/profiles/:id
   * Delete a learned visual profile
   */
  router.delete('/vision/profiles/:id', async (req, res) => {
    await handlers.deleteVisionProfile(req, res);
  });

  return router;
};

