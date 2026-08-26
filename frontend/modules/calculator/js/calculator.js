/**
 * Calculator - A macOS Tahoe style calculator app
 * Features: Basic, Scientific, and Programmer modes
 */

class Calculator extends AppWindow {
  constructor(containerId, callbacks = {}) {
    super({
      appId: 'calculator',
      appName: 'Calculator',
      containerId: containerId,
      preset: 'compact',
      callbacks: callbacks
    });

    this.mode = 'basic'; // basic, scientific, programmer
    this.display = '0';
    this.previousValue = null;
    this.operation = null;
    this.shouldResetDisplay = false;
    
    // Operation symbols for display
    this.operationSymbols = {
      '+': '+',
      '-': '−',
      '*': '×',
      '/': '÷'
    };
    
    window.currentCalculatorApp = this;
    this.createCalculatorUI();
    this.setupCalculatorEventListeners();
  }

  createCalculatorUI() {
    const contentArea = document.getElementById('calculator-content');
    if (!contentArea) return;

    const calculatorHTML = `
      <div class="calculator-container">
        <!-- Display -->
        <div class="calculator-display">
          <div class="display-value" id="calcDisplay">0</div>
        </div>

        <!-- Buttons -->
        <div class="calc-buttons basic-buttons" id="calcButtons">
          <!-- Basic Layout -->
          <button class="calc-btn function-btn" data-action="backspace">⌫</button>
          <button class="calc-btn function-btn" data-action="clear">AC</button>
          <button class="calc-btn function-btn" data-action="percent">%</button>
          <button class="calc-btn operator-btn" data-operation="/">÷</button>

          <button class="calc-btn" data-number="7">7</button>
          <button class="calc-btn" data-number="8">8</button>
          <button class="calc-btn" data-number="9">9</button>
          <button class="calc-btn operator-btn" data-operation="*">×</button>

          <button class="calc-btn" data-number="4">4</button>
          <button class="calc-btn" data-number="5">5</button>
          <button class="calc-btn" data-number="6">6</button>
          <button class="calc-btn operator-btn" data-operation="-">−</button>

          <button class="calc-btn" data-number="1">1</button>
          <button class="calc-btn" data-number="2">2</button>
          <button class="calc-btn" data-number="3">3</button>
          <button class="calc-btn operator-btn" data-operation="+">+</button>

          <button class="calc-btn function-btn" data-action="toggleSign">+/−</button>
          <button class="calc-btn" data-number="0">0</button>
          <button class="calc-btn" data-number=".">.</button>
          <button class="calc-btn equals-btn" data-action="equals">=</button>
        </div>
      </div>

      <!-- Dropdown Menu -->
      <div class="calc-menu" id="calcMenu" style="display: none;">
        <button class="menu-item" data-mode="basic">Basic</button>
        <button class="menu-item" data-mode="scientific">Scientific</button>
        <button class="menu-item" data-mode="programmer">Programmer</button>
      </div>
    `;

    contentArea.innerHTML = calculatorHTML;
    this.addHeaderButtons();
  }

  addHeaderButtons() {
    const titleBar = document.querySelector(`[data-app-id="calculator"] .app-title-bar`);
    if (!titleBar) return;

    // Get the title element
    const titleElement = titleBar.querySelector('.app-title');
    const titleSpacer = titleBar.querySelector('.title-spacer');

    // Create center button (expand/scientific) - circular and replaces title
    const expandBtn = document.createElement('button');
    expandBtn.id = 'expandBtn';
    expandBtn.className = 'liquid-glass-btn expand-btn expand-btn-header-circular';
    expandBtn.title = 'Scientific';
    expandBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="1"></circle>
        <path d="M19 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"></path>
      </svg>
    `;

    // Create right button (menu)
    const menuBtn = document.createElement('button');
    menuBtn.id = 'menuBtn';
    menuBtn.className = 'liquid-glass-btn menu-btn';
    menuBtn.title = 'Menu';
    menuBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    `;

    // Replace the title with the expand button
    titleElement.replaceWith(expandBtn);

    // Replace the title spacer with menu button
    titleSpacer.replaceWith(menuBtn);
  }

