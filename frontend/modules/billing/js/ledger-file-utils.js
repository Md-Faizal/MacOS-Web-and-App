/**
 * LedgerFileUtils - Utility class for handling File System Access API
 * and persisting directory handles using IndexedDB.
 */
class LedgerFileUtils {
  static DB_NAME = 'LedgerExportDB';
  static STORE_NAME = 'DirectoryHandles';
  static DB_VERSION = 1;

  static async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  static async saveHandle(customerName, handle) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(handle, customerName);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  static async getHandle(customerName) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(customerName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  static async verifyPermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    const options = { mode };
    // Check if permission was already granted
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    // Request permission - MUST be called from a user gesture
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }
    return false;
  }

  /**
   * Main export handler
   */
  static async exportToLocation(customerName, fileName, blob) {
    try {
      // 1. Try to get remembered directory handle (only when we have a customer key)
      if (customerName) {
        const handle = await this.getHandle(customerName);
        
        if (handle) {
          // Attempt to verify/request permission (requires user gesture context)
          const hasPermission = await this.verifyPermission(handle);
          if (hasPermission) {
            const fileHandle = await handle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return { success: true, folder: handle.name, fileName: fileName };
          }
        }
      }

      // 2. If no handle OR permission denied OR no customer name, use showSaveFilePicker (Save As)
      if (window.showSaveFilePicker) {
        const pickerOptions = {
          suggestedName: fileName,
          types: [{
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          }],
        };
        
        const saveHandle = await window.showSaveFilePicker(pickerOptions);
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { success: true, fileName: fileName };
      }

      // 3. Absolute fallback: trigger traditional download
      this.fallbackDownload(fileName, blob);
      return { success: true, fallback: true };
      
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.error('Export Error:', error);
      throw error;
    }
  }

  static fallbackDownload(fileName, blob) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }

  static async pickDirectory(customerName) {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support picking a directory.');
      return null;
    }
    if (!customerName) {
      console.warn('LedgerFileUtils.pickDirectory: customerName is required to save a folder preference.');
      return null;
    }
    
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await this.saveHandle(customerName, handle);
      return handle;
    } catch (error) {
      if (error.name === 'AbortError') {
        // User cancelled the picker — not an error
        return null;
      }
      console.error('Directory Picker Error:', error);
      return null;
    }
  }
}

window.LedgerFileUtils = LedgerFileUtils;
