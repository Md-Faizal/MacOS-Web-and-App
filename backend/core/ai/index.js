/**
 * AI Assistant Module
 * Main entry point for AI functionality using Google Gemini
 */

const express = require('express');

const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();
let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ AI Assistant using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    const handlers = createHandlers(db);
    // The router is mutated in place by createRoutes
    createRoutes(router, handlers);
    
    return true;
  } catch (error) {
    console.error('✗ Error initializing AI Assistant:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = {
  router,
  initializeDatabase
};
