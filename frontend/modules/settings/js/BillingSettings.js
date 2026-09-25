/**
 * BillingSettingsComponent - macOS Sequoia/Tahoe style Billing & Invoice settings view
 * Dedicated component for macOS Settings App with modular styling & rich customizability.
 */

export class BillingSettingsComponent {
    constructor(container) {
        this.container = container;
        this.settings = {};
        this.loading = true;
        this.saving = false;
        this.defaultSettings = {
            invoice_duplex_print: 'true',
            payment_qr_image: '',
            payment_upi_id: '7749089400@hdfc',
            portal_base_url: 'https://mac.faizal.uk',
            bank_account_holder: 'MD  FAIZAL',
            bank_account_number: '50100673684509',
            bank_ifsc: 'HDFC0000236',
            bank_branch: 'CUTTACK - ODISHA',
            bank_mmid: '9240072',
            bank_show_mmid: 'true',
            bank_account_type: 'Savings Account'
        };
    }

    async render() {
        if (this.loading) {
            this.container.innerHTML = `
                <div class="billing-settings-root" style="padding: 40px 20px; text-align: center; color: var(--settings-text, #fff);">
                    <div style="font-size: 28px; margin-bottom: 12px; animation: spin 1.2s linear infinite;">⏳</div>
                    <div style="font-size: 14px; font-weight: 500;">Loading Billing & Invoice preferences...</div>
                </div>
            `;
            await this.loadSettings();
        }

        const isDuplex = String(this.settings.invoice_duplex_print ?? 'true').toLowerCase() === 'true';
        const showMmid = String(this.settings.bank_show_mmid ?? 'true').toLowerCase() === 'true';
        const currentAccountType = this.settings.bank_account_type || 'Savings Account';
        const hasCustomQr = Boolean(this.settings.payment_qr_image);

        this.container.innerHTML = `
            <div class="billing-settings-root appearance-page-root">
                <!-- Header -->
                <div class="billing-settings-header">
                    <div class="billing-settings-header-info">
                        <h2>
                            <span>🧾</span>
                            <span>Billing & Invoices</span>
                        </h2>
                        <p>Configure duplex invoice printing, banking information, MMID toggle, account classification, and customer ledger portal.</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="saveStatusMsgHeader" class="billing-toast-success" style="display: none;">
                            <span>✓</span> <span>Saved</span>
                        </span>
                        <button type="button" id="saveBillingSettingsBtnHeader" class="billing-save-btn" style="padding: 7px 16px; font-size: 12px;">
                            <span>Save Changes</span>
                        </button>
                    </div>
                </div>

                <!-- 1. Duplex Printing Options -->
                <div class="billing-card">
                    <div class="billing-row-toggle">
                        <div class="billing-row-left">
                            <div class="billing-card-title">
                                <span>📄</span>
                                <span>2-Page Duplex Printing (Front & Back)</span>
                            </div>
                            <div class="billing-card-subtitle">
                                Formats exported & printed invoice PDFs into 2 pages: Front for billing line items, Back for payment QR & bank account settlement details.
                            </div>
                        </div>
                        <div>
                            <button id="toggleDuplexPrint" class="toggle-switch ${isDuplex ? 'active' : ''}" type="button" aria-label="Toggle Duplex Printing">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. Bank Account Details & Customizability -->
                <div class="billing-card">
                    <div class="billing-card-header">
                        <div>
                            <div class="billing-card-title">
                                <span>🏦</span>
                                <span>Bank Account & Settlement Details</span>
                            </div>
                            <div class="billing-card-subtitle">
                                Printed on the back page of invoices and displayed on the online customer statement portal.
                            </div>
                        </div>
                    </div>

                    <div class="billing-grid-2">
                        <div class="billing-field-group">
                            <label class="billing-label" for="settingBankHolder">Account Holder Name</label>
                            <input type="text" id="settingBankHolder" class="billing-input" value="${this.escapeHtml(this.settings.bank_account_holder || 'MD  FAIZAL')}" placeholder="e.g. MD  FAIZAL" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingBankNumber">Account Number</label>
                            <input type="text" id="settingBankNumber" class="billing-input" value="${this.escapeHtml(this.settings.bank_account_number || '50100673684509')}" placeholder="e.g. 50100673684509" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingBankIfsc">IFSC Code</label>
                            <input type="text" id="settingBankIfsc" class="billing-input" value="${this.escapeHtml(this.settings.bank_ifsc || 'HDFC0000236')}" placeholder="e.g. HDFC0000236" style="text-transform: uppercase;" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingBankBranch">Branch Name</label>
                            <input type="text" id="settingBankBranch" class="billing-input" value="${this.escapeHtml(this.settings.bank_branch || 'CUTTACK - ODISHA')}" placeholder="e.g. CUTTACK - ODISHA" />
                        </div>
                    </div>

                    <!-- Account Type Customizer -->
                    <div style="margin-top: 18px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-label" style="margin-bottom: 6px;">
                            <span>Account Type</span>
                            <span style="font-size: 11px; opacity: 0.7;">Select preset or type custom</span>
                        </div>
                        <div class="billing-pills-row" id="accountTypePills">
                            <button type="button" class="billing-pill-btn ${currentAccountType === 'Savings Account' ? 'active' : ''}" data-val="Savings Account">Savings Account</button>
                            <button type="button" class="billing-pill-btn ${currentAccountType === 'Current Account' ? 'active' : ''}" data-val="Current Account">Current Account</button>
                            <button type="button" class="billing-pill-btn ${currentAccountType === 'Cash Credit (CC)' ? 'active' : ''}" data-val="Cash Credit (CC)">Cash Credit (CC)</button>
                            <button type="button" class="billing-pill-btn ${currentAccountType === 'Overdraft (OD)' ? 'active' : ''}" data-val="Overdraft (OD)">Overdraft (OD)</button>
                            <button type="button" class="billing-pill-btn ${!['Savings Account', 'Current Account', 'Cash Credit (CC)', 'Overdraft (OD)'].includes(currentAccountType) ? 'active' : ''}" data-val="__custom__">Custom</button>
                        </div>
                        <div style="margin-top: 8px;">
                            <input type="text" id="settingBankType" class="billing-input" value="${this.escapeHtml(currentAccountType)}" placeholder="e.g. Current Account, Savings Account, etc." />
                        </div>
                    </div>

                    <!-- MMID Customizer (On / Off Toggle + Value) -->
                    <div style="margin-top: 18px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-row-toggle">
                            <div class="billing-row-left">
                                <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                    <span>MMID (Mobile Money Identifier)</span>
                                    <span id="mmidStatusTag" class="billing-badge-tag ${showMmid ? 'active' : 'inactive'}">
                                        ${showMmid ? 'ENABLED (PRINTED)' : 'DISABLED (HIDDEN)'}
                                    </span>
                                </div>
                                <div class="billing-card-subtitle">
                                    Toggle whether the 7-digit MMID is printed on invoices and shown on the customer ledger. When turned off, the MMID row is omitted completely.
                                </div>
                            </div>
                            <div>
                                <button id="toggleShowMmid" class="toggle-switch ${showMmid ? 'active' : ''}" type="button" aria-label="Toggle MMID on or off">
                                    <div class="toggle-switch-knob"></div>
                                </button>
                            </div>
                        </div>

                        <div id="mmidInputWrapper" class="billing-mmid-wrapper ${showMmid ? '' : 'disabled'}">
                            <label class="billing-label" for="settingBankMmid" style="margin-bottom: 4px;">MMID Number (7 Digits)</label>
                            <input type="text" id="settingBankMmid" class="billing-input" value="${this.escapeHtml(this.settings.bank_mmid || '9240072')}" placeholder="e.g. 9240072" maxlength="15" ${showMmid ? '' : 'disabled'} />
                            <div style="font-size: 11px; color: var(--settings-text-secondary, #8e8e93); margin-top: 4px;">
                                ${showMmid ? '✓ MMID is currently active and will be printed on page 2 of invoices.' : '✕ MMID is hidden from customer invoices and customer statement portal.'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. Payment QR & Customer Portal URL -->
                <div class="billing-card">
                    <div class="billing-card-header">
                        <div>
                            <div class="billing-card-title">
                                <span>⚡</span>
                                <span>Payment QR & Customer Portal</span>
                            </div>
                            <div class="billing-card-subtitle">
                                Manage the UPI payment gateway parameters and customer link domain.
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div class="billing-field-group">
                            <label class="billing-label" for="settingUpiId">UPI VPA ID (Auto-generates high-definition vector QR)</label>
                            <input type="text" id="settingUpiId" class="billing-input" value="${this.escapeHtml(this.settings.payment_upi_id || '7749089400@hdfc')}" placeholder="e.g. 7749089400@hdfc" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label">Custom Payment QR Image Override (Optional)</label>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <button type="button" id="uploadQrBtn" class="billing-action-btn">
                                    <span>📁</span> <span>Upload Custom QR Image...</span>
                                </button>
                                ${hasCustomQr ? `
                                    <button type="button" id="clearQrBtn" class="billing-action-btn danger">
                                        <span>🗑️</span> <span>Clear Custom QR</span>
                                    </button>
                                ` : ''}
                                <input type="file" id="qrFileInput" accept="image/*" style="display: none;" />
                            </div>
                            <div style="font-size: 12px; color: var(--settings-text-secondary, #888); margin-top: 4px;">
                                ${hasCustomQr ? '✅ Custom QR image is active. It overrides automatic UPI QR vector generation.' : '✨ Using ultra-crisp vector UPI QR code auto-generated from your UPI ID.'}
                            </div>
                        </div>

                        <div class="billing-field-group" style="margin-top: 6px;">
                            <label class="billing-label" for="settingPortalUrl">
                                <span>Customer Ledger Portal Base Domain</span>
                                <a href="javascript:void(0)" id="testLedgerLinkBtn" style="color: #0a84ff; text-decoration: none; font-size: 11px;">🔗 Test Ledger View</a>
                            </label>
                            <input type="text" id="settingPortalUrl" class="billing-input" value="${this.escapeHtml(this.settings.portal_base_url || 'https://mac.faizal.uk')}" placeholder="https://mac.faizal.uk" />
                            <div style="font-size: 11px; color: var(--settings-text-secondary, #888);">
                                Encoded into the Customer Statement QR code on the back page of invoices and customer ledger links.
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. Interactive Live Back-Page & Statement Preview -->
                <div class="billing-card">
                    <div class="billing-card-header" style="margin-bottom: 8px;">
                        <div class="billing-card-title">
                            <span>📄</span>
                            <span>Live Back-Page & Statement Preview</span>
                        </div>
                        <span style="font-size: 11px; color: #0a84ff; font-weight: 500;">Real-time Dynamic Sync</span>
                    </div>
                    <div class="billing-card-subtitle" style="margin-bottom: 12px;">
                        This preview reflects exactly how your bank details, MMID, and account type are presented to your customers:
                    </div>

                    <div class="billing-preview-box">
                        <table class="billing-preview-table">
                            <tbody>
                                <tr>
                                    <td>Account Holder:</td>
                                    <td id="previewHolder">${this.escapeHtml(this.settings.bank_account_holder || 'MD  FAIZAL')}</td>
                                </tr>
                                <tr>
                                    <td>Account Number:</td>
                                    <td id="previewNumber">${this.escapeHtml(this.settings.bank_account_number || '50100673684509')}</td>
                                </tr>
                                <tr>
                                    <td>IFSC Code:</td>
                                    <td id="previewIfsc">${this.escapeHtml((this.settings.bank_ifsc || 'HDFC0000236').toUpperCase())}</td>
                                </tr>
                                <tr>
                                    <td>Branch:</td>
                                    <td id="previewBranch">${this.escapeHtml(this.settings.bank_branch || 'CUTTACK - ODISHA')}</td>
                                </tr>
                                <tr id="previewMmidRow" style="${showMmid ? '' : 'display: none;'}">
                                    <td>MMID:</td>
                                    <td id="previewMmid">${this.escapeHtml(this.settings.bank_mmid || '9240072')}</td>
                                </tr>
                                <tr>
                                    <td>Account Type:</td>
                                    <td id="previewType">${this.escapeHtml(currentAccountType)}</td>
                                </tr>
                                <tr>
                                    <td>Payment UPI:</td>
                                    <td id="previewUpi">${this.escapeHtml(this.settings.payment_upi_id || '7749089400@hdfc')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 5. Action Footer -->
                <div class="billing-footer-bar">
                    <span id="saveStatusMsg" class="billing-toast-success" style="display: none;">
                        <span>✓</span> <span>Settings Saved Successfully!</span>
                    </span>
                    <button type="button" id="resetBillingDefaultsBtn" class="billing-reset-btn">
                        <span>↺</span> <span>Reset Defaults</span>
                    </button>
                    <button type="button" id="saveBillingSettingsBtn" class="billing-save-btn">
                        <span>Save Changes</span>
                    </button>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async loadSettings() {
        try {
            const res = await fetch('/api/settings/app-settings');
            if (res.ok) {
                this.settings = await res.json();
            } else {
                const res2 = await fetch('/api/billing/settings/app-settings');
                if (res2.ok) {
                    this.settings = await res2.json();
                }
            }
        } catch (err) {
            console.error('[BillingSettings] Error loading settings:', err);
        } finally {
            this.loading = false;
        }
    }

    attachEventListeners() {
        // 1. Duplex Printing Toggle
        const toggleDuplexBtn = this.container.querySelector('#toggleDuplexPrint');
        if (toggleDuplexBtn) {
            toggleDuplexBtn.addEventListener('click', () => {
                const isActive = toggleDuplexBtn.classList.contains('active');
                if (isActive) {
                    toggleDuplexBtn.classList.remove('active');
                    this.settings.invoice_duplex_print = 'false';
                } else {
                    toggleDuplexBtn.classList.add('active');
                    this.settings.invoice_duplex_print = 'true';
                }
            });
        }

        // 2. MMID Toggle
        const toggleMmidBtn = this.container.querySelector('#toggleShowMmid');
        const mmidWrapper = this.container.querySelector('#mmidInputWrapper');
        const mmidInput = this.container.querySelector('#settingBankMmid');
        const mmidStatusTag = this.container.querySelector('#mmidStatusTag');
        const previewMmidRow = this.container.querySelector('#previewMmidRow');

        if (toggleMmidBtn) {
            toggleMmidBtn.addEventListener('click', () => {
                const isCurrentlyActive = toggleMmidBtn.classList.contains('active');
                const willBeActive = !isCurrentlyActive;

                if (willBeActive) {
                    toggleMmidBtn.classList.add('active');
                    this.settings.bank_show_mmid = 'true';
                    if (mmidWrapper) mmidWrapper.classList.remove('disabled');
                    if (mmidInput) mmidInput.disabled = false;
                    if (mmidStatusTag) {
                        mmidStatusTag.className = 'billing-badge-tag active';
                        mmidStatusTag.textContent = 'ENABLED (PRINTED)';
                    }
                    if (previewMmidRow) previewMmidRow.style.display = '';
                } else {
                    toggleMmidBtn.classList.remove('active');
                    this.settings.bank_show_mmid = 'false';
                    if (mmidWrapper) mmidWrapper.classList.add('disabled');
                    if (mmidInput) mmidInput.disabled = true;
                    if (mmidStatusTag) {
                        mmidStatusTag.className = 'billing-badge-tag inactive';
                        mmidStatusTag.textContent = 'DISABLED (HIDDEN)';
                    }
                    if (previewMmidRow) previewMmidRow.style.display = 'none';
                }
                this.updateLivePreview();
            });
        }

        // 3. Account Type Selector Pills
        const pillsContainer = this.container.querySelector('#accountTypePills');
        const bankTypeInput = this.container.querySelector('#settingBankType');

        if (pillsContainer && bankTypeInput) {
            pillsContainer.addEventListener('click', (e) => {
                const pill = e.target.closest('.billing-pill-btn');
                if (!pill) return;

                pillsContainer.querySelectorAll('.billing-pill-btn').forEach(btn => btn.classList.remove('active'));
                pill.classList.add('active');

                const val = pill.getAttribute('data-val');
                if (val === '__custom__') {
                    bankTypeInput.focus();
                    bankTypeInput.select();
                } else {
                    bankTypeInput.value = val;
                    this.settings.bank_account_type = val;
                    this.updateLivePreview();
                }
            });

            bankTypeInput.addEventListener('input', () => {
                const val = bankTypeInput.value.trim();
                this.settings.bank_account_type = val;

                // Sync pills active state
                let matched = false;
                pillsContainer.querySelectorAll('.billing-pill-btn').forEach(btn => {
                    const dataVal = btn.getAttribute('data-val');
                    if (dataVal === val) {
                        btn.classList.add('active');
                        matched = true;
                    } else {
                        btn.classList.remove('active');
                    }
                });

                if (!matched) {
                    const customPill = pillsContainer.querySelector('[data-val="__custom__"]');
                    if (customPill) customPill.classList.add('active');
                }

                this.updateLivePreview();
            });
        }

        // 4. Live Synchronized Text Inputs
        const liveInputIds = [
            'settingBankHolder', 'settingBankNumber', 'settingBankIfsc',
            'settingBankBranch', 'settingBankMmid', 'settingUpiId', 'settingPortalUrl'
        ];

        liveInputIds.forEach(id => {
            const input = this.container.querySelector(`#${id}`);
            if (input) {
                input.addEventListener('input', () => this.updateLivePreview());
            }
        });

        // 5. QR Code Upload & Clear
        const uploadQrBtn = this.container.querySelector('#uploadQrBtn');
        const qrFileInput = this.container.querySelector('#qrFileInput');
        if (uploadQrBtn && qrFileInput) {
            uploadQrBtn.addEventListener('click', () => qrFileInput.click());
            qrFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.settings.payment_qr_image = event.target.result;
                        this.render();
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        const clearQrBtn = this.container.querySelector('#clearQrBtn');
        if (clearQrBtn) {
            clearQrBtn.addEventListener('click', () => {
                this.settings.payment_qr_image = '';
                this.render();
            });
        }

        // 6. Test Customer Ledger Link
        const testLedgerBtn = this.container.querySelector('#testLedgerLinkBtn');
        if (testLedgerBtn) {
            testLedgerBtn.addEventListener('click', async () => {
                try {
                    const res = await fetch('/api/billing/ledger/customers');
                    const json = await res.json();
                    const customers = Array.isArray(json) ? json : (json.data || []);
                    const testCust = customers[0];
                    const token = testCust && (testCust.ledger_token || testCust.ledgerToken || testCust.token);
                    if (token) {
                        window.open(`/ledger/${token}`, '_blank');
                        return;
                    }
                } catch (_) {}
                window.open('/customer-ledger.html?id=2', '_blank');
            });
        }

        // 7. Reset to Defaults
        const resetBtn = this.container.querySelector('#resetBillingDefaultsBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset Billing & Invoice settings to default configuration?')) {
                    this.settings = { ...this.defaultSettings };
                    this.render();
                }
            });
        }

        // 8. Save Settings (both header & footer buttons)
        const saveBtnFooter = this.container.querySelector('#saveBillingSettingsBtn');
        const saveBtnHeader = this.container.querySelector('#saveBillingSettingsBtnHeader');

        const triggerSave = async () => {
            await this.saveSettings([saveBtnHeader, saveBtnFooter]);
        };

        if (saveBtnFooter) saveBtnFooter.addEventListener('click', triggerSave);
        if (saveBtnHeader) saveBtnHeader.addEventListener('click', triggerSave);
    }

    updateLivePreview() {
        const holderEl = this.container.querySelector('#previewHolder');
        const numberEl = this.container.querySelector('#previewNumber');
        const ifscEl = this.container.querySelector('#previewIfsc');
        const branchEl = this.container.querySelector('#previewBranch');
        const mmidEl = this.container.querySelector('#previewMmid');
        const typeEl = this.container.querySelector('#previewType');
        const upiEl = this.container.querySelector('#previewUpi');

        const holderVal = this.container.querySelector('#settingBankHolder')?.value || 'MD  FAIZAL';
        const numberVal = this.container.querySelector('#settingBankNumber')?.value || '50100673684509';
        const ifscVal = (this.container.querySelector('#settingBankIfsc')?.value || 'HDFC0000236').toUpperCase();
        const branchVal = this.container.querySelector('#settingBankBranch')?.value || 'CUTTACK - ODISHA';
        const mmidVal = this.container.querySelector('#settingBankMmid')?.value || '9240072';
        const typeVal = this.container.querySelector('#settingBankType')?.value || 'Savings Account';
        const upiVal = this.container.querySelector('#settingUpiId')?.value || '7749089400@hdfc';

        if (holderEl) holderEl.textContent = holderVal;
        if (numberEl) numberEl.textContent = numberVal;
        if (ifscEl) ifscEl.textContent = ifscVal;
        if (branchEl) branchEl.textContent = branchVal;
        if (mmidEl) mmidEl.textContent = mmidVal;
        if (typeEl) typeEl.textContent = typeVal;
        if (upiEl) upiEl.textContent = upiVal;
    }

    async saveSettings(buttons = []) {
        const btnList = Array.isArray(buttons) ? buttons.filter(Boolean) : [buttons].filter(Boolean);
        btnList.forEach(btn => {
            btn.disabled = true;
            btn.innerHTML = `<span>⏳</span> <span>Saving...</span>`;
        });

        const isDuplex = this.container.querySelector('#toggleDuplexPrint')?.classList.contains('active') ? 'true' : 'false';
        const showMmid = this.container.querySelector('#toggleShowMmid')?.classList.contains('active') ? 'true' : 'false';

        const newSettings = {
            ...this.settings,
            invoice_duplex_print: isDuplex,
            bank_show_mmid: showMmid,
            payment_upi_id: this.container.querySelector('#settingUpiId')?.value || '',
            portal_base_url: this.container.querySelector('#settingPortalUrl')?.value || '',
            bank_account_holder: this.container.querySelector('#settingBankHolder')?.value || '',
            bank_account_number: this.container.querySelector('#settingBankNumber')?.value || '',
            bank_ifsc: (this.container.querySelector('#settingBankIfsc')?.value || '').toUpperCase(),
            bank_branch: this.container.querySelector('#settingBankBranch')?.value || '',
            bank_mmid: this.container.querySelector('#settingBankMmid')?.value || '',
            bank_account_type: this.container.querySelector('#settingBankType')?.value || ''
        };

        try {
            const res = await fetch('/api/settings/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: newSettings })
            });

            if (res.ok) {
                this.settings = newSettings;
                const statusMsg = this.container.querySelector('#saveStatusMsg');
                const statusMsgHeader = this.container.querySelector('#saveStatusMsgHeader');
                if (statusMsg) statusMsg.style.display = 'inline-flex';
                if (statusMsgHeader) statusMsgHeader.style.display = 'inline-flex';

                setTimeout(() => {
                    if (statusMsg) statusMsg.style.display = 'none';
                    if (statusMsgHeader) statusMsgHeader.style.display = 'none';
                }, 3500);
            } else {
                throw new Error(`Server returned HTTP ${res.status}`);
            }
        } catch (err) {
            console.error('[BillingSettings] Save error:', err);
            alert('Failed to save settings: ' + err.message);
        } finally {
            btnList.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = `<span>Save Changes</span>`;
            });
        }
    }
}
