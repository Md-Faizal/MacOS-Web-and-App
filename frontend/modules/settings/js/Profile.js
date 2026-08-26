/**
 * ProfileComponent - macOS style Apple Account view for Settings
 */
export class ProfileComponent {
    constructor(container) {
        this.container = container;
        this.userName = "Mohammad Faizal";
        this.userEmail = "m.faizal@cloud.com";
        this.currentView = 'main'; // 'main', 'security-challenge', 'security', 'setup-password', 'change-password', 'disable-password', 'update-question', 'setup-touchid'
        this.questions = [];
        this.elevationToken = null;
        this.passwordSet = false;
        this.hasSecurityQuestion = false;
        this.devices = [];
        this.selectedDevice = null;
        this.currentDeviceId = null;
        this.profilePicture = null;
        this.localName = "";
        this.localEmail = "";
        this.localPicture = null;
        this.googleLinked = false;
        this.googleEmail = null;
        this.googleName = null;
        this.googlePicture = null;
        this.nameSource = 'local'; // Acts as Master Identity Source for Name & Email
        this.pictureSource = 'local'; 
    }

    async render() {
        // Fetch status before rendering to ensure we have the latest
        await this.fetchStatus();

        switch (this.currentView) {
            case 'security-challenge':
                await this.renderSecurityChallenge();
                break;
            case 'security':
                await this.renderSecurityHub();
                break;
            case 'setup-password':
                await this.renderSetupPasswordView();
                break;
            case 'change-password':
                await this.renderChangePasswordView();
                break;
            case 'disable-password':
                await this.renderDisablePasswordView();
                break;
            case 'update-question':
                await this.renderUpdateQuestionView();
                break;
            case 'setup-touchid':
                await this.renderTouchIdSetupView();
                break;
            case 'device-detail':
                await this.renderDeviceDetailView(this.selectedDevice);
                break;
            case 'personal':
                await this.renderPersonalInfoView();
                break;
            default:
                this.renderMainView();
        }
    }

    async fetchStatus() {
        try {
            const [statusRes, devicesRes, verifyRes, profileRes] = await Promise.all([
                fetch('/api/auth/status'),
                fetch('/api/auth/devices'),
                fetch('/api/auth/verify'),
                fetch('/api/profile')
            ]);
            
            const statusData = await statusRes.json();
            this.passwordSet = statusData.passwordSet;
            this.hasSecurityQuestion = statusData.hasSecurityQuestion;

            const devicesData = await devicesRes.json();
            this.devices = devicesData.devices || [];

            const verifyData = await verifyRes.json();
            if (verifyData.success && verifyData.user) {
                this.currentDeviceId = verifyData.user.deviceId;
            }

            const profileData = await profileRes.json();
            if (profileData.success && profileData.profile) {
                const profile = profileData.profile;
                this.googleLinked = !!profile.google_id;
                this.googleEmail = profile.google_email || null;
                this.googleName = profile.google_name || null;
                this.googlePicture = profile.google_picture || null;
                this.nameSource = profile.name_source || 'local';
                this.pictureSource = profile.picture_source || 'local';
                
                // Store local versions specifically
                this.localName = profile.full_name || "Mohammad Faizal";
                this.localEmail = profile.email_id || "m.faizal@cloud.com";
                this.localPicture = profile.profile_picture || null;
                
                // Active display values
                this.userName = profile.display_name || this.localName;
                this.userEmail = profile.display_email || this.localEmail;
                this.profilePicture = profile.display_picture || this.localPicture;

                // Cache for lock screen persistence
                localStorage.setItem('macos_user_display_name', this.userName);
                if (this.profilePicture) {
                    localStorage.setItem('macos_user_display_picture', this.profilePicture);
                } else {
                    localStorage.removeItem('macos_user_display_picture');
                }
            }
        } catch (err) {
            console.error('Failed to fetch profile status/devices:', err);
        }
    }

