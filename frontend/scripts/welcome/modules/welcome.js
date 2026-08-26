// ========================================
// WELCOME PAGE - TIME & DATE UPDATE (Liquid Glass Clock)
// ========================================

/**
 * Update the current time display
 */
function updateClock() {
  const now = new Date();

  // Format Date: "Tue Jul 8"
  const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const dateStr = now.toLocaleDateString('en-US', dateOptions).replace(',', '');
  
  // Format Time: 24-hour style
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;
  
  // Update DOM elements
  const dateElement = document.getElementById('date');
  const timeElement = document.getElementById('time');
  
  if (dateElement) {
    dateElement.textContent = dateStr;
  }
  
  if (timeElement) {
    timeElement.textContent = timeStr;
  }
}

/**
 * Initialize and set up time updates
 */
function initWelcomePage() {
  // Update clock immediately
  updateClock();
  
  // Update clock every second for smooth transitions
  setInterval(updateClock, 1000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initWelcomePage);

// Also initialize immediately in case script runs after DOM is ready
initWelcomePage();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage);
} else {
  initWelcomePage();
}
