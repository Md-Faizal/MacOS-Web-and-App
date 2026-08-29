/**
 * ProfileComponent - macOS style Apple Account view for Settings
 */
function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function bytesToBase64Url(value) {
    return btoa(String.fromCharCode(...new Uint8Array(value)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function serializeCredential(credential) {
    const response = credential.response;
    return {
        id: credential.id,
        rawId: bytesToBase64Url(credential.rawId),
        type: credential.type,
        response: {
            clientDataJSON: bytesToBase64Url(response.clientDataJSON),
            attestationObject: bytesToBase64Url(response.attestationObject)
        }
    };
}

function prepareRegistrationOptions(options) {
    options.challenge = base64UrlToBytes(options.challenge);
    options.user.id = base64UrlToBytes(options.user.id);
    (options.excludeCredentials || []).forEach(credential => {
        credential.id = base64UrlToBytes(credential.id);
    });
    return options;
}

export class ProfileComponent {
    constructor(container) {
        this.container = container;
        this.userName = "Mohammad Faizal";
        this.userEmail = "m.faizal@cloud.com";
        this.accountUsername = "";
        this.accountEmail = "";
        this.authIdentifier = null;
        this.currentView = 'main'; // 'main', 'security-challenge', 'security', 'setup-password', 'change-password', 'update-question', 'setup-touchid'
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
        this.challengeVerificationInFlight = false;
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[character]));
    }

    safeImageUrl(value) {
        const imageUrl = String(value ?? '');
        return /^(https?:\/\/|data:image\/)/i.test(imageUrl) ? this.escapeHtml(imageUrl) : '';
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
                this.userRole = verifyData.user.role || 'owner';
                this.userStatus = verifyData.user.status || 'active';
            }

            const profileData = await profileRes.json();
            if (profileData.success && profileData.profile) {
                const profile = profileData.profile;
                if (profile.role) this.userRole = profile.role;
                if (profile.status) this.userStatus = profile.status;
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
                this.accountUsername = profile.username || '';
                this.accountEmail = profile.email || profile.email_id || '';
                this.authIdentifier = profile.username || this.accountEmail || this.userEmail;
                this.profilePicture = profile.display_picture || this.localPicture;

                // Cache identity only after Remember Me has been enabled.
                if (localStorage.getItem('macos_remember_account') === 'true') {
                    localStorage.setItem('macos_user_display_name', this.userName);
                    if (this.profilePicture) {
                        localStorage.setItem('macos_user_display_picture', this.profilePicture);
                    } else {
                        localStorage.removeItem('macos_user_display_picture');
                    }
                } else {
                    localStorage.removeItem('macos_user_display_name');
                    localStorage.removeItem('macos_user_display_picture');
                }
            }
        } catch (err) {
            console.error('Failed to fetch profile status/devices:', err);
        }
    }

    setRememberedAccount(enabled) {
        if (enabled) {
            localStorage.setItem('macos_remember_account', 'true');
            localStorage.setItem('macos_user_identifier', this.authIdentifier || this.userEmail);
            localStorage.setItem('macos_user_display_name', this.userName);
            if (this.profilePicture) {
                localStorage.setItem('macos_user_display_picture', this.profilePicture);
            }
        } else {
            localStorage.removeItem('macos_remember_account');
            localStorage.removeItem('macos_remember_prompt_dismissed');
            localStorage.removeItem('macos_user_identifier');
            localStorage.removeItem('macos_user_display_name');
            localStorage.removeItem('macos_user_display_picture');
            localStorage.removeItem('touchIdEnabled');
            localStorage.removeItem('touchIdCredId');
        }

        window.dispatchEvent(new CustomEvent('macos-profile-updated'));
    }

    renderMainView() {
        const isWorker = this.userRole === 'worker';
        const isPendingDeletion = this.userStatus === 'pending_deletion';

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="profile-header" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(28px) saturate(140%); -webkit-backdrop-filter: blur(28px) saturate(140%); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 22px 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22); margin-bottom: 24px;">
                    <div class="profile-avatar-large" style="width: 72px; height: 72px; font-size: 38px; border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.25); border: 2px solid rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(255, 255, 255, 0.1);">
                        <img src="${this.safeImageUrl(this.profilePicture) || '/assets/Images/DefaultUser.png'}" alt="Profile" class="profile-avatar-large-img" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="profile-header-copy">
                        <div class="profile-eyebrow" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; color: #0071E3; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">
                            <span>Apple Account</span>
                            ${!isWorker ? '<span class="profile-admin-badge" style="background: rgba(0, 113, 227, 0.2); color: #0071E3; border: 1px solid rgba(0, 113, 227, 0.4); padding: 1px 7px; border-radius: 8px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.5px;">ADMIN</span>' : ''}
                        </div>
                        <div class="profile-name" style="font-size: 1.35rem; font-weight: 700; letter-spacing: -0.2px;">${this.escapeHtml(this.userName)}</div>
                        <div class="profile-email" style="font-size: 0.85rem; opacity: 0.7; margin-top: 2px;">${this.escapeHtml(this.userEmail)}</div>
                    </div>
                </div>

                <div class="profile-section-label" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 8px 8px;">Account & Security</div>
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
                    <div class="settings-row" data-action="personal" style="cursor: pointer; transition: background 0.18s ease; padding: 12px 16px;">
                        <div class="settings-row-icon icon-personal" style="font-size: 1.1rem; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(0, 113, 227, 0.18); border-radius: 6px; margin-right: 12px;">👤</div>
                        <div class="settings-row-label" style="font-weight: 500;">Personal Information</div>
                        <div class="settings-row-chevron" style="opacity: 0.4; font-size: 0.75rem;">▶</div>
                    </div>
                    <div class="settings-row" data-action="security-entry" style="cursor: pointer; transition: background 0.18s ease; padding: 12px 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <div class="settings-row-icon icon-security" style="font-size: 1.1rem; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(52, 199, 89, 0.18); border-radius: 6px; margin-right: 12px;">🔑</div>
                        <div class="settings-row-label" style="font-weight: 500;">Sign-In & Security</div>
                        <div class="profile-status-badge ${this.passwordSet ? '' : 'off'}" style="margin-right: 8px; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; font-weight: 600;">${this.passwordSet ? 'Protected' : 'Off'}</div>
                        <div class="settings-row-chevron" style="opacity: 0.4; font-size: 0.75rem;">▶</div>
                    </div>
                </div>

                <div class="devices-section" style="margin-top: 24px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 8px 8px;">
                        <div class="profile-section-label" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 0;">Signed-in Devices</div>
                        <div style="font-size: 0.75rem; opacity: 0.5;">${this.devices.length} ${this.devices.length === 1 ? 'Device' : 'Devices'}</div>
                    </div>
                    
                    <div class="settings-group" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
                        ${this.devices.length > 0 ? this.devices.map((device, idx) => {
                            const rawLastSeen = device.last_seen || '';
                            const utcLastSeen = rawLastSeen.includes('Z') ? rawLastSeen : (rawLastSeen.replace(' ', 'T') + 'Z');
                            const lastSeen = new Date(utcLastSeen).getTime() || 0;
                            
                            const isThisDevice = device.isCurrent || (this.currentDeviceId && device.id === this.currentDeviceId);
                            const isOnline = isThisDevice || (Date.now() - lastSeen < 120000);
                            
                            return `
                            <div class="device-item clickable-device" data-id="${device.id}" style="display: flex; align-items: center; padding: 12px 16px; cursor: pointer; transition: background 0.18s ease; ${idx > 0 ? 'border-top: 1px solid rgba(255, 255, 255, 0.08);' : ''}">
                                <div class="device-icon-wrapper" style="position: relative; width: 34px; height: 34px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; margin-right: 14px; flex-shrink: 0;">
                                    <div class="device-icon">${this.getDeviceIcon(device.device_type)}</div>
                                    ${isOnline ? '<div class="online-indicator" style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #34C759; border: 2px solid rgba(30,30,30,0.85); box-shadow: 0 0 6px #34C759;"></div>' : ''}
                                </div>
                                <div class="device-info" style="flex: 1; min-width: 0;">
                                    <div class="device-name" style="font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
                                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(device.device_name)}</span>
                                        ${isThisDevice ? '<span class="this-device-tag" style="background: rgba(0, 113, 227, 0.15); color: #0071E3; font-weight: 600; padding: 1px 6px; border-radius: 8px; font-size: 0.68rem; flex-shrink: 0;">This device</span>' : ''}
                                    </div>
                                    <div class="device-type" style="font-size: 0.75rem; opacity: 0.6; margin-top: 2px;">${isOnline ? 'Online now' : `Last seen: ${this.escapeHtml(this.formatDeviceDate(utcLastSeen))}`}</div>
                                </div>
                                <div class="settings-row-chevron" style="opacity: 0.4; font-size: 0.75rem; margin-left: 8px;">▶</div>
                            </div>
                            `;
                        }).join('') : `
                            <div class="device-item" style="padding: 14px 16px; display: flex; align-items: center; gap: 12px;">
                                <div class="device-icon" style="font-size: 1.4rem;">💻</div>
                                <div class="device-info">
                                    <div class="device-name" style="font-weight: 600;">This Device</div>
                                    <div class="device-type" style="font-size: 0.75rem; opacity: 0.6;">Current Session</div>
                                </div>
                            </div>
                        `}
                    </div>

                    ${this.devices.length >= 2 ? `
                        <div style="margin-top: 14px; text-align: center;">
                            <button class="primary-btn logout-all-btn" id="logoutAllDevices" style="background: transparent; color: #FF453A; border: 1px solid rgba(255, 69, 58, 0.35); padding: 8px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                                Sign Out of All Other Devices...
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="privacy-data-section" style="margin-top: 24px;">
                    <div class="profile-section-label" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 8px 8px;">Privacy & Data</div>
                    <div class="settings-group" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
                        <div class="settings-row" id="exportDataBtn" style="cursor: pointer; padding: 12px 16px;">
                            <div class="settings-row-icon" style="font-size: 1.1rem; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.12); border-radius: 6px; margin-right: 12px;">📥</div>
                            <div class="settings-row-label" style="font-weight: 500;">Export Account Data</div>
                            <div class="settings-row-chevron" style="opacity: 0.4; font-size: 0.75rem;">⬇</div>
                        </div>
                    </div>
                </div>

                ${isWorker ? `
                    <div class="danger-zone-section" style="margin-top: 28px;">
                        <div class="profile-section-label" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ff453a; margin: 0 0 8px 8px;">Account Deletion</div>
                        ${isPendingDeletion ? `
                            <div style="background: rgba(255, 149, 0, 0.12); border: 1px solid rgba(255, 149, 0, 0.35); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
                                <div style="font-weight: 600; color: #ff9500; font-size: 0.95rem;">⚠️ Account Deletion Pending Owner Approval</div>
                                <div style="font-size: 0.82rem; color: rgba(255, 255, 255, 0.8); line-height: 1.4;">Your deletion request has been submitted to the workspace Owner. You can continue using your account normally until approved, or cancel the request.</div>
                                <button id="cancelDeletionBtn" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25); color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; align-self: flex-start; margin-top: 4px;">Cancel Deletion Request</button>
                            </div>
                        ` : `
                            <div class="settings-group" style="background: rgba(255, 69, 58, 0.08); border-radius: 12px; border: 1px solid rgba(255, 69, 58, 0.25); overflow: hidden;">
                                <div class="settings-row" id="requestDeletionBtn" style="cursor: pointer; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
                                    <div>
                                        <div style="font-weight: 600; color: #ff453a; font-size: 0.9rem;">Request Account Deletion</div>
                                        <div style="font-size: 0.78rem; opacity: 0.7; margin-top: 2px;">Submit a request to permanently delete your worker credentials</div>
                                    </div>
                                    <div class="settings-row-chevron" style="color: #ff453a; opacity: 0.7; font-size: 0.75rem;">▶</div>
                                </div>
                            </div>
                        `}
                    </div>
                ` : ''}
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
        if (!this.passwordSet && !this.hasSecurityQuestion) {
            this.currentView = 'security';
            return this.render();
        }

        let challengeData = { question: null, hasSecurityQuestion: false };
        try {
            const res = await fetch('/api/auth/challenge');
            if (res.ok) {
                challengeData = await res.json();
            }
        } catch (e) {}

        const question = challengeData.question;
        const hasQuestion = !!(question && !question.toLowerCase().includes('not set up') && !question.toLowerCase().includes('recovery key'));

        if (!this.securityGatewayMode) {
            this.securityGatewayMode = hasQuestion ? 'question' : 'password';
        }

        const mode = this.securityGatewayMode;

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Sign-In & Security</h2>
                </div>
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(28px) saturate(140%); -webkit-backdrop-filter: blur(28px) saturate(140%); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 24px 22px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22); margin-top: 10px;">
                    <div class="security-form challenge-form">
                        ${mode === 'question' && hasQuestion ? `
                            <p class="challenge-instruction" style="font-size: 0.88rem; color: rgba(255,255,255,0.85); margin-bottom: 12px;">Please answer your security question to access security settings.</p>
                            <h3 class="security-question-text" style="font-size: 1.05rem; font-weight: 600; color: #ffffff; margin-bottom: 16px; line-height: 1.4;">${this.escapeHtml(question)}</h3>
                            <div class="form-row">
                                <input type="text" id="challengeAnswer" placeholder="Your security answer" autocomplete="off" style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div class="form-actions" style="margin-top: 18px;">
                                <button class="primary-btn" id="verifyChallenge" style="width: 100%;">Verify Answer</button>
                            </div>
                        ` : mode === 'recovery_key' ? `
                            <p class="challenge-instruction" style="font-size: 0.88rem; color: rgba(255,255,255,0.85); margin-bottom: 12px;">Enter your Emergency Recovery Key to access security settings.</p>
                            <div class="form-row">
                                <input type="password" id="challengeRecoveryKey" placeholder="Emergency recovery key" autocomplete="off" style="width: 100%; box-sizing: border-box; font-family: monospace;">
                            </div>
                            <div class="form-actions" style="margin-top: 18px;">
                                <button class="primary-btn" id="verifyRecoveryKey" style="width: 100%;">Verify Recovery Key</button>
                            </div>
                        ` : `
                            <p class="challenge-instruction" style="font-size: 0.88rem; color: rgba(255,255,255,0.85); margin-bottom: 12px;">Enter your account login password to access Sign-In & Security settings.</p>
                            <div class="form-row">
                                <input type="password" id="challengePassword" placeholder="Login password" autocomplete="current-password" style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div class="form-actions" style="margin-top: 18px;">
                                <button class="primary-btn" id="verifyPassword" style="width: 100%;">Verify Password</button>
                            </div>
                        `}

                        <div class="challenge-switch-modes" style="display: flex; flex-direction: column; gap: 8px; margin-top: 20px; text-align: center; font-size: 0.82rem;">
                            ${hasQuestion && mode !== 'question' ? `
                                <button class="mode-switch-btn" id="switchToQuestion" style="background: transparent; border: none; color: #0071E3; cursor: pointer; text-decoration: underline;">Use Security Question</button>
                            ` : ''}
                            ${mode !== 'recovery_key' ? `
                                <button class="mode-switch-btn" id="switchToRecovery" style="background: transparent; border: none; color: #0071E3; cursor: pointer; text-decoration: underline;">Use Emergency Recovery Key</button>
                            ` : ''}
                            ${mode !== 'password' ? `
                                <button class="mode-switch-btn" id="switchToPassword" style="background: transparent; border: none; color: #0071E3; cursor: pointer; text-decoration: underline;">Verify with Login Password</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.querySelector('#backToMain').addEventListener('click', () => {
            this.currentView = 'main';
            this.render();
        });

        // Switch mode listeners
        const btnSwitchQ = this.container.querySelector('#switchToQuestion');
        if (btnSwitchQ) btnSwitchQ.addEventListener('click', () => { this.securityGatewayMode = 'question'; this.render(); });

        const btnSwitchR = this.container.querySelector('#switchToRecovery');
        if (btnSwitchR) btnSwitchR.addEventListener('click', () => { this.securityGatewayMode = 'recovery_key'; this.render(); });

        const btnSwitchP = this.container.querySelector('#switchToPassword');
        if (btnSwitchP) btnSwitchP.addEventListener('click', () => { this.securityGatewayMode = 'password'; this.render(); });

        // Verification listeners
        const verifyBtn = this.container.querySelector('#verifyChallenge') ||
                          this.container.querySelector('#verifyRecoveryKey') ||
                          this.container.querySelector('#verifyPassword');

        const submitVerification = () => {
            if (mode === 'question') {
                const answer = this.container.querySelector('#challengeAnswer')?.value.trim();
                this.handleVerifyChallenge({ answer });
            } else if (mode === 'recovery_key') {
                const recoveryKey = this.container.querySelector('#challengeRecoveryKey')?.value.trim();
                this.handleVerifyChallenge({ recoveryKey });
            } else {
                const password = this.container.querySelector('#challengePassword')?.value;
                this.handleVerifyChallenge({ password });
            }
        };

        if (verifyBtn) verifyBtn.addEventListener('click', submitVerification);

        const inputField = this.container.querySelector('#challengeAnswer') ||
                           this.container.querySelector('#challengeRecoveryKey') ||
                           this.container.querySelector('#challengePassword');
        if (inputField) {
            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') submitVerification();
            });
            setTimeout(() => inputField.focus(), 150);
        }
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
                            <span class="settings-row-subtitle">Required for secure sign-in and account recovery</span>
                        </div>
                        <div class="profile-status-badge ${this.passwordSet ? '' : 'off'}">${this.passwordSet ? 'Required' : 'Not set'}</div>
                    </div>
                </div>
                <p class="group-description">Password protection cannot be turned off for multi-user accounts.</p>

                <div class="settings-group settings-group-mt20 account-identity-group">
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-personal">👤</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Username</span>
                            <span class="settings-row-subtitle">${this.escapeHtml(this.accountUsername || 'Not set')}</span>
                        </div>
                    </div>
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-icloud">✉</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Login Email</span>
                            <span class="settings-row-subtitle">${this.escapeHtml(this.accountEmail || 'Not set')}</span>
                        </div>
                    </div>
                    ${this.googleLinked ? `
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-google">G</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Google Account</span>
                            <span class="settings-row-subtitle">${this.escapeHtml(this.googleEmail || 'Connected')}</span>
                        </div>
                    </div>
                    ` : ''}
                    <div class="settings-row clickable" id="changeAccountDetailsRow">
                        <div class="settings-row-label">Change Account Details...</div>
                        <div class="settings-row-chevron">▶</div>
                    </div>
                </div>
                <p class="group-description">These details identify your account when you sign in.</p>

                <div class="settings-group settings-group-mt20">
                    <div class="settings-row">
                        <div class="settings-row-label">
                            <span class="settings-row-title">Remember This Account</span>
                        </div>
                        <label class="mac-switch">
                            <input type="checkbox" id="rememberAccountToggle"
                                ${localStorage.getItem('macos_remember_account') === 'true' ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <p class="group-description">Show this account on the lock screen for faster sign-in.</p>

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

        const touchToggle = this.container.querySelector('#touchIdToggle');
        if (touchToggle) {
            touchToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                const touchIdEnabled = localStorage.getItem('touchIdEnabled') === 'true';
                
                if (checked) {
                    if (!touchIdEnabled) {
                        this.currentView = 'setup-touchid';
                        this.render();
                    } else {
                        localStorage.setItem('touchIdEnabled', 'true');
                    }
                } else {
                    localStorage.setItem('touchIdEnabled', 'false');
                    localStorage.removeItem('touchIdCredId');
                }
            });
        }

        const rememberToggle = this.container.querySelector('#rememberAccountToggle');
        if (rememberToggle) {
            rememberToggle.addEventListener('change', (e) => {
                this.setRememberedAccount(e.target.checked);
            });
        }

        const changePass = this.container.querySelector('#changePasswordRow');
        if (changePass) {
            changePass.addEventListener('click', () => {
                this.currentView = 'change-password';
                this.render();
            });
        }

        const changeAccountDetails = this.container.querySelector('#changeAccountDetailsRow');
        if (changeAccountDetails) {
            changeAccountDetails.addEventListener('click', () => {
                this.currentView = 'personal';
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
                                ${this.questions.map(q => `<option value="${this.escapeHtml(q)}">${this.escapeHtml(q)}</option>`).join('')}
                            </select>
                            <input type="text" id="setupAnswer" placeholder="Answer" class="settings-input-wide">
                        </div>
                        <div class="form-actions form-actions-mt25">
                            <button class="primary-btn primary-btn-wide" id="confirmSetup">Enable Password</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmSetup', ['#newPassword', '#confirmPassword', '#setupAnswer']);
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
                                ${this.questions.map(q => `<option value="${this.escapeHtml(q)}">${this.escapeHtml(q)}</option>`).join('')}
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
                body: JSON.stringify({ identifier: this.authIdentifier || this.userEmail, password })
            });

            if (!authRes.ok) {
                const data = await authRes.json();
                alert(data.error || 'Incorrect password');
                return;
            }

            const optionsRes = await fetch('/api/auth/webauthn/registration-options');
            if (!optionsRes.ok) throw new Error('Unable to prepare Touch ID setup');
            const options = prepareRegistrationOptions(await optionsRes.json());
            const credential = await navigator.credentials.create({ publicKey: options });

            if (credential) {
                const verifyRes = await fetch('/api/auth/webauthn/registration-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serializeCredential(credential))
                });
                if (!verifyRes.ok) throw new Error('Touch ID registration was not verified');

                localStorage.setItem('touchIdEnabled', 'true');
                
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
                body: JSON.stringify({
                    identifier: this.authIdentifier || this.userEmail,
                    password: currentPassword
                })
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
                body: JSON.stringify({
                    identifier: this.authIdentifier || this.userEmail,
                    password: currentPassword
                })
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

    async handleVerifyChallenge({ answer, recoveryKey, password } = {}) {
        if (this.challengeVerificationInFlight) return;
        this.challengeVerificationInFlight = true;
        try {
            const payload = {
                identifier: this.authIdentifier || this.userEmail
            };
            if (answer) payload.answer = answer;
            if (recoveryKey) payload.recoveryKey = recoveryKey;
            if (password) payload.password = password;

            const res = await fetch('/api/auth/verify-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                this.elevationToken = data.sessionId;
                this.currentView = 'security';
                this.render();
            } else {
                alert(data.error || 'Verification failed. Please check your credentials.');
            }
        } catch (err) {
            console.error('Challenge verify error:', err);
            alert('Failed to connect to server.');
        } finally {
            this.challengeVerificationInFlight = false;
        }
    }

    async renderDeviceDetailView(device) {
        if (!device) return this.renderMainView();

        const res = await fetch(`/api/auth/devices/${device.id}/history`);
        const data = await res.json();
        const history = data.history || [];
        const isCurrent = device.isCurrent || (this.currentDeviceId && device.id === this.currentDeviceId);

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Device Details</h2>
                </div>
                
                <div class="profile-header" style="padding-bottom: 20px;">
                    <div class="device-detail-icon" style="font-size: 56px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));">${this.getDeviceIcon(device.device_type)}</div>
                    <div class="profile-name" style="font-size: 1.35rem; font-weight: 700;">${this.escapeHtml(device.device_name)}</div>
                    <div class="profile-email capitalize-text" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px;">
                        <span>${this.escapeHtml(device.device_type)}</span>
                        ${isCurrent ? '<span class="this-device-tag" style="background: rgba(0, 113, 227, 0.15); color: #0071E3; font-weight: 600; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem;">Current Session</span>' : ''}
                        ${device.hasActiveSession ? '<span style="background: rgba(52, 199, 89, 0.15); color: #34C759; font-weight: 600; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem;">● Active</span>' : ''}
                    </div>
                </div>

                <div class="settings-group">
                    <div class="group-title group-title-detail" style="font-size: 0.75rem; letter-spacing: 0.5px; opacity: 0.6; padding: 8px 16px 4px;">DEVICE INFORMATION</div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Model</strong></div>
                        <div class="settings-row-value" style="color: rgba(255,255,255,0.7);">${this.escapeHtml(device.device_name)}</div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Platform</strong></div>
                        <div class="settings-row-value" style="color: rgba(255,255,255,0.7);">${this.escapeHtml(device.device_type)}</div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Last Activity</strong></div>
                        <div class="settings-row-value" style="color: rgba(255,255,255,0.7);">${this.escapeHtml(this.formatDeviceDate(device.last_seen || device.last_login))}</div>
                    </div>
                </div>

                <div class="settings-group" style="margin-top: 18px;">
                    <div class="group-title group-title-detail" style="font-size: 0.75rem; letter-spacing: 0.5px; opacity: 0.6; padding: 8px 16px 4px;">RECENT SIGN-IN ACTIVITY</div>
                    ${history.length > 0 ? history.map(h => `
                        <div class="settings-row cursor-default">
                            <div class="settings-row-label">
                                <div class="history-title" style="font-weight: 500;">Signed in successfully</div>
                                <div class="history-time" style="font-size: 0.75rem; opacity: 0.6; margin-top: 2px;">${this.formatDeviceDate(h.login_time)}</div>
                            </div>
                            <div class="settings-row-value history-status-success" style="font-size: 0.72rem; background: rgba(52, 199, 89, 0.15); color: #34C759; padding: 2px 8px; border-radius: 6px; font-weight: 600;">ACTIVE</div>
                        </div>
                    `).join('') : `
                        <div class="settings-row">
                            <div class="settings-row-label" style="opacity: 0.6;">No previous sign-in logs recorded</div>
                        </div>
                    `}
                </div>

                <div class="device-logout-container" style="margin-top: 24px; text-align: center;">
                    <button class="primary-btn device-logout-btn" id="logoutThisDevice" style="background: rgba(255, 69, 58, 0.85); border: 1px solid rgba(255, 69, 58, 0.9); width: 100%; max-width: 320px; font-weight: 600; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.2s ease;">
                        ${isCurrent ? 'Sign Out of This Device...' : 'Remove from Account...'}
                    </button>
                    <p class="group-description device-logout-description" style="max-width: 340px; margin: 10px auto 0; font-size: 0.75rem; opacity: 0.65; line-height: 1.4;">
                        ${isCurrent 
                            ? 'Warning: Signing out of this device will terminate your current session immediately and return you to the lock screen.' 
                            : 'This will revoke this device’s active session tokens and remove it from your trusted devices list.'}
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
                const confirmMsg = isCurrent 
                    ? `⚠️ Are you sure you want to sign out of THIS device (${device.device_name})? Your current session will end immediately.`
                    : `Remove ${device.device_name} from your trusted devices? This will immediately terminate its access.`;
                
                if (confirm(confirmMsg)) {
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
            const data = await res.json();

            if (res.ok) {
                if (data.isSelf) {
                    // Current device session was terminated
                    sessionStorage.removeItem('macos_session_active');
                    alert('You have signed out of this device. Returning to lock screen...');
                    window.location.href = './index.html';
                    return;
                }
                this.currentView = 'main';
                this.selectedDevice = null;
                this.render();
            } else {
                alert(data.error || 'Failed to sign out from device');
            }
        } catch (err) {
            console.error('Logout device error:', err);
        }
    }

    async handleLogoutAllDevices() {
        try {
            const res = await fetch('/api/auth/devices?keepCurrent=true', {
                method: 'DELETE'
            });
            const data = await res.json();

            if (res.ok) {
                alert('✓ Successfully signed out of all other devices.');
                await this.fetchStatus();
                this.renderMainView();
            } else {
                alert(data.error || 'Failed to sign out of other devices');
            }
        } catch (err) {
            console.error('Logout all devices error:', err);
            alert('An error occurred while signing out of devices.');
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

        // Export Account Data
        const exportBtn = this.container.querySelector('#exportDataBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                window.location.href = '/api/profile/export';
            });
        }

        // Cancel Deletion Request
        const cancelDelBtn = this.container.querySelector('#cancelDeletionBtn');
        if (cancelDelBtn) {
            cancelDelBtn.addEventListener('click', async () => {
                try {
                    const res = await fetch('/api/profile/cancel-deletion-request', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        alert(data.message || 'Deletion request cancelled.');
                        await this.fetchStatus();
                        this.renderMainView();
                    } else {
                        alert(data.error || 'Failed to cancel request.');
                    }
                } catch (e) {
                    alert('Network error while cancelling deletion request.');
                }
            });
        }

        // Request Account Deletion
        const reqDelBtn = this.container.querySelector('#requestDeletionBtn');
        if (reqDelBtn) {
            reqDelBtn.addEventListener('click', () => {
                this.openRequestDeletionModal();
            });
        }
    }

    openRequestDeletionModal() {
        const modal = document.createElement('div');
        modal.className = 'admin-modal-overlay show';
        modal.innerHTML = `
            <div class="admin-modal" style="max-width: 440px; background: rgba(32, 32, 38, 0.96); border: 1px solid rgba(255, 69, 58, 0.35); border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.6);">
                <div class="modal-header" style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                    <h3 class="modal-title" style="color: #ff453a; font-weight: 600;">Request Account Deletion</h3>
                    <button class="modal-close" style="color: rgba(255,255,255,0.6);">×</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="font-size: 13px; color: rgba(255, 255, 255, 0.85); line-height: 1.45; margin-bottom: 16px;">
                        Submitting a deletion request will notify the workspace Owner for approval. Upon approval, your login credentials, active sessions, and personal preferences will be permanently wiped.
                    </p>
                    <div class="form-group" style="margin-bottom: 14px;">
                        <label class="form-label" style="font-size: 12px; opacity: 0.8;">Optional Reason</label>
                        <input type="text" id="delReasonInput" class="form-input" placeholder="e.g. Leaving workspace, role change...">
                    </div>
                    ${this.passwordSet ? `
                        <div class="form-group">
                            <label class="form-label" style="font-size: 12px; opacity: 0.8;">Confirm Login Password</label>
                            <input type="password" id="delPasswordInput" class="form-input" placeholder="Enter your password">
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding: 14px 20px; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn-cancel" style="background: rgba(255,255,255,0.12); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 500; cursor: pointer;">Cancel</button>
                    <button class="btn-submit-del" style="background: #ff453a; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">Submit Request</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('.modal-close').onclick = close;
        modal.querySelector('.btn-cancel').onclick = close;

        modal.querySelector('.btn-submit-del').onclick = async () => {
            const reason = modal.querySelector('#delReasonInput')?.value.trim();
            const password = modal.querySelector('#delPasswordInput')?.value;
            if (this.passwordSet && !password) {
                alert('Please enter your password to confirm deletion request.');
                return;
            }

            try {
                const res = await fetch('/api/profile/deletion-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason, password })
                });
                const data = await res.json();
                if (res.ok) {
                    alert(data.message || 'Deletion request submitted.');
                    close();
                    await this.fetchStatus();
                    this.renderMainView();
                } else {
                    alert(data.error || 'Failed to submit deletion request.');
                }
            } catch (e) {
                alert('Failed to connect to server.');
            }
        };
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
                            <img src="${this.safeImageUrl(this.profilePicture) || '/assets/Images/DefaultUser.png'}" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img" style="width: 100%; height: 100%; object-fit: cover;">
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
                            <label>USERNAME</label>
                            <input type="text" id="editUsername" value="${this.escapeHtml(this.accountUsername)}"
                                placeholder="Choose a username" autocomplete="username">
                        </div>
                        <div class="form-row-stacked">
                            <label>FULL NAME</label>
                            <input type="text" id="editFullName" value="${this.escapeHtml(this.userName)}"
                                placeholder="Enter your name" 
                                class="${this.nameSource === 'google' ? 'readonly-input' : ''}"
                                ${this.nameSource === 'google' ? 'readonly' : ''}>
                        </div>
                        <div class="form-row-stacked">
                            <label>EMAIL ADDRESS</label>
                            <input type="email" id="editEmailId" value="${this.escapeHtml(this.userEmail)}"
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
                                ${this.googleLinked ? `Linked (${this.escapeHtml(this.googleEmail)})` : 'Not Linked'}
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
            if (event.origin !== window.location.origin) return;
            if (event.data.type === 'GOOGLE_LINK_SUCCESS' || event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                this.fetchStatus().then(() => this.render());
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
                    <img src="/assets/Images/DefaultUser.png" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img" style="width: 100%; height: 100%; object-fit: cover;">
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
        const usernameInp = this.container.querySelector('#editUsername');
        const emailInp = this.container.querySelector('#editEmailId');
        
        const full_name = nameInp ? nameInp.value.trim() : this.localName;
        const username = usernameInp ? usernameInp.value.trim() : this.accountUsername;
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
                    username,
                    profile_picture: this.localPicture, 
                    name_source: this.nameSource,
                    picture_source: this.pictureSource
                })
            });

            if (res.ok) {
                this.userName = full_name;
                this.userEmail = email_id;
                this.accountUsername = username;
                this.accountEmail = email_id;
                this.authIdentifier = username || email_id;
                
                if (!isSilent) {
                    this.currentView = 'main';
                    this.render();
                }
                
                window.dispatchEvent(new CustomEvent('macos-profile-updated'));
                
                // Cache identity only after Remember Me has been enabled.
                if (localStorage.getItem('macos_remember_account') === 'true') {
                    localStorage.setItem('macos_user_display_name', this.userName);
                    if (this.profilePicture) {
                        localStorage.setItem('macos_user_display_picture', this.profilePicture);
                    } else {
                        localStorage.removeItem('macos_user_display_picture');
                    }
                } else {
                    localStorage.removeItem('macos_user_display_name');
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