    renderMainView() {
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="profile-header">
                    <div class="profile-avatar-large">
                        ${this.profilePicture ? `<img src="${this.profilePicture}" alt="Profile" class="profile-avatar-large-img">` : '👤'}
                    </div>
                    <div class="profile-name">${this.userName}</div>
                    <div class="profile-email">${this.userEmail}</div>
                </div>

                <div class="settings-group">
                    <div class="settings-row" data-action="personal">
                        <div class="settings-row-icon icon-personal">👤</div>
                        <div class="settings-row-label">Personal Information</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                    <div class="settings-row" data-action="security-entry">
                        <div class="settings-row-icon icon-security">🔑</div>
                        <div class="settings-row-label">Sign-In & Security</div>
                        <div class="settings-row-value">${this.passwordSet ? 'On' : 'Off'}</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                    <div class="settings-row" data-action="payment">
                        <div class="settings-row-icon icon-payment">💳</div>
                        <div class="settings-row-label">Payment & Shipping</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="settings-row" data-action="icloud">
                        <div class="settings-row-icon icon-icloud">☁️</div>
                        <div class="settings-row-label">iCloud</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                    <div class="settings-row" data-action="media">
                        <div class="settings-row-icon icon-media">🎵</div>
                        <div class="settings-row-label">Media & Purchases</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                </div>

                <div class="devices-section">
                    <div class="devices-title">Devices</div>
                    ${this.devices.length > 0 ? this.devices.map(device => {
                        // Robust UTC parsing: Ensure string is treated as UTC (Z)
                        const rawLastSeen = device.last_seen || '';
                        const utcLastSeen = rawLastSeen.includes('Z') ? rawLastSeen : (rawLastSeen.replace(' ', 'T') + 'Z');
                        const lastSeen = new Date(utcLastSeen).getTime() || 0;
                        
                        const isThisDevice = this.currentDeviceId && device.id === this.currentDeviceId;
                        const isOnline = isThisDevice || (Date.now() - lastSeen < 120000); // Online if seen in last 2 mins
                        
                        return `
                        <div class="device-item clickable-device device-item-margin" data-id="${device.id}">
                            <div class="device-icon-wrapper">
                                <div class="device-icon">${this.getDeviceIcon(device.device_type)}</div>
                                ${isOnline ? '<div class="online-indicator"></div>' : ''}
                            </div>
                            <div class="device-info">
                                <div class="device-name">${device.device_name} ${isThisDevice ? '<span class="this-device-tag">(This device)</span>' : ''}</div>
                                <div class="device-type">Last seen: ${this.formatDeviceDate(utcLastSeen)}</div>
                            </div>
                            <div class="settings-row-chevron">▶</div>
                        </div>
                        `;
                    }).join('') : `
                        <div class="device-item">
                            <div class="device-icon">💻</div>
                            <div class="device-info">
                                <div class="device-name">This Device</div>
                                <div class="device-type">Current Session</div>
                            </div>
                        </div>
                    `}

                    ${this.devices.length >= 2 ? `
                        <div class="touchid-setup-header">
                            <button class="primary-btn logout-all-btn" id="logoutAllDevices">Sign Out of All Devices...</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        this.setupMainEventListeners();
    }

    getDeviceIcon(type) {
        if (type === 'Mobile') return '📱';
        if (type === 'Desktop') return '💻';
        return '🖥️';
    }

    formatDeviceDate(dateInput) {
        if (!dateInput) return 'Unknown';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'Unknown';

        const day = date.getDate();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();

        let suffix = 'th';
        if (day === 1 || day === 21 || day === 31) suffix = 'st';
        else if (day === 2 || day === 22) suffix = 'nd';
        else if (day === 3 || day === 23) suffix = 'rd';

        const dayStr = `${day}'${suffix}`;

        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const hoursStr = hours.toString().padStart(2, '0');

        return `${dayStr} ${month} ${year} At ${hoursStr}:${minutes}:${seconds} ${ampm}`;
    }

    async renderSecurityChallenge() {
        if (!this.passwordSet) {
            this.currentView = 'security';
            return this.render();
        }

        const res = await fetch('/api/auth/challenge');
        const data = await res.json();
        
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Security Challenge</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form challenge-form">
                        <p class="challenge-instruction">Please answer your security question to access security settings.</p>
                        <h3 class="security-question-text">${data.question || 'Security question not found.'}</h3>
                        <div class="form-row">
                            <input type="text" id="challengeAnswer" placeholder="Your answer" autocomplete="off">
                        </div>
                        <div class="form-actions">
                            <button class="primary-btn" id="verifyChallenge">Verify</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.querySelector('#backToMain').addEventListener('click', () => {
            this.currentView = 'main';
            this.render();
        });

        this.container.querySelector('#verifyChallenge').addEventListener('click', () => {
            const answer = this.container.querySelector('#challengeAnswer').value;
            this.handleVerifyChallenge(answer);
        });

        this.container.querySelector('#challengeAnswer').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.container.querySelector('#verifyChallenge').click();
        });
    }

    async renderSecurityHub() {
        const touchIdAvailable = 'PublicKeyCredential' in window;
        const touchIdEnabled = localStorage.getItem('touchIdEnabled') === 'true';

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Sign-In & Security</h2>
                </div>

                <div class="settings-group settings-group-mt20">
                    <div class="settings-row">
                        <div class="settings-row-label">
                            <span class="settings-row-title">Login Password</span>
                        </div>
                        <label class="mac-switch">
                            <input type="checkbox" id="passwordToggle" ${this.passwordSet ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <p class="group-description">Require a password to unlock this computer.</p>

                ${this.passwordSet && touchIdAvailable ? `
                <div class="settings-group settings-group-mt20">
                    <div class="settings-row">
                        <div class="settings-row-label">
                            <span class="settings-row-title">Touch ID</span>
                        </div>
                        <label class="mac-switch">
                            <input type="checkbox" id="touchIdToggle" ${touchIdEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <p class="group-description">Use Touch ID to unlock your account.</p>
                ` : ''}

                ${this.passwordSet ? `
                <div class="settings-group settings-group-mt20">
                    <div class="settings-row clickable" id="changePasswordRow">
                        <div class="settings-row-label">Change Password...</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                    <div class="settings-row clickable" id="updateQuestionRow">
                        <div class="settings-row-label">Update Security Question...</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        this.setupHubEventListeners();
    }

    setupHubEventListeners() {
        this.container.querySelector('#backToMain').addEventListener('click', () => {
            this.currentView = 'main';
            this.elevationToken = null;
            this.render();
        });

        const passToggle = this.container.querySelector('#passwordToggle');
        if (passToggle) {
            passToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                if (checked && !this.passwordSet) {
                    this.currentView = 'setup-password';
                    this.render();
                } else if (!checked && this.passwordSet) {
                    this.currentView = 'disable-password';
                    this.render();
                }
            });
        }

        const touchToggle = this.container.querySelector('#touchIdToggle');
        if (touchToggle) {
            touchToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                const touchIdCredId = localStorage.getItem('touchIdCredId');
                
                if (checked) {
                    if (!touchIdCredId) {
                        this.currentView = 'setup-touchid';
                        this.render();
                    } else {
                        localStorage.setItem('touchIdEnabled', 'true');
                    }
                } else {
                    localStorage.setItem('touchIdEnabled', 'false');
                }
            });
        }

        const changePass = this.container.querySelector('#changePasswordRow');
        if (changePass) {
            changePass.addEventListener('click', () => {
                this.currentView = 'change-password';
                this.render();
            });
        }

        const updateQuest = this.container.querySelector('#updateQuestionRow');
        if (updateQuest) {
            updateQuest.addEventListener('click', () => {
                this.currentView = 'update-question';
                this.render();
            });
        }

        // Click row to toggle switch
        const toggleRows = this.container.querySelectorAll('.settings-row');
        toggleRows.forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                row.addEventListener('click', (e) => {
                    if (e.target !== checkbox && !row.querySelector('.mac-switch').contains(e.target)) {
                        checkbox.click();
                    }
                });
            }
        });
    }

    async renderTouchIdSetupView() {
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Set Up Touch ID</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <div class="touchid-setup-header">
                            <div class="touchid-setup-icon">🤚</div>
                            <p class="challenge-instruction centered-description">
                                Enter your password to enable Touch ID.
                            </p>
                        </div>
                        <div class="form-row">
                            <label>Password</label>
                            <div class="password-field-wrapper">
                                <input type="password" id="currentPassword" placeholder="Required" autofocus>
                                <button class="profile-password-toggle" data-for="currentPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="form-actions form-actions-mt25">
                            <button class="primary-btn primary-btn-wide" id="confirmTouchSetup">Enable Touch ID</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmTouchSetup', ['#currentPassword']);
    }

    async renderSetupPasswordView() {
        if (this.questions.length === 0) {
            const res = await fetch('/api/auth/questions');
            const data = await res.json();
            this.questions = data.questions || [];
        }

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Set Password</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <div class="form-row">
                            <label>New Password</label>
                            <div class="password-field-wrapper">
                                <input type="password" id="newPassword" placeholder="Required" autofocus>
                                <button class="profile-password-toggle" data-for="newPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="form-row">
                            <label>Verify</label>
                            <div class="password-field-wrapper">
                                <input type="password" id="confirmPassword" placeholder="Confirm Password">
                                <button class="profile-password-toggle" data-for="confirmPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="security-question-section">
                            <label class="section-label-dim">SECURITY QUESTION</label>
                            <select id="setupQuestion" class="settings-select-wide">
                                <option value="">Choose a question...</option>
                                ${this.questions.map(q => `<option value="${q}">${q}</option>`).join('')}
                            </select>
                            <input type="text" id="setupAnswer" placeholder="Answer" class="settings-input-wide">
                        </div>
                        <div class="form-actions form-actions-mt25">
                            <button class="primary-btn primary-btn-wide" id="confirmSetup">Enabled Password</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmSetup', ['#newPassword', '#confirmPassword', '#setupAnswer']);
    }

    async renderDisablePasswordView() {
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Disable Password</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <p class="challenge-instruction challenge-instruction-left">
                            Enter your current password to turn off password protection.
                        </p>
                        <div class="form-row">
                            <div class="password-field-wrapper">
                                <input type="password" id="currentPassword" placeholder="Current Password" autofocus>
                                <button class="profile-password-toggle" data-for="currentPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button class="primary-btn" id="confirmDisable">Turn Off</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmDisable', ['#currentPassword']);
    }

    async renderChangePasswordView() {
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Change Password</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <!-- Step 1: Authenticate Current Password -->
                        <div id="step1Authenticate">
                            <p class="challenge-instruction challenge-instruction-left">
                                Enter your current password to make changes.
                            </p>
                            <div class="form-row">
                                <label>Current Password</label>
                                <div class="password-field-wrapper">
                                    <input type="password" id="currentPassword" placeholder="Required" autofocus>
                                    <button class="profile-password-toggle" data-for="currentPassword">${this.getEyeIcon()}</button>
                                </div>
                            </div>
                            <div class="form-actions form-actions-mt25">
                                <button class="primary-btn" id="authenticateCurrentPassword">Next</button>
                            </div>
                        </div>

                        <!-- Step 2: Set New Password (Hidden until authenticated) -->
                        <div id="step2NewPassword" class="hidden">
                            <p class="challenge-instruction challenge-instruction-left">
                                Choose a new password for your account.
                            </p>
                            <div class="form-row">
                                <label>New Password</label>
                                <div class="password-field-wrapper">
                                    <input type="password" id="newPassword" placeholder="New Password">
                                    <button class="profile-password-toggle" data-for="newPassword">${this.getEyeIcon()}</button>
                                </div>
                            </div>
                            <div class="form-row form-actions-mt25">
                                <label>Verify</label>
                                <div class="password-field-wrapper">
                                    <input type="password" id="confirmPassword" placeholder="Confirm New Password">
                                    <button class="profile-password-toggle" data-for="confirmPassword">${this.getEyeIcon()}</button>
                                </div>
                            </div>
                            <div class="form-actions form-actions-mt25">
                                <button class="primary-btn" id="confirmChange">Change Password</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#authenticateCurrentPassword', ['#currentPassword']);
        this.setupSecurityViewListeners('#confirmChange', ['#newPassword', '#confirmPassword']);
    }

    async renderUpdateQuestionView() {
        if (this.questions.length === 0) {
            const res = await fetch('/api/auth/questions');
            const data = await res.json();
            this.questions = data.questions || [];
        }

        this.container.innerHTML = `
           <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Update Security Question</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <!-- Step 1: Authenticate Current Password -->
                        <div id="step1AuthenticateQ">
                            <p class="challenge-instruction challenge-instruction-left">
                                Enter your current password to make changes.
                            </p>
                            <div class="form-row">
                                <label>Current Password</label>
                                <div class="password-field-wrapper">
                                    <input type="password" id="currentPasswordQ" placeholder="Required to update" autofocus>
                                    <button class="profile-password-toggle" data-for="currentPasswordQ">${this.getEyeIcon()}</button>
                                </div>
                            </div>
                            <div class="form-actions form-actions-mt25">
                                <button class="primary-btn" id="authenticateCurrentPasswordQ">Next</button>
                            </div>
                        </div>

                        <!-- Step 2: New Question (Hidden until authenticated) -->
                        <div id="step2UpdateQuestion" class="hidden">
                             <label class="section-label-dim">CHOOSE NEW QUESTION</label>
                            <select id="newQuestion" class="settings-select-wide">
                                <option value="">Select a question...</option>
                                ${this.questions.map(q => `<option value="${q}">${q}</option>`).join('')}
                            </select>
                            <input type="text" id="newAnswer" placeholder="New Answer" class="settings-input-wide">
                            <div class="form-actions form-actions-mt25">
                                <button class="primary-btn" id="confirmUpdateQuestion">Update Question</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#authenticateCurrentPasswordQ', ['#currentPasswordQ']);
        this.setupSecurityViewListeners('#confirmUpdateQuestion', ['#newAnswer']);
    }

    setupSecurityViewListeners(actionId, inputs) {
        // Back button
        const backBtn = this.container.querySelector('#backToHub');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.currentView = 'security';
                this.render();
            });
        }

        // Primary action button
        const actionBtn = this.container.querySelector(actionId);
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                if (actionId === '#confirmSetup') this.handleSetupPassword();
                else if (actionId === '#confirmDisable') this.handleConfirmDisable();
                else if (actionId === '#authenticateCurrentPassword') this.handleAuthenticateForChange();
                else if (actionId === '#authenticateCurrentPasswordQ') this.handleAuthenticateForQuestion();
                else if (actionId === '#confirmChange') this.handleConfirmChange();
                else if (actionId === '#confirmUpdateQuestion') this.handleConfirmUpdateQuestion();
                else if (actionId === '#confirmTouchSetup') this.handleConfirmTouchSetup();
            });
        }

        // Enter key for inputs
        inputs.forEach(sel => {
            const input = this.container.querySelector(sel);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        actionBtn.click();
                    }
                });
            }
        });

        // Toggle visibility for password fields
        const toggles = this.container.querySelectorAll('.profile-password-toggle');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = toggle.getAttribute('data-for');
                const targetInput = this.container.querySelector(`#${targetId}`);
                if (targetInput) {
                    const isPass = targetInput.type === 'password';
                    targetInput.type = isPass ? 'text' : 'password';
                }
            });
        });
    }

    async handleConfirmTouchSetup() {
        const password = this.container.querySelector('#currentPassword').value;
        if (!password) {
            alert('Password is required');
            return;
        }

        try {
            const authRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (!authRes.ok) {
                const data = await authRes.json();
                alert(data.error || 'Incorrect password');
                return;
            }

            // Standard WebAuthn creation flow
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const publicKeyCredentialCreationOptions = {
                challenge: challenge,
                rp: { name: "MacOS Web", id: window.location.hostname || "localhost" },
                user: {
                    id: Uint8Array.from('user-' + Date.now(), c => c.charCodeAt(0)),
                    name: this.userName,
                    displayName: this.userName.split(' ')[0]
                },
                pubKeyCredParams: [{alg: -7, type: "public-key"}],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000,
                attestation: "none"
            };

            const credential = await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });

            if (credential) {
                localStorage.setItem('touchIdEnabled', 'true');
                const bufferToBase64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
                localStorage.setItem('touchIdCredId', bufferToBase64(credential.rawId));
                
                alert('✓ Touch ID enabled successfully!');
                this.currentView = 'security';
                this.render();
            }
        } catch (err) {
            console.error('Touch ID setup error:', err);
            alert('Biometric setup failed or was cancelled.');
            this.currentView = 'security';
            this.render();
        }
    }

    async handleSetupPassword() {
        const newPassword = this.container.querySelector('#newPassword').value;
        const confirmPassword = this.container.querySelector('#confirmPassword').value;
        const securityQuestion = this.container.querySelector('#setupQuestion').value;
        const securityAnswer = this.container.querySelector('#setupAnswer').value;

        if (!newPassword || newPassword !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        if (!securityQuestion || !securityAnswer) {
            alert('Security question and answer are required');
            return;
        }

        const res = await fetch('/api/auth/update-security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword, securityQuestion, securityAnswer })
        });

        if (res.ok) {
            alert('✓ Password protection is now ON');
            this.currentView = 'security';
            this.render();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to setup password');
        }
    }

    async handleConfirmDisable() {
        const currentPassword = this.container.querySelector('#currentPassword').value;
        if (!currentPassword) return;

        const res = await fetch('/api/auth/disable-security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword })
        });

        if (res.ok) {
            alert('✓ Password protection disabled');
            this.currentView = 'security';
            this.render();
        } else {
            const data = await res.json();
            alert(data.error || 'Incorrect password');
        }
    }

    async handleAuthenticateForChange() {
        const currentPassword = this.container.querySelector('#currentPassword').value;
        if (!currentPassword) {
            alert('Please enter your current password');
            return;
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: currentPassword })
            });

            if (res.ok) {
                // Show Step 2
                this.container.querySelector('#step1Authenticate').style.display = 'none';
                this.container.querySelector('#step2NewPassword').style.display = 'block';
                this.container.querySelector('#newPassword').focus();
            } else {
                const data = await res.json();
                alert(data.error || 'Incorrect current password');
            }
        } catch (err) {
            console.error('Auth error:', err);
            alert('Failed to authenticate');
        }
    }

    async handleConfirmChange() {
        const currentPassword = this.container.querySelector('#currentPassword').value;
        const newPassword = this.container.querySelector('#newPassword').value;
        const confirmPassword = this.container.querySelector('#confirmPassword').value;

        if (!newPassword) {
            alert('Please enter a new password');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
        }

        const res = await fetch('/api/auth/update-security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (res.ok) {
            alert('✓ Password changed successfully');
            this.currentView = 'security';
            this.render();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to change password');
        }
    }

    async handleAuthenticateForQuestion() {
        const currentPassword = this.container.querySelector('#currentPasswordQ').value;
        if (!currentPassword) {
            alert('Please enter your current password');
            return;
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: currentPassword })
            });

            if (res.ok) {
                // Show Step 2
                this.container.querySelector('#step1AuthenticateQ').style.display = 'none';
                this.container.querySelector('#step2UpdateQuestion').style.display = 'block';
                this.container.querySelector('#newAnswer').focus();
            } else {
                const data = await res.json();
                alert(data.error || 'Incorrect current password');
            }
        } catch (err) {
            console.error('Auth error:', err);
            alert('Failed to authenticate');
        }
    }

    async handleConfirmUpdateQuestion() {
        const currentPassword = this.container.querySelector('#currentPasswordQ')?.value;
        const securityQuestion = this.container.querySelector('#newQuestion').value;
        const securityAnswer = this.container.querySelector('#newAnswer').value;

        if (!securityQuestion || !securityAnswer) {
            alert('Please select a question and provide an answer');
            return;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (this.elevationToken) headers['Authorization'] = `Bearer ${this.elevationToken}`;

        const res = await fetch('/api/auth/update-security', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ currentPassword, securityQuestion, securityAnswer })
        });

        if (res.ok) {
            alert('✓ Security question updated');
            this.currentView = 'security';
            this.elevationToken = null;
            this.render();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to update question');
        }
    }

    getEyeIcon() {
        return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    }

    async handleVerifyChallenge(answer) {
        if (!answer) return;
        try {
            const res = await fetch('/api/auth/verify-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer })
            });

            if (res.ok) {
                const data = await res.json();
                this.elevationToken = data.elevationToken;
                this.currentView = 'security';
                this.render();
            } else {
                alert('Incorrect answer');
            }
        } catch (err) {
            console.error('Challenge verify error:', err);
        }
    }

    async renderDeviceDetailView(device) {
        if (!device) return this.renderMainView();

        const res = await fetch(`/api/auth/devices/${device.id}/history`);
        const data = await res.json();
        const history = data.history || [];

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Device Details</h2>
                </div>
                
                <div class="profile-header">
                    <div class="device-detail-icon">${this.getDeviceIcon(device.device_type)}</div>
                    <div class="profile-name">${device.device_name}</div>
                    <div class="profile-email capitalize-text">${device.device_type} ${device.is_current ? '• This device' : ''}</div>
                </div>

                <div class="settings-group">
                    <div class="group-title group-title-detail">LOGIN HISTORY</div>
                    ${history.length > 0 ? history.map(h => `
                        <div class="settings-row cursor-default">
                            <div class="settings-row-label">
                                <div class="history-title">Logged in Successfully</div>
                                <div class="history-time">${this.formatDeviceDate(h.login_time)}</div>
                            </div>
                            <div class="settings-row-value history-status-success">SUCCESS</div>
                        </div>
                    `).join('') : `
                        <div class="settings-row">
                            <div class="settings-row-label">No history available for this device</div>
                        </div>
                    `}
                </div>

                <div class="device-logout-container">
                    <button class="primary-btn device-logout-btn" id="logoutThisDevice">Sign Out...</button>
                    <p class="group-description device-logout-description">
                        If you don't recognize this device, sign out and change your password to protect your account.
                    </p>
                </div>
            </div>
        `;

        this.container.querySelector('#backToMain').addEventListener('click', () => {
            this.currentView = 'main';
            this.selectedDevice = null;
            this.render();
        });

        const logoutBtn = this.container.querySelector('#logoutThisDevice');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm(`Sign out of ${device.device_name}? This will remove it from your trusted devices list.`)) {
                    this.handleLogoutDevice(device.id);
                }
            });
        }
    }

    async handleLogoutDevice(deviceId) {
        try {
            const res = await fetch(`/api/auth/devices/${deviceId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                this.currentView = 'main';
                this.selectedDevice = null;
                this.render();
            } else {
                alert('Failed to sign out from device');
            }
        } catch (err) {
            console.error('Logout device error:', err);
        }
    }

    async handleLogoutAllDevices() {
        try {
            const res = await fetch('/api/auth/devices', {
                method: 'DELETE'
            });

            if (res.ok) {
                this.render(); // Re-fetch status and render
            } else {
                alert('Failed to sign out of all devices');
            }
        } catch (err) {
            console.error('Logout all devices error:', err);
        }
    }

    setupMainEventListeners() {
        const rows = this.container.querySelectorAll('.settings-row');
        rows.forEach(row => {
            row.addEventListener('click', () => {
                const action = row.getAttribute('data-action');
                if (action === 'security-entry') {
                    if (this.passwordSet) {
                        this.currentView = 'security-challenge';
                    } else {
                        this.currentView = 'security';
                    }
                    this.render();
                } else if (action === 'personal') {
                    this.currentView = 'personal';
                    this.render();
                }
            });
        });

        // Device click listeners
        const deviceItems = this.container.querySelectorAll('.clickable-device');
        deviceItems.forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.getAttribute('data-id'));
                this.selectedDevice = this.devices.find(d => d.id === id);
                if (this.selectedDevice) {
                    this.currentView = 'device-detail';
                    this.render();
                }
            });
        });

        // Logout all devices
        const logoutAllBtn = this.container.querySelector('#logoutAllDevices');
        if (logoutAllBtn) {
            logoutAllBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to sign out of all other devices?')) {
                    this.handleLogoutAllDevices();
                }
            });
        }
    }

    async renderPersonalInfoView() {
        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Personal Information</h2>
                </div>

                <div class="personal-info-card">
                    <div class="avatar-edit-section">
                        <div class="profile-avatar-large editable" id="avatarEditTrigger">
                            ${this.profilePicture ? `<img src="${this.profilePicture}" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img">` : '<span id="avatarPlaceholder" class="avatar-placeholder">👤</span>'}
                            <div class="avatar-edit-overlay">Edit</div>
                        </div>
                        <input type="file" id="profileImageInput" accept="image/*" style="display: none;">
                    </div>

                    ${this.googleLinked ? `
                    <div class="identity-source-container">
                        <div class="segmented-control">
                            <button class="segment-btn ${this.nameSource === 'local' ? 'active' : ''}" id="toggleSourceLocal">
                                <i class="fas fa-user-edit"></i> Local
                            </button>
                            <button class="segment-btn ${this.nameSource === 'google' ? 'active' : ''}" id="toggleSourceGoogle">
                                <i class="fab fa-google"></i> Google
                            </button>
                        </div>
                    </div>
                    ` : ''}

                    <div class="settings-group">
                        <div class="form-row-stacked">
                            <label>FULL NAME</label>
                            <input type="text" id="editFullName" value="${this.userName}" 
                                placeholder="Enter your name" 
                                class="${this.nameSource === 'google' ? 'readonly-input' : ''}"
                                ${this.nameSource === 'google' ? 'readonly' : ''}>
                        </div>
                        <div class="form-row-stacked">
                            <label>EMAIL ADDRESS</label>
                            <input type="email" id="editEmailId" value="${this.userEmail}" 
                                placeholder="name@example.com"
                                class="${this.nameSource === 'google' ? 'readonly-input' : ''}"
                                ${this.nameSource === 'google' ? 'readonly' : ''}>
                        </div>
                    </div>

                    <div class="settings-group-title">CONNECTED SERVICES</div>
                    <div class="settings-group">
                        <div class="settings-row" id="googleAccountRow">
                            <div class="row-label">
                                <i class="fab fa-google google-icon-blue"></i> Google Account
                            </div>
                            <div class="row-value ${this.googleLinked ? 'status-linked' : 'status-not-linked'}">
                                ${this.googleLinked ? `Linked (${this.googleEmail})` : 'Not Linked'}
                            </div>
                            <div class="row-action row-actions-flex">
                                ${this.googleLinked ? `<button class="secondary-btn" id="btnSyncGoogle" title="Sync from Google"><i class="fas fa-sync-alt"></i></button>` : ''}
                                <button class="secondary-btn" id="btnGoogleAuth">
                                    ${this.googleLinked ? 'Disconnect' : 'Connect'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="done-btn-container">
                        <button class="primary-btn done-btn" id="saveProfile">Done</button>
                    </div>
                </div>
                
                <p class="group-description centered-description">Your name and photo are used across MacOS services to identify you.</p>
            </div>
        `;

        this.setupPersonalInfoListeners();
    }

    setupPersonalInfoListeners() {
        this.container.querySelector('#backToMain').addEventListener('click', () => {
            this.currentView = 'main';
            this.render();
        });

        const avatarTrigger = this.container.querySelector('#avatarEditTrigger');
        const fileInput = this.container.querySelector('#profileImageInput');
        
        avatarTrigger.addEventListener('click', (e) => {
            if (this.profilePicture) {
                this.showProfilePicOptions(e);
            } else {
                fileInput.click();
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleImageUpload(file);
        });

        this.container.querySelector('#saveProfile').addEventListener('click', () => {
            this.handleUpdateProfile();
        });

        const btnGoogle = this.container.querySelector('#btnGoogleAuth');
        if (btnGoogle) {
            btnGoogle.addEventListener('click', () => {
                if (this.googleLinked) {
                    this.handleDisconnectGoogle();
                } else {
                    this.handleGoogleAuth();
                }
            });
        }

        const btnSync = this.container.querySelector('#btnSyncGoogle');
        if (btnSync) {
            btnSync.addEventListener('click', () => this.handleGoogleAuth());
        }

        if (this.googleLinked) {
            const toggleLocal = this.container.querySelector('#toggleSourceLocal');
            const toggleGoogle = this.container.querySelector('#toggleSourceGoogle');

            if (toggleLocal) {
                toggleLocal.addEventListener('click', () => {
                    if (this.nameSource === 'google') {
                        this.nameSource = 'local';
                        this.userName = this.localName;
                        this.userEmail = this.localEmail;
                        this.renderPersonalInfoView();
                        this.handleUpdateProfile(true); // Silent update
                    }
                });
            }

            if (toggleGoogle) {
                toggleGoogle.addEventListener('click', () => {
                    if (this.nameSource === 'local') {
                        // Save current local edits before switching
                        const nameInp = this.container.querySelector('#editFullName');
                        const emailInp = this.container.querySelector('#editEmailId');
                        if (nameInp) this.localName = nameInp.value.trim();
                        if (emailInp) this.localEmail = emailInp.value.trim();
                        
                        this.nameSource = 'google';
                        this.userName = this.googleName || this.localName;
                        this.userEmail = this.googleEmail || this.localEmail;
                        this.renderPersonalInfoView();
                        this.handleUpdateProfile(true); // Silent update
                    }
                });
            }
        }
        
        // Listen for Google Auth success message from popup
        window.addEventListener('message', (event) => {
            if (event.data.type === 'GOOGLE_LINK_SUCCESS' || event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                this.loadProfileData();
            }
        });
    }

    handleGoogleAuth() {
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open('/api/auth/google/link', 'Google Login', 
            `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no`);
    }

    async handleDisconnectGoogle() {
        if (!confirm('Are you sure you want to disconnect your Google Account?')) return;
        
        try {
            const res = await fetch('/api/profile/disconnect-google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                this.googleLinked = false;
                this.googleEmail = null;
                this.render();
            }
        } catch (error) {
            console.error('Disconnect Google error:', error);
        }
    }

    showProfilePicOptions(e) {
        // Remove existing popovers
        const existing = document.querySelector('.profile-pic-popover');
        if (existing) existing.remove();

        const popover = document.createElement('div');
        popover.className = 'profile-pic-popover';
        popover.innerHTML = `
            <div class="popover-item" id="optViewPic">View Profile Picture</div>
            <div class="popover-item" id="optChangePic">Change Profile Picture...</div>
            <div class="popover-item danger" id="optRemovePic">Remove Profile Picture</div>
        `;

        if (this.googleLinked) {
            popover.innerHTML += `
                <div class="popover-divider"></div>
                <div class="popover-item ${this.pictureSource === 'local' ? 'selected' : ''}" id="optSourceLocal">Use Local Photo</div>
                <div class="popover-item ${this.pictureSource === 'google' ? 'selected' : ''}" id="optSourceGoogle">Use Google Photo</div>
            `;
        }

        this.container.appendChild(popover);

        // Listeners for popover
        if (this.googleLinked) {
            popover.querySelector('#optSourceLocal').addEventListener('click', () => {
                this.pictureSource = 'local';
                this.profilePicture = this.localPicture;
                this.renderPersonalInfoView();
                this.handleUpdateProfile(true); // Silent update
                popover.remove();
            });
            popover.querySelector('#optSourceGoogle').addEventListener('click', () => {
                this.pictureSource = 'google';
                this.profilePicture = this.googlePicture || this.localPicture;
                this.renderPersonalInfoView();
                this.handleUpdateProfile(true); // Silent update
                popover.remove();
            });
        }
        popover.querySelector('#optViewPic').addEventListener('click', () => {
            this.viewProfilePicture();
            popover.remove();
        });
        popover.querySelector('#optChangePic').addEventListener('click', () => {
            this.container.querySelector('#profileImageInput').click();
            popover.remove();
        });
        popover.querySelector('#optRemovePic').addEventListener('click', () => {
            if (confirm('Are you sure you want to remove your profile picture?')) {
                this.profilePicture = null;
                this.pictureSource = 'local'; // Switch to local on remove
                const avatarTrigger = this.container.querySelector('#avatarEditTrigger');
                avatarTrigger.innerHTML = `
                    <span id="avatarPlaceholder" class="avatar-placeholder">👤</span>
                    <div class="avatar-edit-overlay">Edit</div>
                `;
                this.handleUpdateProfile(true); // Silent update
            }
            popover.remove();
        });

        // Close on click outside
        const closePopover = (ev) => {
            if (!popover.contains(ev.target) && ev.target !== e.currentTarget) {
                popover.remove();
                document.removeEventListener('click', closePopover);
            }
        };
        setTimeout(() => document.addEventListener('click', closePopover), 10);
    }

    viewProfilePicture() {
        const overlay = document.createElement('div');
        overlay.className = 'image-view-overlay';
        overlay.innerHTML = `
            <span class="close-viewer">&times;</span>
            <img src="${this.profilePicture}" class="image-view-content">
        `;
        this.container.appendChild(overlay);

        overlay.querySelector('.close-viewer').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    async handleImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.openCropModal(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    openCropModal(imageSrc) {
        const overlay = document.createElement('div');
        overlay.className = 'crop-modal-overlay';
        overlay.innerHTML = `
            <div class="crop-modal">
                <div class="crop-header">Move and Scale</div>
                <div class="crop-body">
                    <div class="crop-frame" id="cropFrame">
                        <img src="${imageSrc}" class="crop-image crop-img-preview" id="cropImg">
                        <div class="crop-overlay"></div>
                    </div>
                    <div class="crop-controls">
                        <i class="fas fa-minus-circle zoom-icon-small"></i>
                        <input type="range" class="crop-slider" id="cropSlider" min="0.1" max="2" step="0.01" value="1">
                        <i class="fas fa-plus-circle zoom-icon-large"></i>
                    </div>
                </div>
                <div class="crop-footer">
                    <button class="secondary-btn" id="cancelCrop">Cancel</button>
                    <button class="primary-btn" id="setProfilePic">Set</button>
                </div>
            </div>
        `;
        this.container.appendChild(overlay);

        const img = overlay.querySelector('#cropImg');
        const frame = overlay.querySelector('#cropFrame');
        const slider = overlay.querySelector('#cropSlider');

        let scale = 1;
        let posX = 0;
        let posY = 0;
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        img.onload = () => {
            // Initial center
            const rect = img.getBoundingClientRect();
            posX = (300 - rect.width) / 2;
            posY = (300 - rect.height) / 2;
            updateTransform();
        };

        const updateTransform = () => {
            img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        };

        // Mouse events
        frame.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            posX += dx;
            posY += dy;
            lastX = e.clientX;
            lastY = e.clientY;
            updateTransform();
        });

        window.addEventListener('mouseup', () => isDragging = false);

        // Touch events
        let initialPinchDist = 0;
        let initialScale = 1;

        frame.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                initialPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialScale = scale;
            }
            e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isDragging) {
                const dx = e.touches[0].clientX - lastX;
                const dy = e.touches[0].clientY - lastY;
                posX += dx;
                posY += dy;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
                updateTransform();
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (initialPinchDist > 0) {
                    const pinchScale = dist / initialPinchDist;
                    scale = Math.min(Math.max(0.1, initialScale * pinchScale), 2);
                    slider.value = scale;
                    updateTransform();
                }
            }
            if (e.touches.length > 0) e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchend', () => {
            isDragging = false;
            initialPinchDist = 0;
        });

        // Zoom controls
        slider.addEventListener('input', (e) => {
            scale = parseFloat(e.target.value);
            updateTransform();
        });

        const iconMinus = overlay.querySelector('.fa-minus-circle');
        const iconPlus = overlay.querySelector('.fa-plus-circle');

        if (iconMinus) {
            iconMinus.addEventListener('click', () => {
                scale = Math.max(0.1, scale - 0.1);
                slider.value = scale;
                updateTransform();
            });
        }

        if (iconPlus) {
            iconPlus.addEventListener('click', () => {
                scale = Math.min(2, scale + 0.1);
                slider.value = scale;
                updateTransform();
            });
        }

        // Scroll wheel zoom
        frame.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            scale = Math.min(Math.max(0.1, scale + delta), 2);
            slider.value = scale;
            updateTransform();
        }, { passive: false });

        overlay.querySelector('#cancelCrop').addEventListener('click', () => overlay.remove());

        overlay.querySelector('#setProfilePic').addEventListener('click', () => {
            this.handleSaveCroppedImage(img, scale, posX, posY);
            overlay.remove();
        });
    }

    handleSaveCroppedImage(img, scale, posX, posY) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, 300, 300);

        // Draw image with current position and scale
        // posX and posY are the top-left offset of the image relative to the 300x300 frame
        const dWidth = img.naturalWidth * (scale / (img.width / img.naturalWidth || 1)); 
        // Wait, scale in CSS is relative to the ELEMENT size. 
        // If img element is 300px wide (auto height), scale 1 means 300px.
        
        // Let's use the displayed size
        const displayWidth = img.width * scale;
        const displayHeight = img.height * scale;
        
        ctx.drawImage(img, posX, posY, displayWidth, displayHeight);

        const croppedData = canvas.toDataURL('image/jpeg', 0.8);
        this.profilePicture = croppedData;
        this.localPicture = croppedData;
        this.pictureSource = 'local';

        // Update preview in Personal Info view
        const avatarTrigger = this.container.querySelector('#avatarEditTrigger');
        if (avatarTrigger) {
            avatarTrigger.innerHTML = `
                <img src="${croppedData}" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img">
                <div class="avatar-edit-overlay">Edit</div>
            `;
        }
        this.handleUpdateProfile(true); // Silent update after cropping
    }

    async handleUpdateProfile(isSilent = false) {
        const nameInp = this.container.querySelector('#editFullName');
        const emailInp = this.container.querySelector('#editEmailId');
        
        const full_name = nameInp ? nameInp.value.trim() : this.localName;
        const email_id = emailInp ? emailInp.value.trim() : this.localEmail;
        const profile_picture = this.profilePicture;

        if (!full_name || !email_id) {
            if (!isSilent) alert('Name and Email are required');
            return;
        }

        // If source is local, update our local snapshot from the input
        if (this.nameSource === 'local') {
            this.localName = full_name;
            this.localEmail = email_id;
        }

        try {
            const res = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    full_name: this.localName, 
                    email_id: this.localEmail, 
                    profile_picture: this.localPicture, 
                    name_source: this.nameSource,
                    picture_source: this.pictureSource
                })
            });

            if (res.ok) {
                this.userName = full_name;
                this.userEmail = email_id;
                
                if (!isSilent) {
                    this.currentView = 'main';
                    this.render();
                }
                
                window.dispatchEvent(new CustomEvent('macos-profile-updated'));
                
                // Cache for lock screen persistence
                localStorage.setItem('macos_user_display_name', this.userName);
                if (this.profilePicture) {
                    localStorage.setItem('macos_user_display_picture', this.profilePicture);
                } else {
                    localStorage.removeItem('macos_user_display_picture');
                }

                if (!isSilent) alert('✓ Profile updated successfully');
            } else {
                const data = await res.json();
                if (!isSilent) alert(data.error || 'Failed to update profile');
            }
        } catch (err) {
            console.error('Update profile error:', err);
            if (!isSilent) alert('An error occurred while updating profile');
        }
    }
}
