/**
 * Connectivity Manager
 * Tracks online/offline status and provides system-wide notifications
 */

export class ConnectivityManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.init();
    }

    init() {
        window.addEventListener('online', () => this.handleStatusChange(true));
        window.addEventListener('offline', () => this.handleStatusChange(false));
    }

    handleStatusChange(online) {
        this.isOnline = online;
        const status = online ? 'Back Online' : 'Offline Mode';
        const type = online ? 'success' : 'warning';
        
        console.log(`🌐 System: ${status}`);
        
        if (window.notifications) {
            window.notifications.show(status, `System is now ${online ? 'connected to the internet' : 'running offline'}.`, type);
        }
    }
}

// Auto-initialize
const connectivity = new ConnectivityManager();
window.connectivity = connectivity;

export default connectivity;
