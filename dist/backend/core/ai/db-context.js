/**
 * Database Context Provider for AI
 * Generates comprehensive context about database schema and app functions
 * for the Gemini AI to understand the system's capabilities
 */

function generateDatabaseContext(db) {
  try {
    if (!db) {
      console.warn('Database not available for context generation');
      return {};
    }
    
    // Get all table names and structures
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    
    const tablesInfo = {};
    
    tables.forEach(table => {
      try {
        const tableInfo = db.prepare(`PRAGMA table_info(${table.name})`).all();
        const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        
        tablesInfo[table.name] = {
          columns: tableInfo.map(col => ({
            name: col.name,
            type: col.type,
            notnull: col.notnull === 1,
            pk: col.pk === 1
          })),
          rowCount: countResult ? countResult.count : 0
        };
      } catch (tableError) {
        console.warn(`Could not access table ${table.name}:`, tableError.message);
      }
    });

    return tablesInfo;
  } catch (error) {
    console.error('Error generating database context:', error.message);
    return {};
  }
}

function generateSystemContext() {
  return {
    appModules: [
      {
        module: "Billing",
        description: "Manage customer invoicing, payment tracking, and billing transactions",
        endpoints: ["/api/billing/*"]
      },
      {
        module: "Products",
        description: "Manage product catalog, categories, and inventory",
        endpoints: ["/api/products/*"]
      },
      {
        module: "Variants",
        description: "Manage product variants with different SKUs and pricing",
        endpoints: ["/api/variants/*"]
      },
      {
        module: "Orders",
        description: "Manage customer orders and order line items",
        endpoints: ["/api/orders/*"]
      },
      {
        module: "Payments",
        description: "Track payment transactions and payment history",
        endpoints: ["/api/payments/*"]
      },
      {
        module: "Contacts",
        description: "Manage customer and supplier contact information",
        endpoints: ["/api/contacts/*"]
      },
      {
        module: "Notes",
        description: "Create and manage notes and memos",
        endpoints: ["/api/notes/*"]
      },
      {
        module: "Calendar",
        description: "Manage events and calendar reminders",
        endpoints: ["/api/calendar/*"]
      },
      {
        module: "Analytics",
        description: "Track and analyze business metrics and KPIs",
        endpoints: ["/api/analytics/*"]
      },
      {
        module: "Settings",
        description: "Application configuration and settings management",
        endpoints: ["/api/settings/*"]
      },
      {
        module: "Batches",
        description: "Track batch inventory and fulfillment",
        endpoints: ["/api/batches/*"]
      },
      {
        module: "Credit Notes",
        description: "Manage credit notes and adjustments",
        endpoints: ["/api/creditnotes/*"]
      }
    ],
    queryCapabilities: [
      "Retrieve product information and inventory",
      "Look up customer purchase history",
      "Generate sales reports and analytics",
      "Check order status and payment history",
      "Suggest products based on customer profile",
      "Calculate totals and summaries",
      "Identify trends and patterns in data"
    ]
  };
}

/**
 * Prepare AI-friendly context string
 */
function getAIContextString(db) {
  const dbContext = generateDatabaseContext(db);
  const systemContext = generateSystemContext();

  let contextString = `
You are an intelligent AI assistant for a MacOS business application. You have access to a comprehensive database system.

SYSTEM CAPABILITIES:
${JSON.stringify(systemContext, null, 2)}

DATABASE SCHEMA:
${JSON.stringify(dbContext, null, 2)}

INSTRUCTIONS:
1. Help users query their business data
2. Provide insights based on database information
3. Answer questions about products, orders, customers, and analytics
4. When queried, you can fetch database records to provide accurate responses
5. Always be helpful and concise
6. If asked to perform operations, you can suggest appropriate API endpoints
7. Respect data privacy and security
`;

  return contextString;
}

module.exports = {
  generateDatabaseContext,
  generateSystemContext,
  getAIContextString
};
