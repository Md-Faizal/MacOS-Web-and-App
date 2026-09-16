/**
 * Recent App Tracker
 * Tracks the most recently opened app and displays it next to the Apple logo
 */

class RecentAppTracker {
  constructor() {
    this.recentApp = {
      name: 'Finder',
      id: 'finder'
    };
    this.displayElement = null;
    this.nameElement = null;
    this.init();
  }

  init() {
    this.displayElement = document.getElementById('recentAppDisplay');
    this.nameElement = document.querySelector('.recent-app-name');
    
    if (this.displayElement && this.nameElement) {
      this.updateDisplay();
      this.setupClickHandler();
    }
  }

  setupClickHandler() {
    if (this.displayElement) {
      this.displayElement.addEventListener('click', () => {
        if (this.recentApp.id) {
          this.openRecentApp();
        }
      });
    }
  }

  /**
   * Track when an app is opened
   * Call this from the app initialization code
   */
  trackAppOpen(appName, appId) {
    this.recentApp = {
      name: appName,
      id: appId
    };
    
    // Update display
    this.updateDisplay();
  }

  updateDisplay() {
    if (this.nameElement) {
      this.nameElement.textContent = this.recentApp.name;
      if (this.recentApp.name) {
        this.displayElement.style.opacity = '1';
        this.displayElement.style.pointerEvents = 'auto';
      } else {
        this.displayElement.style.opacity = '0.5';
        this.displayElement.style.pointerEvents = 'none';
      }
    }
  }

  openRecentApp() {
    // Find and open the recent app by ID from available apps
    const availableApps = window.availableAppsForLaunchpad || [];
    const appToOpen = availableApps.find(app => app.id === this.recentApp.id);
    
    if (appToOpen && appToOpen.action) {
      // Call the app's action directly
      appToOpen.action();
    } else {
      // Fallback: try to find and click the app bar item by name
      const appBarItems = document.querySelectorAll('.app-bar-item, .dock-item');
      for (let item of appBarItems) {
        const appName = item.getAttribute('data-app-name') || item.querySelector('.app-bar-label, .dock-label')?.textContent?.trim();
        if (appName === this.recentApp.name) {
          item.click();
          break;
        }
      }
    }
  }
}

// Initialize on page load
window.recentAppTracker = new RecentAppTracker();
