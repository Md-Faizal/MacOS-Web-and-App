/**
 * Core Authentication & Onboarding Controller
 * Manages local credentials, biometric WebAuthn, Google Identity Services, and post-auth onboarding.
 */

import { DialogManager } from './dialog-manager.js';
import { LockscreenDragController } from './lockscreen-drag.js';

export class AuthController {
  constructor() {
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

    this.loginIdentifierInput = document.getElementById('loginIdentifierInput');
    this.loginIdentifierField = document.getElementById('loginIdentifierField');
    this.recoveryIdentityField = document.getElementById('recoveryIdentityField');
    this.recoveryIdentityDisplay = document.getElementById('recoveryIdentityDisplay');
    this.passwordInput = document.getElementById('loginPasswordInput');
    this.setupPasswordInput = document.getElementById('setupPasswordInput');
    this.googleSignInSection = document.getElementById('googleSignInSection');

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

    this.homeTimeSettings = JSON.parse(localStorage.getItem('mac-system-time-settings')) || { mode: 'auto' };
  }

  initDialogManager() {
    this.dialogManager = new DialogManager({
      onPreAuthClose: () => {
        this.resetLoginForm();
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
    img.src = '/assets/Wallpaper/Static/tahoe-beach/tahoe-beach.light.jpg';
  }

  /* --------------------------------------------------------------------------
     PROFILE & STATE SYNC
     -------------------------------------------------------------------------- */
  async syncProfile() {
    const isRemembered = localStorage.getItem('macos_remember_account') === 'true';
    const cachedName = localStorage.getItem('macos_user_display_name');
    const cachedPicture = localStorage.getItem('macos_user_display_picture');

    const avatarElements = [
      document.querySelector('.modal-avatar'),
      document.getElementById('profileAvatar')
    ];
    const usernameElements = [
      document.getElementById('modalUsername'),
      document.getElementById('profileUsername')
    ];

    if (isRemembered && cachedName) {
      usernameElements.forEach((el) => { if (el) el.textContent = cachedName; });
    } else {
      usernameElements.forEach((el) => { if (el) el.textContent = 'Sign in'; });
    }

    if (this.loginIdentifierInput) {
      this.loginIdentifierInput.value = isRemembered ? (localStorage.getItem('macos_user_identifier') || '') : '';
    }

    avatarElements.forEach((el) => {
      if (el) {
        if (isRemembered && cachedPicture) {
          el.innerHTML = `<img src="${cachedPicture}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
          el.style.background = 'transparent';
        } else {
          el.innerHTML = `<img src="/assets/Images/DefaultUser.png" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
          el.style.background = 'transparent';
        }
      }
    });
  }

  updateLoginHint() {
    const isRemembered = localStorage.getItem('macos_remember_account') === 'true';
    const touchIdEnabled = localStorage.getItem('touchIdEnabled') === 'true';
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
  async openLoginModal() {
    await this.checkSecurityStatus();
    this.getBackgroundBrightness();

    const isRemembered = localStorage.getItem('macos_remember_account') === 'true';
    if (this.loginIdentifierField) {
      this.loginIdentifierField.style.display = isRemembered ? 'none' : 'block';
    }

    const focusTarget = !isRemembered && !this.loginIdentifierInput?.value
      ? this.loginIdentifierInput
      : this.passwordInput;

    this.dialogManager.openModal(this.loginModal, focusTarget);
  }

  resetLoginForm() {
    const isRemembered = localStorage.getItem('macos_remember_account') === 'true';
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
    this.dialogManager.closeAllModals();
    document.body.classList.remove('login-active');
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

    const { deviceName, deviceType } = await this.getDeviceInfo();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, deviceName, deviceType })
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
    const profile = await this.loadAuthenticatedProfile();

    if (
      data.role === 'worker' &&
      data.user &&
      !data.user.hasLocalPassword &&
      localStorage.getItem('worker_password_prompt_dismissed') !== 'true'
    ) {
      await this.showWorkerCredentialPrompt(data, profile);
    }
    this.showRememberAccountPrompt(identifier, profile);
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
    const emailInput = document.getElementById('workerEmailInput');
    const useGoogleEmailCheckbox = document.getElementById('workerUseGoogleEmailCheckbox');
    const newPasswordInput = document.getElementById('workerNewPassword');
    const confirmPasswordInput = document.getElementById('workerConfirmPassword');

    if (emailInput) {
      emailInput.value = googleEmail;
      emailInput.readOnly = true;
    }

    if (useGoogleEmailCheckbox) {
      useGoogleEmailCheckbox.checked = true;
      useGoogleEmailCheckbox.onchange = () => {
        if (useGoogleEmailCheckbox.checked) {
          emailInput.value = googleEmail;
          emailInput.readOnly = true;
        } else {
          emailInput.readOnly = false;
          emailInput.focus();
        }
      };
    }

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

      const saveBtn = document.getElementById('saveWorkerPasswordBtn');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          const email = emailInput ? emailInput.value.trim() : '';
          const password = newPasswordInput ? newPasswordInput.value : '';
          const confirmation = confirmPasswordInput ? confirmPasswordInput.value : '';
          if (!email) return alert('Please enter an email address.');
          if (!password) return alert('Please enter a password.');
          if (password !== confirmation) return alert('Passwords do not match.');

          try {
            const response = await fetch('/api/auth/update-security', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newPassword: password, email: email })
            });
            const resData = await response.json();
            if (!response.ok) return alert(resData.error || 'Unable to save credentials.');
            close();
          } catch (err) {
            console.error('Save credentials error:', err);
            alert('Failed to connect to server.');
          }
        };
      }
    });
  }

  showRememberAccountPrompt(identifier, profile) {
    const rememberDismissed = localStorage.getItem('macos_remember_prompt_dismissed') === 'true';
    const accountIsRemembered = localStorage.getItem('macos_remember_account') === 'true';

    const saveRememberedProfile = () => {
      localStorage.setItem('macos_remember_account', 'true');
      localStorage.setItem('macos_user_identifier', identifier);
      if (profile?.display_name) localStorage.setItem('macos_user_display_name', profile.display_name);
      if (profile?.display_picture) localStorage.setItem('macos_user_display_picture', profile.display_picture);
      this.syncProfile();
    };

    const discardRememberedProfile = () => {
      localStorage.removeItem('macos_remember_account');
      localStorage.removeItem('macos_user_identifier');
      localStorage.removeItem('macos_user_display_name');
      localStorage.removeItem('macos_user_display_picture');
      this.syncProfile();
    };

    const showTouchIdChoice = () => {
      if (
        localStorage.getItem('touchIdEnabled') === 'true' ||
        localStorage.getItem('macos_touchid_prompt_dismissed') === 'true'
      ) {
        this.goHome();
        return;
      }
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'none';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'block';
      this.dialogManager.openModal(this.accountPreferenceModal);
    };

    if (accountIsRemembered) {
      showTouchIdChoice();
    } else if (rememberDismissed) {
      this.goHome();
    } else {
      if (this.rememberAccountStep) this.rememberAccountStep.style.display = 'block';
      if (this.rememberAccountWarningStep) this.rememberAccountWarningStep.style.display = 'none';
      if (this.rememberAccountDismissStep) this.rememberAccountDismissStep.style.display = 'none';
      if (this.touchIdChoiceStep) this.touchIdChoiceStep.style.display = 'none';
      if (this.touchIdDismissStep) this.touchIdDismissStep.style.display = 'none';
      this.dialogManager.openModal(this.accountPreferenceModal);
    }

    const continueWithoutRemembering = () => {
      localStorage.setItem('macos_remember_prompt_dismissed', 'true');
      discardRememberedProfile();
      this.goHome();
    };

    const continueWithoutTouchId = () => {
      localStorage.setItem('macos_touchid_prompt_dismissed', 'true');
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
        const { deviceName, deviceType } = await this.getDeviceInfo();
        const response = await fetch('/api/auth/webauthn/authentication-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            deviceName,
            deviceType,
            response: this.serializeCredential(assertion)
          })
        });

        if (response.ok) {
          sessionStorage.setItem('macos_session_active', 'true');
          this.dialogManager.closeAllModals();
          setTimeout(() => { window.location.href = './home.html'; }, 300);
        } else {
          const data = await response.json();
          alert(data.error || 'Biometric login failed');
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
      const { deviceName, deviceType } = await this.getDeviceInfo();
      const body = { idToken: response.credential, deviceName, deviceType };
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

    // Profile Click / Context Menu
    if (this.profileAvatar) {
      this.profileAvatar.addEventListener('click', () => this.openLoginModal());
      this.profileAvatar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (localStorage.getItem('macos_remember_account') === 'true') {
          this.profileMenu?.classList.add('active');
        }
      });
    }

    if (this.profileUsername) {
      this.profileUsername.addEventListener('click', () => this.openLoginModal());
    }

    document.getElementById('forgetRememberedAccountBtn')?.addEventListener('click', async () => {
      localStorage.removeItem('macos_remember_account');
      localStorage.removeItem('macos_remember_prompt_dismissed');
      localStorage.removeItem('macos_user_identifier');
      localStorage.removeItem('macos_user_display_name');
      localStorage.removeItem('macos_user_display_picture');
      localStorage.removeItem('touchIdEnabled');
      localStorage.removeItem('touchIdCredId');
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
    let deviceName = 'Generic Device';
    let deviceType = /Mobi|Android/i.test(userAgent) ? 'Mobile' : 'Desktop';

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

    const firstName = this.profileUsername?.textContent.split(' ')[0] || '';
    if (firstName && ['Windows PC', 'MacBook Pro', 'iPhone', 'Generic Device'].some((n) => deviceName.includes(n))) {
      deviceName = `${firstName}'s ${deviceName}`;
    }

    return { deviceName, deviceType };
  }
}
