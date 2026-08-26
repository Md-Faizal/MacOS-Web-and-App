/**
 * MediaManager - Manages global media playback state and synchronization
 * Singleton class to handle simulated media playback for the OS
 */
class MediaManager {
  constructor() {
    if (MediaManager.instance) {
      return MediaManager.instance;
    }

    this.state = {
      isPlaying: false,
      volume: 65,
      currentTrackIndex: 0,
      currentTime: 0,
    };

    this.tracks = [
      {
        title: "Besties",
        artist: "Black Country, New Road",
        albumArt: "linear-gradient(135deg, #ff416c, #ff4b2b)",
        duration: 372, // seconds
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      },
      {
        title: "The Place Where He Inserted the Blade",
        artist: "Black Country, New Road",
        albumArt: "linear-gradient(135deg, #6a11cb, #2575fc)",
        duration: 433,
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
      },
      {
        title: "Chaos Space Marine",
        artist: "Black Country, New Road",
        albumArt: "linear-gradient(135deg, #f093fb, #f5576c)",
        duration: 338,
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
      }
    ];

    this.listeners = [];
    this.timer = null;
    
    // Initialize actual audio streaming for iOS/Android native integration
    this.audioElement = new Audio();
    this.audioElement.src = this.tracks[0].url;
    this.audioElement.volume = this.state.volume / 100;
    
    // Sync UI with audio time
    this.audioElement.addEventListener('timeupdate', () => {
      this.state.currentTime = Math.floor(this.audioElement.currentTime);
      // Optional: limit notify frequency if needed, but for now we keep state synced
      // if (this.state.isPlaying) this.notify();
    });
    
    // Auto-advance
    this.audioElement.addEventListener('ended', () => {
      this.next();
      this.play();
    });

    MediaManager.instance = this;

    this.setupMediaSession();
  }

  // Set up OS integration via MediaSession API
  setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    }
  }

  updateMediaSession() {
    if ('mediaSession' in navigator) {
      const track = this.getCurrentTrack();
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'MacOS Desktop',
        // Provide standard artwork fallback
        artwork: [
          { src: '/assets/Images/Favicon.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = this.state.isPlaying ? 'playing' : 'paused';
    }
  }

  // State Management
  play() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    if (this.audioElement.src !== this.getCurrentTrack().url) {
        this.audioElement.src = this.getCurrentTrack().url;
    }
    this.audioElement.play().catch(e => console.log('Audio play prevented:', e));
    this.startProgressTimer();
    this.updateMediaSession();
    this.notify();
  }

  pause() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    this.audioElement.pause();
    this.stopProgressTimer();
    this.updateMediaSession();
    this.notify();
  }

  togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    this.state.currentTrackIndex = (this.state.currentTrackIndex + 1) % this.tracks.length;
    this.state.currentTime = 0;
    this.audioElement.src = this.getCurrentTrack().url;
    if (this.state.isPlaying) this.audioElement.play().catch(() => {});
    this.updateMediaSession();
    this.notify();
  }

  previous() {
    this.state.currentTrackIndex = (this.state.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
    this.state.currentTime = 0;
    this.audioElement.src = this.getCurrentTrack().url;
    if (this.state.isPlaying) this.audioElement.play().catch(() => {});
    this.updateMediaSession();
    this.notify();
  }

  setVolume(volume) {
    this.state.volume = Math.max(0, Math.min(100, volume));
    this.audioElement.volume = this.state.volume / 100;
    this.notify();
  }

  // Progress Simulation (kept for UI callbacks, since some components might rely on the 1s tick)
  startProgressTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      // Sync happens naturally from timeupdate, just updating listeners occasionally
      this.notify();
    }, 1000);
  }

  stopProgressTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // UI Integration
  getCurrentTrack() {
    return this.tracks[this.state.currentTrackIndex];
  }

  getState() {
    return { ...this.state, track: this.getCurrentTrack() };
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.getState()); // Initial sync
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    const currentState = this.getState();
    this.listeners.forEach(callback => callback(currentState));
    
    // Also dispatch a global event
    window.dispatchEvent(new CustomEvent('mediaStateChange', { detail: currentState }));
  }
}

// Initialize and export to window
window.mediaManager = new MediaManager();
