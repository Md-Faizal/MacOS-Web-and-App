/**
 * AI Navigation Commands Handler
 * Maps user intents to app navigation and page opens
 */

// Map of available apps and pages
const APP_MAP = {
  // Apps
  'settings': { type: 'app', page: 'settings' },
  'setting': { type: 'app', page: 'settings' },
  'billing': { type: 'app', page: 'billing' },
  'calculator': { type: 'app', page: 'calculator' },
  'launchpad': { type: 'app', page: 'launchpad' },
  'notes': { type: 'app', page: 'notes' },
  'calendar': { type: 'app', page: 'calendar' },
  'contacts': { type: 'app', page: 'contacts' },
  'analytics': { type: 'app', page: 'analytics' },
  'product list': { type: 'app', page: 'product-list' },
  'products': { type: 'app', page: 'product-list' },
  'weather': { type: 'app', page: 'weather' },
  'clock': { type: 'app', page: 'clock-display' },
  'wallpapers': { type: 'page', app: 'settings', section: 'wallpaper' },
  
  // Pages within apps
  'wallpaper': { type: 'page', app: 'settings', section: 'wallpaper' },
  'wallpaper customization': { type: 'page', app: 'settings', section: 'wallpaper' },
  'customize wallpaper': { type: 'page', app: 'settings', section: 'wallpaper' },
  'wallpaper settings': { type: 'page', app: 'settings', section: 'wallpaper' },
  
  'ledger': { type: 'page', app: 'billing', section: 'ledger' },
  'billing ledger': { type: 'page', app: 'billing', section: 'ledger' },
  'invoices': { type: 'page', app: 'billing', section: 'invoices' },
  'payments': { type: 'page', app: 'billing', section: 'payments' },
  'billing history': { type: 'page', app: 'billing', section: 'ledger' },
  
  'quick settings': { type: 'page', app: 'settings', section: 'quick-settings' },
  'notifications': { type: 'page', app: 'settings', section: 'notifications' },
  'profiles': { type: 'page', app: 'contacts', section: 'profiles' },
};

/**
 * Extract navigation intent from user query
 * Returns null if no navigation intent found
 */
function extractNavigationIntent(query) {
  const lowerQuery = query.toLowerCase().trim();
  
  // Direct app/page names (single word or exact match)
  for (const [key, value] of Object.entries(APP_MAP)) {
    const keyLower = key.toLowerCase();
    // Exact match or if query starts with the key
    if (lowerQuery === keyLower || lowerQuery.startsWith(keyLower + ' ')) {
      return {
        intent: 'navigation',
        ...value,
        query: key
      };
    }
  }
  
  // Check for commands like "open X", "show X", "go to X", "navigate to X"
  const navigationPatterns = [
    /^(?:open|show|go to|navigate to|launch|display|view|access)\s+(?:the\s+)?([a-z\s]+?)(?:\s+(?:page|app|menu|section))?$/i,
  ];
  
  for (const pattern of navigationPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const target = match[1].trim().toLowerCase();
      
      // Check if target matches an app or page
      for (const [key, value] of Object.entries(APP_MAP)) {
        const keyLower = key.toLowerCase();
        if (target.includes(keyLower) || keyLower.includes(target) || target === keyLower) {
          return {
            intent: 'navigation',
            ...value,
            query: target
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if query is asking to execute an action
 */
function isNavigationQuery(query) {
  const navigationKeywords = [
    'open', 'show', 'go to', 'navigate', 'launch', 
    'display', 'view', 'access', 'take me to', 'go to the'
  ];
  
  const lowerQuery = query.toLowerCase();
  return navigationKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Generate AI response with navigation command
 */
function generateNavigationResponse(navigation) {
  if (navigation.type === 'app') {
    return {
      type: 'navigation',
      action: 'open-app',
      page: navigation.page,
      message: `Opening ${navigation.page} app...`,
      metadata: navigation
    };
  } else if (navigation.type === 'page') {
    return {
      type: 'navigation',
      action: 'open-page',
      app: navigation.app,
      page: navigation.section,
      message: `Opening ${navigation.section} in ${navigation.app}...`,
      metadata: navigation
    };
  }
  
  return null;
}

module.exports = {
  extractNavigationIntent,
  isNavigationQuery,
  generateNavigationResponse,
  APP_MAP
};
