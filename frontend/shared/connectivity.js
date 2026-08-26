/**
 * Connectivity Notification System
 * Detects online/offline status and shows a YouTube-style toast at the bottom.
 */

(function() {
    // Create and inject the toast element
    const toast = document.createElement('div');
    toast.id = 'connectivity-toast';
    toast.className = 'connectivity-toast';
    document.body.appendChild(toast);

    let onlineTimeout;

    function showToast(message, type, duration = null) {
        toast.textContent = message;
        toast.className = `connectivity-toast active ${type}`;
        
        if (duration) {
            clearTimeout(onlineTimeout);
            onlineTimeout = setTimeout(() => {
                toast.classList.remove('active');
            }, duration);
        }
    }

    function handleOffline() {
        showToast('No connection', 'offline', 3000);
    }

    function handleOnline() {
        // If we were offline, show "Back online" briefly
        if (toast.classList.contains('offline')) {
            showToast('Back online', 'online', 3000);
        } else {
            // Just in case it's called on initial load and stays online
            toast.classList.remove('active');
        }
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Initial check
    if (!navigator.onLine) {
        handleOffline();
    }
})();
