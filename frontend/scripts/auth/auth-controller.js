/**
 * Core Authentication & Onboarding Controller
 * Manages local credentials, biometric WebAuthn, Google Identity Services, and post-auth onboarding.
 */

import { DialogManager } from './dialog-manager.js';
import { LockscreenDragController } from './lockscreen-drag.js';
import { profileManager } from './profiles.js';

const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

export class AuthController {
  constructor() {
    this.profileManager = profileManager;
    this.initDOMElements();
    this.initDialogManager();
    this.initDragController();
    this.initClock();
    this.initEventListeners();
    this.initGoogleAuth();
    this.checkSecurityAndSync();
  }

  initDOMElements() {
    this.loginModal = document.getElementById('loginModal');
    this.touchIdSetupModal = document.getElementById('touchIdSetupModal');
    this.accountPreferenceModal = document.getElementById('accountPreferenceModal');
    this.workerPendingModal = document.getElementById('workerPendingModal');
    this.ownerLinkModal = document.getElementById('ownerLinkModal');
    this.workerCredentialModal = document.getElementById('workerCredentialModal');
    this.removeAccountModal = document.getElementById('removeAccountModal');

    this.loginIdentifierInput = document.getElementById('loginIdentifierInput');
    this.loginIdentifierField = document.getElementById('loginIdentifierField');
    this.recoveryIdentityField = document.getElementById('recoveryIdentityField');
    this.recoveryIdentityDisplay = document.getElementById('recoveryIdentityDisplay');
    this.passwordInput = document.getElementById('loginPasswordInput');
    this.setupPasswordInput = document.getElementById('setupPasswordInput');
    this.googleSignInSection = document.getElementById('googleSignInSection');

    this.multiUserContainer = document.getElementById('multiUserContainer');
    this.multiUserList = document.getElementById('multiUserList');
    this.singleUserContainer = document.getElementById('singleUserContainer');
    this.otherUserBtn = document.getElementById('otherUserBtn');
    this.switchUserRow = document.getElementById('switchUserRow');
    this.switchUserBtn = document.getElementById('switchUserBtn');

    this.removeAccountAvatar = document.getElementById('removeAccountAvatar');
    this.removeAccountTitle = document.getElementById('removeAccountTitle');
    this.removeAccountMessage = document.getElementById('removeAccountMessage');
    this.confirmRemoveAccountBtn = document.getElementById('confirmRemoveAccountBtn');
    this.cancelRemoveAccountBtn = document.getElementById('cancelRemoveAccountBtn');
    this.pendingAccountRemovalId = null;

    this.profileAvatar = document.getElementById('profileAvatar');
    this.profileMenu = document.getElementById('profileMenu');
    this.profileUsername = document.getElementById('profileUsername');
    this.profileHint = document.getElementById('profileHint');
    this.modalUsername = document.getElementById('modalUsername');

    this.rememberAccountStep = document.getElementById('rememberAccountStep');
    this.rememberAccountWarningStep = document.getElementById('rememberAccountWarningStep');
    this.rememberAccountDismissStep = document.getElementById('rememberAccountDismissStep');
    this.touchIdChoiceStep = document.getElementById('touchIdChoiceStep');
    this.touchIdDismissStep = document.getElementById('touchIdDismissStep');

    this.passwordProtectionEnabled = true;
    this.pendingGoogleCredential = null;
    this.pendingWorkerInvite = null;
    this.touchIdRegistrationInFlight = false;
    this.answerVerificationInFlight = false;
    this.loginAutoSubmitTimer = null;
    this.touchIdAutoSubmitTimer = null;
    this.answerAutoSubmitTimer = null;

    this.homeTimeSettings = JSON.parse(localStorage.getItem(this.getScopedStorageKey('mac-system-time-settings'))) || { mode: 'auto' };
  }

  initDialogManager() {
    this.dialogManager = new DialogManager({
      onPreAuthClose: () => {
        this.resetLoginForm();
        this.syncProfile();
        this.updateLoginHint();
        document.body.setAttribute('data-unlock-state', 'locked');
        if (this.dragController) this.dragController.resetDragVisuals();

        const wallpaperBg = document.getElementById('wallpaperBackground');
        if (wallpaperBg) {
          const video = wallpaperBg.querySelector('video');
          if (video && video.paused) video.play().catch(() => {});
        }

        if (window.google?.accounts?.id && !document.body.classList.contains('login-active')) {
          window.google.accounts.id.prompt();
        }
      },
      onPostAuthSkip: () => {
        this.goHome();
      }
    });
  }

  initDragController() {
    this.dragController = new LockscreenDragController({
      onUnlock: () => this.openLoginModal()
    });
  }

