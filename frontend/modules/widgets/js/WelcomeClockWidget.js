/**
 * WelcomeClockWidget - Ported from index.html liquid glass clock.
 */
const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

export function createWelcomeClockWidget() {
  const container = document.createElement('div');
  container.className = 'mac-w-welcome-clock-standalone';
  container.style.height = 'auto';
  
  const dateLabel = document.createElement('div');
  dateLabel.className = 'date';
  
  const timeLabel = document.createElement('div');
  timeLabel.className = 'time';

  container.appendChild(dateLabel);
  container.appendChild(timeLabel);

  let timeSettings = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-system-time-settings'))) || { mode: 'auto' };

  const updateClock = () => {
    let now = new Date();
    
    // Apply Settings
    if (timeSettings.mode === 'location' && timeSettings.timezone) {
      try {
        const locStr = now.toLocaleString('en-US', { timeZone: timeSettings.timezone });
        now = new Date(locStr);
      } catch (e) {
        console.error('Invalid timezone:', timeSettings.timezone);
      }
    } else if (timeSettings.mode === 'manual' && timeSettings.manualOffset) {
      now = new Date(now.getTime() + timeSettings.manualOffset);
    }

    // Date: WED 25 MAR
    const dateStr = now.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    }).toUpperCase();
    dateLabel.textContent = dateStr;
    
    // Time: 12:04
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    const timeStr = `${displayHours}:${displayMinutes}`;
    
    timeLabel.textContent = timeStr;
    timeLabel.setAttribute('data-time', timeStr);
  };

  // Listen for sync
  window.addEventListener('mac-time-sync', (e) => {
    timeSettings = e.detail;
    updateClock();
  });

  updateClock();
  const interval = setInterval(updateClock, 1000);
  
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      clearInterval(interval);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
}
