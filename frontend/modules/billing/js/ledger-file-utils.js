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

  static async removeHandle(customerName) {
    if (!customerName) return;
    try {
      const db = await this.initDB();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.delete(customerName);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.warn('Failed to remove stale directory handle:', err);
    }
  }

  static sanitizeFileName(fileName) {
    const raw = String(fileName || 'export.pdf').trim();
    const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/[. ]+$/, '');
    return cleaned || 'export.pdf';
  }

  static async verifyPermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    const options = { mode };
      try {
        // Check if permission was already granted
        if ((await handle.queryPermission(options)) === 'granted') {
          return true;
        }
        // Request permission - MUST be called from an active user gesture
        if ((await handle.requestPermission(options)) === 'granted') {
          return true;
        }
      } catch (err) {
        console.warn('Directory handle permission check failed:', err);
      }
      return false;
    }

  /**
   * Main export handler
   */
  static async exportToLocation(customerName, fileName, blob, options = {}) {
    const safeFileName = this.sanitizeFileName(fileName);
    let staleFolderCleared = false;

    try {
      // 1. Try to get remembered directory handle (only when we have a customer key)
      if (customerName) {
            try {
              const handle = await this.getHandle(customerName);

              if (handle) {
                // Attempt to verify/request permission
                const hasPermission = await this.verifyPermission(handle);
                if (hasPermission) {
                  const targetFileName = options.incrementFileName
                    ? await this.getAvailableFileName(handle, safeFileName)
                    : safeFileName;
                  const fileHandle = await handle.getFileHandle(targetFileName, { create: true });
                  const writable = await fileHandle.createWritable();
                  await writable.write(blob);
                  await writable.close();
                  return { success: true, folder: handle.name, fileName: targetFileName };
                }
              }
            } catch (dirError) {
              if (dirError.name === 'AbortError') {
                return { success: false, cancelled: true };
              }
              // Saved folder was deleted, moved, or became inaccessible on disk; purge stale handle and fall through
              console.warn(`Remembered export directory unavailable for "${customerName}", falling back:`, dirError);
              if (dirError.name === 'NotFoundError') {
                await this.removeHandle(customerName);
                staleFolderCleared = true;
              }
            }
          }

          // 2. If no handle OR permission denied OR stale directory OR no customer name, use showSaveFilePicker (Save As)
          if (window.showSaveFilePicker) {
            try {
              const pickerOptions = {
                suggestedName: safeFileName,
                types: [{
                  description: 'PDF Document',
                  accept: { 'application/pdf': ['.pdf'] },
                }],
              };

              const saveHandle = await window.showSaveFilePicker(pickerOptions);
              const writable = await saveHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              return { success: true, fileName: saveHandle.name || safeFileName, staleFolderCleared };
            } catch (pickerError) {
              if (pickerError.name === 'AbortError') {
                return { success: false, cancelled: true };
              }
              // e.g. SecurityError when user activation expired during async PDF generation; degrade to download fallback
              console.warn('showSaveFilePicker failed, falling back to browser download:', pickerError);
            }
          }

          // 3. Absolute fallback: trigger traditional download
          this.fallbackDownload(safeFileName, blob);
          return { success: true, fallback: true, fileName: safeFileName, staleFolderCleared };

        } catch (error) {
          if (error.name === 'AbortError') {
            return { success: false, cancelled: true };
          }
          console.error('Export Error:', error);
          throw error;
        }
      }

  static async getAvailableFileName(directoryHandle, fileName) {
    const extensionIndex = fileName.lastIndexOf('.');
    const hasExtension = extensionIndex > 0;
    const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
    const extension = hasExtension ? fileName.slice(extensionIndex) : '';
    let candidate = fileName;
    let increment = 1;

    while (true) {
      try {
        await directoryHandle.getFileHandle(candidate);
        candidate = `${baseName} (${increment})${extension}`;
        increment += 1;
      } catch (error) {
        if (error.name === 'NotFoundError') return candidate;
        if (error.name === 'TypeMismatchError') {
          candidate = `${baseName} (${increment})${extension}`;
          increment += 1;
          continue;
        }
        throw error;
      }
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