  setupEventListeners() {
    super.setupEventListeners();
    const display = document.getElementById('calcDisplay');
    const buttons = document.getElementById('calcButtons');
    
    // Wait for header buttons to be available
    const waitForHeaderButtons = () => {
      const menuBtn = document.getElementById('menuBtn');
      const expandBtn = document.getElementById('expandBtn');
      const calcMenu = document.getElementById('calcMenu');

      if (!menuBtn || !expandBtn || !calcMenu) {
        requestAnimationFrame(waitForHeaderButtons);
        return;
      }

      // Number buttons
      buttons.addEventListener('click', (e) => {
        const target = e.target.closest('.calc-btn');
        if (!target) return;

        if (target.dataset.number) {
          this.handleNumberInput(target.dataset.number, display);
        } else if (target.dataset.operation) {
          this.handleOperation(target.dataset.operation, display);
        } else if (target.dataset.action) {
          this.handleAction(target.dataset.action, display);
        }
      });

      // Menu toggle
      menuBtn.addEventListener('click', () => {
        calcMenu.style.display = calcMenu.style.display === 'none' ? 'block' : 'none';
      });

      // Mode selection
      calcMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const newMode = e.target.dataset.mode;
          this.switchMode(newMode);
          calcMenu.style.display = 'none';
        });
      });

      // Expand button (toggle scientific mode)
      expandBtn.addEventListener('click', () => {
        const newMode = this.mode === 'scientific' ? 'basic' : 'scientific';
        this.switchMode(newMode);
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-btn') && !e.target.closest('.calc-menu')) {
          calcMenu.style.display = 'none';
        }
      });

      // Keyboard input support
      document.addEventListener('keydown', (e) => {
        const key = e.key;
        
        // Number keys 0-9
        if (/^\d$/.test(key)) {
          this.handleNumberInput(key, display);
          return;
        }
        
        // Decimal point
        if (key === '.') {
          this.handleNumberInput('.', display);
          return;
        }
        
        // Operations
        if (key === '+' || key === '-') {
          // Don't prevent default for minus key in some cases, but capture it
          this.handleOperation(key, display);
          e.preventDefault();
          return;
        }
        
        if (key === '*') {
          e.preventDefault();
          this.handleOperation('*', display);
          return;
        }
        
        if (key === '/') {
          e.preventDefault();
          this.handleOperation('/', display);
          return;
        }
        
        // Equals (Enter or =)
        if (key === 'Enter' || key === '=') {
          e.preventDefault();
          this.handleAction('equals', display);
          return;
        }
        
        // Backspace
        if (key === 'Backspace') {
          e.preventDefault();
          this.handleAction('backspace', display);
          return;
        }
        
        // Clear (Delete or Escape)
        if (key === 'Delete' || key === 'Escape') {
          e.preventDefault();
          this.handleAction('clear', display);
          return;
        }
      });
    };

    waitForHeaderButtons();
  }

  handleNumberInput(number, display) {
    if (number === '.' && this.display.includes('.')) return;
    
    if (this.shouldResetDisplay) {
      // If we just pressed an operation, append to show the expression with space
      if (this.operation) {
        this.display += ' ' + number;
      } else {
        this.display = number;
      }
      this.shouldResetDisplay = false;
    } else {
      if (this.display === '0' && number !== '.') {
        this.display = number;
      } else {
        this.display += number;
      }
    }
    
    this.updateDisplay(display);
  }

  handleOperation(operation, display) {
    let currentValue;
    
    // If display contains spaces (showing an operation), extract the second operand
    if (this.operation && this.display.includes(' ')) {
      // Split by space and filter out empty strings and operator symbols, then get the last number
      const parts = this.display.trim().split(/\s+/).filter(p => p && p !== '+' && p !== '-' && p !== '*' && p !== '/' && p !== '÷' && p !== '×' && p !== '−');
      currentValue = parseFloat(parts[parts.length - 1]);
    } else {
      currentValue = parseFloat(this.display);
    }
    
    if (this.previousValue === null) {
      this.previousValue = currentValue;
    } else if (!this.shouldResetDisplay) {
      // Calculate previous operation
      this.previousValue = this.calculate(this.previousValue, currentValue, this.operation);
      this.display = String(this.previousValue);
      this.updateDisplay(display);
    }
    
    this.operation = operation;
    // Show the operation symbol in the display
    const operationSymbol = this.operationSymbols[operation] || operation;
    this.display = String(this.previousValue) + ' ' + operationSymbol;
    this.updateDisplay(display);
    this.shouldResetDisplay = true;
  }

  handleAction(action, display) {
    switch (action) {
      case 'clear':
        this.display = '0';
        this.previousValue = null;
        this.operation = null;
        this.shouldResetDisplay = false;
        break;
      case 'backspace':
        if (this.display.length > 1) {
          this.display = this.display.slice(0, -1);
        } else {
          this.display = '0';
        }
        break;
      case 'equals':
        if (this.previousValue !== null && this.operation) {
          // Extract the second operand from display if it contains spaces
          let currentValue;
          if (this.display.includes(' ')) {
            const parts = this.display.trim().split(/\s+/).filter(p => p && p !== '+' && p !== '-' && p !== '*' && p !== '/' && p !== '÷' && p !== '×' && p !== '−');
            currentValue = parseFloat(parts[parts.length - 1]);
          } else {
            currentValue = parseFloat(this.display);
          }
          this.display = String(this.calculate(this.previousValue, currentValue, this.operation));
          this.previousValue = null;
          this.operation = null;
          this.shouldResetDisplay = true;
        }
        break;
      case 'toggleSign':
        // Extract just the number if display contains operation symbols
        let numberToToggle;
        if (this.display.includes(' ')) {
          const parts = this.display.trim().split(/\s+/).filter(p => p && p !== '+' && p !== '-' && p !== '*' && p !== '/' && p !== '÷' && p !== '×' && p !== '−');
          numberToToggle = parseFloat(parts[parts.length - 1]);
        } else {
          numberToToggle = parseFloat(this.display);
        }
        this.display = String(-numberToToggle);
        break;
      case 'percent':
        // Extract just the number if display contains operation symbols
        let numberToPercent;
        if (this.display.includes(' ')) {
          const parts = this.display.trim().split(/\s+/).filter(p => p && p !== '+' && p !== '-' && p !== '*' && p !== '/' && p !== '÷' && p !== '×' && p !== '−');
          numberToPercent = parseFloat(parts[parts.length - 1]);
        } else {
          numberToPercent = parseFloat(this.display);
        }
        this.display = String(numberToPercent / 100);
        break;
    }
    
    this.updateDisplay(display);
  }

  calculate(prev, current, operation) {
    switch (operation) {
      case '+': return prev + current;
      case '-': return prev - current;
      case '*': return prev * current;
      case '/': return current !== 0 ? prev / current : 0;
      default: return current;
    }
  }

  updateDisplay(element) {
    if (element) {
      element.textContent = this.display.length > 12 
        ? this.display.substring(0, 12) + '...'
        : this.display;
    }
  }

  switchMode(newMode) {
    this.mode = newMode;
    // For now, keep basic mode as the primary view
    // Scientific and Programmer modes can be extended later
  }
}

// Ensure global availability
window.Calculator = Calculator;
