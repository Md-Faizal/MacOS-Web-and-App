/**
 * AI Assistant Chat Widget
 * Provides a beautiful chat interface for interacting with the Gemini AI backend
 * Includes session history, auto-naming, manual rename, inline deletion, model selection,
 * quick prompts, copy responses, and Chart.js visualization.
 */

class AIAssistant {
  constructor(containerSelector = 'body') {
    this.container = document.querySelector(containerSelector);
    this.isOpen = false;
    this.isLoading = false;
    this.isExpanded = false;
    this.isHistoryOpen = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.apiBase = this.getApiBaseUrl() + '/api/ai';
    this.selectedModel = 'gemini-2.5-flash';
    this.sessions = [];
    this.currentSessionId = null;
    this.sessionId = null;
    this.quickSearchQueries = [
      // Database/Business queries
      'Show me all products',
      'List top selling products',
      'Get total revenue',
      'Show pending payments',
      'Get customer count',
      'What are my top customers?',
      'Show recent orders',
      'List unpaid invoices',
      'How many products in inventory?',
      'What is the sales trend this month?',
      'Show payment status overview',
      'List all contacts',
      'What is total pending amount?',
      'Show order summary',
      'Which products have low stock?',
      'What are recent transactions?',
      'Show customer payment history',
      'List products by category',
      'What is average transaction value?',
      'Show monthly revenue breakdown'
    ];
    this.init();
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getApiBaseUrl() {
    return '';
  }

  loadSessions() {
    try {
      const raw = localStorage.getItem('macos_ai_chat_sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.sessions = parsed;
          this.currentSessionId = parsed[0].id;
          this.sessionId = this.currentSessionId;
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse sessions from localStorage:', e);
    }
    const fresh = this.createNewSession();
    this.sessions = [fresh];
    this.currentSessionId = fresh.id;
    this.sessionId = fresh.id;
    this.saveSessions();
  }

  saveSessions() {
    try {
      localStorage.setItem('macos_ai_chat_sessions', JSON.stringify(this.sessions));
    } catch (e) {
      console.error('Failed to save sessions to localStorage:', e);
    }
  }

  createNewSession() {
    return {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
      title: 'New conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
  }

  getCurrentSession() {
    return this.sessions.find(s => s.id === this.currentSessionId) || this.sessions[0];
  }

  init() {
    this.loadStyles();
    this.loadSessions();
    this.createChatWidget();
    this.attachEventListeners();
    this.switchSession(this.currentSessionId);
  }

  loadStyles() {
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = '/frontend/styles/ai-assistant/ai-assistant.css';
    // document.head.appendChild(styleLink); /* Disabled for Vite */
  }

  createChatWidget() {
    const widget = document.createElement('div');
    widget.id = 'aiChatWidget';
    widget.className = 'ai-chat-widget ai-widget-hidden';
    widget.innerHTML = `
      <div class="ai-widget-header" id="aiDragHandle">
        <div class="ai-widget-title">
          <img src="/assets/Images/Siri.png" alt="AI" class="ai-widget-icon">
          <span>AI Assistant</span>
        </div>
        <div class="ai-widget-controls">
          <button class="ai-pill-btn" id="aiHistoryBtn" title="Conversation History">
            <span class="ai-pill-icon">🕒</span><span class="ai-pill-label">History</span>
          </button>
          <button class="ai-pill-btn" id="aiNewChatBtn" title="Start New Conversation">
            <span class="ai-pill-icon">＋</span><span class="ai-pill-label">New</span>
          </button>
          <select id="aiModelSelector" class="ai-model-selector" title="Select AI Model">
            <option value="gemini-2.5-flash" selected>2.5 Flash</option>
            <option value="gemini-2.5-pro">2.5 Pro</option>
            <option value="gemini-2.5-flash-lite">2.5 Lite</option>
            <option value="gemini-3.8-flash">3.8 Flash</option>
          </select>
          <button class="ai-icon-btn ai-widget-expand" title="Expand" id="aiExpandBtn">⛶</button>
          <button class="ai-icon-btn ai-widget-close" title="Close">✕</button>
        </div>
      </div>

      <!-- Sliding History Drawer -->
      <div class="ai-history-drawer" id="aiHistoryDrawer">
        <div class="ai-history-drawer-header">
          <span>Past Conversations</span>
          <div class="ai-history-header-actions">
            <button class="ai-history-clear-btn" id="aiClearAllBtn" title="Clear all history">Clear All</button>
            <button class="ai-history-close-btn" id="aiHistoryCloseBtn" title="Close history">✕</button>
          </div>
        </div>
        <div class="ai-history-list" id="aiHistoryList"></div>
      </div>

      <div class="ai-messages" id="aiMessages"></div>

      <div class="ai-input-area">
        <input 
          type="text" 
          id="aiInput" 
          class="ai-input" 
          placeholder="Ask me anything..." 
          autocomplete="off"
        >
        <div class="ai-suggestions" id="aiSuggestions"></div>
        <button class="ai-send-btn" id="aiSendBtn" title="Send message">→</button>
      </div>
      <div class="ai-resize-handle"></div>
    `;

    document.body.appendChild(widget);
    this.selectedModel = 'gemini-2.5-flash';
  }

  attachEventListeners() {
    // Toggle chat widget visibility
    const btn = document.getElementById('aiAssistantBtn');
    if (btn) {
      btn.addEventListener('click', () => this.toggleChat());
    }

    // Expand button
    document.getElementById('aiExpandBtn').addEventListener('click', () => this.expandApp());

    // Close button
    document.querySelector('.ai-widget-close').addEventListener('click', () => this.toggleChat());

    // History Toggle & New Chat buttons
    document.getElementById('aiHistoryBtn').addEventListener('click', () => this.toggleHistoryDrawer());
    document.getElementById('aiNewChatBtn').addEventListener('click', () => this.startNewChat());
    document.getElementById('aiHistoryCloseBtn').addEventListener('click', () => this.closeHistoryDrawer());
    document.getElementById('aiClearAllBtn').addEventListener('click', () => this.clearAllSessions());

    // Dragging functionality
    const dragHandle = document.getElementById('aiDragHandle');
    dragHandle.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.stopDrag());

    // Resize handle
    const resizeHandle = document.querySelector('.ai-resize-handle');
    resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
    document.addEventListener('mousemove', (e) => this.resize(e));
    document.addEventListener('mouseup', () => this.stopResize());

    // Model selector
    const modelSelector = document.getElementById('aiModelSelector');
    if (modelSelector) {
      modelSelector.addEventListener('change', (e) => {
        this.selectedModel = e.target.value;
      });
    }

    // Send message
    const sendBtn = document.getElementById('aiSendBtn');
    const input = document.getElementById('aiInput');

    sendBtn.addEventListener('click', () => this.sendMessage());
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Show suggestions on input
    input.addEventListener('input', (e) => {
      this.showSuggestions(e.target.value);
    });

    // Hide suggestions on blur
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const suggestionDiv = document.getElementById('aiSuggestions');
        if (suggestionDiv) suggestionDiv.innerHTML = '';
      }, 200);
    });

    // Vault document deep-link click handler
    document.addEventListener('click', (e) => {
      const vaultLink = e.target.closest('.ai-vault-doc-link');
      if (vaultLink) {
        e.preventDefault();
        const docId = Number(vaultLink.dataset.docId);
        if (docId) {
          if (window.DocumentVaultExplorerInstance) {
            window.DocumentVaultExplorerInstance.openFileViewer(docId);
          } else {
            window.open(`/api/compliance/vault/documents/${docId}/pdf`, '_blank');
          }
        }
      }
    });
  }

  toggleChat() {
    const widget = document.getElementById('aiChatWidget');
    this.isOpen = !this.isOpen;
    widget.classList.toggle('ai-widget-hidden', !this.isOpen);

    if (this.isOpen) {
      document.getElementById('aiInput').focus();
    }
  }

  expandApp() {
    const widget = document.getElementById('aiChatWidget');
    this.isExpanded = !this.isExpanded;
    
    if (this.isExpanded) {
      widget.classList.add('ai-widget-expanded');
      document.getElementById('aiExpandBtn').textContent = '⛶';
      document.getElementById('aiExpandBtn').title = 'Collapse';
    } else {
      widget.classList.remove('ai-widget-expanded');
      document.getElementById('aiExpandBtn').textContent = '⛶';
      document.getElementById('aiExpandBtn').title = 'Expand';
    }
  }

  startDrag(e) {
    if (this.isExpanded || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
    
    this.isDragging = true;
    const widget = document.getElementById('aiChatWidget');
    const rect = widget.getBoundingClientRect();
    
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    
    widget.style.cursor = 'grabbing';
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const widget = document.getElementById('aiChatWidget');
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    widget.style.position = 'fixed';
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
    widget.style.right = 'auto';
  }

  stopDrag() {
    this.isDragging = false;
    const widget = document.getElementById('aiChatWidget');
    widget.style.cursor = 'auto';
  }

  startResize(e) {
    if (this.isExpanded) return;
    
    this.isResizing = true;
    const widget = document.getElementById('aiChatWidget');
    this.resizeStart = {
      width: widget.offsetWidth,
      height: widget.offsetHeight,
      x: e.clientX,
      y: e.clientY
    };
    
    e.preventDefault();
  }

  resize(e) {
    if (!this.isResizing) return;
    
    const widget = document.getElementById('aiChatWidget');
    const deltaX = e.clientX - this.resizeStart.x;
    const deltaY = e.clientY - this.resizeStart.y;
    
    const newWidth = Math.max(320, this.resizeStart.width + deltaX);
    const newHeight = Math.max(300, this.resizeStart.height + deltaY);
    
    widget.style.width = newWidth + 'px';
    widget.style.height = newHeight + 'px';
  }

  stopResize() {
    this.isResizing = false;
  }

  /* ==========================================================================
     SESSION & HISTORY MANAGEMENT
     ========================================================================== */

  startNewChat() {
    const fresh = this.createNewSession();
    this.sessions.unshift(fresh);
    this.saveSessions();
    this.switchSession(fresh.id);
    this.closeHistoryDrawer();
    const input = document.getElementById('aiInput');
    if (input) input.focus();
  }

  switchSession(sessionId) {
    this.currentSessionId = sessionId;
    this.sessionId = sessionId;
    const session = this.getCurrentSession();
    
    const messages = document.getElementById('aiMessages');
    if (messages) {
      messages.innerHTML = '';
      if (!session.messages || session.messages.length === 0) {
        this.renderWelcomeScreen();
      } else {
        session.messages.forEach(msg => {
          this.addMessage(msg.text, msg.role, msg.data, false);
        });
      }
    }
    this.renderHistoryList();
  }

  renderWelcomeScreen() {
    const messages = document.getElementById('aiMessages');
    if (!messages) return;

    messages.innerHTML = `
      <div class="ai-welcome">
        <div class="ai-welcome-title">Welcome to AI Assistant</div>
        <p>I can help with anything - ask me questions, write queries, analyze inventory, or check revenue!</p>
        <div class="ai-welcome-chips">
          <button class="ai-chip" data-query="Show me all products">📦 All Products</button>
          <button class="ai-chip" data-query="List top selling products">🔥 Top Selling</button>
          <button class="ai-chip" data-query="Get total revenue">💰 Total Revenue</button>
          <button class="ai-chip" data-query="Which products have low stock?">⚠️ Low Stock</button>
        </div>
      </div>
    `;

    messages.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const query = e.currentTarget.dataset.query;
        const input = document.getElementById('aiInput');
        if (input && query) {
          input.value = query;
          this.sendMessage();
        }
      });
    });
  }

  toggleHistoryDrawer() {
    this.isHistoryOpen = !this.isHistoryOpen;
    const drawer = document.getElementById('aiHistoryDrawer');
    if (drawer) {
      drawer.classList.toggle('ai-history-open', this.isHistoryOpen);
      if (this.isHistoryOpen) {
        this.renderHistoryList();
      }
    }
  }

  closeHistoryDrawer() {
    this.isHistoryOpen = false;
    const drawer = document.getElementById('aiHistoryDrawer');
    if (drawer) {
      drawer.classList.remove('ai-history-open');
    }
  }

  renderHistoryList() {
    const list = document.getElementById('aiHistoryList');
    if (!list) return;

    if (this.sessions.length === 0) {
      list.innerHTML = `<div class="ai-history-empty">No conversations yet</div>`;
      return;
    }

    list.innerHTML = this.sessions.map(s => {
      const isActive = s.id === this.currentSessionId;
      const d = new Date(s.updatedAt || s.createdAt || Date.now());
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const msgCount = (s.messages || []).length;
      return `
        <div class="ai-history-item ${isActive ? 'active' : ''}" data-id="${s.id}">
          <div class="ai-history-item-top">
            <span class="ai-history-title" data-id="${s.id}" title="Double-click to rename">${this.escapeHtml(s.title || 'New conversation')}</span>
            <div class="ai-history-actions">
              <button class="ai-history-action-btn ai-hist-edit" title="Rename conversation" data-id="${s.id}">✎</button>
              <button class="ai-history-action-btn ai-hist-del" title="Delete conversation" data-id="${s.id}">✕</button>
            </div>
          </div>
          <div class="ai-history-meta">${dateStr} • ${msgCount} msgs</div>
        </div>
      `;
    }).join('');

    // Clicking an item switches to that session
    list.querySelectorAll('.ai-history-item').forEach(item => {
      const id = item.dataset.id;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.ai-history-actions') || e.target.classList.contains('ai-history-rename-input')) return;
        this.switchSession(id);
        this.closeHistoryDrawer();
      });
    });

    // Edit button & double-click title
    list.querySelectorAll('.ai-hist-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startInlineRename(btn.dataset.id);
      });
    });

    list.querySelectorAll('.ai-history-title').forEach(span => {
      span.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineRename(span.dataset.id);
      });
    });

    // Delete button
    list.querySelectorAll('.ai-hist-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id);
      });
    });
  }

  startInlineRename(sessionId) {
    const span = document.querySelector(`.ai-history-title[data-id="${sessionId}"]`);
    if (!span) return;
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ai-history-rename-input';
    input.value = session.title;
    
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      if (val) {
        session.title = val;
        session.updatedAt = Date.now();
        this.saveSessions();
      }
      this.renderHistoryList();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        committed = true;
        this.renderHistoryList();
      }
    });
    input.addEventListener('blur', commit);

    span.replaceWith(input);
    input.focus();
    input.select();
  }

  deleteSession(sessionId) {
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.sessions.length === 0) {
      const fresh = this.createNewSession();
      this.sessions = [fresh];
      this.currentSessionId = fresh.id;
    } else if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0].id;
    }
    this.saveSessions();
    this.switchSession(this.currentSessionId);
  }

  clearAllSessions() {
    if (!confirm('Clear all conversation history?')) return;
    const fresh = this.createNewSession();
    this.sessions = [fresh];
    this.saveSessions();
    this.switchSession(fresh.id);
    this.closeHistoryDrawer();
  }

  /* ==========================================================================
     SEND & RENDER MESSAGES
     ========================================================================== */

  async sendMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message to chat and save to session
    this.addMessage(message, 'user');
    input.value = '';

    // Show loading indicator (not saved to session)
    this.isLoading = true;
    this.addMessage('', 'bot-loading', null, false);

    try {
      const response = await fetch(`${this.apiBase}/query`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: message,
          sessionId: this.sessionId,
          useContext: true,
          model: this.selectedModel
        })
      });

      const data = await response.json();

      // Remove loading indicator
      const messages = document.getElementById('aiMessages');
      const loadingSpinner = messages.querySelector('.ai-loading');
      if (loadingSpinner) {
        loadingSpinner.closest('.ai-message')?.remove();
      }

      if (data.success) {
        this.addMessage(data.response, 'bot', data);
      } else {
        // Check for quota/rate limit errors
        if (data.details && data.details.includes('quota')) {
          this.addMessage('⚠️ API quota exceeded. Please try again in a few moments or upgrade your plan at https://ai.google.dev', 'bot');
        } else if (data.details && data.details.includes('429')) {
          this.addMessage('⏳ Too many requests. Please wait a moment and try again.', 'bot');
        } else {
          this.addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);

      const messages = document.getElementById('aiMessages');
      const loadingSpinner = messages.querySelector('.ai-loading');
      if (loadingSpinner) {
        loadingSpinner.closest('.ai-message')?.remove();
      }

      this.addMessage(
        'Connection error. Make sure the AI service is running on port 3002.',
        'bot'
      );
    } finally {
      this.isLoading = false;
    }
  }

  addMessage(text, role, data = null, saveToHistory = true) {
    const messages = document.getElementById('aiMessages');
    if (!messages) return;

    // Remove welcome message if it exists
    const welcome = messages.querySelector('.ai-welcome');
    if (welcome && messages.children.length === 1) {
      welcome.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;

    if (role === 'bot-loading') {
      messageDiv.classList.remove('bot-loading');
      messageDiv.classList.add('bot');
      messageDiv.innerHTML = `
        <div class="ai-message-content">
          <div class="ai-loading">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      `;
    } else {
      let contentHTML = `<div class="ai-message-content">`;
      
      if (role === 'bot') {
        contentHTML += `<div class="ai-text-reply">${this.formatMarkdown(text)}</div>`;
      } else {
        contentHTML += this.formatMarkdown(text);
      }

      // If we have SQL query results, enrich the message block
      if (data && data.query) {
        contentHTML += `
          <details class="ai-sql-details">
            <summary>🔍 View SQL Query</summary>
            <pre><code class="language-sql">${this.escapeHtml(data.query)}</code></pre>
          </details>
        `;

        if (data.results && data.results.length > 0) {
          const keys = Object.keys(data.results[0]);
          const headersHTML = keys.map(k => `<th>${this.escapeHtml(k.replace(/_/g, ' '))}</th>`).join('');
          const rowsHTML = data.results.map(row => {
            const cols = keys.map(k => `<td>${this.escapeHtml(String(row[k] ?? ''))}</td>`).join('');
            return `<tr>${cols}</tr>`;
          }).join('');

          contentHTML += `
            <div class="ai-table-container">
              <table class="ai-results-table">
                <thead><tr>${headersHTML}</tr></thead>
                <tbody>${rowsHTML}</tbody>
              </table>
            </div>
          `;

          // Generate dynamic charts if we have multiple entries and numeric data
          const numericKeys = keys.filter(k => {
            const val = data.results[0][k];
            return typeof val === 'number' || (!isNaN(val) && val !== '' && val !== null);
          });
          const labelKeys = keys.filter(k => !numericKeys.includes(k));

          if (numericKeys.length > 0) {
            const chartId = 'chart_' + Math.random().toString(36).substr(2, 9);
            const labelKey = labelKeys.length > 0 ? labelKeys[0] : keys[0];
            const valueKey = numericKeys[0];

            contentHTML += `
              <div class="ai-chart-wrapper">
                <canvas id="${chartId}"></canvas>
              </div>
            `;

            // Render chart after DOM updates
            setTimeout(() => {
              this.renderChart(chartId, data.results, labelKey, valueKey);
            }, 50);
          }
        } else if (data.results) {
          contentHTML += `<div class="ai-no-results">No records found matching this query.</div>`;
        }
      }

      if (role === 'bot') {
        contentHTML += `
          <div class="ai-msg-footer">
            <button class="ai-copy-btn" title="Copy reply">📋 Copy</button>
          </div>
        `;
      }

      contentHTML += `</div>`;
      messageDiv.innerHTML = contentHTML;

      // Copy response handler
      const copyBtn = messageDiv.querySelector('.ai-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
          }).catch(() => {});
        });
      }
    }

    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;

    // Save to active session
    if (saveToHistory && role !== 'bot-loading') {
      const session = this.getCurrentSession();
      if (session) {
        session.messages = session.messages || [];
        session.messages.push({
          role,
          text,
          data: data ? { query: data.query, results: data.results } : null,
          timestamp: Date.now()
        });
        session.updatedAt = Date.now();

        // Auto-generate title on first user prompt if still default
        if (role === 'user' && (session.title === 'New conversation' || session.messages.filter(m => m.role === 'user').length <= 1)) {
          const cleanTitle = text.trim().slice(0, 32);
          if (cleanTitle) {
            session.title = cleanTitle;
          }
        }

        this.saveSessions();
        if (this.isHistoryOpen) {
          this.renderHistoryList();
        }
      }
    }
  }

  async renderChart(canvasId, results, labelKey, valueKey) {
    try {
      if (!window.Chart) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const labels = results.map(r => String(r[labelKey] ?? ''));
      const dataValues = results.map(r => Number(r[valueKey] ?? 0));

      const textColor = '#4a5568';
      const gridColor = 'rgba(0, 0, 0, 0.05)';
      const primaryColor = 'rgba(102, 126, 234, 0.85)';

      // Determine chart type (line chart for date series, bar chart otherwise)
      let chartType = 'bar';
      const isDate = labels.some(l => l.includes('-') || l.includes('/') || !isNaN(Date.parse(l)));
      if (isDate && labels.length > 1) {
        chartType = 'line';
      }

      new Chart(ctx, {
        type: chartType,
        data: {
          labels: labels,
          datasets: [{
            label: valueKey.replace(/_/g, ' ').toUpperCase(),
            data: dataValues,
            backgroundColor: chartType === 'line' ? 'rgba(102, 126, 234, 0.2)' : primaryColor,
            borderColor: 'rgba(102, 126, 234, 1)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(118, 75, 162, 1)',
            tension: 0.3,
            fill: chartType === 'line'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: '#fff',
              titleColor: textColor,
              bodyColor: textColor,
              borderColor: 'rgba(102, 126, 234, 0.3)',
              borderWidth: 1
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: gridColor
              },
              ticks: {
                color: textColor,
                font: {
                  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }
              }
            },
            x: {
              grid: {
                display: false
              },
              ticks: {
                color: textColor,
                font: {
                  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }
              }
            }
          }
        }
      });

      // Scroll to bottom again after the canvas finishes loading/rendering
      const messages = document.getElementById('aiMessages');
      if (messages) {
        setTimeout(() => {
          messages.scrollTop = messages.scrollHeight;
        }, 100);
      }
    } catch (e) {
      console.error('Error rendering Chart.js chart:', e);
    }
  }

  formatMarkdown(text) {
    if (!text) return '';
    
    // First, escape HTML to prevent XSS
    let escaped = this.escapeHtml(text);
    
    // Handle bolding: replace **text** with <strong>text</strong>
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Handle italics: replace *text* with <em>text</em>
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Handle inline code: replace `text` with <code>text</code>
    escaped = escaped.replace(/`(.*?)`/g, '<code>$1</code>');

    // Handle markdown links: [text](url)
    escaped = escaped.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, linkUrl) => {
      if (linkUrl.startsWith('vault://')) {
        const docIdMatch = linkUrl.match(/docId=(\d+)/);
        const docId = docIdMatch ? docIdMatch[1] : '';
        return `<a href="#" class="ai-vault-doc-link" data-doc-id="${docId}" style="color: #38bdf8; font-weight: 700; text-decoration: underline;">${linkText}</a>`;
      }
      return `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa;">${linkText}</a>`;
    });
    
    const lines = escaped.split('\n');
    let listType = null; // 'ul', 'ol', or null
    let formattedLines = [];
    
    for (let line of lines) {
      let trimmed = line.trim();
      if (!trimmed) {
        if (listType) {
          formattedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
          listType = null;
        }
        continue;
      }
      
      // Check for bullet lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (listType !== 'ul') {
          if (listType) {
            formattedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
          }
          formattedLines.push('<ul class="ai-reply-list">');
          listType = 'ul';
        }
        const content = trimmed.substring(2).trim();
        formattedLines.push(`<li>${content}</li>`);
      }
      // Check for numbered lists
      else if (/^\d+\.\s+/.test(trimmed)) {
        if (listType !== 'ol') {
          if (listType) {
            formattedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
          }
          formattedLines.push('<ol class="ai-reply-list">');
          listType = 'ol';
        }
        const content = trimmed.replace(/^\d+\.\s+/, '').trim();
        formattedLines.push(`<li>${content}</li>`);
      }
      // Normal paragraph
      else {
        if (listType) {
          formattedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
          listType = null;
        }
        formattedLines.push(`<p class="ai-reply-paragraph">${trimmed}</p>`);
      }
    }
    
    if (listType) {
      formattedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
    }
    
    return formattedLines.join('\n');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showSuggestions(input) {
    const suggestionsDiv = document.getElementById('aiSuggestions');
    if (!input.trim()) {
      suggestionsDiv.innerHTML = '';
      return;
    }

    const inputLower = input.toLowerCase();
    const filtered = this.quickSearchQueries.filter(q => 
      q.toLowerCase().startsWith(inputLower) || 
      q.toLowerCase().includes(inputLower)
    ).slice(0, 5);

    if (filtered.length === 0) {
      suggestionsDiv.innerHTML = '';
      return;
    }

    suggestionsDiv.innerHTML = filtered.map(query => `
      <div class="ai-suggestion-item" data-suggest="${query}">
        ${query}
      </div>
    `).join('');

    suggestionsDiv.querySelectorAll('.ai-suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const input = document.getElementById('aiInput');
        input.value = e.target.dataset.suggest;
        suggestionsDiv.innerHTML = '';
        this.sendMessage();
      });
    });
  }
}

// Initialize AI Assistant when page loads
if (typeof window !== 'undefined') {
  window.AIAssistant = AIAssistant;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.aiAssistant = new AIAssistant();
  });
} else {
  window.aiAssistant = new AIAssistant();
}
