// ========================================
// STANDARDIZED LOGO COMPONENT SCRIPT
// ======================================== 

class LogoContextMenu {
  constructor(logoElement, defaultAction) {
    this.logoElement = logoElement;
    this.defaultAction = defaultAction;
    this.menuElement = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    // Create context menu HTML
    const menuHTML = `
      <div class="logo-context-menu">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="menuGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.3" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#menuGradient)" rx="20"/>
        </svg>
        <div class="logo-context-menu-content">
          <div class="logo-menu-item" data-action="home">Home</div>
          <div class="logo-menu-item" data-action="reload">Reload</div>
          <div class="logo-menu-item" data-action="settings">Settings</div>
          <div class="logo-menu-item" data-action="about">About</div>
        </div>
      </div>
    `;

    // Create menu element
    this.menuElement = document.createElement('div');
    this.menuElement.innerHTML = menuHTML;
    this.menuElement.style.display = 'none';
    document.body.appendChild(this.menuElement);

    // Add event listeners
    this.logoElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
      this.close();
    });

    // Menu item click handlers
    const menuItems = this.menuElement.querySelectorAll('.logo-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleMenuAction(item.dataset.action);
        this.close();
      });
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.menuElement) {
      this.menuElement.style.display = 'block';
      this.isOpen = true;
    }
  }

  close() {
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
      this.isOpen = false;
    }
  }

  handleMenuAction(action) {
    switch (action) {
      case 'home':
        this.defaultAction();
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'settings':
        console.log('Settings clicked');
        break;
      case 'about':
        console.log('About clicked');
        break;
    }
  }
}

class LogoDisplay {
  constructor(elementId, options = {}) {
    this.element = document.getElementById(elementId);
    this.options = {
      imagePath: options.imagePath || '/Images/pngimg.com - apple_logo_PNG19680.png',
      altText: options.altText || 'Logo',
      onClick: options.onClick || (async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
          window.location.href = './index.html';
        }
      }), // Default: logout and go to home
      ...options
    };
    
    this.contextMenu = null;
    this.init();
  }

  init() {
    if (!this.element) return;
    
    // Create image element if not exists
    let imgElement = this.element.querySelector('img');
    if (!imgElement) {
      imgElement = document.createElement('img');
      imgElement.src = this.options.imagePath;
      imgElement.alt = this.options.altText;
      this.element.appendChild(imgElement);
    }
    
    // Make element clickable
    this.element.style.cursor = 'pointer';
    
    // Initialize context menu instead of direct click
    this.contextMenu = new LogoContextMenu(this.element, this.options.onClick);
    
    // Add hover effect
    this.element.addEventListener('mouseenter', () => {
      this.element.style.opacity = '0.8';
      this.element.style.transform = 'scale(1.1)';
      this.element.style.transition = 'all 0.2s ease';
    });
    
    this.element.addEventListener('mouseleave', () => {
      this.element.style.opacity = '1';
      this.element.style.transform = 'scale(1)';
    });
  }

  destroy() {
    if (this.contextMenu) {
      this.contextMenu.close();
    }
  }
}
