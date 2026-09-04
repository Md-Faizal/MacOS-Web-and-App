/**
 * Multi-User Profile Manager (profiles.js)
 * Manages remembered accounts, active user selection, avatar synchronization,
 * and persistence in localStorage for the macOS Lockscreen and Settings.
 */

export class ProfileManager {
  static STORAGE_KEY = 'macos_remembered_users';
  static ACTIVE_USER_KEY = 'macos_active_user_id';

  constructor() {
    this.migrateLegacyStorage();
  }

  /**
   * Migrates legacy single-user localStorage keys to the multi-user schema if needed.
   */
  migrateLegacyStorage() {
    try {
      const isLegacyRemembered = localStorage.getItem('macos_remember_account') === 'true';
      const legacyIdentifier = localStorage.getItem('macos_user_identifier');
      const legacyName = localStorage.getItem('macos_user_display_name');
      const legacyPic = localStorage.getItem('macos_user_display_picture');
      const touchIdEnabled = localStorage.getItem('touchIdEnabled') === 'true';

      let users = this.getUsers();

      if (isLegacyRemembered && legacyIdentifier && users.length === 0) {
        const migratedUser = {
          id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          identifier: legacyIdentifier,
          displayName: legacyName || legacyIdentifier.split('@')[0],
          displayPicture: legacyPic || null,
          isTouchIdEnabled: touchIdEnabled,
          lastActive: Date.now(),
          role: 'user'
        };
        users = [migratedUser];
        this.saveUsers(users);
        this.setActiveUserId(migratedUser.id);
      }
    } catch (e) {
      console.warn('[ProfileManager] Legacy migration check failed:', e);
    }
  }

  /**
   * Retrieves all remembered users sorted by lastActive desc.
   * @returns {Array<Object>}
   */
  getUsers() {
    try {
      const raw = localStorage.getItem(ProfileManager.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
      }
      return [];
    } catch (e) {
      console.error('[ProfileManager] Failed to read remembered users:', e);
      return [];
    }
  }

  /**
   * Internal save method for the entire users array.
   */
  saveUsers(users) {
    try {
      localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(users));
      // Keep legacy keys in sync with active / primary user for backwards compatibility
      const active = this.getActiveUser();
      if (active) {
        localStorage.setItem('macos_remember_account', 'true');
        localStorage.setItem('macos_user_identifier', active.identifier);
        if (active.displayName) localStorage.setItem('macos_user_display_name', active.displayName);
        if (active.displayPicture) localStorage.setItem('macos_user_display_picture', active.displayPicture);
      } else if (users.length === 0) {
        localStorage.removeItem('macos_remember_account');
        localStorage.removeItem('macos_user_identifier');
        localStorage.removeItem('macos_user_display_name');
        localStorage.removeItem('macos_user_display_picture');
      }
      window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users } }));
    } catch (e) {
      console.error('[ProfileManager] Failed to save remembered users:', e);
    }
  }

  /**
   * Returns the currently active selected user, or the most recently active one.
   * @returns {Object|null}
   */
  getActiveUser() {
    const users = this.getUsers();
    if (users.length === 0) return null;

    const activeId = localStorage.getItem(ProfileManager.ACTIVE_USER_KEY);
    if (activeId) {
      const found = users.find(u => u.id === activeId || u.identifier === activeId);
      if (found) return found;
    }
    return users[0];
  }

  /**
   * Sets the active user by ID or identifier.
   */
  setActiveUserId(idOrIdentifier) {
    const users = this.getUsers();
    const target = users.find(u => u.id === idOrIdentifier || u.identifier === idOrIdentifier);
    if (target) {
      localStorage.setItem(ProfileManager.ACTIVE_USER_KEY, target.id);
      // Update last active timestamp
      target.lastActive = Date.now();
      this.saveUsers(users);
      return target;
    }
    return null;
  }

  /**
   * Checks if a given identifier or id is already in remembered users.
   */
  isUserRemembered(identifier, id) {
    const users = this.getUsers();
    const norm = (identifier || '').trim().toLowerCase();
    return users.some(u => 
      (id && u.id === id) || 
      (norm && u.identifier && u.identifier.trim().toLowerCase() === norm)
    );
  }

  /**
   * Adds or updates a user profile in the remembered registry.
   * @param {Object} userData
   */
  saveUser(userData) {
    if (!userData || (!userData.identifier && !userData.id)) {
      return null;
    }

    const users = this.getUsers();
    const identifier = (userData.identifier || userData.email || userData.username || '').trim();
    const id = userData.id || ('usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));

    // Find existing user by ID or identifier
    let existingIndex = users.findIndex(u => 
      (userData.id && u.id === userData.id) || 
      (identifier && u.identifier && u.identifier.trim().toLowerCase() === identifier.toLowerCase())
    );

    const userProfile = {
      id: existingIndex !== -1 ? users[existingIndex].id : id,
      identifier: identifier || (existingIndex !== -1 ? users[existingIndex].identifier : ''),
      displayName: userData.displayName || userData.display_name || userData.full_name || userData.name || (identifier ? identifier.split('@')[0] : 'User'),
      displayPicture: userData.displayPicture || userData.display_picture || userData.profile_picture || (existingIndex !== -1 ? users[existingIndex].displayPicture : null),
      isTouchIdEnabled: userData.isTouchIdEnabled !== undefined ? userData.isTouchIdEnabled : (existingIndex !== -1 ? users[existingIndex].isTouchIdEnabled : false),
      role: userData.role || (existingIndex !== -1 ? users[existingIndex].role : 'user'),
      lastActive: Date.now()
    };

    if (existingIndex !== -1) {
      users[existingIndex] = { ...users[existingIndex], ...userProfile };
    } else {
      users.push(userProfile);
    }

    localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(users));
    localStorage.setItem(ProfileManager.ACTIVE_USER_KEY, userProfile.id);
    localStorage.setItem('macos_remember_account', 'true');
    localStorage.setItem('macos_user_identifier', userProfile.identifier);
    if (userProfile.displayName) localStorage.setItem('macos_user_display_name', userProfile.displayName);
    if (userProfile.displayPicture) localStorage.setItem('macos_user_display_picture', userProfile.displayPicture);

    window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users } }));
    return userProfile;
  }

  /**
   * Updates specific properties of an existing user.
   */
  updateUserProfile(idOrIdentifier, updates) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === idOrIdentifier || u.identifier === idOrIdentifier);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      this.saveUsers(users);
      return users[index];
    }
    return null;
  }

  /**
   * Removes a user from the remembered registry.
   */
  removeUser(idOrIdentifier) {
    let users = this.getUsers();
    const initialLen = users.length;
    users = users.filter(u => u.id !== idOrIdentifier && u.identifier !== idOrIdentifier);

    if (users.length !== initialLen) {
      this.saveUsers(users);
      const activeId = localStorage.getItem(ProfileManager.ACTIVE_USER_KEY);
      if (activeId === idOrIdentifier) {
        if (users.length > 0) {
          this.setActiveUserId(users[0].id);
        } else {
          localStorage.removeItem(ProfileManager.ACTIVE_USER_KEY);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Clears all remembered users from the device.
   */
  clearAllUsers() {
    this.saveUsers([]);
    localStorage.removeItem(ProfileManager.ACTIVE_USER_KEY);
  }
}

// Export singleton instance for app-wide sharing
export const profileManager = new ProfileManager();
