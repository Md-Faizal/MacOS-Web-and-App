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
            company_name: 'UTKAL CHEMICAL AUSHADHALAYA',
            company_gstin: '21AIDPF4446J1ZL',
            company_pan: 'AIDPF4446J',
            company_phone: '06822273304 / 943933330',
            company_address_factory: 'Binaba Marg, Aska, Ganjam, Odisha - 761110',
            company_address_office: 'D1, Basera Complex, Dumduma, BBSR - 751019',
            invoice_show_dues_widget: 'true',
            invoice_auto_sign_disclaimer: 'true',
            invoice_authority_sign_no_qr: 'false',
            document_use_proprietor_signature: 'true',
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
                <div class="macos-loader-container">
                    <div class="macos-circular-loader"></div>
                    <div class="macos-loader-title">Loading Billing & Invoice Preferences...</div>
                    <div class="macos-loader-subtitle">Syncing business configurations</div>
                </div>
            `;
            await this.loadSettings();
        }

        const isDuplex = String(this.settings.invoice_duplex_print ?? 'true').toLowerCase() === 'true';
        const showDuesWidget = String(this.settings.invoice_show_dues_widget ?? 'true').toLowerCase() === 'true';
        const legacySettingEnabled = value => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
        const autoSign = legacySettingEnabled(this.settings.invoice_auto_sign_disclaimer ?? 'true');
        const invoiceClassicSign = legacySettingEnabled(this.settings.invoice_authority_sign_no_qr);
        const legacyClassicMode = invoiceClassicSign
            || legacySettingEnabled(this.settings.invoice_classic_signature_mode)
            || ['classic', 'usual'].includes(String(this.settings.invoice_signature_layout || '').trim().toLowerCase());
        const configuredSignatureMode = String(this.settings.document_signature_mode || '').trim().toLowerCase();
        const documentSignatureMode = ['traditional', 'auto_digital'].includes(configuredSignatureMode)
            ? configuredSignatureMode
            : (legacyClassicMode ? 'traditional' : (autoSign ? 'auto_digital' : 'traditional'));
        const hasSavedProprietorSignature = Boolean(String(this.settings.proprietor_signature_data || '').trim());
        const proprietorSignaturePreferenceSet = String(this.settings.document_proprietor_signature_preference_set || '').toLowerCase() === 'true';
        const useProprietorSignature = proprietorSignaturePreferenceSet
            ? String(this.settings.document_use_proprietor_signature).toLowerCase() === 'true'
            : hasSavedProprietorSignature;
        const showMmid = String(this.settings.bank_show_mmid ?? 'true').toLowerCase() === 'true';
        const currentAccountType = this.settings.bank_account_type || 'Savings Account';
        const hasCustomQr = Boolean(this.settings.payment_qr_image);
        const companyName = this.settings.company_name || 'UTKAL CHEMICAL AUSHADHALAYA';
        const companyGstin = this.settings.company_gstin || '21AIDPF4446J1ZL';
        const companyPan = this.settings.company_pan || 'AIDPF4446J';
        const companyPhone = this.settings.company_phone || '06822273304 / 943933330';
        const factoryAddr = this.settings.company_address_factory || 'Binaba Marg, Aska, Ganjam, Odisha - 761110';
        const officeAddr = this.settings.company_address_office || 'D1, Basera Complex, Dumduma, BBSR - 751019';

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

                <!-- 0. Automated Email Reminders Fast Access -->
                <div class="billing-card" style="border-left: 3px solid #0a84ff; background: rgba(10, 132, 255, 0.06);">
                    <div class="billing-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                        <div>
                            <div class="billing-card-title" style="color: #0a84ff;">
                                <span>📧</span>
                                <span>Automated Email Summaries & Overdue Reminders</span>
                            </div>
                            <div class="billing-card-subtitle" style="margin-top: 4px;">
                                Daily business digests, weekly financial summaries, and 7d/14d/30d overdue invoice reminders via Stalwart Mail.
                            </div>
                        </div>
                        <button type="button" id="openEmailRemindersSettingsBtn" class="billing-save-btn" style="padding: 7px 16px; font-size: 12px; white-space: nowrap; cursor: pointer;">
                            <span>Configure Email Controls →</span>
                        </button>
                    </div>
                </div>

                <!-- 1. Document & Printing Options -->
                <div class="billing-card">
                    <div class="billing-card-header">
                        <div>
                            <div class="billing-card-title">
                                <span>📄</span>
                                <span>Invoice & Estimate PDF Controls</span>
                            </div>
                            <div class="billing-card-subtitle">
                                These controls apply to generated invoice and estimate PDFs. Payment receipts and credit notes keep their own document layouts.
                            </div>
                        </div>
                    </div>

                    <!-- Duplex Print Toggle -->
                    <div class="billing-row-toggle" style="margin-top: 4px;">
                        <div class="billing-row-left">
                            <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                Add a Back Page (Duplex)
                            </div>
                            <div class="billing-card-subtitle">
                                Adds a second page with payment QR, bank details, and document terms. Turn off for a single-page PDF.
                            </div>
                        </div>
                        <div>
                            <button id="toggleDuplexPrint" class="toggle-switch ${isDuplex ? 'active' : ''}" type="button" aria-label="Toggle Duplex Printing">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>

                    <!-- Pending Dues Widget Toggle -->
                    <div class="billing-row-toggle" style="margin-top: 14px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-row-left">
                            <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                <span>Pending Bills / Dues Widget with Quick-Pay QR</span>
                                <span id="duesWidgetTag" class="billing-badge-tag ${showDuesWidget ? 'active' : 'inactive'}">
                                    ${showDuesWidget ? 'ENABLED' : 'DISABLED'}
                                </span>
                            </div>
                            <div class="billing-card-subtitle">
                                On invoices with an outstanding balance, shows a due summary and payment QR on the front page. Estimates do not show an outstanding-dues widget.
                            </div>
                        </div>
                        <div>
                            <button id="toggleShowDuesWidget" class="toggle-switch ${showDuesWidget ? 'active' : ''}" type="button" aria-label="Toggle Pending Dues Widget">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>

                    <div class="billing-settings-subsection">
                        <div class="billing-settings-subsection-title">Signature presentation</div>
                        <div class="billing-settings-subsection-description">
                            Choose one signature style for invoices and estimates. Traditional mode can optionally include the saved proprietor image; Auto-digital mode uses a generated notice instead.
                        </div>
                    </div>

                    <div class="billing-row-toggle" style="margin-top: 14px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-row-left">
                            <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                <span>Signature style for invoices & estimates</span>
                                <span id="documentSignatureModeTag" class="billing-badge-tag ${documentSignatureMode === 'auto_digital' ? 'active' : 'inactive'}">
                                    ${documentSignatureMode === 'auto_digital' ? 'AUTO-DIGITAL' : 'TRADITIONAL'}
                                </span>
                            </div>
                            <div class="billing-card-subtitle">
                                Traditional shows the authorised-signatory line, with the saved proprietor signature when enabled. Auto-digital replaces it with a computer-generated document notice.
                            </div>
                        </div>
                        <div style="min-width:190px;">
                            <select id="documentSignatureMode" class="billing-input" aria-label="Invoice and estimate signature mode">
                                <option value="traditional" ${documentSignatureMode === 'traditional' ? 'selected' : ''}>Traditional signature</option>
                                <option value="auto_digital" ${documentSignatureMode === 'auto_digital' ? 'selected' : ''}>Auto-digital notice</option>
                            </select>
                        </div>
                    </div>

                    <div class="billing-row-toggle billing-proprietor-signature-toggle" style="margin-top: 14px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-row-left">
                            <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                <span>Include saved proprietor signature (Traditional only)</span>
                                <span id="proprietorPdfSignatureTag" class="billing-badge-tag ${useProprietorSignature ? 'active' : 'inactive'}">
                                    ${useProprietorSignature ? 'ON' : 'OFF'}
                                </span>
                            </div>
                            <div id="proprietorPdfSignatureHint" class="billing-card-subtitle">
                                ${hasSavedProprietorSignature
                                    ? 'When on, places the saved signature image above the signatory title on invoices and estimates. When off, leaves the standard signatory line.'
                                    : 'No proprietor image is saved yet. Save one in the Proprietor Signature section below; otherwise PDFs show the standard signatory line.'}
                            </div>
                        </div>
                        <div>
                            <button id="toggleProprietorPdfSignature" class="toggle-switch ${useProprietorSignature ? 'active' : ''}" type="button" aria-label="Include saved proprietor signature in traditional PDFs" aria-pressed="${useProprietorSignature}">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>

                    <div class="billing-settings-subsection billing-settings-subsection-separated">
                        <div class="billing-settings-subsection-title">Invoice payment display</div>
                        <div class="billing-settings-subsection-description">
                            These invoice-only options control payment QR visibility and are independent of Traditional or Auto-digital signature mode.
                        </div>
                    </div>

                    <div class="billing-row-toggle" style="margin-top: 14px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-row-left">
                            <div class="billing-label" style="font-size: 13px; font-weight: 600; color: var(--settings-text, #fff);">
                                <span>Invoice No-Payment-QR Mode</span>
                                <span id="invoiceClassicSignTag" class="billing-badge-tag ${invoiceClassicSign ? 'active' : 'inactive'}">
                                    ${invoiceClassicSign ? 'PAYMENT QR HIDDEN' : 'PAYMENT QR AVAILABLE'}
                                </span>
                            </div>
                            <div class="billing-card-subtitle">
                                Hides the invoice payment QR and pending-dues widget. It does not change the signature style or affect estimates.
                            </div>
                        </div>
                        <div>
                            <button id="toggleInvoiceClassicSign" class="toggle-switch ${invoiceClassicSign ? 'active' : ''}" type="button" aria-label="Toggle Invoice Usual Signature">
                                <div class="toggle-switch-knob"></div>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. Company Profile & Tax Identifiers -->
                <div class="billing-card">
                    <div class="billing-card-header">
                        <div>
                            <div class="billing-card-title">
                                <span>🏢</span>
                                <span>Company Business Profile & Tax Identifiers</span>
                            </div>
                            <div class="billing-card-subtitle">
                                Printed across all Invoice, Payment Receipt, and Credit Note PDF headers. Changes here apply immediately to all generated documents.
                            </div>
                        </div>
                    </div>

                    <div class="billing-grid-2">
                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyName">Company Legal / Trade Name</label>
                            <input type="text" id="settingCompanyName" class="billing-input" value="${this.escapeHtml(companyName)}" placeholder="e.g. UTKAL CHEMICAL AUSHADHALAYA" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyPhone">Contact Phone Number(s)</label>
                            <input type="text" id="settingCompanyPhone" class="billing-input" value="${this.escapeHtml(companyPhone)}" placeholder="e.g. 06822273304 / 943933330" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyGstin">GSTIN Number (15 Characters)</label>
                            <input type="text" id="settingCompanyGstin" class="billing-input" value="${this.escapeHtml(companyGstin)}" placeholder="e.g. 21AIDPF4446J1ZL" style="text-transform: uppercase; font-family: monospace;" maxlength="15" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyPan">PAN Number (10 Characters)</label>
                            <input type="text" id="settingCompanyPan" class="billing-input" value="${this.escapeHtml(companyPan)}" placeholder="e.g. AIDPF4446J" style="text-transform: uppercase; font-family: monospace;" maxlength="10" />
                        </div>

                        <div class="billing-field-group" style="grid-column: span 2;">
                            <label class="billing-label" for="settingCompanyFactAddr">Factory / Registered Production Address</label>
                            <input type="text" id="settingCompanyFactAddr" class="billing-input" value="${this.escapeHtml(factoryAddr)}" placeholder="e.g. Binaba Marg, Aska, Ganjam, Odisha - 761110" />
                        </div>

                        <div class="billing-field-group" style="grid-column: span 2;">
                            <label class="billing-label" for="settingCompanyOfficeAddr">Office / Correspondence Address</label>
                            <input type="text" id="settingCompanyOfficeAddr" class="billing-input" value="${this.escapeHtml(officeAddr)}" placeholder="e.g. D1, Basera Complex, Dumduma, BBSR - 751019" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyAyush">AYUSH Drug Mfg Lic (Form 25D)</label>
                            <input type="text" id="settingCompanyAyush" class="billing-input" value="${this.escapeHtml(this.settings.company_ayush_license || 'OR-02/AYUR')}" placeholder="e.g. OR-02/AYUR" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingCompanyGmp">GMP / Schedule T Ref</label>
                            <input type="text" id="settingCompanyGmp" class="billing-input" value="${this.escapeHtml(this.settings.company_gmp_ref || 'GMP-OD-AYU-2024-08')}" placeholder="e.g. GMP-OD-AYU-2024-08" />
                        </div>

                        <div class="billing-field-group" style="grid-column: span 2;">
                            <label class="billing-label" for="settingCompanyEmail">Official Compliance / Billing Email</label>
                            <input type="email" id="settingCompanyEmail" class="billing-input" value="${this.escapeHtml(this.settings.company_email || 'compliance@utkalchemical.com')}" placeholder="e.g. compliance@utkalchemical.com" />
                        </div>
                    </div>
                </div>

                <!-- 2b. Proprietor Specimen Signature & Authorized Seal -->
                <div class="billing-card">
                    <div class="billing-card-header">
                        <div>
                            <div class="billing-card-title">
                                <span>🖋️</span>
                                <span>Proprietor Specimen Signature & Digital Authority Seal</span>
                            </div>
                            <div class="billing-card-subtitle">
                                This is the saved signature image. The Traditional PDF switch in Invoice & Estimate PDF Controls decides whether invoices and estimates include it.
                            </div>
                        </div>
                    </div>

                    <div class="billing-grid-2">
                        <div class="billing-field-group">
                            <label class="billing-label" for="settingProprietorName">Proprietor / Signatory Full Name</label>
                            <input type="text" id="settingProprietorName" class="billing-input" value="${this.escapeHtml(this.settings.proprietor_name || 'MD  FAIZAL')}" placeholder="e.g. MD  FAIZAL" />
                        </div>

                        <div class="billing-field-group">
                            <label class="billing-label" for="settingProprietorTitle">Designation / Signing Authority Title</label>
                            <input type="text" id="settingProprietorTitle" class="billing-input" value="${this.escapeHtml(this.settings.proprietor_title || 'Proprietor')}" placeholder="e.g. Proprietor" />
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--settings-row-border, rgba(255, 255, 255, 0.08)); padding-top: 14px;">
                        <div class="billing-label" style="margin-bottom: 8px;">Saved Signature Image (Draw or Upload PNG, JPEG, or WebP)</div>
                        <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                            <div style="border: 1.5px dashed var(--settings-row-border, rgba(255, 255, 255, 0.2)); border-radius: 8px; background: rgba(255, 255, 255, 0.95); padding: 8px; width: 320px; height: 110px; display: flex; align-items: center; justify-content: center; position: relative;">
                                <canvas id="proprietorSigCanvas" width="300" height="94" style="width: 300px; height: 94px; cursor: crosshair; touch-action: none;"></canvas>
                                <button type="button" id="clearProprietorSigBtn" style="position: absolute; top: 4px; right: 4px; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; cursor: pointer;">Clear</button>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
                                <input type="file" id="proprietorSigFileInput" accept="image/png, image/jpeg, image/webp" style="display: none;">
                                <button type="button" id="uploadProprietorSigBtn" class="billing-save-btn" style="padding: 6px 14px; font-size: 12px; background: rgba(255,255,255,0.12); color: var(--settings-text, #fff); border: 1px solid var(--settings-row-border, rgba(255,255,255,0.2));">
                                    <span>📁</span> <span>Upload Signature Image</span>
                                </button>
                                <span style="font-size: 11px; opacity: 0.7;">Or draw your signature on the pad to the left.</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. Bank Account Details & Customizability -->
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
                                    <td>Company Name:</td>
                                    <td id="previewCompanyName" style="font-weight: 600; color: #60a5fa;">${this.escapeHtml(companyName)}</td>
                                </tr>
                                <tr>
                                    <td>GSTIN & PAN:</td>
                                    <td id="previewGstinPan" style="font-family: monospace;">${this.escapeHtml(companyGstin)} / ${this.escapeHtml(companyPan)}</td>
                                </tr>
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
        // Proprietor Signature Canvas & Upload Binding
        const propCanvas = this.container.querySelector('#proprietorSigCanvas');
        if (propCanvas) {
            const ctx = propCanvas.getContext('2d');
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#0f172a';

            if (this.settings.proprietor_signature_data) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, propCanvas.width, propCanvas.height);
                    ctx.drawImage(img, 10, 10, propCanvas.width - 20, propCanvas.height - 20);
                };
                img.src = this.settings.proprietor_signature_data;
            }

            let isDrawing = false;
            const getPos = (e) => {
                const rect = propCanvas.getBoundingClientRect();
                const scaleX = propCanvas.width / rect.width;
                const scaleY = propCanvas.height / rect.height;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
            };
            const startDraw = (e) => {
                isDrawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                e.preventDefault();
            };
            const draw = (e) => {
                if (!isDrawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                e.preventDefault();
            };
            const stopDraw = () => {
                if (isDrawing) {
                    ctx.closePath();
                    isDrawing = false;
                    this.settings.proprietor_signature_data = propCanvas.toDataURL('image/png');
                }
            };
            propCanvas.addEventListener('mousedown', startDraw);
            propCanvas.addEventListener('mousemove', draw);
            propCanvas.addEventListener('mouseup', stopDraw);
            propCanvas.addEventListener('mouseleave', stopDraw);
            propCanvas.addEventListener('touchstart', startDraw, { passive: false });
            propCanvas.addEventListener('touchmove', draw, { passive: false });
            propCanvas.addEventListener('touchend', stopDraw);

            this.container.querySelector('#clearProprietorSigBtn')?.addEventListener('click', () => {
                ctx.clearRect(0, 0, propCanvas.width, propCanvas.height);
                this.settings.proprietor_signature_data = '';
            });

            const uploadBtn = this.container.querySelector('#uploadProprietorSigBtn');
            const fileInput = this.container.querySelector('#proprietorSigFileInput');
            uploadBtn?.addEventListener('click', () => fileInput?.click());
            fileInput?.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        this.settings.proprietor_signature_data = ev.target.result;
                        const img = new Image();
                        img.onload = () => {
                            ctx.clearRect(0, 0, propCanvas.width, propCanvas.height);
                            ctx.drawImage(img, 10, 10, propCanvas.width - 20, propCanvas.height - 20);
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
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

        // 1b. Pending Dues Widget Toggle
        const toggleDuesBtn = this.container.querySelector('#toggleShowDuesWidget');
        const duesWidgetTag = this.container.querySelector('#duesWidgetTag');
        if (toggleDuesBtn) {
            toggleDuesBtn.addEventListener('click', () => {
                const isActive = toggleDuesBtn.classList.contains('active');
                if (isActive) {
                    toggleDuesBtn.classList.remove('active');
                    this.settings.invoice_show_dues_widget = 'false';
                    if (duesWidgetTag) {
                        duesWidgetTag.className = 'billing-badge-tag inactive';
                        duesWidgetTag.textContent = 'DISABLED';
                    }
                } else {
                    toggleDuesBtn.classList.add('active');
                    this.settings.invoice_show_dues_widget = 'true';
                    if (duesWidgetTag) {
                        duesWidgetTag.className = 'billing-badge-tag active';
                        duesWidgetTag.textContent = 'ENABLED';
                    }
                }
            });
        }

        const documentSignatureModeSelect = this.container.querySelector('#documentSignatureMode');
        const documentSignatureModeTag = this.container.querySelector('#documentSignatureModeTag');
        const proprietorPdfSignatureToggle = this.container.querySelector('#toggleProprietorPdfSignature');
        const proprietorPdfSignatureHint = this.container.querySelector('#proprietorPdfSignatureHint');
        const proprietorPdfSignatureTag = this.container.querySelector('#proprietorPdfSignatureTag');
        const updateProprietorSignatureHint = () => {
            if (!proprietorPdfSignatureHint) return;
            const mode = documentSignatureModeSelect?.value || 'traditional';
            const enabled = proprietorPdfSignatureToggle?.classList.contains('active');
            const hasImage = Boolean(String(this.settings.proprietor_signature_data || '').trim());
            if (!hasImage) {
                proprietorPdfSignatureHint.textContent = 'No proprietor image is saved yet. Save one in the Proprietor Signature section below; otherwise PDFs show the standard signatory line.';
            } else if (mode === 'auto_digital') {
                proprietorPdfSignatureHint.textContent = `Preference is ${enabled ? 'on' : 'off'} and remembered. Auto-digital PDFs use a generated notice; the image is used only in Traditional mode.`;
            } else if (enabled) {
                proprietorPdfSignatureHint.textContent = 'The saved image is placed above the signatory title on invoices and estimates.';
            } else {
                proprietorPdfSignatureHint.textContent = 'The saved image is omitted. Traditional PDFs show the standard signatory line.';
            }
        };
        proprietorPdfSignatureToggle?.addEventListener('click', () => {
            const enabled = proprietorPdfSignatureToggle.classList.toggle('active');
            proprietorPdfSignatureToggle.setAttribute('aria-pressed', String(enabled));
            if (proprietorPdfSignatureTag) {
                proprietorPdfSignatureTag.className = `billing-badge-tag ${enabled ? 'active' : 'inactive'}`;
                proprietorPdfSignatureTag.textContent = enabled ? 'ON' : 'OFF';
            }
            updateProprietorSignatureHint();
        });
        documentSignatureModeSelect?.addEventListener('change', () => {
            const isAutoDigital = documentSignatureModeSelect.value === 'auto_digital';
            if (documentSignatureModeTag) {
                documentSignatureModeTag.className = `billing-badge-tag ${isAutoDigital ? 'active' : 'inactive'}`;
                documentSignatureModeTag.textContent = isAutoDigital ? 'AUTO-DIGITAL' : 'TRADITIONAL';
            }
            updateProprietorSignatureHint();
        });

        // Invoice payment QR preference
        const toggleInvoiceClassicSignBtn = this.container.querySelector('#toggleInvoiceClassicSign');
        const invoiceClassicSignTag = this.container.querySelector('#invoiceClassicSignTag');
        if (toggleInvoiceClassicSignBtn) {
            toggleInvoiceClassicSignBtn.addEventListener('click', () => {
                const isActive = toggleInvoiceClassicSignBtn.classList.contains('active');
                if (isActive) {
                    toggleInvoiceClassicSignBtn.classList.remove('active');
                    this.settings.invoice_authority_sign_no_qr = 'false';
                    if (invoiceClassicSignTag) {
                        invoiceClassicSignTag.className = 'billing-badge-tag inactive';
                        invoiceClassicSignTag.textContent = 'PAYMENT QR AVAILABLE';
                    }
                } else {
                    toggleInvoiceClassicSignBtn.classList.add('active');
                    this.settings.invoice_authority_sign_no_qr = 'true';
                    if (invoiceClassicSignTag) {
                        invoiceClassicSignTag.className = 'billing-badge-tag active';
                        invoiceClassicSignTag.textContent = 'PAYMENT QR HIDDEN';
                    }
                }
            });
        }

        // 1d. Company Tax Identifiers Real-time Sync
        ['#settingCompanyName', '#settingCompanyGstin', '#settingCompanyPan'].forEach(sel => {
            const el = this.container.querySelector(sel);
            if (el) {
                el.addEventListener('input', () => this.updateLivePreview());
            }
        });

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

        // 9. Email Reminders Fast-Access Shortcut
        const emailShortcutBtn = this.container.querySelector('#openEmailRemindersSettingsBtn');
        if (emailShortcutBtn) {
            emailShortcutBtn.addEventListener('click', () => {
                const navItem = document.querySelector('.settings-sidebar-item[data-section="email-reminders"]');
                if (navItem) navItem.click();
            });
        }
    }

    updateLivePreview() {
        const compNameEl = this.container.querySelector('#previewCompanyName');
        const gstinPanEl = this.container.querySelector('#previewGstinPan');
        const holderEl = this.container.querySelector('#previewHolder');
        const numberEl = this.container.querySelector('#previewNumber');
        const ifscEl = this.container.querySelector('#previewIfsc');
        const branchEl = this.container.querySelector('#previewBranch');
        const mmidEl = this.container.querySelector('#previewMmid');
        const typeEl = this.container.querySelector('#previewType');
        const upiEl = this.container.querySelector('#previewUpi');

        const compNameVal = this.container.querySelector('#settingCompanyName')?.value || 'UTKAL CHEMICAL AUSHADHALAYA';
        const gstinVal = (this.container.querySelector('#settingCompanyGstin')?.value || '21AIDPF4446J1ZL').toUpperCase();
        const panVal = (this.container.querySelector('#settingCompanyPan')?.value || 'AIDPF4446J').toUpperCase();
        const holderVal = this.container.querySelector('#settingBankHolder')?.value || 'MD  FAIZAL';
        const numberVal = this.container.querySelector('#settingBankNumber')?.value || '50100673684509';
        const ifscVal = (this.container.querySelector('#settingBankIfsc')?.value || 'HDFC0000236').toUpperCase();
        const branchVal = this.container.querySelector('#settingBankBranch')?.value || 'CUTTACK - ODISHA';
        const mmidVal = this.container.querySelector('#settingBankMmid')?.value || '9240072';
        const typeVal = this.container.querySelector('#settingBankType')?.value || 'Savings Account';
        const upiVal = this.container.querySelector('#settingUpiId')?.value || '7749089400@hdfc';

        if (compNameEl) compNameEl.textContent = compNameVal;
        if (gstinPanEl) gstinPanEl.textContent = `${gstinVal} / ${panVal}`;
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
        const showDuesWidget = this.container.querySelector('#toggleShowDuesWidget')?.classList.contains('active') ? 'true' : 'false';
        const documentSignatureMode = this.container.querySelector('#documentSignatureMode')?.value || 'traditional';
        const useProprietorSignature = this.container.querySelector('#toggleProprietorPdfSignature')?.classList.contains('active') ? 'true' : 'false';
        const invoiceClassicSign = this.container.querySelector('#toggleInvoiceClassicSign')?.classList.contains('active') ? 'true' : 'false';
        const showMmid = this.container.querySelector('#toggleShowMmid')?.classList.contains('active') ? 'true' : 'false';

        const newSettings = {
            ...this.settings,
            invoice_duplex_print: isDuplex,
            invoice_show_dues_widget: showDuesWidget,
            document_signature_mode: documentSignatureMode,
            document_use_proprietor_signature: useProprietorSignature,
            invoice_authority_sign_no_qr: invoiceClassicSign,
            company_name: this.container.querySelector('#settingCompanyName')?.value?.trim() || 'UTKAL CHEMICAL AUSHADHALAYA',
            company_phone: this.container.querySelector('#settingCompanyPhone')?.value?.trim() || '',
            company_gstin: (this.container.querySelector('#settingCompanyGstin')?.value?.trim() || '21AIDPF4446J1ZL').toUpperCase(),
            company_pan: (this.container.querySelector('#settingCompanyPan')?.value?.trim() || 'AIDPF4446J').toUpperCase(),
            company_address_factory: this.container.querySelector('#settingCompanyFactAddr')?.value?.trim() || '',
            company_address_office: this.container.querySelector('#settingCompanyOfficeAddr')?.value?.trim() || '',
            company_email: this.container.querySelector('#settingCompanyEmail')?.value?.trim() || '',
            company_ayush_license: this.container.querySelector('#settingCompanyAyush')?.value?.trim() || '',
            company_gmp_ref: this.container.querySelector('#settingCompanyGmp')?.value?.trim() || '',
            proprietor_name: this.container.querySelector('#settingProprietorName')?.value?.trim() || 'MD  FAIZAL',
            proprietor_title: this.container.querySelector('#settingProprietorTitle')?.value?.trim() || 'Proprietor',
            proprietor_signature_data: this.settings.proprietor_signature_data || '',
            document_proprietor_signature_preference_set: 'true',
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
