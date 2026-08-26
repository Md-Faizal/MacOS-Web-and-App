// ========================================
// CONTEXT MENU ACTIONS - Separate module
// ========================================

import { DesktopWidgetsPanel } from '../../../modules/widgets/js/desktop-widgets.js';

export class ContextMenuActions {
  constructor() {
    this.init();
  }

  init() {
    // Initialize action handlers
    this.setupNewFolderAction();
    this.setupGetInfoAction();
    this.setupChangeWallpaperAction();
    this.setupEditWidgetsAction();
    this.setupUseStacksAction();
    this.setupSortByAction();
    this.setupShowViewOptionsAction();
  }

  // ========== NEW FOLDER ACTION ==========
  setupNewFolderAction() {
    this.newFolderAction = new NewFolderAction();
  }

  handleNewFolder() {
    this.newFolderAction.execute();
  }

  // ========== GET INFO ACTION ==========
  setupGetInfoAction() {
    this.getInfoAction = new GetInfoAction();
  }

  handleGetInfo() {
    this.getInfoAction.execute();
  }

  // ========== CHANGE WALLPAPER ACTION ==========
  setupChangeWallpaperAction() {
    this.changeWallpaperAction = new ChangeWallpaperAction();
  }

  handleChangeWallpaper() {
    this.changeWallpaperAction.execute();
  }

  // ========== EDIT WIDGETS ACTION ==========
  setupEditWidgetsAction() {
    this.editWidgetsAction = new EditWidgetsAction();
  }

  handleEditWidgets() {
    this.editWidgetsAction.execute();
  }

  // ========== USE STACKS ACTION ==========
  setupUseStacksAction() {
    this.useStacksAction = new UseStacksAction();
  }

  handleUseStacks() {
    this.useStacksAction.execute();
  }

  // ========== SORT BY ACTION ==========
  setupSortByAction() {
    this.sortByAction = new SortByAction();
  }

  handleSortBy() {
    this.sortByAction.execute();
  }

  // ========== SHOW VIEW OPTIONS ACTION ==========
  setupShowViewOptionsAction() {
    this.showViewOptionsAction = new ShowViewOptionsAction();
  }

  handleShowViewOptions() {
    this.showViewOptionsAction.execute();
  }
}

// Backwards-compat: allow non-module pages to access it
if (typeof window !== 'undefined') {
  window.ContextMenuActions = ContextMenuActions;
}

// ========== INDIVIDUAL ACTION CLASSES ==========

/**
 * New Folder Action - Creates a new folder on desktop
 */
class NewFolderAction {
  execute() {
    console.log('📁 New Folder action triggered');
    const folderName = prompt('Enter folder name:', 'New Folder');
    
    if (folderName) {
      this.showNotification(`Created folder: ${folderName}`);
      console.log('✓ Folder created:', folderName);
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(100, 100, 100, 0.3);
      backdrop-filter: blur(20px);
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      z-index: 9999;
      animation: fadeInOut 3s ease-in-out forwards;
    `;

    if (!document.querySelector('style[data-fade]')) {
      const style = document.createElement('style');
      style.setAttribute('data-fade', 'true');
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(20px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(20px); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

/**
 * Get Info Action - Shows information about desktop
 */
class GetInfoAction {
  execute() {
    console.log('ℹ Get Info action triggered');
    this.showInfoDialog();
  }

  showInfoDialog() {
    let infoWindow = document.getElementById('getInfoWindow');
    if (infoWindow) {
      infoWindow.remove();
      return;
    }

    infoWindow = document.createElement('div');
    infoWindow.id = 'getInfoWindow';
    infoWindow.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 380px;
      background: rgba(120, 120, 120, 0.5);
      backdrop-filter: blur(30px);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 24px;
      z-index: 2000;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    infoWindow.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="color: #fff; margin: 0; font-size: 16px; font-weight: 600;">Desktop Info</h2>
        <button class="close-info-btn" style="
          background: transparent;
          border: none;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        ">✕</button>
      </div>
      <div style="color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1.8; margin-bottom: 20px;">
        <p><strong>Display Name:</strong> Desktop</p>
        <p><strong>Size:</strong> ${window.innerWidth}px × ${window.innerHeight}px</p>
        <p><strong>Resolution:</strong> ${window.devicePixelRatio}x</p>
        <p><strong>Items:</strong> ${document.querySelectorAll('.shortcut').length}</p>
        <p><strong>Last Updated:</strong> Today</p>
      </div>
      <button class="close-info-btn" style="
        width: 100%;
        padding: 8px;
        background: rgba(0, 120, 215, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
      ">Close</button>
    `;

    document.body.appendChild(infoWindow);

    const closeButtons = infoWindow.querySelectorAll('.close-info-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        infoWindow.remove();
      });
    });
  }
}

