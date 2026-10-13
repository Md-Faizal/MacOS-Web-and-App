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

                // If local photo is not uploaded, default to Google photo
                if (!this.localPicture && this.googlePicture) {
                    this.profilePicture = this.googlePicture;
                    if (!profile.picture_source || profile.picture_source === 'local') {
                        this.pictureSource = 'google';
                    }
                } else {
                    this.profilePicture = profile.display_picture || this.localPicture || this.googlePicture || null;
                }

                // Synchronize active identity with Multi-User Remembered Accounts
                const activeId = (this.authIdentifier || this.accountUsername || this.accountEmail || this.userEmail || '').trim().toLowerCase();
                let rememberedUsers = [];
                try {
                    rememberedUsers = JSON.parse(localStorage.getItem('macos_remembered_users') || '[]');
                } catch (e) {
                    rememberedUsers = [];
                }

                const userIndex = rememberedUsers.findIndex(u => 
                    (activeId && u.identifier && u.identifier.toLowerCase() === activeId) ||
                    (this.userId && u.id === this.userId)
                );

                if (userIndex !== -1) {
                    rememberedUsers[userIndex].displayName = this.userName || rememberedUsers[userIndex].displayName;
                    rememberedUsers[userIndex].displayPicture = this.profilePicture || rememberedUsers[userIndex].displayPicture;
                    rememberedUsers[userIndex].role = this.userRole || 'user';
                    rememberedUsers[userIndex].lastActive = Date.now();
                    localStorage.setItem('macos_remembered_users', JSON.stringify(rememberedUsers));
                    localStorage.setItem('macos_active_user_id', rememberedUsers[userIndex].id);
                    localStorage.setItem('macos_remember_account', 'true');
                    localStorage.setItem('macos_user_identifier', rememberedUsers[userIndex].identifier);
                    localStorage.setItem('macos_user_display_name', rememberedUsers[userIndex].displayName);
                    if (rememberedUsers[userIndex].displayPicture) {
                        localStorage.setItem('macos_user_display_picture', rememberedUsers[userIndex].displayPicture);
                    }
                } else {
                    localStorage.setItem('macos_remember_account', 'false');
                }
            }
        } catch (err) {
            console.error('Failed to fetch profile status/devices:', err);
        }
    }

    setRememberedAccount(enabled) {
        const identifier = (this.authIdentifier || this.accountUsername || this.accountEmail || this.userEmail || '').trim();
        let users = [];
        try {
            users = JSON.parse(localStorage.getItem('macos_remembered_users') || '[]');
        } catch (e) {
            users = [];
        }

        if (enabled) {
            const existingIndex = users.findIndex(u => 
                (identifier && u.identifier && u.identifier.toLowerCase() === identifier.toLowerCase()) ||
                (this.userId && u.id === this.userId)
            );

            const userProfile = {
                id: (existingIndex !== -1 ? users[existingIndex].id : this.userId) || ('usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)),
                identifier: identifier,
                displayName: this.userName || (identifier ? identifier.split('@')[0] : 'User'),
                displayPicture: this.profilePicture || null,
                isTouchIdEnabled: localStorage.getItem('touchIdEnabled') === 'true',
                role: this.userRole || 'user',
                lastActive: Date.now()
            };

            if (existingIndex !== -1) {
                users[existingIndex] = { ...users[existingIndex], ...userProfile };
            } else {
                users.push(userProfile);
            }

            localStorage.setItem('macos_remembered_users', JSON.stringify(users));
            localStorage.setItem('macos_active_user_id', userProfile.id);
            localStorage.setItem('macos_remember_account', 'true');
            localStorage.setItem('macos_user_identifier', identifier);
            localStorage.setItem('macos_user_display_name', this.userName);
            if (this.profilePicture) {
                localStorage.setItem('macos_user_display_picture', this.profilePicture);
            }
        } else {
            users = users.filter(u => {
                const matchId = this.userId && u.id === this.userId;
                const matchIdent = identifier && u.identifier && u.identifier.toLowerCase() === identifier.toLowerCase();
                return !(matchId || matchIdent);
            });
            localStorage.setItem('macos_remembered_users', JSON.stringify(users));
            localStorage.setItem('macos_remember_account', 'false');

            if (users.length === 0) {
                localStorage.removeItem('macos_remember_account');
                localStorage.removeItem('macos_user_identifier');
                localStorage.removeItem('macos_user_display_name');
                localStorage.removeItem('macos_user_display_picture');
                localStorage.removeItem('macos_active_user_id');
                localStorage.removeItem('touchIdEnabled');
                localStorage.removeItem('touchIdCredId');
            } else {
                localStorage.setItem('macos_active_user_id', users[0].id);
                localStorage.setItem('macos_user_identifier', users[0].identifier);
                if (users[0].displayName) localStorage.setItem('macos_user_display_name', users[0].displayName);
                if (users[0].displayPicture) localStorage.setItem('macos_user_display_picture', users[0].displayPicture);
            }
        }

        window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users } }));
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

                ${(() => {
                    let rememberedUsers = [];
                    try {
                        rememberedUsers = JSON.parse(localStorage.getItem('macos_remembered_users') || '[]');
                    } catch (e) {
                        rememberedUsers = [];
                    }
                    const currentEmail = (this.userEmail || this.accountEmail || '').trim().toLowerCase();
                    const currentUsername = (this.userName || this.accountUsername || '').trim().toLowerCase();
                    const currentAuthId = (this.authIdentifier || '').trim().toLowerCase();
                    const otherAccounts = rememberedUsers.filter(u => {
                        const ident = (u.identifier || '').trim().toLowerCase();
                        const name = (u.displayName || '').trim().toLowerCase();
                        const isCurrent = (currentEmail && ident === currentEmail) || 
                                          (currentUsername && (ident === currentUsername || name === currentUsername)) ||
                                          (currentAuthId && ident === currentAuthId) ||
                                          (this.userId && u.id === this.userId);
                        return !isCurrent;
                    });
                    if (otherAccounts.length === 0) return '';
                    return `
                        <div class="other-accounts-section" style="margin-top: 24px;">
                            <div class="profile-section-label" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 8px 8px;">Other Accounts on this Mac</div>
                            <div class="settings-group" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
                                ${otherAccounts.map((user, idx) => `
                                    <div class="settings-row other-account-item" data-user-id="${this.escapeHtml(user.id || user.identifier)}" data-user-identifier="${this.escapeHtml(user.identifier)}" data-user-name="${this.escapeHtml(user.displayName)}" data-user-pic="${this.escapeHtml(user.displayPicture || '')}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; ${idx > 0 ? 'border-top: 1px solid rgba(255, 255, 255, 0.08);' : ''}">
                                        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                                            <div style="width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.1); border: 1.5px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                                <img src="${this.safeImageUrl(user.displayPicture) || '/assets/Images/DefaultUser.png'}" alt="${this.escapeHtml(user.displayName)}" style="width: 100%; height: 100%; object-fit: cover;">
                                            </div>
                                            <div style="min-width: 0; flex: 1;">
                                                <div style="font-weight: 600; font-size: 0.92rem; color: var(--settings-text, #000); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(user.displayName)}</div>
                                                <div style="font-size: 0.78rem; opacity: 0.65; color: var(--settings-text-secondary, #555); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(user.identifier)}</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 12px;">
                                            <button class="tahoe-action-btn primary-ghost btn-switch-other-account" data-user-identifier="${this.escapeHtml(user.identifier)}" data-user-name="${this.escapeHtml(user.displayName)}" data-user-pic="${this.escapeHtml(user.displayPicture || '')}" style="padding: 5px 12px; font-size: 0.78rem; font-weight: 600; border-radius: 6px; background: rgba(0, 113, 227, 0.2); color: #2997ff; border: 1px solid rgba(0, 113, 227, 0.4); cursor: pointer;">Switch…</button>
                                            <button class="tahoe-action-btn danger-ghost btn-forget-other-account" data-user-id="${this.escapeHtml(user.id || user.identifier)}" data-user-name="${this.escapeHtml(user.displayName)}" title="Forget account on this device" style="padding: 5px 9px; font-size: 0.78rem; border-radius: 6px; background: transparent; color: #ff453a; border: 1px solid rgba(255, 69, 58, 0.3); cursor: pointer;">✕</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                })()}

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
                            
                            const isPWA = device.client_type === 'pwa' || device.device_type?.includes('PWA');
                            const isNativeApp = device.client_type === 'native_android' || device.device_type?.includes('Android App');

                            return `
                            <div class="device-item clickable-device" data-id="${device.id}" style="display: flex; align-items: center; padding: 12px 16px; cursor: pointer; transition: background 0.18s ease; ${idx > 0 ? 'border-top: 1px solid rgba(255, 255, 255, 0.08);' : ''}">
                                <div class="device-icon-wrapper" style="position: relative; width: 34px; height: 34px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; margin-right: 14px; flex-shrink: 0;">
                                    <div class="device-icon">${this.getDeviceIcon(device.device_type, device.client_type)}</div>
                                    ${isOnline ? '<div class="online-indicator" style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #34C759; border: 2px solid rgba(30,30,30,0.85); box-shadow: 0 0 6px #34C759;"></div>' : ''}
                                </div>
                                <div class="device-info" style="flex: 1; min-width: 0;">
                                    <div class="device-name" style="font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(device.device_name)}</span>
                                        ${isPWA ? '<span class="device-platform-badge pwa" style="background: rgba(255, 149, 0, 0.18); color: #ff9500; font-weight: 700; padding: 1px 7px; border-radius: 8px; font-size: 0.65rem; border: 1px solid rgba(255, 149, 0, 0.35);">PWA App</span>' : ''}
                                        ${isNativeApp ? '<span class="device-platform-badge native" style="background: rgba(52, 199, 89, 0.18); color: #34c759; font-weight: 700; padding: 1px 7px; border-radius: 8px; font-size: 0.65rem; border: 1px solid rgba(52, 199, 89, 0.35);">Android App</span>' : ''}
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

    getDeviceIcon(type, clientType) {
        if (clientType === 'pwa' || (type && type.includes('PWA'))) return '🌐📱';
        if (clientType === 'native_android' || (type && (type.includes('Android') || type === 'Mobile Device'))) return '🤖';
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
        this.currentSecurityQuestion = question;
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

                <div class="security-challenge-container">
                    <div class="security-challenge-card">
                        <div class="security-challenge-icon-wrap">
                            <div class="security-challenge-icon">${mode === 'question' ? '🛡️' : mode === 'recovery_key' ? '🔑' : '🔒'}</div>
                        </div>

                        <div class="security-challenge-header">
                            <h3 class="security-challenge-title">
                                ${mode === 'question' ? 'Security Question Challenge' : mode === 'recovery_key' ? 'Emergency Recovery Key' : 'Account Password'}
                            </h3>
                            <p class="security-challenge-subtitle">
                                ${mode === 'question' && hasQuestion 
                                    ? 'Please answer your security question to access security settings.' 
                                    : mode === 'recovery_key' 
                                        ? 'Enter your Emergency Recovery Key to access security settings.' 
                                        : 'Enter your account login password to access Sign-In & Security settings.'}
                            </p>
                        </div>

                        ${mode === 'question' && hasQuestion ? `
                            <div class="security-question-banner">
                                <div class="security-question-label">SECURITY QUESTION</div>
                                <div class="security-question-prompt">${this.escapeHtml(question)}</div>
                            </div>

                            <div class="security-input-group">
                                <label for="challengeAnswer">YOUR ANSWER</label>
                                <div class="security-input-wrapper">
                                    <input type="text" id="challengeAnswer" class="security-text-input" placeholder="Enter your secret answer" autocomplete="off">
                                </div>
                            </div>

                            <div class="form-actions-security">
                                <button class="primary-btn security-action-btn" id="verifyChallenge">
                                    <span>Verify Answer</span>
                                    <i class="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        ` : mode === 'recovery_key' ? `
                            <div class="security-input-group">
                                <label for="challengeRecoveryKey">EMERGENCY RECOVERY KEY</label>
                                <div class="security-input-wrapper">
                                    <input type="password" id="challengeRecoveryKey" class="security-text-input font-mono" placeholder="Enter 24-character recovery key" autocomplete="off">
                                </div>
                            </div>

                            <div class="form-actions-security">
                                <button class="primary-btn security-action-btn" id="verifyRecoveryKey">
                                    <span>Verify Recovery Key</span>
                                    <i class="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        ` : `
                            <div class="security-input-group">
                                <label for="challengePassword">LOGIN PASSWORD</label>
                                <div class="security-input-wrapper">
                                    <input type="password" id="challengePassword" class="security-text-input" placeholder="Enter your password" autocomplete="current-password">
                                </div>
                            </div>

                            <div class="form-actions-security">
                                <button class="primary-btn security-action-btn" id="verifyPassword">
                                    <span>Verify Password</span>
                                    <i class="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        `}

                        <div class="security-modes-switcher">
                            ${hasQuestion && mode !== 'question' ? `
                                <button class="security-mode-tab-btn" id="switchToQuestion">
                                    <i class="fas fa-shield-alt"></i> Use Security Question
                                </button>
                            ` : ''}
                            ${mode !== 'recovery_key' ? `
                                <button class="security-mode-tab-btn" id="switchToRecovery">
                                    <i class="fas fa-key"></i> Use Emergency Recovery Key
                                </button>
                            ` : ''}
                            ${mode !== 'password' ? `
                                <button class="security-mode-tab-btn" id="switchToPassword">
                                    <i class="fas fa-lock"></i> Verify with Password
                                </button>
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

    async handleVerifyChallenge(credentials) {
        const verifyBtn = this.container.querySelector('#verifyChallenge') ||
                          this.container.querySelector('#verifyRecoveryKey') ||
                          this.container.querySelector('#verifyPassword');
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = `<span>Verifying…</span>`;
        }

        try {
            const body = {
                ...credentials,
                identifier: this.authIdentifier || this.accountUsername || this.accountEmail || this.userEmail
            };

            const res = await fetch('/api/auth/verify-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                this.elevationToken = data.sessionId || 'elevated';
                if (credentials.password) {
                    this.activePassword = credentials.password;
                    sessionStorage.setItem('macos_active_password', credentials.password);
                    this.revealedPassword = credentials.password;
                }
                if (credentials.answer) {
                    this.validatedSecurityAnswer = credentials.answer;
                    sessionStorage.setItem('macos_last_verified_answer', credentials.answer);
                }
                this.currentView = 'security';
                this.render();
            } else {
                alert(data.error || 'Verification failed. Please try again.');
            }
        } catch (err) {
            console.error('Challenge verify error:', err);
            alert('Failed to connect to authentication server');
        } finally {
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = `<span>Verify</span><i class="fas fa-arrow-right"></i>`;
            }
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

                <!-- Account Credentials Group -->
                <div class="settings-group settings-group-mt20 account-identity-group">
                    <!-- Username Row -->
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-personal">👤</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Username</span>
                            <span class="settings-row-subtitle">${this.escapeHtml(this.accountUsername || 'Not set')}</span>
                        </div>
                        <div class="row-action">
                            <button class="tahoe-action-btn" id="btnChangeUsername">Change…</button>
                        </div>
                    </div>

                    <!-- Login Email Row -->
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-icloud">✉</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Login Email</span>
                            <span class="settings-row-subtitle">${this.escapeHtml(this.accountEmail || 'Not set')}</span>
                        </div>
                        <div class="row-action">
                            <button class="tahoe-action-btn" id="btnChangeEmail">Change…</button>
                        </div>
                    </div>

                    <!-- Password Row (Integrated View/Hide + Copy + Change) -->
                    <div class="settings-row account-identity-row" id="viewPasswordRow">
                        <div class="settings-row-icon icon-password">🔑</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Password</span>
                            <span class="settings-row-subtitle" id="passwordMaskedText">${this.passwordSet ? (this.revealedPassword ? this.escapeHtml(this.revealedPassword) : '••••••••••••') : 'Not set'}</span>
                        </div>
                        <div class="row-action" style="display: flex; gap: 6px; align-items: center;">
                            ${this.passwordSet ? `
                                ${this.revealedPassword ? `
                                    <button class="tahoe-action-btn" id="btnCopyPassword" title="Copy Password" style="padding: 4px 10px;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                        </svg>
                                        <span id="copyPasswordText">Copy</span>
                                    </button>
                                ` : ''}
                                <button class="tahoe-action-btn" id="btnToggleViewPassword" title="${this.revealedPassword ? 'Hide Password' : 'View Password'}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        ${this.revealedPassword 
                                            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>'
                                            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
                                    </svg>
                                    <span>${this.revealedPassword ? 'Hide' : 'View'}</span>
                                </button>
                                <button class="tahoe-action-btn" id="btnChangePassword" title="Change Password">
                                    <span>Change…</span>
                                </button>
                            ` : `
                                <button class="tahoe-action-btn" id="btnSetupPassword" title="Set Password">
                                    <span>Set Up…</span>
                                </button>
                            `}
                        </div>
                    </div>

                    <!-- Google Account Row -->
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-google">G</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Google Account</span>
                            <span class="settings-row-subtitle">${this.googleLinked ? this.escapeHtml(this.googleEmail || 'Connected') : 'Not Linked'}</span>
                        </div>
                        <div class="row-action" style="display: flex; gap: 6px; align-items: center;">
                            ${this.googleLinked ? `
                                <button class="tahoe-action-btn" id="btnSwitchGoogle" title="Switch Google Account">Switch</button>
                                <button class="tahoe-action-btn danger-ghost" id="btnDisconnectGoogle" title="Disconnect Google">Disconnect</button>
                            ` : `
                                <button class="tahoe-action-btn" id="btnConnectGoogle" title="Connect Google">Connect</button>
                            `}
                        </div>
                    </div>
                </div>
                <p class="group-description">These details identify your account when you sign in.</p>

                <!-- Security & Recovery Group -->
                <div class="settings-group settings-group-mt20">
                    <div class="settings-row account-identity-row">
                        <div class="settings-row-icon icon-question">🛡️</div>
                        <div class="settings-row-label">
                            <span class="settings-row-title">Security Question</span>
                            <span class="settings-row-subtitle">${this.hasSecurityQuestion ? 'Configured (Active)' : 'Not set up'}</span>
                        </div>
                        <div class="row-action">
                            <button class="tahoe-action-btn" id="btnUpdateQuestion">${this.hasSecurityQuestion ? 'Update…' : 'Set Up…'}</button>
                        </div>
                    </div>

                    <div class="settings-row">
                        <div class="settings-row-label">
                            <span class="settings-row-title">Remember This Account</span>
                            <span class="settings-row-subtitle">Show this account on the lock screen</span>
                        </div>
                        <label class="mac-switch">
                            <input type="checkbox" id="rememberAccountToggle"
                                ${localStorage.getItem('macos_remember_account') === 'true' ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>

                    ${this.passwordSet && touchIdAvailable ? `
                    <div class="settings-row">
                        <div class="settings-row-label">
                            <span class="settings-row-title">Touch ID</span>
                            <span class="settings-row-subtitle">Use biometric Touch ID to unlock account</span>
                        </div>
                        <label class="mac-switch">
                            <input type="checkbox" id="touchIdToggle" ${touchIdEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    ` : ''}
                </div>
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

        const btnChangeUser = this.container.querySelector('#btnChangeUsername');
        if (btnChangeUser) {
            btnChangeUser.addEventListener('click', () => this.promptChangeUsername());
        }

        const btnChangeMail = this.container.querySelector('#btnChangeEmail');
        if (btnChangeMail) {
            btnChangeMail.addEventListener('click', () => this.promptChangeEmail());
        }

        const btnToggleViewPass = this.container.querySelector('#btnToggleViewPassword');
        if (btnToggleViewPass) {
            btnToggleViewPass.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.revealedPassword) {
                    this.revealedPassword = null;
                    this.renderSecurityHub();
                    return;
                }

                const cached = this.activePassword || sessionStorage.getItem('macos_active_password');
                if (cached) {
                    this.revealedPassword = cached;
                    this.renderSecurityHub();
                    return;
                }

                // If not cached in browser memory, show secured label without popping up password challenge
                this.revealedPassword = '(Secured by macOS • Click Change to set new password)';
                this.renderSecurityHub();
            });
        }

        const btnCopyPass = this.container.querySelector('#btnCopyPassword');
        if (btnCopyPass) {
            btnCopyPass.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.revealedPassword) {
                    navigator.clipboard.writeText(this.revealedPassword).then(() => {
                        const copyText = this.container.querySelector('#copyPasswordText');
                        if (copyText) {
                            copyText.textContent = 'Copied!';
                            setTimeout(() => { if (copyText) copyText.textContent = 'Copy'; }, 2000);
                        }
                    });
                }
            });
        }

        const btnChangePass = this.container.querySelector('#btnChangePassword');
        if (btnChangePass) {
            btnChangePass.addEventListener('click', () => {
                this.currentView = 'change-password';
                this.render();
            });
        }

        const btnSetupPass = this.container.querySelector('#btnSetupPassword');
        if (btnSetupPass) {
            btnSetupPass.addEventListener('click', () => {
                this.currentView = 'setup-password';
                this.render();
            });
        }

        const btnSwitchG = this.container.querySelector('#btnSwitchGoogle');
        if (btnSwitchG) {
            btnSwitchG.addEventListener('click', () => this.handleGoogleAuth());
        }

        const btnConnG = this.container.querySelector('#btnConnectGoogle');
        if (btnConnG) {
            btnConnG.addEventListener('click', () => this.handleGoogleAuth());
        }

        const btnDiscG = this.container.querySelector('#btnDisconnectGoogle');
        if (btnDiscG) {
            btnDiscG.addEventListener('click', () => this.handleDisconnectGoogle());
        }

        const btnUpdQ = this.container.querySelector('#btnUpdateQuestion');
        if (btnUpdQ) {
            btnUpdQ.addEventListener('click', () => {
                this.currentView = 'update-question';
                this.render();
            });
        }

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

        // Click row to toggle switch
        const toggleRows = this.container.querySelectorAll('.settings-row');
        toggleRows.forEach(row => {
            if (row.querySelector('.mac-switch')) {
                row.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('slider')) {
                        const checkbox = row.querySelector('.mac-switch input');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    }
                });
            }
        });
    }

    async renderTouchIdSetupView() {
        let credentials = [];
        try {
            const res = await fetch('/api/auth/webauthn/credentials');
            if (res.ok) {
                const data = await res.json();
                credentials = data.credentials || [];
            }
        } catch (e) {}

        const credentialsHtml = credentials.length > 0 ? `
            <div style="margin: 20px auto; max-width: 440px; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 16px;">
                <div style="font-size: 11px; font-weight: 700; color: var(--settings-primary, #0071E3); letter-spacing: 0.04em; margin-bottom: 12px;">ACTIVE PASSKEYS & BIOMETRIC KEYS</div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${credentials.map(c => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255, 255, 255, 0.03); border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 20px;">${c.friendly_name?.toLowerCase().includes('mac') ? '💻' : c.friendly_name?.toLowerCase().includes('phone') ? '📱' : '🪪'}</span>
                                <div>
                                    <div style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">${this.escapeHtml(c.friendly_name || 'Passkey')}</div>
                                    <div style="font-size: 11px; color: var(--settings-text-secondary, #888);">${c.credential_device_type === 'multiDevice' ? 'Synced Passkey (iCloud / Google)' : 'Device-bound Passkey'} • Added ${new Date(c.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <button class="delete-passkey-btn" data-id="${this.escapeHtml(c.id)}" style="background: rgba(255, 69, 58, 0.15); border: 1px solid rgba(255, 69, 58, 0.3); color: #ff453a; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; cursor: pointer; font-weight: 500;">Remove</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        this.container.innerHTML = `
            <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Passkeys & Touch ID</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form" style="text-align: center; padding: 24px 16px;">
                        <div class="touchid-setup-header" style="margin-bottom: 20px;">
                            <div class="touchid-setup-icon" style="font-size: 54px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2));">🤚</div>
                            <h3 style="font-size: 1.15rem; font-weight: 600; margin-bottom: 8px; color: var(--settings-text, #fff);">Passkeys & Biometric Sign-In</h3>
                            <p class="challenge-instruction centered-description" style="max-width: 380px; margin: 0 auto; color: var(--settings-text-secondary, #888); font-size: 13px; line-height: 1.45;">
                                Unlock quickly with your fingerprint, Face ID, Windows Hello, or hardware passkey on this and synced devices.
                            </p>
                        </div>
                        
                        <div id="touchIdStatusContainer" style="display: none; margin: 16px auto; max-width: 440px; padding: 12px 14px; border-radius: 8px; font-size: 13px; text-align: left;"></div>

                        ${credentialsHtml}

                        <div class="form-actions form-actions-mt25" style="display: flex; gap: 12px; justify-content: center;">
                            <button class="primary-btn primary-btn-wide" id="confirmTouchSetup" style="max-width: 240px;">${credentials.length > 0 ? '+ Add Another Passkey' : 'Set Up Passkey / Touch ID'}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmTouchSetup', []);

        this.container.querySelectorAll('.delete-passkey-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const credId = btn.getAttribute('data-id');
                if (!confirm('Are you sure you want to remove this passkey?')) return;
                try {
                    const dRes = await fetch(`/api/auth/webauthn/credentials/${encodeURIComponent(credId)}`, {
                        method: 'DELETE'
                    });
                    if (dRes.ok) {
                        this.renderTouchIdSetupView();
                    } else {
                        const dData = await dRes.json().catch(() => ({}));
                        alert(dData.error || 'Failed to remove passkey');
                    }
                } catch (err) {
                    alert('Error removing passkey');
                }
            });
        });
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
                        <p class="challenge-instruction challenge-instruction-left" style="margin-bottom: 18px; color: var(--settings-text-secondary, #666);">
                            Choose a new password for your account. You won't be asked for your old password.
                        </p>
                        <div class="form-row">
                            <label>New Password</label>
                            <div class="password-field-wrapper">
                                <input type="password" id="newPassword" placeholder="Enter new password" autofocus autocomplete="new-password">
                                <button class="profile-password-toggle" data-for="newPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="form-row form-actions-mt25">
                            <label>Verify</label>
                            <div class="password-field-wrapper">
                                <input type="password" id="confirmPassword" placeholder="Confirm new password" autocomplete="new-password">
                                <button class="profile-password-toggle" data-for="confirmPassword">${this.getEyeIcon()}</button>
                            </div>
                        </div>
                        <div class="form-actions form-actions-mt25">
                            <button class="primary-btn" id="confirmChange">Change Password</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupSecurityViewListeners('#confirmChange', ['#newPassword', '#confirmPassword']);
    }

    async renderUpdateQuestionView() {
        if (this.questions.length === 0) {
            const res = await fetch('/api/auth/questions');
            const data = await res.json();
            this.questions = data.questions || [];
        }

        let challengeAnswer = this.validatedSecurityAnswer || sessionStorage.getItem('macos_last_verified_answer') || '';

        try {
            const cRes = await fetch('/api/auth/challenge');
            const cData = await cRes.json();
            if (cData.question) this.currentSecurityQuestion = cData.question;
            if (cData.answer) {
                challengeAnswer = cData.answer;
                this.validatedSecurityAnswer = cData.answer;
                sessionStorage.setItem('macos_last_verified_answer', cData.answer);
            }
        } catch (e) {}

        const savedAnswer = challengeAnswer;

        this.container.innerHTML = `
           <div class="profile-container">
                <div class="subview-header">
                    <button class="back-button" id="backToHub">◀ Sign-In & Security</button>
                    <h2 class="subview-title">Update Security Question</h2>
                </div>
                <div class="settings-group">
                    <div class="security-form">
                        <!-- Current Security Question & Answer Box -->
                        <div class="current-security-info-box" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; text-align: left;">
                            <div style="font-size: 11px; font-weight: 700; color: var(--settings-primary, #0071E3); letter-spacing: 0.04em; margin-bottom: 6px;">CURRENT SECURITY QUESTION</div>
                            <div style="font-size: 13.5px; font-weight: 600; color: var(--settings-text, #fff); margin-bottom: 10px;">${this.escapeHtml(this.currentSecurityQuestion || 'In what city were you born?')}</div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--settings-text-secondary, #888); letter-spacing: 0.04em; margin-bottom: 4px;">CURRENT SECRET ANSWER</div>
                            <div style="font-size: 13px; color: var(--settings-text, #fff); display: flex; align-items: center; justify-content: space-between;">
                                <span id="currentAnswerDisplay" style="font-family: monospace; font-weight: 600; color: var(--settings-primary, #0071E3);">${savedAnswer ? this.escapeHtml(savedAnswer) : 'Not configured'}</span>
                                ${savedAnswer ? `
                                    <span style="font-size: 11px; color: #34C759; font-weight: 600;">✓ Active</span>
                                ` : ''}
                            </div>
                        </div>

                        <label class="section-label-dim">CHOOSE NEW QUESTION</label>
                        <select id="newQuestion" class="settings-select-wide">
                            <option value="">Select a question...</option>
                            ${this.questions.map(q => `<option value="${this.escapeHtml(q)}" ${q === this.currentSecurityQuestion ? 'selected' : ''}>${this.escapeHtml(q)}</option>`).join('')}
                        </select>
                        <label class="section-label-dim" style="margin-top: 14px;">NEW SECRET ANSWER</label>
                        <input type="text" id="newAnswer" value="${this.escapeHtml(savedAnswer)}" placeholder="Enter your secret answer" class="settings-input-wide" autocomplete="off">
                        <div class="form-actions form-actions-mt25">
                            <button class="primary-btn" id="confirmUpdateQuestion">Save Security Question</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

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
        const btn = this.container.querySelector('#confirmTouchSetup');
        const statusBox = this.container.querySelector('#touchIdStatusContainer');
        
        const showStatus = (title, message, type = 'error') => {
            if (!statusBox) {
                alert(`${title}: ${message}`);
                return;
            }
            statusBox.style.display = 'block';
            if (type === 'error') {
                statusBox.style.background = 'rgba(255, 69, 58, 0.15)';
                statusBox.style.border = '1px solid rgba(255, 69, 58, 0.3)';
                statusBox.style.color = '#ff453a';
            } else if (type === 'warning') {
                statusBox.style.background = 'rgba(255, 159, 10, 0.15)';
                statusBox.style.border = '1px solid rgba(255, 159, 10, 0.3)';
                statusBox.style.color = '#ff9f0a';
            } else if (type === 'success') {
                statusBox.style.background = 'rgba(52, 199, 89, 0.15)';
                statusBox.style.border = '1px solid rgba(52, 199, 89, 0.3)';
                statusBox.style.color = '#34c759';
            }
            statusBox.innerHTML = `<strong>${this.escapeHtml(title)}</strong><div style="margin-top: 4px; font-size: 12px; opacity: 0.9;">${this.escapeHtml(message)}</div>`;
        };

        if (!window.PublicKeyCredential) {
            showStatus('Touch ID Unavailable', 'Biometric authentication is not supported by your browser or device.', 'error');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Follow Prompt…';
        }

        try {
            const optionsRes = await fetch('/api/auth/webauthn/registration-options');
            if (!optionsRes.ok) {
                const errData = await optionsRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Unable to prepare Touch ID setup');
            }
            const optionsData = await optionsRes.json();
            const options = prepareRegistrationOptions(optionsData);

            if (window._profileWebAuthnAbort) {
                try { window._profileWebAuthnAbort.abort('New request'); } catch (e) {}
            }
            window._profileWebAuthnAbort = new AbortController();

            const credential = await navigator.credentials.create({
                publicKey: options,
                signal: window._profileWebAuthnAbort.signal
            });

            if (credential) {
                const friendlyName = navigator.userAgent.includes('Macintosh') ? 'Touch ID (MacBook)' :
                                     navigator.userAgent.includes('Windows') ? 'Windows Hello' :
                                     navigator.userAgent.includes('iPhone') ? 'iCloud Keychain (iPhone)' :
                                     navigator.userAgent.includes('Android') ? 'Android Passkey' : 'Device Passkey';

                const verifyRes = await fetch('/api/auth/webauthn/registration-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...serializeCredential(credential),
                        friendlyName
                    })
                });
                if (!verifyRes.ok) {
                    const vData = await verifyRes.json().catch(() => ({}));
                    throw new Error(vData.error || 'Passkey registration was not verified');
                }

                localStorage.setItem('touchIdEnabled', 'true');
                showStatus('✓ Passkey Configured', 'Your passkey is configured and active for this device.', 'success');
                if (btn) {
                    btn.textContent = '✓ Configured';
                    btn.style.background = '#34c759';
                }
                setTimeout(() => {
                    this.renderTouchIdSetupView();
                }, 1000);
            }
        } catch (err) {
            console.error('Touch ID setup error:', err);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Retry Touch ID Setup';
            }
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                showStatus('Passkey Setup Cancelled', 'The passkey prompt was cancelled or dismissed.', 'info');
            } else if (err.name === 'InvalidStateError') {
                localStorage.setItem('touchIdEnabled', 'true');
                showStatus('✓ Touch ID Active', 'Touch ID is recognized and active for this device.', 'success');
                if (btn) {
                    btn.textContent = '✓ Configured';
                    btn.style.background = '#34c759';
                }
                setTimeout(() => {
                    this.currentView = 'security';
                    this.render();
                }, 1200);
            } else {
                showStatus('Passkey Setup Failed', err.message || 'An error occurred during passkey configuration.', 'error');
            }
        } finally {
            window._profileWebAuthnAbort = null;
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
        const newPassword = this.container.querySelector('#newPassword')?.value;
        const confirmPassword = this.container.querySelector('#confirmPassword')?.value;

        if (!newPassword) {
            alert('Please enter a new password');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (this.elevationToken) headers['Authorization'] = `Bearer ${this.elevationToken}`;

        try {
            const res = await fetch('/api/auth/update-security', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ newPassword })
            });

            if (res.ok) {
                this.activePassword = newPassword;
                sessionStorage.setItem('macos_active_password', newPassword);
                this.revealedPassword = newPassword;
                alert('✓ Password changed successfully');
                this.currentView = 'security';
                this.render();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to change password');
            }
        } catch (e) {
            alert('Failed to connect to server');
        }
    }

    async handleConfirmUpdateQuestion() {
        const securityQuestion = this.container.querySelector('#newQuestion')?.value;
        const securityAnswer = this.container.querySelector('#newAnswer')?.value;

        if (!securityQuestion || !securityAnswer) {
            alert('Please select a question and provide an answer');
            return;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (this.elevationToken) headers['Authorization'] = `Bearer ${this.elevationToken}`;

        try {
            const res = await fetch('/api/auth/update-security', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ securityQuestion, securityAnswer })
            });

            if (res.ok) {
                alert('✓ Security question updated');
                this.hasSecurityQuestion = true;
                this.currentSecurityQuestion = securityQuestion;
                this.validatedSecurityAnswer = securityAnswer;
                sessionStorage.setItem('macos_last_verified_answer', securityAnswer);
                this.currentView = 'security';
                this.elevationToken = null;
                this.render();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update question');
            }
        } catch (e) {
            alert('Failed to connect to server');
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
                if (answer) {
                    this.validatedSecurityAnswer = answer;
                    sessionStorage.setItem('macos_last_verified_answer', answer);
                }
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
                    <div class="device-detail-icon" style="font-size: 56px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));">${this.getDeviceIcon(device.device_type, device.client_type)}</div>
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
                        <div class="settings-row-value">${this.escapeHtml(device.device_name)}</div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Platform</strong></div>
                        <div class="settings-row-value">${this.escapeHtml(device.device_type)}</div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Client Application</strong></div>
                        <div class="settings-row-value">
                            ${(device.client_type === 'pwa' || device.device_type?.includes('PWA')) 
                                ? '<span style="color: #ff9500; font-weight: 600;">📱 Progressive Web App (PWA)</span>' 
                                : (device.client_type === 'native_android' || device.device_type?.includes('Android App')) 
                                ? '<span style="color: #34c759; font-weight: 600;">🤖 Native Android App (Kotlin)</span>' 
                                : '<span style="color: #0071e3; font-weight: 600;">💻 Web Browser</span>'}
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-row-label"><strong>Last Activity</strong></div>
                        <div class="settings-row-value">${this.escapeHtml(this.formatDeviceDate(device.last_seen || device.last_login))}</div>
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

        // Switch other account listeners
        const switchBtns = this.container.querySelectorAll('.btn-switch-other-account');
        switchBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ident = btn.getAttribute('data-user-identifier');
                const name = btn.getAttribute('data-user-name');
                const pic = btn.getAttribute('data-user-pic');
                this.promptSwitchAccountModal({ identifier: ident, displayName: name, displayPicture: pic });
            });
        });

        // Forget other account listeners
        const forgetBtns = this.container.querySelectorAll('.btn-forget-other-account');
        forgetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                if (userId && confirm(`Remove "${userName}" from this device?`)) {
                    let users = [];
                    try {
                        users = JSON.parse(localStorage.getItem('macos_remembered_users') || '[]');
                    } catch (err) {}
                    users = users.filter(u => u.id !== userId && u.identifier !== userId);
                    localStorage.setItem('macos_remembered_users', JSON.stringify(users));
                    window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users } }));
                    window.dispatchEvent(new CustomEvent('macos-profile-updated'));
                    this.renderMainView();
                }
            });
        });
    }

    promptSwitchAccountModal(user) {
        const existingModal = document.getElementById('accountSwitchModal');
        if (existingModal) existingModal.remove();

        const pic = this.safeImageUrl(user.displayPicture) || '/assets/Images/DefaultUser.png';
        const modal = document.createElement('div');
        modal.id = 'accountSwitchModal';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; z-index: 2147483647;';

        modal.innerHTML = `
            <div style="background: rgba(30, 30, 32, 0.95); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 18px; padding: 24px; width: 340px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); text-align: center; color: white;">
                <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; margin: 0 auto 12px; border: 2px solid rgba(255, 255, 255, 0.4); box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
                    <img src="${pic}" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div style="font-weight: 700; font-size: 1.18rem; margin-bottom: 2px;">${this.escapeHtml(user.displayName)}</div>
                <div style="font-size: 0.8rem; opacity: 0.65; margin-bottom: 18px;">${this.escapeHtml(user.identifier)}</div>
                <div style="margin-bottom: 18px; text-align: left;">
                    <input type="password" id="switchAccountPasswordInput" placeholder="Enter Password" style="width: 100%; padding: 10px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: white; font-size: 0.95rem; outline: none; box-sizing: border-box;">
                    <div id="switchAccountErrorDiv" style="color: #ff453a; font-size: 0.8rem; margin-top: 6px; display: none;"></div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancelSwitchAccountBtn" style="padding: 8px 16px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); color: white; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 500;">Cancel</button>
                    <button id="confirmSwitchAccountBtn" style="padding: 8px 16px; border-radius: 8px; background: #0071e3; color: white; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Sign In & Switch</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const passInput = modal.querySelector('#switchAccountPasswordInput');
        const errorDiv = modal.querySelector('#switchAccountErrorDiv');
        const cancelBtn = modal.querySelector('#cancelSwitchAccountBtn');
        const confirmBtn = modal.querySelector('#confirmSwitchAccountBtn');

        setTimeout(() => passInput?.focus(), 100);

        const closeModal = () => modal.remove();
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const submit = async () => {
            const password = passInput.value.trim();
            if (!password) {
                errorDiv.textContent = 'Please enter your password';
                errorDiv.style.display = 'block';
                return;
            }
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Authenticating…';
            errorDiv.style.display = 'none';

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identifier: user.identifier,
                        password: password
                    })
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Authentication failed');
                }

                // Update active profile
                localStorage.setItem('macos_active_user_id', data.user.id);
                localStorage.setItem('macos_user_identifier', data.user.email || data.user.username);
                localStorage.setItem('macos_user_display_name', data.user.full_name || data.user.username);
                if (user.displayPicture) {
                    localStorage.setItem('macos_user_display_picture', user.displayPicture);
                }

                let users = [];
                try {
                    users = JSON.parse(localStorage.getItem('macos_remembered_users') || '[]');
                } catch (err) {}
                const idx = users.findIndex(u => u.id === data.user.id || u.identifier === user.identifier);
                if (idx !== -1) {
                    users[idx].lastActive = Date.now();
                    localStorage.setItem('macos_remembered_users', JSON.stringify(users));
                }

                window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users } }));
                window.dispatchEvent(new CustomEvent('macos-profile-updated'));

                window.location.reload();
            } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Sign In & Switch';
                errorDiv.textContent = err.message || 'Incorrect password. Please try again.';
                errorDiv.style.display = 'block';
            }
        };

        confirmBtn.addEventListener('click', submit);
        passInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') closeModal();
        });
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
            <div class="profile-container tahoe-personal-container">
                <div class="subview-header">
                    <button class="back-button" id="backToMain">◀ Apple Account</button>
                    <h2 class="subview-title">Personal Information</h2>
                    <div class="subview-header-actions">
                        <span id="personalInfoStatusBadge" class="save-status-badge">✓ Saved</span>
                    </div>
                </div>

                <div class="personal-info-card">
                    <!-- Profile Picture Section -->
                    <div class="tahoe-avatar-section">
                        <div class="tahoe-avatar-wrap" id="avatarEditTrigger" title="Click to view, change, or choose Google picture">
                            <img src="${this.safeImageUrl(this.profilePicture) || '/assets/Images/DefaultUser.png'}" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img" style="width: 100%; height: 100%; object-fit: cover;">
                            <div class="avatar-edit-overlay">Edit</div>
                        </div>
                        <input type="file" id="profileImageInput" accept="image/*" style="display: none;">
                        <span class="tahoe-avatar-hint">Click photo to upload or switch to Google picture</span>
                    </div>

                    <!-- Unified Name Field with Autosave -->
                    <div class="tahoe-form-group">
                        <div class="tahoe-field-row">
                            <label class="tahoe-field-label">FULL NAME</label>
                            <input type="text" id="editFullName" class="tahoe-field-input" value="${this.escapeHtml(this.userName || '')}"
                                placeholder="Enter your full name" autocomplete="name">
                        </div>
                    </div>
                    ${this.googleLinked && this.googleName && this.userName !== this.googleName ? `
                        <div id="resetGoogleNameWrap" style="margin: -8px 0 14px 6px; text-align: left;">
                            <button class="tahoe-text-link-btn" id="btnResetGoogleName" title="Reset name to Google account name">
                                <span>↻ Use Google Name ("${this.escapeHtml(this.googleName)}")</span>
                            </button>
                        </div>
                    ` : ''}

                    <!-- Connected Google Services -->
                    <div class="tahoe-section-heading">CONNECTED SERVICES</div>
                    <div class="tahoe-service-row" id="googleAccountRow">
                        <div class="tahoe-service-left">
                            <div class="tahoe-service-icon-wrap">
                                <svg width="18" height="18" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
                                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.39 7.35 24 12 24Z"/>
                                    <path fill="#FBBC05" d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.58H1.26a11.99 11.99 0 0 0 0 10.84l4.02-3.15Z"/>
                                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.61 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
                                </svg>
                            </div>
                            <div class="tahoe-service-meta">
                                <span class="tahoe-service-title">Google Account</span>
                                <span class="tahoe-service-status ${this.googleLinked ? 'status-linked' : ''}">
                                    ${this.googleLinked ? `● Connected (${this.escapeHtml(this.googleEmail || '')})` : '○ Not Linked'}
                                </span>
                            </div>
                        </div>
                        <div class="row-action row-actions-flex">
                            ${this.googleLinked ? `
                                <button class="tahoe-action-btn" id="btnSyncGoogle" title="Re-sync name and photo from Google">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="sync-spin-icon">
                                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                    </svg>
                                    <span>Re-sync</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Account Credentials & Security Shortcuts -->
                    <div class="tahoe-section-heading">ACCOUNT CREDENTIALS & SECURITY</div>
                    <div class="tahoe-form-group">
                        <div class="tahoe-shortcut-row" id="shortcutUsername" title="Manage in Sign-In & Security" style="cursor: pointer;">
                            <div class="tahoe-shortcut-left">
                                <span class="tahoe-shortcut-icon">👤</span>
                                <div class="tahoe-shortcut-meta">
                                    <span class="tahoe-shortcut-title">Username</span>
                                    <span class="tahoe-shortcut-val">${this.escapeHtml(this.accountUsername || 'Not set')}</span>
                                </div>
                            </div>
                            <span class="tahoe-shortcut-chevron" style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #0071E3;">
                                <span>🔒 Manage in Security</span> ➜
                            </span>
                        </div>
                        <div class="tahoe-shortcut-row" id="shortcutEmail" title="Manage in Sign-In & Security" style="cursor: pointer;">
                            <div class="tahoe-shortcut-left">
                                <span class="tahoe-shortcut-icon">✉</span>
                                <div class="tahoe-shortcut-meta">
                                    <span class="tahoe-shortcut-title">Login Email</span>
                                    <span class="tahoe-shortcut-val">${this.escapeHtml(this.accountEmail || 'Not set')}</span>
                                </div>
                            </div>
                            <span class="tahoe-shortcut-chevron" style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #0071E3;">
                                <span>🔒 Manage in Security</span> ➜
                            </span>
                        </div>
                        <div class="tahoe-shortcut-row" id="shortcutPassword" title="Manage in Sign-In & Security" style="cursor: pointer;">
                            <div class="tahoe-shortcut-left">
                                <span class="tahoe-shortcut-icon">🔑</span>
                                <div class="tahoe-shortcut-meta">
                                    <span class="tahoe-shortcut-title">Password & Sign-In</span>
                                    <span class="tahoe-shortcut-val">${this.passwordSet ? 'Configured' : 'Not set up'}</span>
                                </div>
                            </div>
                            <span class="tahoe-shortcut-chevron" style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #0071E3;">
                                <span>🔒 Manage in Security</span> ➜
                            </span>
                        </div>
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
            e.stopPropagation();
            this.showProfilePicOptions(e);
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleImageUpload(file);
        });

        const nameInput = this.container.querySelector('#editFullName');
        let autoSaveTimer = null;

        const triggerAutosave = () => {
            const badge = this.container.querySelector('#personalInfoStatusBadge');
            if (badge) {
                badge.className = 'save-status-badge saving';
                badge.textContent = 'Saving…';
            }
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(async () => {
                const nameVal = (nameInput ? nameInput.value.trim() : '') || this.userName;
                this.userName = nameVal;
                this.localName = nameVal;

                const payload = {
                    full_name: this.userName,
                    display_name: this.userName,
                    email_id: this.accountEmail || this.userEmail || this.localEmail,
                    email: this.accountEmail || this.userEmail || this.localEmail,
                    username: this.accountUsername,
                    profile_picture: this.profilePicture,
                    picture_source: this.pictureSource || 'local',
                    name_source: this.nameSource || 'local'
                };

                try {
                    const res = await fetch('/api/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        this.updateSidebarDOM(this.userName, this.profilePicture);
                        if (localStorage.getItem('macos_remember_account') === 'true') {
                            localStorage.setItem('macos_user_display_name', this.userName);
                        }
                        window.dispatchEvent(new CustomEvent('macos-profile-updated', {
                            detail: {
                                name: this.userName,
                                picture: this.profilePicture,
                                email: this.accountEmail || this.userEmail,
                                username: this.accountUsername
                            }
                        }));
                        if (badge) {
                            badge.className = 'save-status-badge';
                            badge.textContent = '✓ Saved';
                        }
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        console.error('[Autosave Failed] HTTP', res.status, res.statusText, errData);
                        if (badge) {
                            badge.className = 'save-status-badge dirty';
                            badge.textContent = `● Save Failed (${errData.error || res.status})`;
                        }
                    }
                } catch (e) {
                    console.error('[Autosave Exception]', e);
                    if (badge) {
                        badge.className = 'save-status-badge dirty';
                        badge.textContent = `● Error (${e.message || 'Exception'})`;
                    }
                }
            }, 500);
        };

        if (nameInput) {
            nameInput.addEventListener('input', triggerAutosave);
        }

        const btnResetGoogle = this.container.querySelector('#btnResetGoogleName');
        if (btnResetGoogle) {
            btnResetGoogle.addEventListener('click', () => {
                if (nameInput && this.googleName) {
                    nameInput.value = this.googleName;
                    this.userName = this.googleName;
                    const wrap = this.container.querySelector('#resetGoogleNameWrap');
                    if (wrap) wrap.remove();
                    triggerAutosave();
                }
            });
        }

        const btnSync = this.container.querySelector('#btnSyncGoogle');
        if (btnSync) {
            btnSync.addEventListener('click', async () => {
                const icon = btnSync.querySelector('.sync-spin-icon');
                if (icon) icon.style.animation = 'syncSpin 0.7s linear infinite';
                btnSync.disabled = true;
                try {
                    await this.handleGoogleAuth();
                } finally {
                    if (icon) icon.style.animation = '';
                    btnSync.disabled = false;
                }
            });
        }

        // Shortcut rows - securely route through security challenge gateway before opening Sign-In & Security
        const navigateToSecurityGateway = () => {
            if (this.passwordSet || this.hasSecurityQuestion) {
                this.currentView = 'security-challenge';
            } else {
                this.currentView = 'security';
            }
            this.render();
        };

        const scUsername = this.container.querySelector('#shortcutUsername');
        if (scUsername) {
            scUsername.addEventListener('click', navigateToSecurityGateway);
        }

        const scEmail = this.container.querySelector('#shortcutEmail');
        if (scEmail) {
            scEmail.addEventListener('click', navigateToSecurityGateway);
        }

        const scPassword = this.container.querySelector('#shortcutPassword');
        if (scPassword) {
            scPassword.addEventListener('click', navigateToSecurityGateway);
        }
        
        // Listen for Google Auth success message from popup
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type === 'GOOGLE_LINK_SUCCESS' || event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                this.fetchStatus().then(() => this.render());
            }
        });
    }

    updateSidebarDOM(name, picture) {
        const sidebar = document.querySelector('.settings-sidebar');
        if (!sidebar) return;
        const avatarEl = sidebar.querySelector('.sidebar-avatar');
        const nameEl = sidebar.querySelector('.sidebar-name');
        if (name && nameEl) {
            nameEl.textContent = name;
        }
        if (avatarEl) {
            if (picture) {
                avatarEl.innerHTML = `<img src="${this.safeImageUrl(picture)}" alt="Profile" class="sidebar-avatar-img">`;
                avatarEl.style.background = 'transparent';
            } else {
                avatarEl.innerHTML = `👤`;
                avatarEl.style.background = '';
            }
        }
    }

    hasUnsavedChanges() {
        return false;
    }

    promptUnsavedChanges(onProceed) {
        if (typeof onProceed === 'function') onProceed();
        return Promise.resolve(true);
    }

    async saveProfilePictureDirect(picture, source = 'local') {
        const badge = this.container?.querySelector('#personalInfoStatusBadge');
        if (badge) {
            badge.className = 'save-status-badge saving';
            badge.textContent = 'Saving…';
        }
        try {
            const res = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: this.userName,
                    display_name: this.userName,
                    email_id: this.accountEmail || this.userEmail || this.localEmail,
                    email: this.accountEmail || this.userEmail || this.localEmail,
                    username: this.accountUsername,
                    profile_picture: picture,
                    picture_source: source,
                    name_source: this.nameSource || 'local'
                })
            });
            if (res.ok) {
                this.updateSidebarDOM(this.userName, picture);
                if (localStorage.getItem('macos_remember_account') === 'true') {
                    localStorage.setItem('macos_user_display_picture', picture);
                }
                window.dispatchEvent(new CustomEvent('macos-profile-updated', {
                    detail: {
                        name: this.userName,
                        picture: picture,
                        email: this.accountEmail || this.userEmail,
                        username: this.accountUsername
                    }
                }));
                if (badge) {
                    badge.className = 'save-status-badge';
                    badge.textContent = '✓ Saved';
                }
            }
        } catch (e) {
            console.error('Save picture direct error:', e);
        }
    }

    promptAuthenticateForPassword(onSuccess) {
        const existing = document.querySelector('.unsaved-changes-dialog-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'unsaved-changes-dialog-overlay';
        overlay.innerHTML = `
            <div class="unsaved-changes-dialog tahoe-auth-dialog" style="max-width: 390px;">
                <div class="unsaved-warning-icon">🔒</div>
                <div class="unsaved-title">View Account Password</div>
                <div class="unsaved-message" style="margin-bottom: 14px;">
                    Enter your account login password to reveal your saved password.
                </div>
                <div class="security-input-group" style="margin-bottom: 14px; text-align: left;">
                    <label for="authModalPassword" style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: var(--settings-text-secondary, #888); margin-bottom: 5px; display: block;">PASSWORD</label>
                    <div class="security-input-wrapper">
                        <input type="password" id="authModalPassword" class="security-text-input" placeholder="Enter password" autocomplete="current-password" autofocus>
                    </div>
                    <div id="authModalError" style="display: none; color: #FF453A; font-size: 11.5px; margin-top: 6px;"></div>
                </div>
                <div class="unsaved-buttons">
                    <button class="secondary-btn" id="cancelAuthModal">Cancel</button>
                    <button class="primary-btn" id="confirmAuthModal">Unlock</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const passInput = overlay.querySelector('#authModalPassword');
        const errDiv = overlay.querySelector('#authModalError');
        const confirmBtn = overlay.querySelector('#confirmAuthModal');
        const cancelBtn = overlay.querySelector('#cancelAuthModal');

        const close = () => {
            if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        };

        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const handleVerify = async () => {
            const pwd = passInput.value;
            if (!pwd) {
                errDiv.textContent = 'Please enter your password';
                errDiv.style.display = 'block';
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Verifying…';
            errDiv.style.display = 'none';

            try {
                const res = await fetch('/api/auth/challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    close();
                    if (typeof onSuccess === 'function') onSuccess(pwd);
                } else {
                    errDiv.textContent = data.error || 'Incorrect password';
                    errDiv.style.display = 'block';
                    passInput.value = '';
                    passInput.focus();
                }
            } catch (e) {
                errDiv.textContent = 'Failed to connect to server';
                errDiv.style.display = 'block';
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Unlock';
            }
        };

        confirmBtn.addEventListener('click', handleVerify);
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleVerify();
        });

        setTimeout(() => passInput.focus(), 150);
    }

    promptChangeUsername() {
        const existing = document.querySelector('.unsaved-changes-dialog-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'unsaved-changes-dialog-overlay';
        overlay.innerHTML = `
            <div class="unsaved-changes-dialog tahoe-auth-dialog" style="max-width: 400px;">
                <div class="unsaved-warning-icon">👤</div>
                <div class="unsaved-title">Change Username</div>
                <div class="unsaved-message" style="margin-bottom: 14px;">
                    Choose a new username to identify your account across MacOS.
                </div>
                <div class="security-input-group" style="margin-bottom: 14px; text-align: left;">
                    <label for="newUsernameInput" style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: var(--settings-text-secondary, #888); margin-bottom: 5px; display: block;">NEW USERNAME</label>
                    <div class="security-input-wrapper">
                        <input type="text" id="newUsernameInput" class="security-text-input" value="${this.escapeHtml(this.accountUsername || '')}" placeholder="Enter new username" autocomplete="off" autofocus>
                    </div>
                    <div id="usernameCheckStatus" style="display: none; font-size: 11.5px; margin-top: 6px;"></div>
                </div>
                <div class="unsaved-buttons">
                    <button class="secondary-btn" id="cancelUsernameModal">Cancel</button>
                    <button class="primary-btn" id="confirmUsernameModal">Update Username</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const uInput = overlay.querySelector('#newUsernameInput');
        const statusDiv = overlay.querySelector('#usernameCheckStatus');
        const confirmBtn = overlay.querySelector('#confirmUsernameModal');
        const cancelBtn = overlay.querySelector('#cancelUsernameModal');

        const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        let checkTimer = null;
        uInput.addEventListener('input', () => {
            if (checkTimer) clearTimeout(checkTimer);
            const val = uInput.value.trim();
            if (!val || val === this.accountUsername) {
                statusDiv.style.display = 'none';
                return;
            }
            checkTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(val)}`);
                    const data = await res.json();
                    if (data.available) {
                        statusDiv.style.color = '#34C759';
                        statusDiv.textContent = '✓ Username is available';
                    } else {
                        statusDiv.style.color = '#FF453A';
                        statusDiv.textContent = data.reason || 'Username is not available';
                    }
                    statusDiv.style.display = 'block';
                } catch (e) {}
            }, 300);
        });

        const handleSave = async () => {
            const val = uInput.value.trim();
            if (!val) {
                statusDiv.style.color = '#FF453A';
                statusDiv.textContent = 'Please enter a username';
                statusDiv.style.display = 'block';
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Updating…';

            try {
                const res = await fetch('/api/auth/update-security', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: val })
                });
                const data = await res.json();
                if (res.ok) {
                    this.accountUsername = val;
                    this.authIdentifier = val;
                    close();
                    await this.fetchStatus();
                    this.renderSecurityHub();
                } else {
                    statusDiv.style.color = '#FF453A';
                    statusDiv.textContent = data.error || 'Failed to update username';
                    statusDiv.style.display = 'block';
                }
            } catch (e) {
                statusDiv.style.color = '#FF453A';
                statusDiv.textContent = 'Failed to connect to server';
                statusDiv.style.display = 'block';
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Update Username';
            }
        };

        confirmBtn.addEventListener('click', handleSave);
        uInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSave(); });
        setTimeout(() => uInput.focus(), 150);
    }

    promptChangeEmail() {
        const existing = document.querySelector('.unsaved-changes-dialog-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'unsaved-changes-dialog-overlay';
        overlay.innerHTML = `
            <div class="unsaved-changes-dialog tahoe-auth-dialog" style="max-width: 400px;">
                <div class="unsaved-warning-icon">✉</div>
                <div class="unsaved-title">Change Login Email</div>
                <div class="unsaved-message" style="margin-bottom: 14px;">
                    Enter your new email address for account sign-in and recovery.
                </div>
                <div class="security-input-group" style="margin-bottom: 14px; text-align: left;">
                    <label for="newEmailInput" style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: var(--settings-text-secondary, #888); margin-bottom: 5px; display: block;">NEW LOGIN EMAIL</label>
                    <div class="security-input-wrapper">
                        <input type="email" id="newEmailInput" class="security-text-input" value="${this.escapeHtml(this.accountEmail || '')}" placeholder="name@example.com" autocomplete="email" autofocus>
                    </div>
                    <div id="emailCheckStatus" style="display: none; color: #FF453A; font-size: 11.5px; margin-top: 6px;"></div>
                </div>
                <div class="unsaved-buttons">
                    <button class="secondary-btn" id="cancelEmailModal">Cancel</button>
                    <button class="primary-btn" id="confirmEmailModal">Update Email</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const eInput = overlay.querySelector('#newEmailInput');
        const statusDiv = overlay.querySelector('#emailCheckStatus');
        const confirmBtn = overlay.querySelector('#confirmEmailModal');
        const cancelBtn = overlay.querySelector('#cancelEmailModal');

        const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const handleSave = async () => {
            const val = eInput.value.trim();
            if (!val || !val.includes('@')) {
                statusDiv.textContent = 'Please enter a valid email address';
                statusDiv.style.display = 'block';
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Updating…';

            try {
                const res = await fetch('/api/auth/update-security', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: val })
                });
                const data = await res.json();
                if (res.ok) {
                    this.accountEmail = val;
                    this.userEmail = val;
                    close();
                    await this.fetchStatus();
                    this.renderSecurityHub();
                } else {
                    statusDiv.textContent = data.error || 'Failed to update email';
                    statusDiv.style.display = 'block';
                }
            } catch (e) {
                statusDiv.textContent = 'Failed to connect to server';
                statusDiv.style.display = 'block';
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Update Email';
            }
        };

        confirmBtn.addEventListener('click', handleSave);
        eInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSave(); });
        setTimeout(() => eInput.focus(), 150);
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
            const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await this.fetchStatus();
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

        const hasAnyPic = !!this.profilePicture;
        const popover = document.createElement('div');
        popover.className = 'profile-pic-popover';

        let itemsHtml = '';
        if (hasAnyPic) {
            itemsHtml += `<div class="popover-item" id="optViewPic">View Profile Picture</div>`;
            itemsHtml += `<div class="popover-item" id="optChangePic">Change Profile Picture...</div>`;
            itemsHtml += `<div class="popover-item danger" id="optRemovePic">Remove Profile Picture</div>`;
        } else {
            itemsHtml += `<div class="popover-item" id="optChangePic">Upload Profile Picture...</div>`;
        }

        if (this.googleLinked || this.googlePicture) {
            itemsHtml += `
                <div class="popover-divider"></div>
                <div class="popover-item ${this.pictureSource === 'local' ? 'selected' : ''}" id="optSourceLocal">Use Local Photo</div>
                <div class="popover-item ${this.pictureSource === 'google' ? 'selected' : ''}" id="optSourceGoogle">Use Google Photo</div>
            `;
        }

        popover.innerHTML = itemsHtml;

        const avatarSection = this.container.querySelector('.avatar-edit-section');
        if (avatarSection) {
            avatarSection.style.position = 'relative';
            avatarSection.appendChild(popover);
            popover.style.top = '100%';
            popover.style.left = '50%';
            popover.style.transform = 'translateX(-50%)';
            popover.style.marginTop = '8px';
        } else {
            this.container.appendChild(popover);
        }

        // Listeners for popover
        const optLocal = popover.querySelector('#optSourceLocal');
        if (optLocal) {
            optLocal.addEventListener('click', () => {
                this.pictureSource = 'local';
                this.profilePicture = this.localPicture;
                const preview = this.container.querySelector('#profileImagePreview');
                if (preview) preview.src = this.safeImageUrl(this.profilePicture) || '/assets/Images/DefaultUser.png';
                this.saveProfilePictureDirect(this.profilePicture, 'local');
                popover.remove();
            });
        }

        const optGoogle = popover.querySelector('#optSourceGoogle');
        if (optGoogle) {
            optGoogle.addEventListener('click', () => {
                this.pictureSource = 'google';
                this.profilePicture = this.googlePicture || this.localPicture;
                const preview = this.container.querySelector('#profileImagePreview');
                if (preview) preview.src = this.safeImageUrl(this.profilePicture) || '/assets/Images/DefaultUser.png';
                this.saveProfilePictureDirect(this.profilePicture, 'google');
                popover.remove();
            });
        }

        const optView = popover.querySelector('#optViewPic');
        if (optView) {
            optView.addEventListener('click', () => {
                this.viewProfilePicture();
                popover.remove();
            });
        }

        const optChange = popover.querySelector('#optChangePic');
        if (optChange) {
            optChange.addEventListener('click', () => {
                this.container.querySelector('#profileImageInput').click();
                popover.remove();
            });
        }

        const optRemove = popover.querySelector('#optRemovePic');
        if (optRemove) {
            optRemove.addEventListener('click', () => {
                if (confirm('Are you sure you want to remove your profile picture?')) {
                    this.profilePicture = null;
                    this.localPicture = null;
                    this.pictureSource = 'local';
                    const preview = this.container.querySelector('#profileImagePreview');
                    if (preview) preview.src = '/assets/Images/DefaultUser.png';
                    this.saveProfilePictureDirect(null, 'local');
                }
                popover.remove();
            });
        }

        // Close on click outside
        const closePopover = (ev) => {
            if (!popover.contains(ev.target) && !e.target.closest('#avatarEditTrigger')) {
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
                <img src="${croppedData}" alt="Profile" id="profileImagePreview" class="profile-avatar-large-img" style="width: 100%; height: 100%; object-fit: cover;">
                <div class="avatar-edit-overlay">Edit</div>
            `;
        }
        this.saveProfilePictureDirect(this.profilePicture, 'local');
    }

    async handleUpdateProfile(isSilent = false, skipViewReset = false) {
        const nameInp = this.container.querySelector('#editFullName');
        const usernameInp = this.container.querySelector('#editUsername');
        const emailInp = this.container.querySelector('#editEmailId');
        
        const full_name = (nameInp ? nameInp.value.trim() : '') || this.localName || this.userName;
        const username = (usernameInp ? usernameInp.value.trim() : '') || this.accountUsername;
        const email_id = (emailInp ? emailInp.value.trim() : '') || this.localEmail || this.userEmail;
        const profile_picture = this.profilePicture;

        if (!full_name || !email_id) {
            if (!isSilent) alert('Name and Email are required');
            return false;
        }

        if (this.nameSource === 'local') {
            this.localName = full_name;
            this.localEmail = email_id;
        }

        try {
            const res = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    full_name, 
                    email_id, 
                    username,
                    profile_picture, 
                    name_source: this.nameSource || 'local',
                    picture_source: this.pictureSource || 'local'
                })
            });

            if (res.ok) {
                this.userName = full_name;
                this.userEmail = email_id;
                this.accountUsername = username;
                this.accountEmail = email_id;
                this.authIdentifier = username || email_id;
                this.isDirty = false;
                this.baseline = {
                    fullName: full_name,
                    username,
                    email: email_id,
                    profilePicture: this.profilePicture,
                    nameSource: this.nameSource || 'local',
                    pictureSource: this.pictureSource || 'local'
                };
                
                // Immediately sync Settings sidebar in real time
                const sidebar = document.querySelector('.settings-sidebar');
                if (sidebar) {
                    const avatarEl = sidebar.querySelector('.sidebar-avatar');
                    const nameEl = sidebar.querySelector('.sidebar-name');
                    const subtitleEl = sidebar.querySelector('.sidebar-subtitle');
                    if (avatarEl && this.profilePicture) {
                        avatarEl.innerHTML = `<img src="${this.safeImageUrl(this.profilePicture)}" alt="Profile" class="sidebar-avatar-img">`;
                        avatarEl.style.background = 'transparent';
                    }
                    if (nameEl) nameEl.textContent = this.userName;
                    if (subtitleEl) subtitleEl.textContent = this.userEmail;
                }

                window.dispatchEvent(new CustomEvent('macos-profile-updated', {
                    detail: {
                        name: this.userName,
                        email: this.userEmail,
                        picture: this.profilePicture
                    }
                }));
                
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

                if (!skipViewReset) {
                    this.currentView = 'main';
                    this.render();
                } else if (this.container.querySelector('#personalInfoStatusBadge')) {
                    const badge = this.container.querySelector('#personalInfoStatusBadge');
                    badge.className = 'save-status-badge';
                    badge.textContent = '✓ Saved';
                    const headerBtn = this.container.querySelector('#headerSaveProfile');
                    if (headerBtn) headerBtn.disabled = true;
                    const bottomBtn = this.container.querySelector('#saveProfile');
                    if (bottomBtn) bottomBtn.disabled = true;
                    const discardBtn = this.container.querySelector('#discardProfileChanges');
                    if (discardBtn) discardBtn.style.display = 'none';
                }

                return true;
            } else {
                const data = await res.json();
                if (!isSilent) alert(data.error || 'Failed to update profile');
                return false;
            }
        } catch (err) {
            console.error('Update profile error:', err);
            if (!isSilent) alert('An error occurred while updating profile');
            return false;
        }
    }
}
