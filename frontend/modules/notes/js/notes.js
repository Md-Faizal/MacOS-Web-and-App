const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Notes') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * FieldTracker - Track which fields have changed in a note
 * Enables partial updates (only send changed fields to server)
 */
class FieldTracker {
  constructor(initialData) {
    this.original = JSON.parse(JSON.stringify(initialData));
    this.current = JSON.parse(JSON.stringify(initialData));
    this.changedFields = new Set();
  }
  
  setField(field, value) {
    this.current[field] = value;
    
    // Check if actually changed from original
    if (JSON.stringify(this.original[field]) !== JSON.stringify(value)) {
      this.changedFields.add(field);
    } else {
      this.changedFields.delete(field);
    }
  }
  
  getChanges() {
    const changes = {};
    for (const field of this.changedFields) {
      changes[field] = this.current[field];
    }
    return changes;
  }
  
  hasChanges() {
    return this.changedFields.size > 0;
  }
  
  reset() {
    this.original = JSON.parse(JSON.stringify(this.current));
    this.changedFields.clear();
  }
}

/**
 * AdaptiveDebouncer - Dynamically adjust sync delay based on typing speed
 * Fast typists: wait longer to batch edits
 * Slow typists: sync sooner when they pause
 */
class AdaptiveDebouncer {
  constructor(onSync) {
    this.onSync = onSync;
    this.timers = new Map();
    this.lastEditTime = new Map();
    this.editCounts = new Map();
    
    // Thresholds (in milliseconds)
    this.delays = {
      fast: 500,      // User typing fast
      normal: 1000,   // Normal typing
      slow: 300       // Long pause (ready to sync)
    };
  }
  
  queue(noteId) {
    const now = Date.now();
    const lastEdit = this.lastEditTime.get(noteId) || 0;
    const timeSinceLastEdit = now - lastEdit;
    
    // Determine typing speed and set delay accordingly
    let delay = this.delays.normal;
    
    if (timeSinceLastEdit < 50) {
      // Very fast typing - wait longer to batch edits
      delay = this.delays.fast;
    } else if (timeSinceLastEdit > 500) {
      // Long pause - sync soon
      delay = this.delays.slow;
    }
    
    this.lastEditTime.set(noteId, now);
    this.editCounts.set(noteId, (this.editCounts.get(noteId) || 0) + 1);
    
    // Cancel existing timer
    const existingTimer = this.timers.get(noteId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const editCount = this.editCounts.get(noteId);
    log.debug(`⏱️ Scheduling sync for ${noteId} in ${delay}ms (${editCount} edits)`);
    
    // Set new timer
    const timer = setTimeout(() => {
      this.editCounts.set(noteId, 0);
      this.timers.delete(noteId);
      log.debug(`⏰ Adaptive debounce fired for ${noteId}`);
      this.onSync(noteId);
    }, delay);
    
    this.timers.set(noteId, timer);
  }
  
  cancel(noteId) {
    const timer = this.timers.get(noteId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(noteId);
    }
  }
}

/**
 * LoadingQueue - Prioritized task queue for background loading
 * Ensures the currently viewed note loads immediately
 */
class LoadingQueue {
  constructor() {
    this.queue = [];
    this.isActive = false;
    this.priorities = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  }

  // Task object: { id: string, priority: number, action: function }
  add(id, priorityStr, action) {
    const priority = this.priorities[priorityStr] ?? this.priorities.NORMAL;
    
    // Remove if already in queue (to upgrade priority if needed)
    this.queue = this.queue.filter(t => t.id !== id || t.action.name !== action.name);
    
    this.queue.push({ id, priority, action });
    this.queue.sort((a, b) => a.priority - b.priority); // Lowest priority number goes first
    
    if (!this.isActive) {
      this.processNext();
    }
  }

  async processNext() {
    if (this.queue.length === 0) {
      this.isActive = false;
      return;
    }

    this.isActive = true;
    const task = this.queue.shift();
    
    try {
      await task.action();
    } catch (e) {
      log.warn(`[LoadingQueue] Task failed:`, e);
    } finally {
      // Add slight delay between background tasks to prevent locking the main thread
      setTimeout(() => this.processNext(), 20);
    }
  }

  clear() {
    this.queue = [];
    this.isActive = false;
  }
}

/**
 * NotesApp - Rebuilt with clean architecture
 * - Single unified sync queue
 * - Promise-based async loading
 * - Clear state machine (pristine → edited → syncing → synced/error)
 * - Atomic compound updates
 * - Better error recovery
 * - IMPROVED: Partial updates, request dedup, adaptive debounce
 */

class NotesApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const width = window.innerWidth;
    let config = { appId: 'notes', appName: 'Notes', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    // API configuration
    this.apiEndpoint = '/api/notes';
    this.notes = [];
    this.currentNoteId = null;

    // ===== REAL-TIME SYNC =====
    // Unique ID for this tab — used to suppress echoing our own SSE events back
    this.clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // BroadcastChannel — instant sync across tabs in the same browser
    this.broadcastChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('notes-sync')
      : null;
    // EventSource — sync across different devices via SSE
    this.eventSource = null;
    // Live typing stream - throttle state per note
    this.streamThrottle = null;       // setTimeout handle for throttle
    this.typingClearTimers = {};      // per-noteId timer to remove typing indicator
    
    // ===== UNIFIED STATE MANAGEMENT =====
    // Note state: pristine | edited | syncing | synced | error
    this.noteState = {}; // { noteId: 'pristine'|'edited'|'syncing'|'synced'|'error' }
    this.noteSyncErrors = {}; // { noteId: errorMessage }
    this.isSyncingAny = false; // Track if ANY note is currently syncing
    
    // ===== SINGLE UNIFIED SYNC QUEUE ====="
    // Queue stores operations in order: { noteId, field: 'title'|'content'|'images'|'all', timestamp }
    this.syncQueue = [];
    this.isSyncing = false;
    this.syncWorker = null; // Active sync promise
    
    // ===== IMPROVED: Helper classes for performance =====
    // FieldTracker for partial updates
    this.fieldTracker = null;
    

    // AdaptiveDebouncer for dynamic sync delay
    this.adaptiveDebouncer = new AdaptiveDebouncer(() => this.processSyncQueue());
    
    // ===== LOADING STATE =====
    this.contentLoading = {}; // { noteId: boolean }
    this.imagesLoading = {}; // { noteId: boolean }
    this.imagesNeedSync = {}; // { noteId: boolean } — tracks image-only dirty state
    this.tilesLoaded = false;
    
    // ===== LOADING MANAGER =====
    this.loadingManager = new LoadingQueue();
    
    // Initialize the app
    this.initializeApp();
  }

  // Storage for ETags per note
  noteETags = {};

  async initializeApp() {
    log.debug('🚀 Initializing Notes App with clean architecture...');
    
    try {
      // Load CSS immediately before anything else
      this.loadExternalStyles();
      
      // Step 1: Set up UI immediately (non-blocking)
      this.setupNotesUI();
      
      // Show loading indicator in the list
      this.renderLoadingState();
      
      // Step 2: Load note tiles immediately and render as soon as available
      log.debug('📥 Fetching note titles...');
      const startTime = performance.now();
      
      await this.loadNoteTiles();
      
      const loadTime = (performance.now() - startTime).toFixed(0);
      log.debug(`⏱️  Note titles loaded in ${loadTime}ms`);
      
      // Render list immediately with titles
      this.renderNotesList();
      
      // Step 3: Load content and images in background (non-blocking)
      this.loadNoteContentsInBackground();
      this.loadNoteImagesInBackground();

      // Step 4: Start real-time sync (SSE + BroadcastChannel)
      this.setupRealTimeSync();

      log.debug('✅ Notes app initialized (titles ready, loading details in background)');
    } catch (error) {
      log.error('❌ Failed to initialize notes app:', error);
      this.showNotification('Failed to load notes', 'error');
    }
  }