/**
 * Change Wallpaper Action - Changes desktop wallpaper
 */
class ChangeWallpaperAction {
  execute() {
    console.log('🖼 Change Wallpaper action triggered');
    this.openSettingsWallpaperSection();
  }

  openSettingsWallpaperSection() {
    // Check if SettingsApp class exists
    if (typeof SettingsApp === 'undefined') {
      console.warn('SettingsApp not available yet');
      return;
    }

    // Get or create the settings app
    let settingsApp = window.currentSettingsApp;
    const container = document.getElementById('settingsAppContainer');

    if (!settingsApp || !container || container.children.length === 0) {
      // Create new settings app instance
      settingsApp = new SettingsApp('settingsAppContainer', {
        onClose: () => {
          console.log('Settings app closed');
        }
      });
    }

    // Switch to wallpaper section
    if (settingsApp && typeof settingsApp.switchSection === 'function') {
      settingsApp.switchSection('wallpaper');
      
      // Bring the settings window to focus
      const appWindow = document.querySelector('[data-appid="settings"]');
      if (appWindow) {
        appWindow.parentElement.style.zIndex = '10000';
      }
    }
  }
}

/**
 * Edit Widgets Action - Opens widget editor
 */
class EditWidgetsAction {
  constructor() {
    this.widgetsPanel = null;
  }

  execute() {
    if (!this.widgetsPanel) {
      this.widgetsPanel = new DesktopWidgetsPanel();
    }
    this.widgetsPanel.open();
  }
}

/**
 * Use Stacks Action - Toggles stack functionality
 */
class UseStacksAction {
  execute() {
    console.log('📚 Use Stacks action triggered');
    this.toggleStacks();
  }

  toggleStacks() {
    const isEnabled = localStorage.getItem('stacksEnabled') === 'true';
    const newState = !isEnabled;
    localStorage.setItem('stacksEnabled', newState);
    
    const message = newState ? 'Stacks enabled' : 'Stacks disabled';
    this.showNotification(message);
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(100, 100, 100, 0.3);
      backdrop-filter: blur(20px);
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      z-index: 9999;
      animation: fadeInOut 3s ease-in-out forwards;
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

/**
 * Sort By Action - Shows sort options
 */
class SortByAction {
  execute() {
    console.log('↕ Sort By action triggered');
    this.showSortDialog();
  }

  showSortDialog() {
    let sortWindow = document.getElementById('sortByWindow');
    if (sortWindow) {
      sortWindow.remove();
      return;
    }

    sortWindow = document.createElement('div');
    sortWindow.id = 'sortByWindow';
    sortWindow.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      background: rgba(120, 120, 120, 0.5);
      backdrop-filter: blur(30px);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 16px 0;
      z-index: 2000;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    const options = ['Name', 'Date Modified', 'Date Created', 'Size', 'Kind'];
    sortWindow.innerHTML = options.map(option => `
      <div style="
        padding: 10px 16px;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        border-radius: 6px;
        margin: 2px 6px;
        transition: all 0.1s;
      " class="sort-option" onclick="this.style.background = 'rgba(0, 120, 215, 0.5)';">
        ${option}
      </div>
    `).join('');

    document.body.appendChild(sortWindow);

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closeSort(e) {
        if (!sortWindow.contains(e.target)) {
          sortWindow.remove();
          document.removeEventListener('click', closeSort);
        }
      });
    }, 50);
  }
}

