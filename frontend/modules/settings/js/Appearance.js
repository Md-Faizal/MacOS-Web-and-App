/**
 * AppearanceComponent - macOS style Appearance view for Settings
 */
export class AppearanceComponent {
    constructor(container, settings, saveSettingsCallback) {
        this.container = container;
        this.settings = settings;
        this.saveSettings = saveSettingsCallback;
    }

    render() {
        this.container.innerHTML = `
            <div class="settings-section appearance-page-root">
                <!-- Appearance Group -->
                <div class="settings-group">
                    <div class="settings-row">
                        <div class="label-column">
                            <div class="appearance-label-main">Appearance</div>
                        </div>
                        <div class="control-column">
                            <div class="theme-options">
                                <button class="theme-option ${this.settings.theme === 'auto' ? 'active' : ''}" data-theme="auto">
                                    <div class="theme-preview auto"></div>
                                    <span class="theme-label">Auto</span>
                                </button>
                                <button class="theme-option ${this.settings.theme === 'light' ? 'active' : ''}" data-theme="light">
                                    <div class="theme-preview light"></div>
                                    <span class="theme-label">Light</span>
                                </button>
                                <button class="theme-option ${this.settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                                    <div class="theme-preview dark"></div>
                                    <span class="theme-label">Dark</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-row border-top">
                        <div class="label-column">
                            <div class="appearance-label-main">Liquid Glass</div>
                            <div class="appearance-subtitle">Choose your preferred look for Liquid Glass.</div>
                        </div>
                        <div class="control-column">
                            <div class="liquid-glass-options">
                                <button class="liquid-option ${this.settings.liquidGlass === 'clear' || !this.settings.liquidGlass ? 'active' : ''}" data-liquid="clear">
                                    <div class="liquid-preview clear"></div>
                                    <span class="theme-label">Clear</span>
                                </button>
                                <button class="liquid-option ${this.settings.liquidGlass === 'tinted' ? 'active' : ''}" data-liquid="tinted">
                                    <div class="liquid-preview tinted"></div>
                                    <span class="theme-label">Tinted</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="section-divider-label">Theme</div>

                <!-- Theme Group -->
                <div class="settings-group">
                    <div class="settings-row">
                        <div class="label-column">
                            <div class="appearance-label-main">Color</div>
                        </div>
                        <div class="control-column">
                            <div class="color-options-row">
                                <div class="color-circle-option multi ${this.settings.accentColor === 'multicolor' ? 'active' : ''}" data-color="multicolor">
                                    <div class="multi-color-inner"></div>
                                    <span class="color-name">Multicolor</span>
                                </div>
                                <div class="color-circle-option blue ${this.settings.accentColor === 'blue' ? 'active' : ''}" data-color="blue"></div>
                                <div class="color-circle-option purple ${this.settings.accentColor === 'purple' ? 'active' : ''}" data-color="purple"></div>
                                <div class="color-circle-option pink ${this.settings.accentColor === 'pink' ? 'active' : ''}" data-color="pink"></div>
                                <div class="color-circle-option red ${this.settings.accentColor === 'red' ? 'active' : ''}" data-color="red"></div>
                                <div class="color-circle-option orange ${this.settings.accentColor === 'orange' ? 'active' : ''}" data-color="orange"></div>
                                <div class="color-circle-option yellow ${this.settings.accentColor === 'yellow' ? 'active' : ''}" data-color="yellow"></div>
                                <div class="color-circle-option green ${this.settings.accentColor === 'green' ? 'active' : ''}" data-color="green"></div>
                                <div class="color-circle-option gray ${this.settings.accentColor === 'gray' ? 'active' : ''}" data-color="gray"></div>
                            </div>
                        </div>
                    </div>

                    <div class="settings-row border-top">
                        <div class="label-column">
                            <div class="appearance-label-main">Text highlight color</div>
                        </div>
                        <div class="control-column">
                            <div class="mac-select-trigger" data-select="highlight">
                                <div class="color-dot" style="background: ${this.getHighlightColor()};"></div>
                                <span class="select-label">Automatic</span>
                                <div class="select-arrows">
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4L5 2L7 4" stroke="currentColor" stroke-width="1.2"/><path d="M3 6L5 8L7 6" stroke="currentColor" stroke-width="1.2"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="settings-row border-top">
                        <div class="label-column">
                            <div class="appearance-label-main">Icon & widget style</div>
                        </div>
                        <div class="control-column">
                            <div class="icon-widget-options">
                                <button class="icon-widget-option ${this.settings.iconStyle === 'default' || !this.settings.iconStyle ? 'active' : ''}" data-style="default">
                                    <div class="icon-widget-preview default">
                                        <div class="inner-icon">☀️</div>
                                    </div>
                                    <span class="theme-label">Default</span>
                                </button>
                                <button class="icon-widget-option ${this.settings.iconStyle === 'dark' ? 'active' : ''}" data-style="dark">
                                    <div class="icon-widget-preview dark">
                                        <div class="inner-icon">🌑</div>
                                    </div>
                                    <span class="theme-label">Dark</span>
                                </button>
                                <button class="icon-widget-option ${this.settings.iconStyle === 'clear' ? 'active' : ''}" data-style="clear">
                                    <div class="icon-widget-preview clear">
                                        <div class="inner-icon">☁️</div>
                                    </div>
                                    <span class="theme-label">Clear</span>
                                </button>
                                <button class="icon-widget-option ${this.settings.iconStyle === 'tinted' ? 'active' : ''}" data-style="tinted">
                                    <div class="icon-widget-preview tinted">
                                        <div class="inner-icon">🌊</div>
                                    </div>
                                    <span class="theme-label">Tinted</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-row border-top">
                        <div class="label-column">
                            <div class="appearance-label-main">Folder color</div>
                        </div>
                        <div class="control-column">
                            <div class="mac-select-trigger" data-select="folder">
                                <div class="color-dot blue"></div>
                                <span class="select-label">Automatic</span>
                                <div class="select-arrows">
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4L5 2L7 4" stroke="currentColor" stroke-width="1.2"/><path d="M3 6L5 8L7 6" stroke="currentColor" stroke-width="1.2"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="section-divider-label">Windows</div>

                <!-- Windows Group -->
                <div class="settings-group">
                    <div class="settings-row">
                        <div class="label-column">
                            <div class="appearance-label-main">Sidebar icon size</div>
                        </div>
                        <div class="control-column">
                            <div class="mac-select-trigger" data-select="sidebar-size">
                                <span class="select-label">Medium</span>
                                <div class="select-arrows">
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4L5 2L7 4" stroke="currentColor" stroke-width="1.2"/><path d="M3 6L5 8L7 6" stroke="currentColor" stroke-width="1.2"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="settings-row border-top">
                        <div class="label-column">
                            <div class="appearance-label-main">Tint window background with wallpaper color</div>
                        </div>
                        <div class="control-column">
                            <button class="mac-toggle ${this.settings['tint-wallpaper'] ? 'active' : ''}" data-toggle="tint-wallpaper">
                                <div class="toggle-knob"></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.setupEventListeners();
    }

    getHighlightColor() {
        // Mocking highlight color based on accent color
        const colors = {
            'multicolor': 'linear-gradient(90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #0a84ff, #af52de)',
            'blue': '#0a84ff',
            'purple': '#af52de',
            'pink': '#ff2d55',
            'red': '#ff3b30',
            'orange': '#ff9500',
            'yellow': '#ffcc00',
            'green': '#34c759',
            'gray': '#8e8e93'
        };
        return colors[this.settings.accentColor] || colors['multicolor'];
    }

    setupEventListeners() {
        // Theme selection
        const themeOptions = this.container.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                themeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.settings.theme = option.getAttribute('data-theme');
                this.saveSettings();
            });
        });

        // Liquid Glass selection
        const liquidOptions = this.container.querySelectorAll('.liquid-option');
        liquidOptions.forEach(option => {
            option.addEventListener('click', () => {
                liquidOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.settings.liquidGlass = option.getAttribute('data-liquid');
                this.saveSettings();
            });
        });

        // Color selection
        const colorOptions = this.container.querySelectorAll('.color-circle-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                colorOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.settings.accentColor = option.getAttribute('data-color');
                
                // Update highlight color dot if color changed
                const highlightDot = this.container.querySelector('[data-select="highlight"] .color-dot');
                if (highlightDot) {
                    highlightDot.style.background = this.getHighlightColor();
                }
                
                this.saveSettings();
            });
        });

        // Icon style selection
        const iconStyleOptions = this.container.querySelectorAll('.icon-widget-option');
        iconStyleOptions.forEach(option => {
            option.addEventListener('click', () => {
                iconStyleOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.settings.iconStyle = option.getAttribute('data-style');
                this.saveSettings();
            });
        });

        // Toggle switches
        const toggles = this.container.querySelectorAll('.mac-toggle');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggle.classList.toggle('active');
                const toggleName = toggle.getAttribute('data-toggle');
                this.settings[toggleName] = toggle.classList.contains('active');
                this.saveSettings();
            });
        });

    }
}
