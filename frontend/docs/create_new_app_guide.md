# How to Create a New Windowed App in 3 Easy Steps

The **App Window Framework** standardizes window management, size presets, event listeners, active dock indicators, minimizing/restoring, and deep-linking.

---

## Step 1: Create your App Class extending `AppWindow`

In `frontend/modules/my-app/js/my-app.js`:

```javascript
class MyApp extends AppWindow {
  constructor(containerId, callbacks = {}, params = {}) {
    super({
      appId: 'my-app',               // Unique application identifier
      appName: 'My App',             // Display title on window bar
      containerId: containerId,      // DOM container ID
      preset: 'standard',            // Presets: 'compact', 'standard', 'medium', 'large'
      // icon: '/assets/Images/MyApp.png', // Optional icon path
      ...callbacks
    });

    this.params = params;
    this.initUI();
  }

  async initUI() {
    // 1. Set HTML content (or load from HTML template)
    this.setContent(`
      <div class="my-app-container">
        <h2>Welcome to My App</h2>
        <p>Your content here.</p>
      </div>
    `);

    // 2. Set up your custom app event listeners
    this.bindAppEvents();
  }

  bindAppEvents() {
    const content = this.getContentArea();
    // Attach event handlers...
  }

  // Optional: Handle parameters passed on re-launching
  handleDeepLink(params) {
    console.log('Deep link received:', params);
  }
}

// Export for global launch access
window.MyApp = MyApp;
```

### Available Presets
| Preset Name | Initial Width | Initial Height | Resizable | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `'compact'` | `310px` | `450px` | `false` (Fixed) | Calculators, widgets, tools |
| `'standard'` | `600px` (responsive) | `500px` | `true` | Notes, Camera, standard utility apps |
| `'medium'` | `800px` | `600px` | `true` | Analytics, Contacts, medium dashboards |
| `'large'` | `1100px` | `650px` | `true` | Billing, Product catalog, rich workflows |

---

## Step 2: Add HTML Container in `home.html`

In `frontend/home.html`:

```html
<!-- My App Container -->
<div id="myAppContainer"></div>
```

Include your app script tag:
```html
<script type="module" src="/modules/my-app/js/my-app.js"></script>
```

---

## Step 3: Register Dock Item in `app-bar.js`

In `frontend/scripts/app-bar/modules/app-bar.js`, add your app entry to `apps`:

```javascript
    {
      id: 'my-app',
      name: 'My App',
      icon: '/assets/Images/MyApp.png',
      alt: 'My App',
      color: '#3b82f6',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('my-app', window.MyApp, 'myAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    }
```

That's it! `AppWindow.launchApp` handles:
- Checking if class & container exist
- First-time instantiation
- Active dock indicator tracking (white active dot)
- Yellow dock indicator on minimize
- Smooth 400ms macOS minimize and restore animations
- Re-opening / restoring from minimized state without page reload
- Automatic container cleanup on close