  /* --------------------------------------------------------------------------
     CLOCK & DISPLAY MANAGEMENT
     -------------------------------------------------------------------------- */
  initClock() {
    const updateHomepageClock = () => {
      let now = new Date();
      if (this.homeTimeSettings.mode === 'location' && this.homeTimeSettings.timezone) {
        try {
          const locStr = now.toLocaleString('en-US', { timeZone: this.homeTimeSettings.timezone });
          now = new Date(locStr);
        } catch (e) {
          console.error('Invalid timezone:', this.homeTimeSettings.timezone);
        }
      } else if (this.homeTimeSettings.mode === 'manual' && this.homeTimeSettings.manualOffset) {
        now = new Date(now.getTime() + this.homeTimeSettings.manualOffset);
      }

      const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
      const dateStr = now.toLocaleDateString('en-US', dateOptions).replace(',', '');

      let hours = now.getHours();
      if (hours === 0) hours = 12;
      else if (hours > 12) hours = hours - 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes}`;

      const dateElement = document.getElementById('dateDisplay');
      const timeElement = document.getElementById('timeDisplay');
      if (dateElement) dateElement.textContent = dateStr;
      if (timeElement) {
        timeElement.textContent = timeStr;
        timeElement.setAttribute('data-time', timeStr);
      }
    };

    const updateLoginPageClock = () => {
      let now = new Date();
      if (this.homeTimeSettings.mode === 'location' && this.homeTimeSettings.timezone) {
        try {
          const locStr = now.toLocaleString('en-US', { timeZone: this.homeTimeSettings.timezone });
          now = new Date(locStr);
        } catch (e) {}
      } else if (this.homeTimeSettings.mode === 'manual' && this.homeTimeSettings.manualOffset) {
        now = new Date(now.getTime() + this.homeTimeSettings.manualOffset);
      }

      const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const formatted = `${weekday} ${monthDay} ${hours}:${minutes} ${ampm}`;

      const el = document.getElementById('loginClockDisplay');
      if (el) el.textContent = formatted;
    };

    window.addEventListener('mac-time-sync', (e) => {
      this.homeTimeSettings = e.detail;
      updateHomepageClock();
    });

    updateHomepageClock();
    setInterval(updateHomepageClock, 1000);
    setInterval(updateLoginPageClock, 1000);
  }

  getBackgroundBrightness() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      try {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let brightness = 0;
        for (let i = 0; i < data.length; i += 40) {
          brightness += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        }
        brightness = brightness / (data.length / 40);

        const bgClass = brightness > 200 ? 'light-bg' : 'dark-bg';
        const bgClassRemove = brightness > 200 ? 'dark-bg' : 'light-bg';

        const loginClock = document.getElementById('loginPageClock');
        if (loginClock) {
          loginClock.classList.remove(bgClassRemove);
          loginClock.classList.add(bgClass);
        }

        const weatherElement = document.getElementById('homepageWeatherDisplay');
        if (weatherElement) {
          weatherElement.classList.remove(bgClassRemove);
          weatherElement.classList.add(bgClass);
        }
      } catch (e) {}
    };
    img.src = '/storage/wallpapers/builtin/tahoe-beach-2/tahoe-beach-2.light.jpg';
  }

  /* --------------------------------------------------------------------------
     PROFILE & STATE SYNC
     -------------------------------------------------------------------------- */
  async syncProfile() {
    const users = this.profileManager.getUsers();
    const activeUser = this.profileManager.getActiveUser();

    // If 2 or more users are remembered, show multi-user vertical list
    if (users.length > 1) {
      if (this.multiUserContainer) this.multiUserContainer.style.display = 'flex';
      if (this.singleUserContainer) this.singleUserContainer.style.display = 'none';
      this.renderMultiUserList(users, activeUser);
    } else {
      // 0 or 1 user: exact original centered single user layout
      if (this.multiUserContainer) this.multiUserContainer.style.display = 'none';
      if (this.singleUserContainer) this.singleUserContainer.style.display = 'flex';
      
      const singleUser = users.length === 1 ? users[0] : activeUser;
      const usernameElements = [
        document.getElementById('profileUsername'),
        this.profileUsername
      ];

      if (singleUser) {
        usernameElements.forEach((el) => { if (el) el.textContent = singleUser.displayName || 'Sign in'; });
        if (this.profileAvatar) {
          const pic = singleUser.displayPicture || '/assets/Images/DefaultUser.png';
          this.profileAvatar.innerHTML = `<img src="${pic}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
          this.profileAvatar.style.background = 'transparent';
        }
      } else {
        usernameElements.forEach((el) => { if (el) el.textContent = 'Sign in'; });
        if (this.profileAvatar) {
          this.profileAvatar.innerHTML = `<img src="/assets/Images/DefaultUser.png" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
          this.profileAvatar.style.background = 'transparent';
        }
      }
    }

    // Modal Identity Update
    if (activeUser) {
      if (this.modalUsername) this.modalUsername.textContent = activeUser.displayName || 'Sign in';
      const modalAvatar = document.querySelector('.modal-avatar');
      if (modalAvatar) {
        const pic = activeUser.displayPicture || '/assets/Images/DefaultUser.png';
        modalAvatar.innerHTML = `<img src="${pic}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        modalAvatar.style.background = 'transparent';
      }
      if (this.loginIdentifierInput) {
        this.loginIdentifierInput.value = activeUser.identifier || '';
      }
    } else {
      if (this.modalUsername) this.modalUsername.textContent = 'Sign in';
      const modalAvatar = document.querySelector('.modal-avatar');
      if (modalAvatar) {
        modalAvatar.innerHTML = `<img src="/assets/Images/DefaultUser.png" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        modalAvatar.style.background = 'transparent';
      }
      if (this.loginIdentifierInput) {
        this.loginIdentifierInput.value = '';
      }
    }

    this.updateLoginHint();
  }

  renderMultiUserList(users, activeUser) {
    if (!this.multiUserList) return;
    this.multiUserList.innerHTML = '';

    const activeId = activeUser?.id;

    users.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'user-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Sign in as ${user.displayName}`);

      const pic = user.displayPicture || '/assets/Images/DefaultUser.png';
      const isActive = user.id === activeId;

      item.innerHTML = `
        <div class="user-avatar-wrapper">
          <img src="${pic}" alt="${user.displayName}" class="user-avatar-img">
          ${isActive ? '<span class="user-badge-active" title="Active Account">✓</span>' : ''}
        </div>
        <span class="user-item-name">${user.displayName}</span>
      `;

      item.addEventListener('click', () => {
        this.profileManager.setActiveUserId(user.id);
        this.openLoginModal(user);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.promptRemoveAccount(user);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.profileManager.setActiveUserId(user.id);
          this.openLoginModal(user);
        }
      });

      this.multiUserList.appendChild(item);
    });
  }

  updateLoginHint() {
    const activeUser = this.profileManager.getActiveUser();
    const isRemembered = !!activeUser;
    const touchIdEnabled = activeUser?.isTouchIdEnabled === true || localStorage.getItem('touchIdEnabled') === 'true';
    const touchidText = document.getElementById('touchidText');

    if (touchidText) {
      touchidText.style.display = this.passwordProtectionEnabled && touchIdEnabled && isRemembered ? 'block' : 'none';
    }

    if (!this.profileHint) return;

    this.profileHint.innerHTML = !this.passwordProtectionEnabled
      ? '<span id="hintPassword">Sign in with username or email</span>'
      : touchIdEnabled && isRemembered
      ? '<span id="hintTouchId">Touch ID</span> <span class="hint-separator">or</span> <span id="hintPassword">Enter Password</span>'
      : '<span id="hintPassword">Enter Password</span>';

    document.getElementById('hintTouchId')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleTouchID();
    });
    document.getElementById('hintPassword')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openLoginModal();
    });
  }

  async checkSecurityStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      this.passwordProtectionEnabled = data.passwordSet === true;

      const passwordSection = document.getElementById('passwordProtectionSection');
      const noPasswordSection = document.getElementById('noPasswordSection');
      if (passwordSection) passwordSection.style.display = 'flex';
      if (noPasswordSection) noPasswordSection.style.display = 'none';

      const passwordField = document.getElementById('loginPasswordField');
      const forgotPassword = document.getElementById('forgotPasswordText');
      if (passwordField) passwordField.style.display = 'block';
      if (forgotPassword) forgotPassword.style.display = 'block';

      this.updateLoginHint();
    } catch (err) {
      console.error('Status check failed:', err);
    }
  }

  async checkSecurityAndSync() {
    await this.checkSecurityStatus();
    await this.syncProfile();
    this.getBackgroundBrightness();
  }

  /* --------------------------------------------------------------------------
     MODAL CONTROLS & NAVIGATION
     -------------------------------------------------------------------------- */
  async openLoginModal(targetUser = null) {
    await this.checkSecurityStatus();
    this.getBackgroundBrightness();

    const user = targetUser || this.profileManager.getActiveUser();
    const isRemembered = !!user;

    if (user) {
      if (this.modalUsername) this.modalUsername.textContent = user.displayName || 'Sign in';
      const modalAvatar = document.querySelector('.modal-avatar');
      if (modalAvatar) {
        const pic = user.displayPicture || '/assets/Images/DefaultUser.png';
        modalAvatar.innerHTML = `<img src="${pic}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        modalAvatar.style.background = 'transparent';
      }
      if (this.loginIdentifierInput) {
        this.loginIdentifierInput.value = user.identifier || '';
      }
      if (this.loginIdentifierField) {
        this.loginIdentifierField.style.display = 'none';
      }
      if (this.switchUserRow) {
        this.switchUserRow.style.display = 'flex';
      }
    } else {
      if (this.modalUsername) this.modalUsername.textContent = 'Sign in';
      const modalAvatar = document.querySelector('.modal-avatar');
      if (modalAvatar) {
        modalAvatar.innerHTML = `<img src="/assets/Images/DefaultUser.png" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        modalAvatar.style.background = 'transparent';
      }
      if (this.loginIdentifierInput) {
        this.loginIdentifierInput.value = '';
      }
      if (this.loginIdentifierField) {
        this.loginIdentifierField.style.display = 'block';
      }
      if (this.switchUserRow) {
        const totalUsers = this.profileManager.getUsers().length;
        this.switchUserRow.style.display = totalUsers > 0 ? 'flex' : 'none';
      }
    }

    const focusTarget = !isRemembered && !this.loginIdentifierInput?.value
      ? this.loginIdentifierInput
      : this.passwordInput;

    this.dialogManager.openModal(this.loginModal, focusTarget);
  }

  openGenericLoginModal() {
    if (this.modalUsername) this.modalUsername.textContent = 'Sign in';
    const modalAvatar = document.querySelector('.modal-avatar');
    if (modalAvatar) {
      modalAvatar.innerHTML = `<img src="/assets/Images/DefaultUser.png" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      modalAvatar.style.background = 'transparent';
    }
    if (this.loginIdentifierField) {
      this.loginIdentifierField.style.display = 'block';
    }
    if (this.loginIdentifierInput) {
      this.loginIdentifierInput.value = '';
    }
    if (this.passwordInput) {
      this.passwordInput.value = '';
    }
    if (this.switchUserRow) {
      const hasSavedUsers = this.profileManager.getUsers().length > 0;
      this.switchUserRow.style.display = hasSavedUsers ? 'flex' : 'none';
    }
    this.dialogManager.openModal(this.loginModal, this.loginIdentifierInput);
    setTimeout(() => {
      try { this.loginIdentifierInput?.focus(); } catch (e) {}
    }, 150);
  }

  handleSwitchUser() {
    const users = this.profileManager.getUsers();
    const isGenericLogin = this.loginIdentifierField && this.loginIdentifierField.style.display !== 'none';

    if (isGenericLogin) {
      // If currently on generic login and remembered user(s) exist, switch back to active user
      const activeUser = this.profileManager.getActiveUser() || (users.length > 0 ? users[0] : null);
      if (activeUser) {
        this.openLoginModal(activeUser);
      }
    } else if (users.length > 1) {
      // If multiple users exist, return to lockscreen user selection
      this.dialogManager.closeModal(this.loginModal);
    } else {
      // If single user, switch to generic username/password login
      this.openGenericLoginModal();
    }
  }

  promptRemoveAccount(user) {
    if (!user) return;
    this.pendingAccountRemovalId = user.id;

    if (this.removeAccountAvatar) {
      const pic = user.displayPicture || '/assets/Images/DefaultUser.png';
      this.removeAccountAvatar.innerHTML = `<img src="${pic}" alt="${user.displayName}">`;
    }
    if (this.removeAccountTitle) {
      this.removeAccountTitle.textContent = `Remove "${user.displayName}"?`;
    }
    if (this.removeAccountMessage) {
      this.removeAccountMessage.textContent = `This account shortcut will be removed from the lock screen on this Mac.`;
    }

    this.dialogManager.openModal(this.removeAccountModal);
  }

  confirmRemoveAccount() {
    if (this.pendingAccountRemovalId) {
      this.profileManager.removeUser(this.pendingAccountRemovalId);
      this.pendingAccountRemovalId = null;
      this.dialogManager.closeModal(this.removeAccountModal);
      this.syncProfile();
    }
  }

  resetLoginForm() {
    const activeUser = this.profileManager.getActiveUser();
    const isRemembered = !!activeUser;

    if (this.loginIdentifierField) this.loginIdentifierField.style.display = isRemembered ? 'none' : 'block';
    if (this.recoveryIdentityField) this.recoveryIdentityField.style.display = 'none';

    const passwordField = document.getElementById('loginPasswordField');
    if (passwordField) passwordField.style.display = 'block';

    const forgotPassword = document.getElementById('forgotPasswordText');
    if (forgotPassword) forgotPassword.style.display = 'block';

    const googleSec = document.getElementById('googleSignInSection');
    if (googleSec) googleSec.style.display = 'block';

    const sQuest = document.getElementById('securityQuestionSection');
    if (sQuest) sQuest.style.display = 'none';

    const pReset = document.getElementById('passwordResetSection');
    if (pReset) pReset.style.display = 'none';

    if (this.passwordInput) {
      this.passwordInput.value = '';
      this.passwordInput.type = 'password';
    }
    if (this.setupPasswordInput) this.setupPasswordInput.value = '';

    const rnPass = document.getElementById('resetNewPassword');
    if (rnPass) rnPass.value = '';
    const rcPass = document.getElementById('resetConfirmPassword');
    if (rcPass) rcPass.value = '';
    const sAns = document.getElementById('securityAnswerInput');
    if (sAns) sAns.value = '';

    if (this.switchUserRow) {
      const hasSavedUsers = this.profileManager.getUsers().length > 0;
      this.switchUserRow.style.display = hasSavedUsers ? 'flex' : 'none';
    }

    if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'block';
    if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
    if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'none';
    if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'none';
    if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'none';
    const tFailed = document.getElementById('touchIdFailedStep');
    if (tFailed) tFailed.style.display = 'none';
  }

  goHome() {
    sessionStorage.setItem('macos_session_active', 'true');
    document.body.setAttribute('data-unlock-state', 'finished');
    document.body.classList.add('login-finished');
    this.dialogManager.closeAllModals();
    window.location.replace('./home.html');
  }

  async loadAuthenticatedProfile() {
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) return null;
      const data = await response.json();
      return data.profile || null;
    } catch (error) {
      console.warn('Profile cache update failed:', error);
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     AUTHENTICATION FLOWS
     -------------------------------------------------------------------------- */
  async handleLogin() {
    const identifier = this.loginIdentifierInput?.value.trim() || '';
    const password = this.passwordInput?.value || '';
    const passwordRequired = document.getElementById('loginPasswordField')?.style.display !== 'none';

    if (!identifier || (passwordRequired && !password)) {
      const invalidInput = passwordRequired ? this.passwordInput : this.loginIdentifierInput;
      if (invalidInput) {
        invalidInput.classList.add('error-shake');
        setTimeout(() => invalidInput.classList.remove('error-shake'), 500);
      }
      return;
    }

    const { deviceName, deviceType, clientType } = await this.getDeviceInfo();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, deviceName, deviceType, clientType })
      });

      const data = await response.json();

      if (response.ok) {
        await this.finishAuthenticatedLogin(data, identifier);
      } else {
        if (this.passwordInput) {
          this.passwordInput.classList.add('error-shake');
          setTimeout(() => this.passwordInput.classList.remove('error-shake'), 500);
          this.passwordInput.value = '';
          this.passwordInput.focus();
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Could not connect to authentication server');
    }
  }

  async finishAuthenticatedLogin(data, identifier) {
    sessionStorage.setItem('macos_session_active', 'true');
    if (data.role) sessionStorage.setItem('macos_user_role', data.role);
    if (data.user?.id) sessionStorage.setItem('macos_user_id', data.user.id);
    if (Array.isArray(data.permissions?.allowedApps) && data.permissions.allowedApps.length > 0) {
      sessionStorage.setItem('macos_allowed_apps', JSON.stringify(data.permissions.allowedApps));
    }
    const profile = await this.loadAuthenticatedProfile();

    if (
      data.role === 'worker' &&
      data.user &&
      !data.user.hasLocalPassword &&
      localStorage.getItem('worker_password_prompt_dismissed') !== 'true'
    ) {
      await this.showWorkerCredentialPrompt(data, profile);
    }
    this.showRememberAccountPrompt(identifier, profile, data?.user || null);
  }

  /* --------------------------------------------------------------------------
     POST-LOGIN ONBOARDING PROMPTS
     -------------------------------------------------------------------------- */
  async showWorkerCredentialPrompt(data, profile) {
    if (!this.workerCredentialModal) return;

    this.dialogManager.closeAllModals();

    const inputStep = document.getElementById('workerPasswordInputStep');
    const dismissStep = document.getElementById('workerPasswordDismissStep');
    if (inputStep) inputStep.style.display = 'block';
    if (dismissStep) dismissStep.style.display = 'none';

    const googleEmail = (data && data.user && data.user.email) || (profile && profile.email) || '';
    const identifierInput = document.getElementById('workerIdentifierInput') || document.getElementById('workerEmailInput');
    const identifierLabel = document.getElementById('workerIdentifierLabel');
    const typeEmailBtn = document.getElementById('workerTypeEmailBtn');
    const typeUsernameBtn = document.getElementById('workerTypeUsernameBtn');
    const googleCheckboxContainer = document.getElementById('workerGoogleEmailCheckboxContainer');
    const useGoogleEmailCheckbox = document.getElementById('workerUseGoogleEmailCheckbox');
    const statusEl = document.getElementById('workerIdentifierStatus');
    const newPasswordInput = document.getElementById('workerNewPassword');
    const confirmPasswordInput = document.getElementById('workerConfirmPassword');

    let currentIdType = 'email';
    let usernameCheckTimeout = null;
    let isUsernameAvailable = false;

    const checkRealtimeUsername = (rawVal) => {
      const val = (rawVal || '').trim();
      if (!statusEl) return;
      if (!val) {
        statusEl.style.display = 'none';
        isUsernameAvailable = false;
        return;
      }

      if (val.length < 3) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#FF453A';
        statusEl.textContent = '✗ Must be at least 3 characters';
        isUsernameAvailable = false;
        return;
      }

      if (!/^[a-zA-Z0-9_.-]+$/.test(val)) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#FF453A';
        statusEl.textContent = '✗ Letters, numbers, underscores only';
        isUsernameAvailable = false;
        return;
      }

      statusEl.style.display = 'block';
      statusEl.style.color = 'rgba(255, 255, 255, 0.7)';
      statusEl.textContent = '⏳ Checking availability...';

      fetch(`/api/auth/check-username?username=${encodeURIComponent(val)}`)
        .then(res => res.json())
        .then(data => {
          if (identifierInput && identifierInput.value.trim() !== val) return;
          if (data.available) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#30D158';
            statusEl.textContent = `✓ ${data.message || 'Username available'}`;
            isUsernameAvailable = true;
          } else {
            statusEl.style.display = 'block';
            statusEl.style.color = '#FF453A';
            statusEl.textContent = `✗ ${data.message || 'Username taken'}`;
            isUsernameAvailable = false;
          }
        })
        .catch(() => {
          statusEl.style.display = 'none';
        });
    };

    if (identifierInput) {
      identifierInput.oninput = () => {
        if (currentIdType === 'username') {
          clearTimeout(usernameCheckTimeout);
          usernameCheckTimeout = setTimeout(() => {
            checkRealtimeUsername(identifierInput.value);
          }, 280);
        }
      };
    }

    const setIdentifierType = (type) => {
      currentIdType = type;
      if (statusEl) statusEl.style.display = 'none';
      if (type === 'email') {
        if (identifierLabel) identifierLabel.textContent = 'Email address';
        if (identifierInput) {
          identifierInput.placeholder = 'name@example.com';
          identifierInput.type = 'email';
          if (useGoogleEmailCheckbox && useGoogleEmailCheckbox.checked) {
            identifierInput.value = googleEmail;
            identifierInput.readOnly = true;
          } else {
            identifierInput.readOnly = false;
          }
        }
        if (googleCheckboxContainer) googleCheckboxContainer.style.display = 'block';
        if (typeEmailBtn) {
          typeEmailBtn.style.background = 'rgba(255, 255, 255, 0.3)';
          typeEmailBtn.style.color = '#fff';
        }
        if (typeUsernameBtn) {
          typeUsernameBtn.style.background = 'transparent';
          typeUsernameBtn.style.color = 'rgba(255, 255, 255, 0.65)';
        }
      } else {
        if (identifierLabel) identifierLabel.textContent = 'Username';
        if (identifierInput) {
          identifierInput.placeholder = 'e.g. john_doe';
          identifierInput.type = 'text';
          identifierInput.readOnly = false;
          if (identifierInput.value === googleEmail) {
            identifierInput.value = googleEmail.split('@')[0] || '';
          }
          if (identifierInput.value) {
            checkRealtimeUsername(identifierInput.value);
          }
        }
        if (googleCheckboxContainer) googleCheckboxContainer.style.display = 'none';
        if (typeUsernameBtn) {
          typeUsernameBtn.style.background = 'rgba(255, 255, 255, 0.3)';
          typeUsernameBtn.style.color = '#fff';
        }
        if (typeEmailBtn) {
          typeEmailBtn.style.background = 'transparent';
          typeEmailBtn.style.color = 'rgba(255, 255, 255, 0.65)';
        }
      }
    };

    if (typeEmailBtn) typeEmailBtn.onclick = () => setIdentifierType('email');
    if (typeUsernameBtn) typeUsernameBtn.onclick = () => setIdentifierType('username');

    if (useGoogleEmailCheckbox) {
      useGoogleEmailCheckbox.checked = true;
      useGoogleEmailCheckbox.onchange = () => {
        if (useGoogleEmailCheckbox.checked) {
          if (identifierInput) {
            identifierInput.value = googleEmail;
            identifierInput.readOnly = true;
          }
        } else {
          if (identifierInput) {
            identifierInput.readOnly = false;
            identifierInput.focus();
          }
        }
      };
    }

    setIdentifierType('email');

    const setupToggle = (toggleBtnId, targetInput) => {
      const toggleBtn = document.getElementById(toggleBtnId);
      if (toggleBtn && targetInput) {
        toggleBtn.onclick = () => {
          const isPassword = targetInput.type === 'password';
          targetInput.type = isPassword ? 'text' : 'password';
          toggleBtn.style.color = isPassword ? '#0071E3' : 'rgba(255, 255, 255, 0.7)';
        };
      }
    };
    setupToggle('workerNewPasswordToggle', newPasswordInput);
    setupToggle('workerConfirmPasswordToggle', confirmPasswordInput);

    this.dialogManager.openModal(this.workerCredentialModal, newPasswordInput);

    return new Promise((resolve) => {
      const close = () => {
        this.dialogManager.closeModal(this.workerCredentialModal);
        resolve();
      };

      const skipBtn = document.getElementById('skipWorkerPasswordBtn');
      if (skipBtn) {
        skipBtn.onclick = () => {
          if (inputStep) inputStep.style.display = 'none';
          if (dismissStep) dismissStep.style.display = 'block';
        };
      }

      const closeDismissBtn = document.getElementById('closeWorkerDismissStep');
      if (closeDismissBtn) {
        closeDismissBtn.onclick = () => {
          if (dismissStep) dismissStep.style.display = 'none';
          if (inputStep) inputStep.style.display = 'block';
        };
      }

      const justThisTimeBtn = document.getElementById('confirmWorkerJustThisTimeBtn');
      if (justThisTimeBtn) {
        justThisTimeBtn.onclick = close;
      }

      const dontAskBtn = document.getElementById('dontAskWorkerPasswordBtn');
      if (dontAskBtn) {
        dontAskBtn.onclick = () => {
          localStorage.setItem('worker_password_prompt_dismissed', 'true');
          close();
        };
      }

      const inputStep = document.getElementById('workerPasswordInputStep');
      const securityStep = document.getElementById('workerSecurityQuestionStep');
      const dismissStep = document.getElementById('workerPasswordDismissStep');
      const questionSelect = document.getElementById('workerSecurityQuestionSelect');
      const answerInput = document.getElementById('workerSecurityAnswerInput');

      const continueBtn = document.getElementById('saveWorkerPasswordBtn');
      const backBtn = document.getElementById('backToWorkerCredentialsBtn');
      const saveSecurityBtn = document.getElementById('saveWorkerSecurityBtn');

      let validatedCredentials = null;

      if (continueBtn) {
        continueBtn.onclick = async () => {
          const identifierVal = identifierInput ? identifierInput.value.trim() : '';
          const password = newPasswordInput ? newPasswordInput.value : '';
          const confirmation = confirmPasswordInput ? confirmPasswordInput.value : '';
          if (!identifierVal) return alert(`Please enter a ${currentIdType === 'email' ? 'email address' : 'username'}.`);
          if (currentIdType === 'username' && identifierVal.length < 3) return alert('Username must be at least 3 characters.');
          if (!password) return alert('Please enter a password.');
          if (password !== confirmation) return alert('Passwords do not match.');

          // If username, do a quick availability check if not already confirmed
          if (currentIdType === 'username' && !isUsernameAvailable) {
            try {
              const chk = await fetch(`/api/auth/check-username?username=${encodeURIComponent(identifierVal)}`).then(r => r.json());
              if (!chk.available) {
                alert(chk.message || 'This username is already taken. Please choose another.');
                return;
              }
            } catch (e) {
              // Non-blocking if network check fails
            }
          }

          validatedCredentials = {
            identifierVal,
            password,
            currentIdType
          };

          if (inputStep) inputStep.style.display = 'none';
          if (securityStep) {
            securityStep.style.display = 'block';
            if (questionSelect) {
              setTimeout(() => {
                if (!questionSelect.value) questionSelect.focus();
                else if (answerInput) answerInput.focus();
              }, 100);
            }
          }
        };
      }

      if (backBtn) {
        backBtn.onclick = () => {
          if (securityStep) securityStep.style.display = 'none';
          if (inputStep) {
            inputStep.style.display = 'block';
            if (newPasswordInput) setTimeout(() => newPasswordInput.focus(), 100);
          }
        };
      }

      if (saveSecurityBtn) {
        saveSecurityBtn.onclick = async () => {
          if (!validatedCredentials) {
            if (securityStep) securityStep.style.display = 'none';
            if (inputStep) inputStep.style.display = 'block';
            return;
          }

          const selectedQuestion = questionSelect ? questionSelect.value : '';
          const secretAnswer = answerInput ? answerInput.value.trim() : '';

          if (!selectedQuestion) {
            alert('Please select a security question.');
            if (questionSelect) questionSelect.focus();
            return;
          }

          if (!secretAnswer) {
            alert('Please enter an answer to your security question.');
            if (answerInput) answerInput.focus();
            return;
          }

          const { identifierVal, password, currentIdType: idType } = validatedCredentials;

          const payload = {
            newPassword: password,
            securityQuestion: selectedQuestion,
            securityAnswer: secretAnswer
          };

          if (idType === 'username' || !identifierVal.includes('@')) {
            payload.username = identifierVal;
            payload.identifier = identifierVal;
          } else {
            payload.email = identifierVal;
            payload.identifier = identifierVal;
          }

          try {
            const csrfToken = document.cookie.split('; ').find(i => i.startsWith('csrf_token='))?.split('=')[1];
            const headers = { 'Content-Type': 'application/json' };
            if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);

            const response = await fetch('/api/auth/update-security', {
              method: 'POST',
              credentials: 'include',
              headers,
              body: JSON.stringify(payload)
            });
            const resData = await response.json();
            if (!response.ok) return alert(resData.error || 'Unable to save credentials.');
            
            alert('✓ Local account credentials and security question saved successfully!');
            close();
          } catch (err) {
            console.error('Save credentials error:', err);
            alert('Failed to connect to server.');
          }
        };
      }
    });
  }

  showRememberAccountPrompt(identifier, profile, authUser = null) {
    const normIdentifier = (identifier || authUser?.email || authUser?.username || profile?.email || profile?.username || '').trim();
    const userId = authUser?.id || profile?.id || null;
    const isThisAccountRemembered = this.profileManager.isUserRemembered(normIdentifier, userId);

    const displayName = authUser?.name || authUser?.displayName || authUser?.username || 
                        profile?.display_name || profile?.full_name || profile?.name || 
                        (normIdentifier ? normIdentifier.split('@')[0] : 'User');
    const displayPicture = authUser?.picture || authUser?.displayPicture || 
                           profile?.display_picture || profile?.profile_picture || null;
    const role = authUser?.role || profile?.role || 'user';

    const saveRememberedProfile = () => {
      this.profileManager.saveUser({
        id: userId,
        identifier: normIdentifier,
        displayName,
        displayPicture,
        role,
        isTouchIdEnabled: localStorage.getItem('touchIdEnabled') === 'true'
      });
      this.syncProfile();
    };

    const discardRememberedProfile = () => {
      if (normIdentifier) {
        this.profileManager.removeUser(normIdentifier);
      }
      this.syncProfile();
    };

    const showTouchIdChoice = () => {
      if (
        localStorage.getItem('touchIdEnabled') === 'true' ||
        localStorage.getItem(`macos_touchid_prompt_dismissed_${normIdentifier}`) === 'true'
      ) {
        this.goHome();
        return;
      }
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'none';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'block';
      this.dialogManager.openModal(this.accountPreferenceModal);
    };

    if (isThisAccountRemembered) {
      // Account is already remembered -> refresh stored details and proceed
      saveRememberedProfile();
      showTouchIdChoice();
    } else {
      // Account is NOT remembered yet -> show Remember Account prompt
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'block';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'none';
      if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'none';
      this.dialogManager.openModal(this.accountPreferenceModal);
    }

    const continueWithoutRemembering = () => {
      localStorage.setItem(`macos_remember_prompt_dismissed_${normIdentifier}`, 'true');
      discardRememberedProfile();
      this.goHome();
    };

    const continueWithoutTouchId = () => {
      localStorage.setItem(`macos_touchid_prompt_dismissed_${normIdentifier}`, 'true');
      this.goHome();
    };

    document.getElementById('dontRememberAccountBtn').onclick = () => {
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'none';
      if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'block';
    };

    document.getElementById('closeRememberDismissStep').onclick = () => {
      if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'none';
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'block';
    };

    document.getElementById('rememberAccountBtn').onclick = () => {
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'none';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'block';
    };

    document.getElementById('cancelRememberAccountBtn').onclick = () => {
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'block';
    };

    document.getElementById('rememberAccountDontAskOption').onclick = continueWithoutRemembering;
    document.getElementById('confirmDontRememberAccountBtn').onclick = () => {
      discardRememberedProfile();
      this.goHome();
    };

    document.getElementById('confirmRememberAccountBtn').onclick = () => {
      saveRememberedProfile();
      showTouchIdChoice();
    };

    document.getElementById('skipTouchIdBtn').onclick = () => {
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'none';
      if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'block';
    };

    document.getElementById('closeTouchIdDismissStep').onclick = () => {
      if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'block';
    };

    document.getElementById('touchIdDontAskOption').onclick = continueWithoutTouchId;
    document.getElementById('confirmSkipTouchIdBtn').onclick = () => this.goHome();

    document.getElementById('chooseTouchIdBtn').onclick = () => {
      this.dialogManager.openModal(this.touchIdSetupModal, this.setupPasswordInput);
    };

    // Touch ID Setup Failed Handlers
    document.getElementById('touchIdFailedRetryBtn').onclick = () => {
      this.dialogManager.closeModal(this.accountPreferenceModal);
      if (this.setupPasswordInput) this.setupPasswordInput.value = '';
      this.dialogManager.openModal(this.touchIdSetupModal, this.setupPasswordInput);
    };

    document.getElementById('touchIdFailedNotNowBtn').onclick = () => this.goHome();
    document.getElementById('touchIdFailedDontAskBtn').onclick = continueWithoutTouchId;
    document.getElementById('closeTouchIdFailedStep').onclick = () => this.goHome();
  }

  /* --------------------------------------------------------------------------
     WEBAUTHN & BIOMETRICS
     -------------------------------------------------------------------------- */
  handleTouchID() {
    const isEnabled = localStorage.getItem('touchIdEnabled') === 'true';
    if (localStorage.getItem('macos_remember_account') !== 'true') {
      this.openLoginModal();
      return;
    }

    if (!isEnabled) {
      this.dialogManager.openModal(this.touchIdSetupModal, this.setupPasswordInput);
    } else {
      this.authenticateBiometrics();
    }
  }

  base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  }

  bytesToBase64Url(value) {
    return btoa(String.fromCharCode(...new Uint8Array(value)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  serializeCredential(credential) {
    const response = credential.response;
    const result = {
      id: credential.id,
      rawId: this.bytesToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: this.bytesToBase64Url(response.clientDataJSON)
      }
    };

    if (response.attestationObject) {
      result.response.attestationObject = this.bytesToBase64Url(response.attestationObject);
    }
    if (response.authenticatorData) {
      result.response.authenticatorData = this.bytesToBase64Url(response.authenticatorData);
      result.response.signature = this.bytesToBase64Url(response.signature);
      result.response.userHandle = response.userHandle ? this.bytesToBase64Url(response.userHandle) : null;
    }
    return result;
  }

  prepareRegistrationOptions(options) {
    options.challenge = this.base64UrlToBytes(options.challenge);
    options.user.id = this.base64UrlToBytes(options.user.id);
    (options.excludeCredentials || []).forEach((c) => {
      c.id = this.base64UrlToBytes(c.id);
    });
    return options;
  }

  prepareAuthenticationOptions(options) {
    options.challenge = this.base64UrlToBytes(options.challenge);
    (options.allowCredentials || []).forEach((c) => {
      c.id = this.base64UrlToBytes(c.id);
    });
    return options;
  }

  async registerBiometrics() {
    if (this.touchIdRegistrationInFlight) return;
    const password = this.setupPasswordInput?.value;
    if (!password) return alert('Please enter your password.');

    const showTouchIdFailed = (title, message) => {
      this.dialogManager.closeModal(this.touchIdSetupModal);
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'none';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'none';
      if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'none';

      const failedStep = document.getElementById('touchIdFailedStep');
      const titleEl = document.getElementById('touchIdFailedTitle');
      const msgEl = document.getElementById('touchIdFailedMessage');
      if (titleEl && title) titleEl.textContent = title;
      if (msgEl && message) msgEl.textContent = message;
      if (failedStep) failedStep.style.display = 'block';

      this.dialogManager.openModal(this.accountPreferenceModal);
    };

    this.touchIdRegistrationInFlight = true;
    try {
      const authRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: this.loginIdentifierInput?.value.trim(), password })
      });

      if (!authRes.ok) {
        const authData = await authRes.json();
        alert(authData.error || 'Incorrect password');
        return;
      }

      if (!window.PublicKeyCredential) {
        showTouchIdFailed('Touch ID Unavailable', 'Biometric authentication is not supported by your browser or device.');
        return;
      }

      const optionsRes = await fetch('/api/auth/webauthn/registration-options');
      if (!optionsRes.ok) throw new Error('Unable to prepare Touch ID setup');
      const options = this.prepareRegistrationOptions(await optionsRes.json());
      const credential = await navigator.credentials.create({ publicKey: options });

      if (credential) {
        const verifyRes = await fetch('/api/auth/webauthn/registration-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.serializeCredential(credential))
        });
        if (!verifyRes.ok) throw new Error('Touch ID registration was not verified');

        localStorage.setItem('touchIdEnabled', 'true');
        sessionStorage.setItem('macos_session_active', 'true');

        alert('✓ Touch ID setup successful!');
        this.updateLoginHint();
        this.goHome();
      }
    } catch (err) {
      console.error('Biometric registration failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        showTouchIdFailed('Touch ID Setup Cancelled', 'Biometric registration was cancelled. You can retry now or continue using your password.');
        return;
      }
      showTouchIdFailed('Touch ID Setup Failed', err.message || 'Biometric setup could not be completed. You can retry now or continue using your password.');
    } finally {
      this.touchIdRegistrationInFlight = false;
    }
  }

  async authenticateBiometrics() {
    try {
      const identifier = localStorage.getItem('macos_user_identifier');
      if (!identifier) throw new Error('Remembered account not found');
      const optionsRes = await fetch(`/api/auth/webauthn/authentication-options?identifier=${encodeURIComponent(identifier)}`);
      if (!optionsRes.ok) throw new Error('Touch ID is not configured');
      const options = this.prepareAuthenticationOptions(await optionsRes.json());
      const assertion = await navigator.credentials.get({ publicKey: options });

      if (assertion) {
        const { deviceName, deviceType, clientType } = await this.getDeviceInfo();
        const response = await fetch('/api/auth/webauthn/authentication-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            deviceName,
            deviceType,
            clientType,
            response: this.serializeCredential(assertion)
          })
        });

        const resData = await response.json();
        if (response.ok) {
          const profile = await this.loadAuthenticatedProfile();
          this.showRememberAccountPrompt(identifier, profile, resData?.user || null);
        } else {
          alert(resData.error || 'Biometric login failed');
        }
      }
    } catch (err) {
      console.error('Biometric authentication failed:', err);
      if (err.name !== 'NotAllowedError') {
        alert('Biometric authentication failed. Please enter your password.');
      }
      this.dialogManager.handleDismissal();
    }
  }

  /* --------------------------------------------------------------------------
     GOOGLE IDENTITY SERVICES
     -------------------------------------------------------------------------- */
  async initGoogleAuth() {
    if (!window.google?.accounts?.id) {
      setTimeout(() => this.initGoogleAuth(), 500);
      return;
    }
    try {
      const configResponse = await fetch('/api/auth/google/config');
      const config = await configResponse.json();
      if (!configResponse.ok) return;

      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: (res) => this.handleGoogleCredential(res),
        auto_select: false,
        use_fedcm_for_prompt: false,
        cancel_on_tap_outside: false
      });

      const buttonContainer = document.getElementById('googleSignInButton');
      if (buttonContainer) {
        const buttonWidth = Math.floor(buttonContainer.getBoundingClientRect().width);
        window.google.accounts.id.renderButton(buttonContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: buttonWidth
        });
      }

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.info('[Google] One Tap unavailable:', notification.getNotDisplayedReason?.() || 'browser decision');
        }
      });
    } catch (error) {
      console.warn('[Google] One Tap initialization failed:', error.message);
    }
  }

  async handleGoogleCredential(response, linkPassword = null) {
    try {
      if (!response?.credential) throw new Error('Google did not return an ID token. Please try again.');
      const { deviceName, deviceType, clientType } = await this.getDeviceInfo();
      const body = { idToken: response.credential, deviceName, deviceType, clientType };
      if (linkPassword) body.linkPassword = linkPassword;

      const result = await fetch('/api/auth/google/worker-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await result.json();

      if (result.status === 409 && data.requiresLinking) {
        this.pendingGoogleCredential = response;
        this.dialogManager.openModal(this.ownerLinkModal, document.getElementById('ownerLinkPassword'));
      } else if (data.status === 'pending') {
        this.pendingGoogleCredential = response;
        this.showWorkerPending(data);
      } else if (result.ok) {
        await this.finishAuthenticatedLogin(data, data.user?.email || '');
      } else {
        alert(data.message || data.error || 'Google sign-in failed.');
      }
    } catch (error) {
      console.error('[Google] Login request failed:', error);
      alert(error.message || 'Google sign-in failed. Please try again.');
    }
  }

  showWorkerPending(data) {
    this.dialogManager.openModal(this.workerPendingModal);
    const rawCode = String(data.inviteCode || '');
    const displayCode = rawCode.length > 8 ? rawCode.slice(0, 6).toUpperCase() : rawCode;
    document.getElementById('workerInviteCode').textContent = displayCode;
    const qr = document.getElementById('workerInviteQr');
    const canvas = document.createElement('canvas');

    if (window.QRCode && data.inviteCode) {
      window.QRCode.toCanvas(canvas, data.inviteCode, { width: 180, margin: 1, errorCorrectionLevel: 'H' });
      qr.src = canvas.toDataURL('image/png');
      qr.style.display = 'block';
    } else if (data.inviteQr) {
      qr.src = data.inviteQr;
      qr.style.display = 'block';
    }

    this.pendingWorkerInvite = data.inviteCode;
    const poll = async () => {
      if (!this.pendingWorkerInvite) return;
      const response = await fetch(`/api/auth/worker/status?inviteCode=${encodeURIComponent(this.pendingWorkerInvite)}`);
      if (!response.ok) return;
      const status = await response.json();
      if (status.approved) {
        this.pendingWorkerInvite = null;
        this.dialogManager.closeModal(this.workerPendingModal);
        if (this.pendingGoogleCredential) {
          await this.handleGoogleCredential(this.pendingGoogleCredential);
        } else {
          alert('Your access was approved. Sign in with Google again to continue.');
        }
      } else if (this.pendingWorkerInvite) {
        setTimeout(poll, 4000);
      }
    };
    poll();
  }

  /* --------------------------------------------------------------------------
     FORGOT PASSWORD & RECOVERY
     -------------------------------------------------------------------------- */
  async handleForgotPassword() {
    const identifier = this.loginIdentifierInput?.value.trim() || localStorage.getItem('macos_user_identifier') || '';
    if (!identifier) {
      if (this.loginIdentifierField) this.loginIdentifierField.style.display = 'block';
      if (this.loginIdentifierInput) {
        this.loginIdentifierInput.focus();
        this.loginIdentifierInput.classList.add('error-shake');
        setTimeout(() => this.loginIdentifierInput.classList.remove('error-shake'), 500);
      }
      return;
    }

    try {
      const response = await fetch(`/api/auth/challenge?identifier=${encodeURIComponent(identifier)}`);
      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'No account found with this username or email.');
        if (this.loginIdentifierField) this.loginIdentifierField.style.display = 'block';
        if (this.loginIdentifierInput) {
          this.loginIdentifierInput.focus();
          this.loginIdentifierInput.classList.add('error-shake');
          setTimeout(() => this.loginIdentifierInput.classList.remove('error-shake'), 500);
        }
        return;
      }

      if (this.loginIdentifierField) this.loginIdentifierField.style.display = 'none';
      if (this.recoveryIdentityField) this.recoveryIdentityField.style.display = 'block';
      if (this.recoveryIdentityDisplay) this.recoveryIdentityDisplay.textContent = identifier;

      const passField = document.getElementById('loginPasswordField');
      if (passField) passField.style.display = 'none';
      const touchidText = document.getElementById('touchidText');
      if (touchidText) touchidText.style.display = 'none';
      const forgotPassText = document.getElementById('forgotPasswordText');
      if (forgotPassText) forgotPassText.style.display = 'none';

      // Hide Google sign-in during forgot password flow
      const googleSec = document.getElementById('googleSignInSection');
      if (googleSec) googleSec.style.display = 'none';

      const questionSection = document.getElementById('securityQuestionSection');
      const questionDisplay = document.getElementById('challengeQuestionDisplay');
      const answerLabel = document.getElementById('securityAnswerLabel');
      const answerInput = document.getElementById('securityAnswerInput');
      const isRecoveryKey = !data.question;

      if (questionDisplay) {
        questionDisplay.textContent = isRecoveryKey 
          ? 'Enter your recovery key to reset password'
          : data.question;
      }
      if (answerLabel) {
        answerLabel.textContent = isRecoveryKey ? 'Recovery Key' : 'Security Answer';
      }
      if (answerInput) {
        answerInput.placeholder = isRecoveryKey ? 'Recovery Key' : 'Your Answer';
        answerInput.value = '';
      }
      if (questionSection) questionSection.style.display = 'block';
      if (answerInput) setTimeout(() => answerInput.focus(), 150);

      const cancelBtn = document.getElementById('cancelRecoveryBtn');
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          this.resetLoginForm();
          this.openLoginModal();
        };
      }

      const verifyAnswerAction = async () => {
        if (this.answerVerificationInFlight) return;
        const answer = answerInput?.value?.trim();
        if (!answer) {
          if (answerInput) {
            answerInput.classList.add('error-shake');
            setTimeout(() => answerInput.classList.remove('error-shake'), 500);
          }
          return;
        }

        this.answerVerificationInFlight = true;
        const verifyBtn = document.getElementById('verifyAnswerBtn');
        if (verifyBtn) verifyBtn.disabled = true;

        try {
          let verified = false;

          if (isRecoveryKey) {
            // Verify recovery key via auth endpoint
            const recRes = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier, password: answer })
            });
            const recData = await recRes.json();
            verified = recRes.ok;
            if (!verified) {
              if (answerInput) {
                answerInput.classList.add('error-shake');
                setTimeout(() => answerInput.classList.remove('error-shake'), 500);
              }
              alert(recData.error || 'Invalid recovery key');
              return;
            }
          } else {
            // Verify security question answer
            const vRes = await fetch('/api/auth/verify-answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answer, identifier })
            });
            verified = vRes.ok;
            if (!verified) {
              if (answerInput) {
                answerInput.classList.add('error-shake');
                setTimeout(() => answerInput.classList.remove('error-shake'), 500);
              }
              alert('Incorrect answer');
              return;
            }
          }

          if (verified) {
            sessionStorage.setItem('macos_session_active', 'true');
            if (questionSection) questionSection.style.display = 'none';
            const resetSection = document.getElementById('passwordResetSection');
            if (resetSection) resetSection.style.display = 'flex';

            const newPassInput = document.getElementById('resetNewPassword');
            if (newPassInput) {
              newPassInput.value = '';
              setTimeout(() => newPassInput.focus(), 150);
            }

            const confirmResetAction = async () => {
              const newPassword = document.getElementById('resetNewPassword')?.value;
              const confirmPassword = document.getElementById('resetConfirmPassword')?.value;
              if (!newPassword || newPassword !== confirmPassword) {
                alert('Passwords do not match');
                return;
              }
              const updateRes = await fetch('/api/auth/update-security', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
              });
              if (updateRes.ok) {
                alert('✓ Password updated successfully! Please sign in with your new password.');
                this.resetLoginForm();
                this.openLoginModal();
              } else {
                const errData = await updateRes.json();
                alert(errData.error || 'Failed to update password');
              }
            };

            const confirmResetBtn = document.getElementById('confirmResetBtn');
            if (confirmResetBtn) confirmResetBtn.onclick = confirmResetAction;

            const resetConfirmActionBtn = document.getElementById('resetConfirmActionBtn');
            if (resetConfirmActionBtn) resetConfirmActionBtn.onclick = confirmResetAction;
          }
        } finally {
          this.answerVerificationInFlight = false;
          if (verifyBtn) verifyBtn.disabled = false;
        }
      };

      const verifyBtn = document.getElementById('verifyAnswerBtn');
      if (verifyBtn) verifyBtn.onclick = verifyAnswerAction;

      const verifyActionBtn = document.getElementById('verifyAnswerActionBtn');
      if (verifyActionBtn) verifyActionBtn.onclick = verifyAnswerAction;

    } catch (err) {
      console.error('Challenge error:', err);
    }
  }

  /* --------------------------------------------------------------------------
     EVENT LISTENERS & BINDINGS
     -------------------------------------------------------------------------- */
  initEventListeners() {
    // Password toggles & action buttons
    document.getElementById('passwordToggleBtn')?.addEventListener('click', () => {
      if (this.passwordInput) {
        this.passwordInput.type = this.passwordInput.type === 'password' ? 'text' : 'password';
      }
    });

    document.getElementById('loginPasswordActionBtn')?.addEventListener('click', () => this.handleLogin());
    document.getElementById('forgotPasswordText')?.addEventListener('click', () => this.handleForgotPassword());
    document.getElementById('touchidText')?.addEventListener('click', () => this.handleTouchID());

    // Switch User Handler
    this.switchUserBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSwitchUser();
    });

    // Remove Account Confirmation Modal Listeners
    this.confirmRemoveAccountBtn?.addEventListener('click', () => {
      this.confirmRemoveAccount();
    });

    this.cancelRemoveAccountBtn?.addEventListener('click', () => {
      this.pendingAccountRemovalId = null;
      this.dialogManager.closeModal(this.removeAccountModal);
    });

    // Profile updates from Settings or other components
    window.addEventListener('macos-profiles-updated', () => {
      this.syncProfile();
    });

    window.addEventListener('macos-profile-updated', () => {
      this.syncProfile();
    });

    // Profile Click / Context Menu (Fallback single-user view)
    if (this.profileAvatar) {
      this.profileAvatar.addEventListener('click', () => this.openLoginModal());
      this.profileAvatar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.profileManager.getUsers().length > 0) {
          this.profileMenu?.classList.add('active');
        }
      });
    }

    if (this.profileUsername) {
      this.profileUsername.addEventListener('click', () => this.openLoginModal());
    }

    document.getElementById('forgetRememberedAccountBtn')?.addEventListener('click', async () => {
      const active = this.profileManager.getActiveUser();
      if (active) {
        this.profileManager.removeUser(active.id);
      } else {
        this.profileManager.clearAllUsers();
      }
      sessionStorage.removeItem('macos_session_active');
      if (this.profileMenu) this.profileMenu.classList.remove('active');
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      await this.syncProfile();
      this.updateLoginHint();
    });

    document.addEventListener('click', (e) => {
      if (this.profileMenu?.classList.contains('active') && !this.profileMenu.contains(e.target) && e.target !== this.profileAvatar) {
        this.profileMenu.classList.remove('active');
      }
    });

    // Inputs & Enter key handling
    if (this.passwordInput) {
      this.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleLogin();
        }
      });

      this.passwordInput.addEventListener('input', () => {
        clearTimeout(this.loginAutoSubmitTimer);
        if (!this.loginIdentifierInput?.value.trim() || !this.passwordInput.value || !this.loginModal?.classList.contains('active')) return;
        this.loginAutoSubmitTimer = setTimeout(() => this.handleLogin(), 900);
      });
    }

    // Owner link modal bindings
    document.getElementById('cancelOwnerLinkBtn')?.addEventListener('click', () => {
      this.pendingGoogleCredential = null;
      this.dialogManager.closeModal(this.ownerLinkModal);
      this.dialogManager.openModal(this.loginModal);
    });

    document.getElementById('confirmOwnerLinkBtn')?.addEventListener('click', async () => {
      const password = document.getElementById('ownerLinkPassword')?.value;
      if (!password || !this.pendingGoogleCredential) return;
      this.dialogManager.closeModal(this.ownerLinkModal);
      const credential = this.pendingGoogleCredential;
      this.pendingGoogleCredential = null;
      await this.handleGoogleCredential(credential, password);
    });

    document.getElementById('ownerLinkActionBtn')?.addEventListener('click', () => {
      document.getElementById('confirmOwnerLinkBtn')?.click();
    });

    document.getElementById('ownerLinkPasswordToggle')?.addEventListener('click', () => {
      const input = document.getElementById('ownerLinkPassword');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('cancelWorkerPendingBtn')?.addEventListener('click', () => {
      this.pendingWorkerInvite = null;
      this.dialogManager.closeModal(this.workerPendingModal);
    });

    // Touch ID setup buttons
    document.getElementById('cancelTouchIdSetup')?.addEventListener('click', () => this.goHome());
    document.getElementById('confirmTouchIdSetup')?.addEventListener('click', () => this.registerBiometrics());
    document.getElementById('setupPasswordActionBtn')?.addEventListener('click', () => this.registerBiometrics());
    document.getElementById('setupPasswordToggleBtn')?.addEventListener('click', () => {
      const input = document.getElementById('setupPasswordInput');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    if (this.setupPasswordInput) {
      this.setupPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.registerBiometrics();
        }
      });
    }

    // Security Question & Reset password inputs
    const secAnswer = document.getElementById('securityAnswerInput');
    if (secAnswer) {
      secAnswer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('verifyAnswerBtn')?.click();
        }
      });
    }

    const resetNew = document.getElementById('resetNewPassword');
    if (resetNew) {
      resetNew.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('resetConfirmPassword')?.focus();
        }
      });
    }

    const resetConfirm = document.getElementById('resetConfirmPassword');
    if (resetConfirm) {
      resetConfirm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('confirmResetBtn')?.click();
        }
      });
    }

    document.getElementById('resetNewToggleBtn')?.addEventListener('click', () => {
      const input = document.getElementById('resetNewPassword');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('resetConfirmToggleBtn')?.addEventListener('click', () => {
      const input = document.getElementById('resetConfirmPassword');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Global Keypress to open login
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('login-active')) {
        const isPrintableKey = typeof e.key === 'string' && e.key.length === 1;
        const isEnter = e.key === 'Enter';
        const noModifiers = !e.ctrlKey && !e.altKey && !e.metaKey;
        if ((isPrintableKey || isEnter) && noModifiers) {
          this.openLoginModal();
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     DEVICE DETECTION HELPER
     -------------------------------------------------------------------------- */
  async getDeviceInfo() {
    const userAgent = navigator.userAgent;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true || 
                  document.referrer.includes('android-app://');
    let clientType = isPWA ? 'pwa' : 'web';
    let deviceName = 'Generic Device';
    let deviceType = isPWA ? 'Mobile (PWA)' : (/Mobi|Android/i.test(userAgent) ? 'Mobile' : 'Desktop');

    try {
      const res = await fetch('/api/system/info');
      if (res.ok) {
        const data = await res.json();
        const clientPlatform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
        const platformMatch =
          (data.platform === 'win32' && clientPlatform.includes('win')) ||
          (data.platform === 'darwin' && (clientPlatform.includes('mac') || clientPlatform.includes('iphone'))) ||
          (data.platform === 'linux' && clientPlatform.includes('linux'));

        if (platformMatch && data.model && !data.model.toLowerCase().includes('generic') && !data.model.toLowerCase().includes('pc')) {
          deviceName = data.model;
        } else if (data.hostname && !data.hostname.toLowerCase().includes('localhost')) {
          const lowerHostname = data.hostname.toLowerCase();
          if (lowerHostname.includes('hp') && clientPlatform.includes('win')) deviceName = 'HP Slim Desktop';
          else if (lowerHostname.includes('mac') && data.platform === 'darwin') deviceName = 'MacBook Pro';
          else if (lowerHostname.includes('dell') && clientPlatform.includes('win')) deviceName = 'Dell Desktop';
          else if (!platformMatch && deviceType === 'Desktop' && lowerHostname.includes('-') && lowerHostname.length > 5) {
            deviceName = data.hostname;
          }
        }
      }
    } catch (e) {}

    if (deviceName === 'Generic Device' && navigator.userAgentData?.getHighEntropyValues) {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platform']);
        if (hints.model) {
          deviceName = hints.model;
          if (userAgent.includes('Samsung')) deviceName = 'Samsung ' + deviceName;
          else if (userAgent.includes('Pixel')) deviceName = 'Google ' + deviceName;
        } else if (hints.platform) {
          deviceName = hints.platform + ' PC';
        }
      } catch (e) {}
    }

    if (deviceName === 'Generic Device' || deviceName.includes('PC')) {
      if (userAgent.includes('iPhone')) deviceName = window.screen.height >= 844 ? 'iPhone 15 Pro' : 'iPhone';
      else if (userAgent.includes('iPad')) deviceName = 'iPad Pro';
      else if (userAgent.includes('Macintosh')) deviceName = 'MacBook Pro';
      else if (userAgent.includes('Windows')) deviceName = userAgent.includes('x64') ? 'Windows PC (x64)' : 'Windows PC';
      else if (userAgent.includes('Android')) {
        const modelMatch = userAgent.match(/Android.*;\s*([^;)]+)\s*[);]/);
        deviceName = modelMatch && modelMatch[1] ? modelMatch[1].trim() : 'Android Device';
      }
    }

    return { deviceName, deviceType, clientType };
  }
}
