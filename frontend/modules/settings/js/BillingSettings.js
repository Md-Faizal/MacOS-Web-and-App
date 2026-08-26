/**
 * BillingSettingsComponent - macOS style Billing & Invoice settings view for Settings
 */
export class BillingSettingsComponent {
    constructor(container) {
        this.container = container;
        this.settings = {};
        this.loading = true;
        this.saving = false;
    }

    async render() {
        if (this.loading) {
            this.container.innerHTML = `
                <div class="settings-section appearance-page-root" style="padding: 30px; text-align: center; color: var(--text-color);">
                    <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                    <div>Loading Billing & Invoice settings...</div>
                </div>
            `;
            await this.loadSettings();
        }

        this.container.innerHTML = `
            <div class="settings-section appearance-page-root" style="display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px; max-height: 100%; overflow-y: auto;">
                <div style="margin-bottom: 5px;">
                    <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 4px 0; color: var(--text-color);">Billing & Invoices</h2>
                    <p style="font-size: 13px; color: var(--text-secondary, #888); margin: 0;">Configure duplex printing options, custom payment QR code, bank account details, and customer portal sharing.</p>
                </div>

                <!-- Duplex Printing Options -->
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 600; font-size: 14px; color: var(--text-color);">2-Page Duplex Printing (Front & Back)</div>
                            <div style="font-size: 12px; color: var(--text-secondary, #888); margin-top: 4px;">When enabled, exported and printed invoice PDFs are formatted into 2 pages: Front for bill items, Back for payment QR & account details.</div>
                        </div>
                        <div>
                            <button id="toggleDuplexPrint" class="toggle-switch ${this.settings.invoice_duplex_print === 'true' ? 'active' : ''}" style="border: none; cursor: pointer;">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Payment QR & UPI ID -->
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 16px;">
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-color); margin-bottom: 12px;">Payment QR & UPI ID</div>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">UPI ID (for auto-generating Payment QR)</label>
                            <input type="text" id="settingUpiId" value="${this.escapeHtml(this.settings.payment_upi_id || '7749089400@hdfc')}" placeholder="e.g. 7749089400@hdfc" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">Custom Payment QR Image (Optional Override)</label>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <button id="uploadQrBtn" class="settings-header-btn" style="padding: 6px 14px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: var(--text-color); font-size: 12px; cursor: pointer;">📁 Upload QR Image...</button>
                                ${this.settings.payment_qr_image ? `<button id="clearQrBtn" class="settings-header-btn" style="padding: 6px 14px; background: rgba(255, 80, 80, 0.2); border: 1px solid rgba(255, 80, 80, 0.4); border-radius: 6px; color: #ff8888; font-size: 12px; cursor: pointer;">🗑️ Clear Custom Image</button>` : ''}
                                <input type="file" id="qrFileInput" accept="image/*" style="display: none;" />
                            </div>
                            <div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary, #888);">
                                ${this.settings.payment_qr_image ? '✅ Using uploaded custom QR image.' : '✨ No custom image uploaded. Using ultra-crisp vector UPI QR code generated automatically.'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Customer Portal Base URL -->
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 16px;">
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-color); margin-bottom: 6px;">Customer Portal URL</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888); margin-bottom: 12px;">This domain is encoded into the Customer Portal QR on the back of the invoice.</div>
                    <input type="text" id="settingPortalUrl" value="${this.escapeHtml(this.settings.portal_base_url || 'https://mac.faizal.uk')}" placeholder="https://mac.faizal.uk" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                </div>

                <!-- Bank Account Details -->
                <div class="settings-group" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 16px;">
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-color); margin-bottom: 12px;">Bank Account Details (Printed on Back of Invoice)</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">Account Holder</label>
                            <input type="text" id="settingBankHolder" value="${this.escapeHtml(this.settings.bank_account_holder || 'MD  FAIZAL')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">Account Number</label>
                            <input type="text" id="settingBankNumber" value="${this.escapeHtml(this.settings.bank_account_number || '50100673684509')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">IFSC Code</label>
                            <input type="text" id="settingBankIfsc" value="${this.escapeHtml(this.settings.bank_ifsc || 'HDFC0000236')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">Branch</label>
                            <input type="text" id="settingBankBranch" value="${this.escapeHtml(this.settings.bank_branch || 'CUTTACK - ODISHA')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">MMID</label>
                            <input type="text" id="settingBankMmid" value="${this.escapeHtml(this.settings.bank_mmid || '9240072')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                        <div>
                            <label style="font-size: 12px; font-weight: 500; color: var(--text-secondary, #aaa); display: block; margin-bottom: 6px;">Account Type</label>
                            <input type="text" id="settingBankType" value="${this.escapeHtml(this.settings.bank_account_type || 'Savings Account')}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: var(--text-color); font-size: 13px; box-sizing: border-box;" />
                        </div>
                    </div>
                </div>

                <!-- Save Button -->
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px;">
                    <span id="saveStatusMsg" style="font-size: 13px; color: #4caf50; align-self: center; display: none;">✅ Settings Saved Successfully!</span>
                    <button id="saveBillingSettingsBtn" class="settings-header-btn" style="padding: 10px 24px; background: var(--system-blue, #007aff); border: none; border-radius: 8px; color: #fff; font-weight: 600; font-size: 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);">Save Changes</button>
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
        const toggleBtn = this.container.querySelector('#toggleDuplexPrint');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const isActive = toggleBtn.classList.contains('active');
                if (isActive) {
                    toggleBtn.classList.remove('active');
                    this.settings.invoice_duplex_print = 'false';
                } else {
                    toggleBtn.classList.add('active');
                    this.settings.invoice_duplex_print = 'true';
                }
            });
        }

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

        const saveBtn = this.container.querySelector('#saveBillingSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                const newSettings = {
                    ...this.settings,
                    invoice_duplex_print: this.container.querySelector('#toggleDuplexPrint')?.classList.contains('active') ? 'true' : 'false',
                    payment_upi_id: this.container.querySelector('#settingUpiId')?.value || '',
                    portal_base_url: this.container.querySelector('#settingPortalUrl')?.value || '',
                    bank_account_holder: this.container.querySelector('#settingBankHolder')?.value || '',
                    bank_account_number: this.container.querySelector('#settingBankNumber')?.value || '',
                    bank_ifsc: this.container.querySelector('#settingBankIfsc')?.value || '',
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
                        if (statusMsg) {
                            statusMsg.style.display = 'inline';
                            setTimeout(() => { if (statusMsg) statusMsg.style.display = 'none'; }, 3000);
                        }
                    }
                } catch (err) {
                    console.error('[BillingSettings] Save error:', err);
                    alert('Failed to save settings: ' + err.message);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Changes';
                }
            });
        }
    }
}
