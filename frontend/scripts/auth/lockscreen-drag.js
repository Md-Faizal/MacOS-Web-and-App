/**
 * Lockscreen Drag & Gesture Interaction Module
 * Encapsulates vertical pull-up drag physics and smooth transitions to login.
 */

export class LockscreenDragController {
  constructor(options = {}) {
    this.onUnlock = options.onUnlock || (() => {});
    this.isDragging = false;
    this.dragStartY = 0;
    this.dragThreshold = window.innerHeight / 2;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.dragThreshold = window.innerHeight / 2;
    });

    // Mouse Events
    document.addEventListener('mousedown', (e) => this.handleDragStart(e.clientY));
    document.addEventListener('mousemove', (e) => this.handleDragMove(e.clientY));
    document.addEventListener('mouseup', (e) => this.handleDragEnd(e.clientY));

    // Touch Events
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        this.handleDragStart(e.touches[0].clientY);
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        this.handleDragMove(e.touches[0].clientY);
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        this.handleDragEnd(e.changedTouches[0].clientY);
      }
    });
  }

  handleDragStart(clientY) {
    const currentState = document.body.getAttribute('data-unlock-state');
    if (currentState === 'locked') {
      this.isDragging = true;
      this.dragStartY = clientY;
      document.body.setAttribute('data-unlock-state', 'dragging');
    }
  }

  handleDragMove(clientY) {
    if (!this.isDragging) return;
    const dragDistance = this.dragStartY - clientY; // Positive = upward
    if (dragDistance > 0) {
      const dragTranslate = Math.min(dragDistance, this.dragThreshold * 1.1);
      document.querySelectorAll('.draggable-content').forEach((el) => {
        el.style.transform = `translate(-50%, -${dragTranslate}px)`;
      });
    }
  }

  handleDragEnd(clientY) {
    if (!this.isDragging) return;
    const dragDistance = this.dragStartY - clientY;
    this.isDragging = false;

    if (dragDistance > this.dragThreshold) {
      this.executeUnlockSequence();
    } else {
      document.body.setAttribute('data-unlock-state', 'locked');
      this.resetDragVisuals();
    }
  }

  executeUnlockSequence() {
    document.body.setAttribute('data-unlock-state', 'unlocking');

    document.querySelectorAll('.draggable-content').forEach((el) => {
      el.style.transition = 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.6s ease-out';
      el.style.transform = 'translate(-50%, -100vh)';
      el.style.opacity = '0';
    });

    const firstEl = document.querySelector('.draggable-content');
    if (firstEl) {
      let transitioned = false;
      const onTransitionEnd = (e) => {
        if (e.propertyName === 'transform' && !transitioned) {
          transitioned = true;
          firstEl.removeEventListener('transitionend', onTransitionEnd);
          document.body.setAttribute('data-unlock-state', 'finished');
          this.onUnlock();
        }
      };
      firstEl.addEventListener('transitionend', onTransitionEnd);

      setTimeout(() => {
        if (!transitioned && document.body.getAttribute('data-unlock-state') === 'unlocking') {
          transitioned = true;
          document.body.setAttribute('data-unlock-state', 'finished');
          this.onUnlock();
        }
      }, 1000);
    } else {
      this.onUnlock();
    }
  }

  resetDragVisuals() {
    document.querySelectorAll('.draggable-content').forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
    });
  }
}
