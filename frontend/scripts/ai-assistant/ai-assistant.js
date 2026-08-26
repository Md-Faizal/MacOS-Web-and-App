/**
 * AI Assistant Chat Widget
 * Provides a beautiful chat interface for interacting with the Gemini AI backend
 */

class AIAssistant {
  constructor(containerSelector = 'body') {
    this.container = document.querySelector(containerSelector);
    this.sessionId = this.generateSessionId();
    this.isOpen = false;
    this.isLoading = false;
    this.isExpanded = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.apiBase = this.getApiBaseUrl() + '/api/ai';
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
    // For dev environment (localhost)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3002';
    }
    
    // For prod environment - use current domain with standard port
    const protocol = window.location.protocol; // 'http:' or 'https:'
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${hostname}${port}`;
  }

  init() {
    this.loadStyles();
    this.createChatWidget();
    this.attachEventListeners();
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
          <select id="aiModelSelector" class="ai-model-selector" title="Select AI Model">
            <option value="gemini-2.5-flash" selected>Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-2.0-flash-001">Gemini 2.0 Flash 001</option>
            <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
            <option value="gemini-2.0-flash-lite-001">Gemini 2.0 Flash-Lite 001</option>
          </select>
          <button class="ai-widget-expand" title="Expand" id="aiExpandBtn">⛶</button>
          <button class="ai-widget-close" title="Close">✕</button>
        </div>
      </div>
      <div class="ai-messages" id="aiMessages">
        <div class="ai-welcome">
          <div class="ai-welcome-title">Welcome to AI Assistant</div>
          <p>I can help with anything - ask me questions, get explanations, write code, analyze data, or just chat!</p>
        </div>
      </div>
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
    
    const newWidth = Math.max(300, this.resizeStart.width + deltaX);
    const newHeight = Math.max(300, this.resizeStart.height + deltaY);
    
    widget.style.width = newWidth + 'px';
    widget.style.height = newHeight + 'px';
  }

  stopResize() {
    this.isResizing = false;
  }

  async sendMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message to chat
    this.addMessage(message, 'user');
    input.value = '';

    // Show loading indicator
    this.isLoading = true;
    this.addMessage('', 'bot-loading');

    try {
      const response = await fetch(`${this.apiBase}/query`, {
        method: 'POST',
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

      // Remove loading indicator - find and remove the loading spinner
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

      // Remove loading indicator
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

  addMessage(text, role, data = null) {
    const messages = document.getElementById('aiMessages');

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
      let contentHTML = `<div class="ai-message-content">${this.formatMarkdown(text)}</div>`;
      
      // If we have SQL query results, enrich the message block
      if (data && data.query) {
        contentHTML = `<div class="ai-message-content">
          <div class="ai-text-reply">${this.formatMarkdown(text)}</div>
          
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

        contentHTML += `</div>`;
      }

      messageDiv.innerHTML = contentHTML;
    }

    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
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

  handleNavigation(navigation) {
    // Navigation feature removed - all queries go to AI for database processing
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
    ).slice(0, 5); // Show top 5

    if (filtered.length === 0) {
      suggestionsDiv.innerHTML = '';
      return;
    }

    suggestionsDiv.innerHTML = filtered.map(query => `
      <div class="ai-suggestion-item" data-suggest="${query}">
        ${query}
      </div>
    `).join('');

    // Attach click handlers to suggestions
    suggestionsDiv.querySelectorAll('.ai-suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const input = document.getElementById('aiInput');
        input.value = e.target.dataset.suggest;
        suggestionsDiv.innerHTML = '';
        this.sendMessage();
      });
    });
  }

  openApp(appName) {
    // Removed - navigation feature disabled
  }

  openPage(appName, pageName) {
    // Removed - navigation feature disabled
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