/**
 * Show View Options Action - Opens view settings
 */
class ShowViewOptionsAction {
  execute() {
    console.log('⚙ Show View Options action triggered');
    this.showViewOptions();
  }

  showViewOptions() {
    let viewWindow = document.getElementById('viewOptionsWindow');
    if (viewWindow) {
      viewWindow.remove();
      return;
    }

    viewWindow = document.createElement('div');
    viewWindow.id = 'viewOptionsWindow';
    viewWindow.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 380px;
      background: rgba(120, 120, 120, 0.5);
      backdrop-filter: blur(30px);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 24px;
      z-index: 2000;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    viewWindow.innerHTML = `
      <h2 style="color: #fff; margin: 0 0 20px 0; font-size: 16px; font-weight: 600;">View Options</h2>
      <div style="color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1.8; margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer;">
          <input type="checkbox" checked style="cursor: pointer; width: 16px; height: 16px;">
          <span style="color: #fff;">Show hidden files</span>
        </label>
        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer;">
          <input type="checkbox" checked style="cursor: pointer; width: 16px; height: 16px;">
          <span style="color: #fff;">Show file extensions</span>
        </label>
        <div style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; text-align: center;">
          <div style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Grid Size</div>
          <div style="font-size: 18px; font-weight: 600; color: #fff;" id="viewModalGridSize">
            ${window.desktopManager ? `${window.desktopManager.getGridOffsets().gridCols} x ${window.desktopManager.getGridOffsets().gridRows}` : 'Unknown'}
          </div>
        </div>
        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
          <input type="checkbox" id="showGridCheckbox" ${window.desktopManager?.gridOverlay?.style.display === 'block' ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
          <span style="color: #fff;">Show grid</span>
        </label>
        <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
          <button id="calibrateGridBtn" style="
            width: 100%;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          ">📏 Calibrate Grid to This Screen</button>
          <p style="font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 8px; text-align: center;">
            Resets the maximum grid size to your current monitor resolution.
          </p>
        </div>
      </div>
      <button style="
        width: 100%;
        padding: 8px;
        background: rgba(0, 120, 215, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
      " id="closeViewOptionsBtn">Close</button>
    `;

    document.body.appendChild(viewWindow);

    const gridCheckbox = document.getElementById('showGridCheckbox');
    if (gridCheckbox) {
      gridCheckbox.addEventListener('change', () => {
        if (window.desktopManager) {
          window.desktopManager.toggleGrid();
        }
      });
    }

    const calibrateBtn = document.getElementById('calibrateGridBtn');
    if (calibrateBtn) {
      calibrateBtn.addEventListener('click', () => {
        if (window.desktopManager) {
          const result = window.desktopManager.resetBenchmark();
          calibrateBtn.textContent = `✓ Calibrated: ${result.cols}x${result.rows}`;
          calibrateBtn.style.background = 'rgba(50, 205, 50, 0.2)';
          
          // Update the displayed grid size in real-time
          const sizeDisplay = document.getElementById('viewModalGridSize');
          if (sizeDisplay) {
            sizeDisplay.textContent = `${result.cols} x ${result.rows}`;
          }

          setTimeout(() => {
            calibrateBtn.textContent = '📏 Calibrate Grid to This Screen';
            calibrateBtn.style.background = 'rgba(255, 255, 255, 0.1)';
          }, 2000);
        }
      });
      
      calibrateBtn.addEventListener('mouseenter', () => {
        calibrateBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      calibrateBtn.addEventListener('mouseleave', () => {
        calibrateBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      });
    }

    document.getElementById('closeViewOptionsBtn').addEventListener('click', () => {
      viewWindow.remove();
    });
  }
}