  setupNotesUI() {
    // Build the notes UI
    this.buildNotesLayout();

    // Add custom header controls
    this.setupHeaderControls();

    // Setup notes-specific event listeners
    this.setupNotesEventListeners();

    // Store reference for home.html
    window.currentNotesApp = this;
  }

  buildNotesLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <!-- Notes List (Sidebar) -->
      <div class="notes-list">
        <div class="notes-list-items"></div>
        <div class="notes-sidebar-footer">
          <button class="refresh-btn" id="refreshBtn" title="Refresh notes from database">↻</button>
        </div>
      </div>

      <!-- Editor Area -->
      <div class="notes-editor">
        <div class="editor-empty">
          <div>
            <p style="margin: 0 0 8px 0; font-size: 16px;">📝</p>
            <p style="margin: 0;">No note selected</p>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #bca3af;">Create a new note to get started</p>
          </div>
        </div>
        <input type="text" class="editor-title-input" placeholder="Note Title" style="display: none;">
        <div class="editor-images-container-wrapper">
          <div class="editor-images-loader" style="display: none;">
            <div class="spinner"></div>
            <div style="color: #999; font-size: 13px; margin-top: 8px;">Loading images...</div>
          </div>
          <div class="editor-images-container" style="display: none;"></div>
        </div>
        <div class="container-editor-wrapper">
          <div class="container-editor-loader" style="display: none;">
            <div class="skeleton-title"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
          </div>
          <textarea class="editor-textarea" placeholder="Write your note here... (Drag images here to add)" style="display: none;"></textarea>
        <!-- Typing indicator: appears when someone else is actively typing -->
        <div class="typing-indicator" style="display:none;">
          <span class="typing-dots"><span></span><span></span><span></span></span>
          <span class="typing-text">Someone is typing...</span>
        </div>
        </div>
        <div class="notes-footer" style="display: none;">
          <span class="note-timestamp">Created</span>
          <div style="display: flex; gap: 12px; align-items: center;">
            <div class="sync-indicator" style="display: none;">
              <span class="sync-dot"></span>
              <span class="sync-text">synced</span>
            </div>
            <button class="delete-btn">Delete</button>
          </div>
        </div>
      </div>
    `;

    // Setup element references
    this.notesList = contentArea.querySelector('.notes-list-items');
    this.editorArea = contentArea.querySelector('.notes-editor');
    this.editorWrapper = contentArea.querySelector('.container-editor-wrapper');
    this.editorLoader = contentArea.querySelector('.container-editor-loader');
    this.imagesLoaderWrapper = contentArea.querySelector('.editor-images-container-wrapper');
    this.imagesLoader = contentArea.querySelector('.editor-images-loader');
    this.sidebar = contentArea.querySelector('.notes-list');
    this.titleInput = contentArea.querySelector('.editor-title-input');
    this.imagesContainer = contentArea.querySelector('.editor-images-container');
    this.textarea = contentArea.querySelector('.editor-textarea');
    this.footer = contentArea.querySelector('.notes-footer');
    this.deleteBtn = contentArea.querySelector('.delete-btn');
    this.emptyState = contentArea.querySelector('.editor-empty');
    this.syncIndicator = contentArea.querySelector('.sync-indicator');
    this.syncDot = contentArea.querySelector('.sync-dot');
    this.syncText = contentArea.querySelector('.sync-text');
    this.typingIndicator = contentArea.querySelector('.typing-indicator');
    this.typingText = contentArea.querySelector('.typing-text');
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (sidebar toggle)
    const leftControls = document.createElement('div');
    leftControls.className = 'notes-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'notes-header-btn';
    expandBtn.id = 'expandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(expandBtn);
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    
    // Create right controls group (replace title-spacer)
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'notes-header-controls';
    
    // Create buttons container (Edit, Add)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'notes-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="notes-header-btn edit-btn-text" id="editBtn" title="Edit Note">Edit</button>
      <button class="notes-header-btn" id="addBtn" title="Add Note">+</button>
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'notes-header-search';
    searchInput.id = 'headerSearch';
    searchInput.placeholder = 'Search';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);
    
    // Replace spacer with right controls
    if (spacer && spacer.parentNode) {
      spacer.parentNode.replaceChild(rightControls, spacer);
    } else {
      // Fallback: append to title bar if spacer not found
      titleBar.appendChild(rightControls);
    }
    
    // Store search input reference
    this.searchInput = searchInput;
  }

  setupNotesEventListeners() {
    // Search functionality from header
    this.searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.renderNotesList(query);
    });

    // Expand button - toggle sidebar visibility
    const expandBtn = document.getElementById('expandBtn');
    expandBtn?.addEventListener('click', () => {
      this.sidebar.classList.toggle('hidden');
    });

    // Edit button
    const editBtn = document.getElementById('editBtn');
    editBtn?.addEventListener('click', () => {
      if (this.currentNoteId) {
        this.titleInput.focus();
      } else {
        alert('Please select a note to edit');
      }
    });

    // Add button
    const addBtn = document.getElementById('addBtn');
    addBtn?.addEventListener('click', () => {
      this.createNewNote();
    });

    // Refresh button - reload notes from database
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.style.opacity = '0.5';
      refreshBtn.style.cursor = 'wait';
      try {
        await this.loadNoteTiles();
        this.renderNotesList();

        // Also refresh the currently open note's content + images
        if (this.currentNoteId) {
          const note = this.notes.find(n => n.id === this.currentNoteId);
          if (note) {
            // Reset ETag so we fetch fresh state
            delete this.noteETags[this.currentNoteId];
            await this.loadSingleNoteContent(note);
            await this.loadSingleNoteImages(note);
            this.renderImages();
          }
        }

        this.showNotification('Notes refreshed from database', 'success');
        log.debug('✓ Notes refreshed from database');
      } catch (error) {
        log.error('Failed to refresh notes:', error);
        this.showNotification('Failed to refresh notes', 'error');
      } finally {
        refreshBtn.style.opacity = '1';
        refreshBtn.style.cursor = 'pointer';
      }
    });

    // Editor events with debounced save
    this.titleInput?.addEventListener('input', (e) => {
      this.onEditorChange();
    });
    
    this.textarea?.addEventListener('input', (e) => {
      this.onEditorChange();
    });
    
    this.deleteBtn?.addEventListener('click', () => this.deleteCurrentNote());

    // Image drag and drop
    this.editorArea?.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.editorArea?.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.editorArea?.addEventListener('drop', (e) => this.handleImageDrop(e));
  }

  onEditorChange() {
    if (!this.currentNoteId || !this.fieldTracker) return;

    // Force hide loader if user is interacting with the editor
    if (this.editorLoader) this.editorLoader.style.display = 'none';
    if (this.textarea) this.textarea.style.display = 'block';

    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;

    // ===== IMPROVED: Track changed fields for partial updates =====
    const newTitle = this.titleInput.value || 'Untitled';
    const newContent = this.textarea.value;
    
    // Track changes ONLY if they differ from the original
    // Check existing fieldTracker state to avoid duplicate tracking
    const currentTitle = note.title;
    const currentContent = note.content;
    
    // Only set fields if they actually changed
    if (newTitle !== currentTitle) {
      note.title = newTitle;
      this.fieldTracker.setField('title', newTitle);
    }
    
    if (newContent !== currentContent) {
      note.content = newContent;
      this.fieldTracker.setField('content', newContent);
    }
    
    // Queue sync only if there are actual changes
    if (this.fieldTracker.hasChanges()) {
      this.queueSync(note.id, 'partial');
      // Fire a live streaming broadcast so other devices see the keystrokes in real-time
      this.streamContent(note);
    }
    
    // Update UI directly for the active note to prevent complete re-render and lag
    const activeItem = this.notesList.querySelector('.notes-list-item.active');
    if (activeItem) {
      if (newTitle !== currentTitle) {
        activeItem.textContent = newTitle || 'Untitled';
      }
      activeItem.dataset.state = this.noteState[note.id] || 'pristine';
    }
  }

  // ===== LIVE TYPING STREAM =====

  /**
   * Throttled live content stream — fires every 150ms while the user types.
   * POSTs to /stream which immediately SSE-broadcasts to all other connected
   * clients. No DB write. This is what makes editing feel like WhatsApp.
   */
  streamContent(note) {
    if (this.streamThrottle) return; // Already queued for this 150ms window
    this.streamThrottle = setTimeout(async () => {
      this.streamThrottle = null;
      if (!note || !this.currentNoteId) return;
      try {
        await fetch(`${this.apiEndpoint}/${note.id}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:    this.titleInput.value || 'Untitled',
            content:  this.textarea.value,
            clientId: this.clientId
          })
        });
        // Also instantly push to other tabs via BroadcastChannel (zero round-trip)
        this.emit('content-streaming', {
          id:      note.id,
          title:   this.titleInput.value || 'Untitled',
          content: this.textarea.value
        });
      } catch (e) {
        // Streaming is always best-effort — ignore failures silently
      }
    }, 150);
  }

  /**
   * Show "Someone is typing..." badge above the editor footer.
   * Auto-hides 3 seconds after the last typing event.
   */
  showTypingIndicator(noteId) {
    if (!this.typingIndicator || noteId !== this.currentNoteId) return;
    this.typingIndicator.style.display = 'flex';
    if (this.typingClearTimers[noteId]) clearTimeout(this.typingClearTimers[noteId]);
    this.typingClearTimers[noteId] = setTimeout(() => {
      if (this.typingIndicator) this.typingIndicator.style.display = 'none';
      delete this.typingClearTimers[noteId];
    }, 3000);
  }

  /** Immediately hide the typing indicator. */
  hideTypingIndicator(noteId) {
    if (!this.typingIndicator || noteId !== this.currentNoteId) return;
    if (this.typingClearTimers[noteId]) {
      clearTimeout(this.typingClearTimers[noteId]);
      delete this.typingClearTimers[noteId];
    }
    this.typingIndicator.style.display = 'none';
  }

  // ===== REAL-TIME SYNC =====

  /**
   * Set up both sync channels on app init.
   * BroadcastChannel handles same-browser tabs (instant, zero server load).
   * SSE handles cross-device / different-browser updates.
   */
  setupRealTimeSync() {
    // BroadcastChannel: listen for events from other tabs in this browser
    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = (e) => {
        // BroadcastChannel never fires for the sender tab — no clientId filter needed
        this.handleSyncEvent(e.data);
      };
    }
    // SSE: listen for events from other devices
    this.connectSSE();
  }

  /**
   * Connect to the SSE stream with automatic reconnect on error.
   */
  connectSSE() {
    if (typeof EventSource === 'undefined') return;

    // Include clientId so the server echoes it back — we ignore events from ourselves
    const url = `${this.apiEndpoint}/events?clientId=${encodeURIComponent(this.clientId)}`;
    this.eventSource = new EventSource(url);

    const handleEvent = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Skip our own events (they were already handled optimistically in the UI)
        if (data.clientId && data.clientId === this.clientId) return;
        this.handleSyncEvent(data);
      } catch (err) {
        log.warn('[SSE] Failed to parse event:', err);
      }
    };

    this.eventSource.addEventListener('note-created',     handleEvent);
    this.eventSource.addEventListener('note-updated',     handleEvent);
    this.eventSource.addEventListener('note-deleted',     handleEvent);
    this.eventSource.addEventListener('image-updated',    handleEvent);
    this.eventSource.addEventListener('content-streaming', handleEvent);

    this.eventSource.addEventListener('connected', () => {
      log.debug('📡 [SSE] Connected to real-time events stream');
    });

    // Auto-reconnect after 5s on any error
    this.eventSource.onerror = () => {
      log.warn('📡 [SSE] Connection lost — reconnecting in 5s...');
      this.eventSource.close();
      setTimeout(() => this.connectSSE(), 5000);
    };
  }

  /**
   * Handle an incoming sync event from either SSE or BroadcastChannel.
   * Updates local state and re-renders without a full page reload.
   */
  handleSyncEvent(data) {
    if (!data || !data.type) return;
    const { type, id, noteId, title } = data;
    log.debug(`🔄 [Sync] Received: ${type}`, id || noteId || '');

    switch (type) {
      case 'content-streaming': {
        // Someone else is typing — identify by noteId
        const streamId = id; // id field holds the note ID for streaming events
        const note = this.notes.find(n => n.id === streamId);
        if (!note) break;

        // Update in-memory model
        if (data.title !== undefined) note.title = data.title;
        if (data.content !== undefined) note.content = data.content;

        if (streamId === this.currentNoteId) {
          if (this.noteState[streamId] === 'edited' || this.noteState[streamId] === 'syncing') {
            // We're also editing — just show the typing indicator, don't overwrite
            this.showTypingIndicator(streamId);
          } else {
            // We're idle — live-update the editor content
            this.showTypingIndicator(streamId);
            this.updateEditorContent(note.title, note.content);
          }
        }
        // Update sidebar title instantly if title changed
        this.renderNotesList();
        break;
      }
      case 'note-created': {
        // Add the new note to our list if we don't already have it
        if (!this.notes.find(n => n.id === id)) {
          this.notes.push({
            id, title: title || 'Untitled',
            content: data.content || '',
            images: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          this.noteState[id] = 'pristine';
          this.renderNotesList();
          this.showNotification(`New note: "${title || 'Untitled'}"`, 'info');
        }
        break;
      }
      case 'note-updated': {
        const note = this.notes.find(n => n.id === id);
        if (!note) break;
        
        // Update local memory and list title
        if (title !== undefined) note.title = title;
        if (data.content !== undefined) note.content = data.content;
        
        this.renderNotesList();

        // If this is the currently open note, update the editor
        if (id === this.currentNoteId) {
          // If the user has local unsaved changes, warn them
          if (this.noteState[id] === 'edited' || this.noteState[id] === 'syncing') {
            this.showNotification('Note was updated on another device', 'warning');
          } else {
            // No local changes -> update editor instantly with the new data
            this.updateEditorContent(note.title, note.content);
            this.noteState[id] = 'synced';
            this.updateSyncStatus('synced', id);
          }
        }
        break;
      }
      case 'note-deleted': {
        this.notes = this.notes.filter(n => n.id !== id);
        delete this.noteState[id];
        delete this.noteETags[id];
        if (id === this.currentNoteId) {
          this.currentNoteId = null;
          this.showEmptyState();
          this.showNotification('This note was deleted on another device', 'warning');
        }
        this.renderNotesList();
        break;
      }
      case 'image-updated': {
        // Reload images for the affected note if it's currently open
        if (noteId === this.currentNoteId) {
          const note = this.notes.find(n => n.id === noteId);
          if (note) {
            note.images = [];
            note.imageIds = [];
            this.loadSingleNoteImages(note).then(() => this.renderImages()).catch(() => {});
          }
        }
        break;
      }
    }
  }

  /**
   * Emit an event to the BroadcastChannel so other tabs in this browser update
   * instantly — without waiting for the SSE round-trip through the server.
   */
  emit(type, data) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type, clientId: this.clientId, ...data });
      } catch (e) {
        log.warn('[BroadcastChannel] emit failed:', e);
      }
    }
  }

  // ===== SYNC FUNCTIONS =====

  queueSync(noteId, field = 'all') {
    if (!this.notes.find(n => n.id === noteId)) return;

    // Mark note as edited
    this.noteState[noteId] = 'edited';
    this.noteSyncErrors[noteId] = null;
    this.updateSyncStatus('editing');

    // Track image dirty state separately from fieldTracker
    if (field === 'images') {
      this.imagesNeedSync[noteId] = true;
    }

    this.adaptiveDebouncer.queue(noteId);
  }

  async processSyncQueue() {
    log.debug('🔄 Processing sync queue (triggered by adaptive debouncer)...');
    
    // Get edited notes that are ready to sync
    const notesToSync = [];
    for (const noteId in this.noteState) {
      if (this.noteState[noteId] === 'edited') {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
          notesToSync.push(note);
        }
      }
    }
    
    if (notesToSync.length === 0) {
      log.debug('📭 No notes to sync');
      return;
    }
    
    // Sync each note
    this.isSyncingAny = true;
    try {
      for (const note of notesToSync) {
        await this.syncNoteToServer(note);
      }
    } finally {
      this.isSyncingAny = false;
      // Refresh sync status after all syncs complete
      const hasSyncErrors = Object.values(this.noteSyncErrors).some(e => e !== null);
      if (hasSyncErrors) {
        this.updateSyncStatus('error');
      } else {
        this.updateSyncStatus('synced');
      }
    }
  }

  // Helper to safely extract ETag header (handles case sensitivity and weak ETags)
  getETag(response) {
    let eTag = response.headers.get('ETag') || response.headers.get('etag') || null;
    // Normalize weak ETags: W/"xxx" -> "xxx"
    if (eTag) {
      eTag = eTag.replace(/^W\//, '');
    }
    return eTag;
  }

  async syncNoteToServer(note) {
    if (this.noteState[note.id] === 'syncing') {
      log.debug(`⏳ Note ${note.id} already syncing, skipping...`);
      return;
    }
    
    // ===== Check if there are ANY text changes to sync =====
    const hasTextChanges = this.fieldTracker && this.fieldTracker.hasChanges();

    if (!hasTextChanges) {
      log.debug(`ℹ️  No text changes to sync for note ${note.id}`);
      // Improvement B: If fieldTracker is null/unset (e.g. note was marked edited but user
      // switched away before field tracker was initialized), reset to synced to avoid
      // the note getting stuck in 'edited' state forever.
      this.noteState[note.id] = 'synced';
      this.noteSyncErrors[note.id] = null;
      if (this.currentNoteId === note.id) this.updateSyncStatus('synced', note.id);
      return;
    }
    
    this.noteState[note.id] = 'syncing';
    // Only update indicator for the current note being synced
    if (this.currentNoteId === note.id) {
      this.updateSyncStatus('syncing', note.id);
    }
    
    try {
      // Use cached ETag if available, otherwise fetch current state
      let eTag = this.noteETags[note.id];
      log.debug(`🔍 Check ETag cache for note ${note.id}:`, eTag ? `"${eTag}"` : 'EMPTY');
      
      if (!eTag) {
        // If we don't have a cached ETag, fetch it
        log.debug(`📥 Fetching ETag for note ${note.id}...`);
        const serverResponse = await fetch(`${this.apiEndpoint}/${note.id}`);
        if (!serverResponse.ok) {
          throw new Error(`Failed to fetch current state: ${serverResponse.status}`);
        }
        eTag = this.getETag(serverResponse);
        if (eTag) {
          this.noteETags[note.id] = eTag;
          log.debug(`✅ Cached ETag for note ${note.id}: "${eTag}"`);
        } else {
          log.warn(`⚠️  No ETag received from server for note ${note.id}`);
        }
      } else {
        log.debug(`✅ Using cached ETag for note ${note.id}: "${eTag}"`);
      }
      
      // ===== Prepare text update payload =====
      let newETag = eTag;

      let updatePayload;
      if (this.fieldTracker && this.fieldTracker.hasChanges()) {
        updatePayload = this.fieldTracker.getChanges();
        log.debug(`📤 Syncing partial update for ${note.id}: changed fields = ${Object.keys(updatePayload).join(', ')}`);
      } else {
        updatePayload = { title: note.title, content: note.content };
        log.debug(`📤 Syncing full update for ${note.id}`);
      }

      const headers = { 'Content-Type': 'application/json' };
      if (eTag) headers['If-Match'] = eTag;

      const updateResponse = await fetch(`${this.apiEndpoint}/${note.id}?clientId=${this.clientId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatePayload)
      });

      if (updateResponse.status === 412) {
        delete this.noteETags[note.id];
        await this.loadSingleNoteContent(note);
        this.noteState[note.id] = 'edited';
        this.noteSyncErrors[note.id] = 'Note was modified elsewhere. Please review changes.';
        this.updateSyncStatus('error', note.id);
        this.showNotification('Note was modified elsewhere. Refreshed from server.', 'warning');
        return;
      }

      if (!updateResponse.ok) throw new Error(`API error: ${updateResponse.status}`);

      newETag = this.getETag(updateResponse) || newETag;
      if (newETag) this.noteETags[note.id] = newETag;

      if (this.fieldTracker) {
        this.fieldTracker.reset();
        log.debug(`✅ Reset field tracker for ${note.id}`);
      }
      
      // Success!
      this.noteState[note.id] = 'synced';
      this.noteSyncErrors[note.id] = null;
      // Only update indicator if this is the current note
      if (this.currentNoteId === note.id) {
        this.updateSyncStatus('synced', note.id);
      }
      // Notify other tabs instantly via BroadcastChannel
      this.emit('note-updated', { id: note.id, title: note.title, content: note.content });
      
      log.debug(`✅ Successfully synced note: ${note.title}`);
    } catch (error) {
      log.error(`❌ Failed to sync note ${note.id}:`, error);
      
      this.noteState[note.id] = 'error';
      this.noteSyncErrors[note.id] = error.message;
      // Only update indicator if this is the current note
      if (this.currentNoteId === note.id) {
        this.updateSyncStatus('error', note.id);
      }
      
      this.showNotification(`Failed to sync "${note.title}": ${error.message}`, 'error');
    }
  }

  // ===== LOADING FUNCTIONS =====

  async loadNoteTiles() {
    log.debug('📋 Loading note tiles...');
    const startTime = performance.now();
    try {
      // Fetch only minimal data (id, title, created_at, updated_at) for faster load
      const response = await fetch(`${this.apiEndpoint}?minimal=true`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      const apiNotes = Array.isArray(data) ? data : (data.notes || data.data || []);
      
      if (!Array.isArray(apiNotes)) {
        throw new Error('Invalid API response format');
      }
      
      // Initialize notes with metadata only
      this.notes = apiNotes.map(note => ({
        id: note.id,
        title: note.title,
        content: null, // Will load separately (null means not yet loaded)
        images: [], // Will load separately
        created_at: note.created_at,
        updated_at: note.updated_at
      }));
      
      // Initialize state for all notes
      this.notes.forEach(note => {
        this.noteState[note.id] = 'pristine';
        this.noteSyncErrors[note.id] = null;
      });
      
      this.tilesLoaded = true;
      const loadTime = (performance.now() - startTime).toFixed(2);
      log.debug(`✅ Loaded ${this.notes.length} note tiles in ${loadTime}ms`);
      return this.notes;
    } catch (error) {
      log.error('❌ Failed to load note tiles:', error);
      throw error;
    }
  }

  async loadNoteContentsInBackground() {
    log.debug('📄 Queuing background content loading...');
    for (const note of this.notes) {
       this.loadingManager.add(`${note.id}-content`, 'NORMAL', async () => {
         await this.loadSingleNoteContent(note).catch(e => {
           log.warn(`⚠️  Failed to load content for ${note.id}:`, e);
         });
       });
    }
  }

  async loadSingleNoteContent(note) {
    this.contentLoading[note.id] = true;
    try {
      const response = await fetch(`${this.apiEndpoint}/${note.id}`);
      if (!response.ok) throw new Error(`Failed to fetch note ${note.id}`);
      
      const data = await response.json();
      note.content = data.content || '';
      
      // Cache the ETag for conflict detection
      const eTag = this.getETag(response);
      if (eTag) {
        this.noteETags[note.id] = eTag;
        log.debug(`📄 Loaded content for: ${note.title}, ETag: "${eTag}"`);
      } else {
        log.warn(`⚠️  Loaded content for: ${note.title}, but NO ETag received!`);
      }
      
      // ===== IMPROVED: Reset field tracker after content loads =====
      // This ensures we're only tracking user edits, not the initial content load
      if (this.currentNoteId === note.id && this.fieldTracker) {
        this.fieldTracker.reset();
        log.debug(`🔄 Reset field tracker for ${note.id} after content loaded`);
      }
      
      // Update UI immediately with content (don't wait for images)
      if (this.currentNoteId === note.id && this.textarea) {
        this.editorLoader.style.display = 'none';
        this.textarea.style.display = 'block';
        this.textarea.value = note.content;
      }
    } finally {
      this.contentLoading[note.id] = false;
    }
  }

  async loadNoteImagesInBackground() {
    log.debug('🖼️  Queuing background image loading...');
    
    // Low priority queueing for all notes.
    // Bug 7 fix: guard on BOTH images.length AND imagesLoading to prevent double-fetching
    // when the user selects a note before the background queue reaches it (selectNote also
    // calls loadSingleNoteImages which sets imagesLoading[id] = true).
    for (const note of this.notes) {
       this.loadingManager.add(`${note.id}-images`, 'LOW', async () => {
         if (!note.images.length && !this.imagesLoading[note.id]) {
            await this.loadSingleNoteImages(note).catch(e => {
              log.warn(`Failed to load images for ${note.id}:`, e);
            });
         }
       });
    }
  }

  async loadSingleNoteImages(note) {
    this.imagesLoading[note.id] = true;
    try {
      // 1) Fetch only the metadata first (fast)
      const metaRes = await fetch(`${this.apiEndpoint}/${note.id}/images/meta`);
      if (!metaRes.ok) throw new Error('Failed to fetch image meta');
      
      const meta = await metaRes.json();
      note.images = new Array(meta.length).fill(null); // allocate placeholders
      note.imageIds = meta.map(m => m.id);
      
      // Update UI to show the right number of skeleton blocks immediately
      if (this.currentNoteId === note.id && this.imagesContainer) {
        this.imagesLoader.style.display = 'none';
        this.imagesContainer.style.display = 'block';
        this.renderImages();
      }

      // 2) Staggered load of actual image data
      for (let i = 0; i < meta.length; i++) {
        try {
          const imgRes = await fetch(`${this.apiEndpoint}/${note.id}/images/${meta[i].id}`);
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            note.images[i] = imgData.data; // The base64 string
            
            // Render sequentially as soon as each image loads
            if (this.currentNoteId === note.id) {
              this.renderImages();
            }
          }
        } catch (err) {
          log.warn(`Failed to load individual image ${meta[i].id}:`, err);
        }
      }
    } finally {
      this.imagesLoading[note.id] = false;
      // Guarantee final render state is applied
      if (this.currentNoteId === note.id) {
        this.renderImages();
      }
    }
  }

  loadExternalStyles() {
    if (document.getElementById('notes-app-styles')) return;

    const link = document.createElement('link');
    link.id = 'notes-app-styles';
    link.rel = 'stylesheet';
    link.href = '/modules/notes/css/notes.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }

  // ===== NOTE OPERATIONS =====

  createNewNote() {
    // Use crypto.randomUUID() for collision-safe IDs (Date.now() can collide if two notes
    // are created within the same millisecond, causing a silent UNIQUE constraint error).
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const note = {
      id,
      title: `Note ${this.notes.length + 1}`,
      content: '',
      images: [],
      created_at: new Date().toISOString(),
      isNew: true
    };
    
    this.notes.unshift(note);
    this.noteState[id] = 'edited';
    this.noteSyncErrors[id] = null;
    
    this.renderNotesList();
    this.selectNote(id);
    
    // Explicitly ensure loader is hidden for new notes immediately
    if (this.editorLoader) this.editorLoader.style.display = 'none';
    if (this.textarea) this.textarea.style.display = 'block';
    
    this.titleInput.focus();
    
    // Create in API
    this.createNoteOnServer(note);
    
    log.debug(`📝 Created new note: ${id}`);
  }

  async createNoteOnServer(note) {
    try {
      log.debug(`📤 Creating note on server: ${note.title}`);
      
      // Only send the fields the server actually uses — avoids sending images:[],
      // imageIds:[], isNew, created_at (server sets its own), etc.
      const payload = { id: note.id, title: note.title, content: note.content || '' };
      
      const response = await fetch(`${this.apiEndpoint}?clientId=${this.clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      log.debug(`✅ Note created on server:`, result);
      
      delete note.isNew;
      if (note.isDeleted) {
        this.deleteNoteOnServer(note.id, note.title);
        return;
      }
      
      this.noteState[note.id] = 'synced';
      this.updateSyncStatus('synced', note.id);
      // Notify other tabs instantly via BroadcastChannel
      this.emit('note-created', { id: note.id, title: note.title, content: note.content || '' });
    } catch (error) {
      log.error('❌ Failed to create note on server:', error);
      this.noteState[note.id] = 'error';
      this.noteSyncErrors[note.id] = error.message;
      this.showNotification('Failed to sync note to server', 'warning');
    }
  }

  selectNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    if (!note.isNew) {
      // Use the same key as the background loader to ensure deduplication in LoadingQueue.
      // Adding the same key at URGENT priority replaces the lower-priority background task.
      this.loadingManager.add(`${note.id}-content`, 'URGENT', async () => {
        await this.loadSingleNoteContent(note);
      });
      
      if (!note.images.length && !this.imagesLoading[note.id]) {
         this.loadingManager.add(`${note.id}-images`, 'URGENT', async () => {
           await this.loadSingleNoteImages(note);
         });
      }
    }

    this.currentNoteId = id;
    
    // ===== IMPROVED: Initialize FieldTracker for partial updates =====
    this.fieldTracker = new FieldTracker(note);

    // Show editor UI
    this.emptyState.style.display = 'none';
    this.titleInput.style.display = 'block';
    this.imagesLoaderWrapper.style.display = 'block';
    this.textarea.style.display = 'block';
    this.footer.style.display = 'flex';

    // Show content loader if content is loading or not yet loaded (null = not yet fetched)
    // New notes (isNew=true) start with empty content ('') — which is not null, so the loader is skipped
    if (!note.isNew && (note.content === null || this.contentLoading[id])) {
      this.editorLoader.style.display = 'flex';
      this.textarea.style.display = 'none';
    } else {
      this.editorLoader.style.display = 'none';
      this.textarea.style.display = 'block';
    }

    // Note: imagesContainer is always shown now to keep the Add Image button visible
    this.imagesContainer.style.display = 'block';

    if ((!note.images || note.images.length === 0) && this.imagesLoading[id]) {
      this.imagesLoader.style.display = 'flex';
    } else {
      this.imagesLoader.style.display = 'none';
    }

    // Load content if needed — never for new notes (they have no server content yet)
    if (note.content === null && !this.contentLoading[id] && !note.isNew) {
      this.contentLoading[id] = true;
      this.editorLoader.style.display = 'flex';
      this.textarea.style.display = 'none';
      this.loadSingleNoteContent(note).catch(e => {
        log.warn('Failed to load content:', e);
        this.textarea.value = 'Failed to load content';
        this.editorLoader.style.display = 'none';
        this.textarea.style.display = 'block';
      });
    }

    // Load images if needed (happens in background, independent of content display)
    if ((!note.images || note.images.length === 0) && !this.imagesLoading[id] && !note.isNew) {
      this.imagesLoading[id] = true;
      this.imagesLoader.style.display = 'flex';
      this.loadSingleNoteImages(note).catch(e => {
        log.warn('Failed to load images:', e);
        this.imagesLoader.style.display = 'none';
      });
    }

    // Update editor display
    this.titleInput.value = note.title || '';
    this.textarea.value = note.content || '';

    // Update timestamp
    const timestamp = this.footer.querySelector('.note-timestamp');
    if (note.created_at) {
      const date = new Date(note.created_at);
      timestamp.textContent = `Created ${date.toLocaleDateString()}`;
    }

    // Render images (will show loaders for individual images if not fully loaded yet)
    this.renderImages();
    this.renderNotesList();
    this.updateSyncStatus('synced', id);
  }

  deleteCurrentNote() {
    if (!this.currentNoteId) return;
    
    if (!confirm('Are you sure you want to delete this note?')) return;

    const noteId = this.currentNoteId;
    const note = this.notes.find(n => n.id === noteId);
    const noteTitle = note ? note.title : 'Unknown';
    
    // Remove from list
    this.notes = this.notes.filter(n => n.id !== noteId);
    this.currentNoteId = null;
    
    // Clean up cached data
    delete this.noteETags[noteId];
    delete this.noteState[noteId];
    delete this.contentLoading[noteId];
    delete this.imagesLoading[noteId];
    delete this.noteSyncErrors[noteId];
    
    this.showEmptyState();
    this.renderNotesList();
    
    // Delete from server
    if (note && note.isNew) {
      note.isDeleted = true;
    } else {
      this.deleteNoteOnServer(noteId, noteTitle);
    }
    
    log.debug(`🗑️  Deleted note: ${noteTitle}`);
  }

  async deleteNoteOnServer(noteId, noteTitle) {
    try {
      log.debug(`📤 Deleting note on server: ${noteId}`);
      
      const response = await fetch(`${this.apiEndpoint}/${noteId}?clientId=${this.clientId}`, {
        method: 'DELETE'
      });

      if (response.status === 404) {
        log.debug('Note not found on server (already deleted)');
        return;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      log.debug(`✅ Note deleted from server: ${noteTitle}`);
      this.showNotification(`Deleted: ${noteTitle}`, 'success');
      // Notify other tabs instantly via BroadcastChannel
      this.emit('note-deleted', { id: noteId });
    } catch (error) {
      log.error('❌ Failed to delete note from server:', error);
      this.showNotification('Failed to delete note from server', 'error');
    }
  }

  showEmptyState() {
    this.emptyState.style.display = 'flex';
    this.titleInput.style.display = 'none';
    this.imagesContainer.style.display = 'none';
    this.textarea.style.display = 'none';
    this.footer.style.display = 'none';
  }

  updateEditorContent(title, content) {
    if (this.titleInput) this.titleInput.value = title || '';
    if (this.textarea) this.textarea.value = content || '';
    
    // Force loader off when content is manually updated (e.g. via SSE)
    if (this.editorLoader) this.editorLoader.style.display = 'none';
    if (this.textarea) this.textarea.style.display = 'block';
  }

  updateSyncStatus(status, noteId = null) {
    if (!this.syncIndicator) return;

    const dot = this.syncIndicator.querySelector('.sync-dot');
    const text = this.syncIndicator.querySelector('.sync-text');

    if (status === 'editing') {
      this.syncIndicator.style.display = 'flex';
      dot.className = 'sync-dot editing';
      text.textContent = 'editing...';
    } else if (status === 'syncing') {
      // Only show syncing if not already showing synced
      if (dot.className !== 'sync-dot synced') {
        this.syncIndicator.style.display = 'flex';
        dot.className = 'sync-dot syncing';
        text.textContent = 'syncing...';
      }
    } else if (status === 'synced') {
      this.syncIndicator.style.display = 'flex';
      dot.className = 'sync-dot synced';
      text.textContent = 'synced';

      setTimeout(() => {
        // Hide if still showing synced and no active syncing
        if (this.syncIndicator && !this.isSyncingAny) {
          this.syncIndicator.style.display = 'none';
        }
      }, 2000);
    } else if (status === 'error') {
      this.syncIndicator.style.display = 'flex';
      dot.className = 'sync-dot error';
      text.textContent = 'sync error';
    }
  }

  renderLoadingState() {
    if (!this.notesList) return;
    this.notesList.innerHTML = `
      <div class="notes-list-loading">
        <div class="skeleton-list-item"></div>
        <div class="skeleton-list-item" style="animation-delay: 0.1s"></div>
        <div class="skeleton-list-item" style="animation-delay: 0.2s"></div>
        <div class="skeleton-list-item" style="animation-delay: 0.3s"></div>
        <div class="skeleton-list-item" style="animation-delay: 0.4s"></div>
      </div>
    `;
  }

  renderNotesList(query = '') {
    const prevScroll = this.notesList ? this.notesList.scrollTop : 0;
    this.notesList.innerHTML = '';
    
    const filteredNotes = query
      ? this.notes.filter(n => n.title.toLowerCase().includes(query))
      : this.notes;

    filteredNotes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'notes-list-item';
      if (this.currentNoteId === note.id) {
        item.classList.add('active');
      }
      
      // Add state indicator
      const stateIndicator = this.noteState[note.id] || 'pristine';
      item.dataset.state = stateIndicator;
      
      item.textContent = note.title || 'Untitled';
      item.addEventListener('click', () => this.selectNote(note.id));
      
      this.notesList.appendChild(item);
    });

    if (this.notesList) {
      this.notesList.scrollTop = prevScroll;
    }
  }

  renderImages() {
    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) {
      this.imagesContainer.innerHTML = '';
      return;
    }

    // Bug 2 fix: Clean separation of loading vs. loaded states.
    // Previously, skeletons were injected via innerHTML AND individual images were appended
    // in the same render call — creating duplicated skeleton+image rendering simultaneously
    // during staggered loading. Now: show skeletons OR real images, never both.

    this.imagesContainer.innerHTML = '<div class="note-images"></div>';
    const imagesDiv = this.imagesContainer.querySelector('.note-images');

    // Phase 1: Show pure skeleton placeholders while fetching metadata
    // (before we even know how many images there are)
    if (this.imagesLoading[note.id] && (!note.images || note.images.length === 0)) {
      const placeholders = Array.from({ length: 2 }, (_, i) =>
        `<div class="skeleton-image" style="animation-delay: ${i * 0.1}s"></div>`
      ).join('');
      imagesDiv.innerHTML = placeholders;
    }

    // Phase 2: Images known (meta loaded) — render each image or a skeleton slot
    if (note.images && note.images.length > 0) {
      note.images.forEach((imageData, index) => {
        if (!imageData) {
          // Skeleton slot for images still being fetched (staggered loading)
          const placeholder = document.createElement('div');
          placeholder.className = 'skeleton-image';
          placeholder.style.marginRight = '8px';
          imagesDiv.appendChild(placeholder);
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'note-image-wrapper';

        // Spinner shown while the <img> itself decodes/paints
        const spinner = document.createElement('div');
        spinner.className = 'image-loading-spinner';
        spinner.innerHTML = '<div class="spinner"></div>';

        const img = document.createElement('img');
        img.src = imageData;
        img.className = 'note-image';
        img.addEventListener('click', () => this.viewImage(imageData));
        img.addEventListener('load', () => {
          spinner.style.opacity = '0';
          spinner.style.pointerEvents = 'none';
          setTimeout(() => { spinner.style.display = 'none'; }, 300);
        });
        img.addEventListener('error', () => {
          spinner.innerHTML = '<div style="color:#ef4444;font-size:12px;text-align:center;padding:8px">Failed to load</div>';
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'image-remove-btn';
        removeBtn.innerHTML = '✕';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeImage(index);
        });

        wrapper.appendChild(spinner);
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        imagesDiv.appendChild(wrapper);
      });
    }
    // ── Add Image button (file picker — works on mobile) ──
    const addImgWrapper = document.createElement('div');
    addImgWrapper.className = 'note-image-wrapper note-add-image-btn';
    addImgWrapper.title = 'Add image';
    addImgWrapper.innerHTML = `
      <div class="add-image-inner">
        <span class="add-image-icon">＋</span>
        <span class="add-image-label">Add</span>
      </div>
      <input type="file" class="add-image-input" accept="image/*" multiple style="display:none;">
    `;
    const fileInput = addImgWrapper.querySelector('.add-image-input');
    addImgWrapper.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) this.processImageFiles(files);
      // Reset so the same file can be selected again
      fileInput.value = '';
    });
    imagesDiv.appendChild(addImgWrapper);

    this.imagesContainer.style.display = 'block';
  }

  async removeImage(index) {
    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note || !note.images) return;

    const imageId = note.imageIds ? note.imageIds[index] : null;
    
    // Snapshot for rollback in case the server request fails
    const removedImage = note.images[index];
    const removedImageId = note.imageIds ? note.imageIds[index] : null;

    // Optimistic UI update
    note.images.splice(index, 1);
    if (note.imageIds) note.imageIds.splice(index, 1);
    this.renderImages();
    
    log.debug(`🗑️  Removed image at index ${index} from note`);
    
    if (imageId) {
      try {
        const res = await fetch(`${this.apiEndpoint}/${note.id}/images/${imageId}?clientId=${this.clientId}`, {
          method: 'DELETE'
        });
        // Bug 4 fix: check response — roll back optimistic update on failure
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        // Notify other tabs instantly via BroadcastChannel
        this.emit('image-updated', { noteId: note.id });
      } catch (err) {
        log.error('Failed to delete image on server — rolling back:', err);
        // Restore the image at its original position
        note.images.splice(index, 0, removedImage);
        if (note.imageIds && removedImageId !== undefined) {
          note.imageIds.splice(index, 0, removedImageId);
        }
        this.renderImages();
        this.showNotification('Failed to delete image — it has been restored', 'error');
      }
    }
  }

  // ===== IMAGE HANDLING =====

  // Shared: process a FileList/Array of image files (drag-and-drop or file picker)
  processImageFiles(files) {
    if (!this.currentNoteId) return;
    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;

    const MAX_IMAGES = 50;
    const MAX_TOTAL_SIZE = 50000000; // 50MB
    const MAX_PER_IMAGE = 7500000;   // 7.5MB raw ≈ 10MB after base64 (+33%)

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      this.showNotification('Only image files can be added', 'warning');
      return;
    }

    let filesProcessed = 0;
    // Bug 5 fix: Use a running total that accounts for images added in this same batch.
    // The old code captured currentSize once before the forEach, so the 2nd, 3rd... files
    // in a multi-file selection all checked against the same stale start size.
    let runningTotalSize = note.images.reduce((sum, img) => sum + (img ? img.length : 0), 0);

    // Ensure images container is visible and the .note-images div exists
    this.imagesContainer.style.display = 'block';
    if (!this.imagesContainer.querySelector('.note-images')) {
      this.imagesContainer.innerHTML = '<div class="note-images"></div>';
    }

    imageFiles.forEach(file => {
      if (file.size > MAX_PER_IMAGE) {
        this.showNotification(`Image "${file.name}" is too large (max 10MB)`, 'error');
        return;
      }
      if (note.images.length + filesProcessed >= MAX_IMAGES) {
        this.showNotification(`Cannot add more than ${MAX_IMAGES} images per note`, 'error');
        return;
      }

      // Show ring-spinner placeholder immediately
      const noteImagesDiv = this.imagesContainer.querySelector('.note-images')
        || (() => {
          this.imagesContainer.innerHTML = '<div class="note-images"></div>';
          return this.imagesContainer.querySelector('.note-images');
        })();
      // Insert placeholder before the ＋ button if it exists
      const addBtn = noteImagesDiv.querySelector('.note-add-image-btn');
      const placeholderWrapper = document.createElement('div');
      placeholderWrapper.className = 'note-image-wrapper note-image-uploading';
      placeholderWrapper.innerHTML = `
        <div class="image-upload-placeholder">
          <div class="upload-ring-spinner"></div>
          <span class="upload-label">Reading…</span>
        </div>
      `;
      if (addBtn) noteImagesDiv.insertBefore(placeholderWrapper, addBtn);
      else noteImagesDiv.appendChild(placeholderWrapper);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        // Bug 5 fix: check against running total (updated per file), not stale snapshot
        const newSize = runningTotalSize + base64.length;
        if (newSize > MAX_TOTAL_SIZE) {
          this.showNotification('Total image size limit (50MB) would be exceeded', 'warning');
          placeholderWrapper.remove();
          return;
        }
        runningTotalSize += base64.length; // update for subsequent files in same batch

        // Optimistically add to UI first
        const newIndex = note.images.length;
        note.images.push(base64);
        if (!note.imageIds) note.imageIds = [];
        note.imageIds.push('temp'); // Will update when server responds
        filesProcessed++;

        // Replace placeholder with thumbnail + sync overlay
        placeholderWrapper.innerHTML = `
          <div class="image-sync-overlay">
            <div class="upload-ring-spinner upload-ring-sm"></div>
          </div>
          <img src="${base64}" class="note-image note-image-syncing" />
          <button class="image-remove-btn" title="Remove image">✕</button>
        `;
        placeholderWrapper.classList.remove('note-image-uploading');

        placeholderWrapper.querySelector('.image-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeImage(newIndex);
        });
        placeholderWrapper.querySelector('img').addEventListener('click', () => this.viewImage(base64));

        try {
          // Wait for parent note to finish syncing to server to prevent FK constraint violations.
          // This handles the race condition between optimistic UI creation and server-side persistence.
          if (note.isNew) {
            log.debug(`⏳ Waiting for note ${note.id} to sync before uploading image...`);
            let retries = 60; // Wait up to 6 seconds (60 * 100ms)
            while (note.isNew && retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retries--;
            }
            if (note.isNew) {
              throw new Error('Parent note took too long to sync. Please try again.');
            }
            log.debug(`✅ Note ${note.id} synced — proceeding with image upload.`);
          }

          // Upload the image with retry-with-backoff logic.
          // The backend now returns 404 specifically when the note doesn't exist (FK constraint).
          // We retry on both 404 and 500 to handle transient timing/lock issues.
          let uploadResponse = null;
          const MAX_UPLOAD_RETRIES = 5;
          for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
            uploadResponse = await fetch(`${this.apiEndpoint}/${note.id}/images?clientId=${this.clientId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageData: base64 })
            });

            if (uploadResponse.ok) break; // Success

            const status = uploadResponse.status;
            if (attempt < MAX_UPLOAD_RETRIES && (status === 404 || status === 500 || status === 503)) {
              const delay = attempt * 500; // 500ms, 1s, 1.5s, 2s
              log.warn(`⚠️ Image upload attempt ${attempt} failed (HTTP ${status}). Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // Non-retriable error or max retries exhausted
              const errData = await uploadResponse.json().catch(() => ({}));
              throw new Error(`Upload failed (HTTP ${status}): ${errData.error || '(no details)'}`);
            }
          }

          if (!uploadResponse || !uploadResponse.ok) {
            throw new Error('Image upload failed after maximum retries.');
          }

          const data = await uploadResponse.json();
          note.imageIds[newIndex] = data.imageId; // Assign real server ID

          // Clear sync overlay on success
          const overlay = placeholderWrapper.querySelector('.image-sync-overlay');
          const thumb = placeholderWrapper.querySelector('img');
          if (overlay) { overlay.classList.add('image-sync-overlay--done'); setTimeout(() => overlay.remove(), 400); }
          if (thumb) thumb.classList.remove('note-image-syncing');

          if (filesProcessed === imageFiles.length) {
            this.showNotification(`Added ${filesProcessed} image(s)`, 'success');
          }
          // Notify other tabs instantly (before SSE arrives)
          this.emit('image-updated', { noteId: note.id });
        } catch (err) {
          log.error('Image upload failed:', err);
          // Visually mark the image as errored
          placeholderWrapper.classList.add('note-image-error');
          const overlay = placeholderWrapper.querySelector('.image-sync-overlay');
          if (overlay) overlay.innerHTML = '<div style="color:#ef4444;font-size:11px;text-align:center;padding:4px;">Upload failed</div>';
          this.showNotification(`Failed to upload image: ${err.message}`, 'error');
        }
      };

      reader.onerror = () => {
        placeholderWrapper.remove();
        this.showNotification(`Failed to load image: ${file.name}`, 'error');
      };
      reader.readAsDataURL(file);
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.editorArea.classList.add('drag-over');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.editorArea.classList.remove('drag-over');
  }

  handleImageDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.editorArea.classList.remove('drag-over');
    this.processImageFiles(e.dataTransfer.files);
  }

  viewImage(imageData) {
    const modal = document.createElement('div');
    
    // Improvement E: Use __appZIndexCounter directly instead of scanning all DOM elements
    // (querySelectorAll('body *') on a complex page can touch thousands of nodes)
    const modalZ = (window.__appZIndexCounter || 0) + 1 || 9999999;

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${modalZ};
      overflow: hidden;
      touch-action: none;
    `;

    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 90%;
      height: 90%;
      position: relative;
      cursor: grab;
      touch-action: none;
    `;

    const img = document.createElement('img');
    img.src = imageData;
    let scale = 1;
    let panning = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    // Touch tracking
    let lastTouchDistance = 0;
    let touchStartTime = 0;
    let lastTap = 0;
    const DOUBLE_TAP_DELAY = 300;

    const getDistance = (touches) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (touches) => {
      let x = 0, y = 0;
      for (let touch of touches) {
        x += touch.clientX;
        y += touch.clientY;
      }
      return { x: x / touches.length, y: y / touches.length };
    };

    const updateImageStyle = () => {
      img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transform: scale(${scale}) translate(${offsetX}px, ${offsetY}px);
        transition: ${panning ? 'none' : 'transform 0.2s ease'};
        user-select: none;
        cursor: ${scale > 1 ? 'grab' : 'default'};
      `;
    };

    updateImageStyle();

    // Zoom with mouse wheel
    imgContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      scale += e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      scale = Math.max(1, Math.min(scale, 5));
      
      if (scale === 1) {
        offsetX = 0;
        offsetY = 0;
      }
      updateImageStyle();
    });

    // Pan with mouse drag (only when zoomed)
    imgContainer.addEventListener('mousedown', (e) => {
      if (scale > 1) {
        panning = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
        imgContainer.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (panning) {
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        updateImageStyle();
      }
    });

    document.addEventListener('mouseup', () => {
      panning = false;
      if (scale > 1) {
        imgContainer.style.cursor = 'grab';
      }
    });

    // Double-click to reset zoom
    img.addEventListener('dblclick', () => {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      updateImageStyle();
    });

    // ===== TOUCH EVENTS =====
    
    // Pinch to zoom with touch
    imgContainer.addEventListener('touchstart', (e) => {
      touchStartTime = Date.now();
      
      if (e.touches.length === 2) {
        lastTouchDistance = getDistance(e.touches);
      } else if (e.touches.length === 1) {
        panning = false;
        startX = e.touches[0].clientX - offsetX;
        startY = e.touches[0].clientY - offsetY;
      }
    });

    imgContainer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      
      if (e.touches.length === 2) {
        // Pinch zoom
        const newDistance = getDistance(e.touches);
        if (lastTouchDistance > 0) {
          const delta = (newDistance - lastTouchDistance) * 0.01;
          scale += delta;
          scale = Math.max(1, Math.min(scale, 5));
          updateImageStyle();
        }
        lastTouchDistance = newDistance;
      } else if (e.touches.length === 1 && scale > 1) {
        // Single finger pan (only when zoomed)
        panning = true;
        offsetX = e.touches[0].clientX - startX;
        offsetY = e.touches[0].clientY - startY;
        updateImageStyle();
      }
    });

    imgContainer.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        lastTouchDistance = 0;
      }
      panning = false;
      
      // Reset pan if zoomed out
      if (scale === 1) {
        offsetX = 0;
        offsetY = 0;
        updateImageStyle();
      }
      
      // Double tap to reset zoom
      const now = Date.now();
      if (now - lastTap <= DOUBLE_TAP_DELAY) {
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        updateImageStyle();
      }
      lastTap = now;
    });

    // Close on click outside image
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Close on tap outside image (touch)
    modal.addEventListener('touchstart', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    imgContainer.appendChild(img);
    modal.appendChild(imgContainer);

    // ── Close button — always visible, especially on mobile ──
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close image');
    closeBtn.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${modalZ + 1};
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
      transition: background 0.2s ease, transform 0.15s ease;
      touch-action: manipulation;
    `;
    closeBtn.addEventListener('pointerover', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.30)';
    });
    closeBtn.addEventListener('pointerout', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.18)';
    });
    closeBtn.addEventListener('pointerdown', () => {
      closeBtn.style.transform = 'scale(0.88)';
    });
    closeBtn.addEventListener('pointerup', () => {
      closeBtn.style.transform = 'scale(1)';
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
    modal.appendChild(closeBtn);

    const closeModal = () => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    };

    // Close with Escape key
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(modal);
  }

  // ===== UTILITIES =====

  showNotification(message, type = 'info') {
    let notification = document.querySelector('.notes-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'notes-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `notes-notification notes-notification-${type}`;
    notification.style.display = 'block';

    setTimeout(() => {
      notification.style.display = 'none';
    }, 3000);
  }
}

// Export for use in other files
window.NotesApp = NotesApp;

