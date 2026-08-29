/**
 * macOS Dialog & Modal Manager
 * Manages modal lifecycles, backdrop blur overlay, and context-aware Escape/Backdrop dismissals.
 */

export class DialogManager {
  constructor(options = {}) {
    this.blurOverlay = document.getElementById('blurOverlay');
    this.loginPageClock = document.getElementById('loginPageClock');
    this.onPreAuthClose = options.onPreAuthClose || (() => {});
    this.onPostAuthSkip = options.onPostAuthSkip || (() => {});

    this.activeModal = null;
    this.initGlobalEvents();
  }

  initGlobalEvents() {
    if (this.blurOverlay) {
      this.blurOverlay.addEventListener('click', () => this.handleDismissal());
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('login-active')) {
          this.handleDismissal();
        }
      }
    });
  }

  openModal(modalElement, focusTarget = null) {
    if (!modalElement) return;

    // Close any previous modal cleanly
    if (this.activeModal && this.activeModal !== modalElement) {
      this.activeModal.classList.remove('active');
    }

    this.activeModal = modalElement;
    document.body.classList.add('login-active');

    if (this.blurOverlay) this.blurOverlay.classList.add('active');
    if (this.loginPageClock) this.loginPageClock.classList.add('active');

    modalElement.classList.add('active');

    if (focusTarget) {
      setTimeout(() => {
        try {
          focusTarget.focus();
        } catch (e) {}
      }, 200);
    }
  }

  closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('active');
    if (this.activeModal === modalElement) {
      this.activeModal = null;
    }
  }

  closeAllModals() {
    document.querySelectorAll('.login-modal').forEach((modal) => {
      modal.classList.remove('active');
    });
    this.activeModal = null;
  }

  isPostAuthModalActive() {
    const workerModal = document.getElementById('workerCredentialModal');
    const prefModal = document.getElementById('accountPreferenceModal');
    return (
      (workerModal && workerModal.classList.contains('active')) ||
      (prefModal && prefModal.classList.contains('active'))
    );
  }

  handleDismissal() {
    const touchIdSetupModal = document.getElementById('touchIdSetupModal');
    const accountPreferenceModal = document.getElementById('accountPreferenceModal');
    const touchIdChoiceStep = document.getElementById('touchIdChoiceStep');
    const workerCredentialModal = document.getElementById('workerCredentialModal');

    // Case 1: Inside Touch ID biometric setup during onboarding -> return to preference step
    if (touchIdSetupModal && touchIdSetupModal.classList.contains('active')) {
      touchIdSetupModal.classList.remove('active');
      if (touchIdChoiceStep) touchIdChoiceStep.style.display = 'block';
      if (accountPreferenceModal) accountPreferenceModal.classList.add('active');
      this.activeModal = accountPreferenceModal;
      return;
    }

    // Case 2: On an authenticated onboarding prompt -> treat as "Not Now" and proceed to home
    if (this.isPostAuthModalActive()) {
      this.closeAllModals();
      this.onPostAuthSkip();
      return;
    }

    // Case 3: Pre-auth modal (Standard login / pending / link) -> return to lockscreen
    this.closeAllModals();
    document.body.classList.remove('login-active');
    if (this.blurOverlay) this.blurOverlay.classList.remove('active');
    if (this.loginPageClock) this.loginPageClock.classList.remove('active');

    this.onPreAuthClose();
  }
}
