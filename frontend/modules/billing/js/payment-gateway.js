/**
 * payment-gateway.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SpaceX / Cyber-Brutalist Widescreen Telemetry Cockpit Controller
 * Features:
 * - Dynamic cosmic starfield particle telemetry
 * - Multi-QR sequential tranche switcher (> ₹1 Lakh)
 * - Optical shutter / laser scanline reveal animation
 * - 3D cockpit perspective tracking on desktop
 * - 1-click clipboard copy with haptic toasts
 * - Zero-bank-API remittance notice pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ─── Extract Link Code ──────────────────────────────────────────────────────
  function extractLinkCode() {
    const path = window.location.pathname;
    const pMatch = path.match(/^\/(?:p|pay)\/([a-zA-Z0-9_-]+)/);
    if (pMatch && pMatch[1]) return pMatch[1];

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code') || urlParams.get('c') || '';
  }

  const code = extractLinkCode();
  let gatewayData = null;
  let activeTrancheIndex = 0;

  // DOM Elements
  const loadingView = document.getElementById('loadingView');
  const errorView = document.getElementById('errorView');
  const activeView = document.getElementById('activeView');
  const receiptView = document.getElementById('receiptView');
  const cockpitShell = document.getElementById('cockpitShell');

  const errorTitle = document.getElementById('errorTitle');
  const errorMsg = document.getElementById('errorMsg');

  const companyNameEl = document.getElementById('companyName');
  const linkRefTokenEl = document.getElementById('linkRefToken');
  const payableAmountEl = document.getElementById('payableAmount');
  const customerNameEl = document.getElementById('customerName');
  const paymentMemoEl = document.getElementById('paymentMemo');

  const trancheSection = document.getElementById('trancheSection');
  const tranchePills = document.getElementById('tranchePills');
  const trancheProgress = document.getElementById('trancheProgress');
  const terminalTrancheStatus = document.getElementById('terminalTrancheStatus');

  const qrImageEl = document.getElementById('qrImage');
  const launchUpiBtn = document.getElementById('launchUpiBtn');
  const assemblyOverlay = document.getElementById('assemblyOverlay');

  const tabBtnQr = document.getElementById('tabBtnQr');
  const tabBtnBank = document.getElementById('tabBtnBank');
  const bankSpecTable = document.getElementById('bankSpecTable');

  const bankHolderEl = document.getElementById('bankHolder');
  const bankBranchEl = document.getElementById('bankBranch');
  const bankAccNoEl = document.getElementById('bankAccNo');
  const bankIfscEl = document.getElementById('bankIfsc');
  const bankUpiEl = document.getElementById('bankUpi');

  const accordionTrigger = document.getElementById('accordionTrigger');
  const accordionContent = document.getElementById('accordionContent');
  const accordionArrow = document.getElementById('accordionArrow');

  const remittanceForm = document.getElementById('remittanceForm');
  const utrInput = document.getElementById('utrInput');
  const amountInput = document.getElementById('amountInput');
  const payerNameInput = document.getElementById('payerNameInput');
  const notesInput = document.getElementById('notesInput');
  const submitRemittanceBtn = document.getElementById('submitRemittanceBtn');

  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const printReceiptBtn = document.getElementById('printReceiptBtn');

  // Format INR Currency
  function formatINR(val) {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Toast
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2000);
  }

  // Copy Helper
  async function copyText(text, label) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast(`COPIED ${label.toUpperCase()}`);
      return true;
    } catch (_) {
      showToast('COPY FAILED');
      return false;
    }
  }

      // Copy Buttons
      document.querySelectorAll('.spec-copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetId = btn.getAttribute('data-copy-target');
          const targetEl = document.getElementById(targetId);
          if (!targetEl) return;
          const val = targetEl.textContent.trim().replace(/\s*•\s*/, ' - ');
          const label = targetEl.previousElementSibling ? targetEl.previousElementSibling.textContent : 'value';

          btn.classList.add('copied');
          btn.textContent = 'COPIED';
          await copyText(val, label);
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = 'Copy';
        }, 1400);
      });
    });

      // Switch Channels (QR vs Direct Bank)
      tabBtnQr.addEventListener('click', () => {
        tabBtnQr.classList.add('active');
        tabBtnBank.classList.remove('active');
        tabBtnQr.setAttribute('aria-selected', 'true');
        tabBtnBank.setAttribute('aria-selected', 'false');
        bankSpecTable.style.display = 'none';
      });

      tabBtnBank.addEventListener('click', () => {
        tabBtnBank.classList.add('active');
        tabBtnQr.classList.remove('active');
        tabBtnBank.setAttribute('aria-selected', 'true');
        tabBtnQr.setAttribute('aria-selected', 'false');
        bankSpecTable.style.display = 'flex';
      });

      // Drawer Accordion Toggle
      accordionTrigger.addEventListener('click', () => {
        const isOpen = accordionContent.classList.contains('open');
        if (isOpen) {
          accordionContent.classList.remove('open');
          accordionTrigger.setAttribute('aria-expanded', 'false');
          accordionArrow.textContent = '▼';
        } else {
          accordionContent.classList.add('open');
          accordionTrigger.setAttribute('aria-expanded', 'true');
          accordionArrow.textContent = '▲';
          utrInput.focus();
        }
      });

      // Print Receipt
      if (printReceiptBtn) {
        printReceiptBtn.addEventListener('click', () => {
          window.print();
        });
      }

      // Optical Shutter Aperture Animation
      function triggerApertureAnimation(callback) {
        if (!assemblyOverlay) {
          if (callback) callback();
          return;
        }
        assemblyOverlay.classList.add('active');
        setTimeout(() => {
          if (callback) callback();
          setTimeout(() => {
            assemblyOverlay.classList.remove('active');
          }, 160);
        }, 120);
      }

      // Select Active Tranche
      function selectTranche(index) {
        if (!gatewayData || !gatewayData.tranches || !gatewayData.tranches[index]) return;
        activeTrancheIndex = index;
        const tranche = gatewayData.tranches[index];

        triggerApertureAnimation(() => {
          qrImageEl.src = tranche.qr_data_url || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tranche.upi_uri)}`;
          launchUpiBtn.href = tranche.upi_uri;

          if (gatewayData.is_split) {
            terminalTrancheStatus.textContent = `TRANCHE 0${tranche.part} / 0${tranche.total_parts} // ${formatINR(tranche.amount)}`;
            trancheProgress.textContent = `PART ${tranche.part} OF ${tranche.total_parts}`;
            amountInput.value = Number(tranche.amount).toFixed(2);
          } else {
            terminalTrancheStatus.textContent = 'ACTIVE PAYLOAD';
            amountInput.value = Number(gatewayData.amount).toFixed(2);
          }

          // Update active pill style
          document.querySelectorAll('.tranche-pill').forEach((pill, pIdx) => {
            if (pIdx === index) pill.classList.add('active');
            else pill.classList.remove('active');
          });
        });
      }

      // Show Receipt View
      function showReceipt(info) {
        loadingView.style.display = 'none';
        activeView.style.display = 'none';
        receiptView.style.display = 'block';

        document.getElementById('receiptCustomer').textContent = info.customer_name || gatewayData?.customer_name || '-';
        document.getElementById('receiptAmount').textContent = formatINR(info.claimed_amount || gatewayData?.amount || 0);
        document.getElementById('receiptUtr').textContent = info.claimed_utr || 'Pending';
        document.getElementById('receiptRef').textContent = 'SYS // PAY-' + (info.link_code || code);

        const d = info.claimed_at ? new Date(info.claimed_at) : new Date();
        document.getElementById('receiptTime').textContent = d.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short'
        }) + ' IST';
      }

      // Populate Active Gateway Data
      function populateGateway(data) {
        gatewayData = data;

        // Flight Bar
        companyNameEl.textContent = data.company?.name || 'UTKAL CHEMICAL AUSHADHALAYA';
        linkRefTokenEl.textContent = `SYS // PAY-${data.code}`;

        // Balance Hero
        payableAmountEl.textContent = formatINR(data.amount);
        customerNameEl.textContent = data.customer_name || 'Customer';
        paymentMemoEl.textContent = data.description || 'SETTLEMENT RECORD';

          // Status Check
          if (data.status === 'CLAIMED' || data.status === 'SETTLED') {
            showReceipt(data);
            if (data.status === 'SETTLED') {
              document.querySelector('.receipt-heading').textContent = 'PAYMENT SETTLED & POSTED';
            }
            return;
          }

          // Banking Coordinates
          bankHolderEl.textContent = data.banking?.account_holder || 'MD  FAIZAL';
          bankBranchEl.textContent = data.banking?.bank_branch || 'CUTTACK - ODISHA';
          bankAccNoEl.textContent = data.banking?.account_number || '50100673684509';
          bankIfscEl.textContent = data.banking?.ifsc || 'HDFC0000236';
          bankUpiEl.textContent = data.banking?.upi_id || '7749089400@hdfc';

          // Multi-Tranche Rendering (> ₹1 Lakh)
          if (data.is_split && Array.isArray(data.tranches) && data.tranches.length > 1) {
            trancheSection.style.display = 'block';
            tranchePills.innerHTML = data.tranches.map((t, idx) => `
        <button type="button" class="tranche-pill ${idx === 0 ? 'active' : ''}" data-tranche-idx="${idx}">
          <span>0${t.part}</span>
          <span style="opacity:0.4;">//</span>
          <span>${formatINR(t.amount)}</span>
        </button>
      `).join('');

            tranchePills.querySelectorAll('.tranche-pill').forEach(btn => {
              btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-tranche-idx'), 10);
                selectTranche(idx);
              });
            });
          } else {
            trancheSection.style.display = 'none';
          }

          // Initialize first tranche
          selectTranche(0);

          loadingView.style.display = 'none';
          activeView.style.display = 'grid';
        }

        // Show Error View
        function showError(title, msg) {
          loadingView.style.display = 'none';
          activeView.style.display = 'none';
          receiptView.style.display = 'none';
          errorTitle.textContent = title;
          errorMsg.textContent = msg;
          errorView.style.display = 'block';
        }

        // Fetch Gateway Data
        async function fetchGatewayData() {
          if (!code) {
            showError('INVALID LINK', 'No payment link reference was identified in the URL.');
            return;
          }

          try {
            const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}`);
            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              showError('ORDER NOT FOUND', errJson.error || 'This payment link has reached its threshold or does not exist.');
              return;
            }

            const data = await res.json();
            if (data.is_expired) {
              showError('ORDER EXPIRED', 'This electronic payment order has reached its expiry threshold.');
              return;
            }

            populateGateway(data);
          } catch (_) {
            showError('CONNECTION FAILED', 'Unable to communicate with the settlement gateway. Please reload.');
          }
        }

        // Remittance Form Submission
        remittanceForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          const utr = utrInput.value.trim();
          const amount = Number(amountInput.value);
          const payerName = payerNameInput.value.trim();
          const notes = notesInput.value.trim();

          if (!utr) {
            showToast('ENTER TRANSACTION UTR');
            utrInput.focus();
            return;
          }

          if (isNaN(amount) || amount <= 0) {
            showToast('ENTER VALID AMOUNT');
            amountInput.focus();
            return;
          }

          submitRemittanceBtn.disabled = true;
          submitRemittanceBtn.textContent = 'TRANSMITTING RECEIPT...';

          try {
            const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                utr,
                amount,
                payerName,
                notes
              })
            });

            const json = await res.json();
            if (!res.ok) {
              throw new Error(json.error || 'Remittance registration failed.');
            }

            showToast('REMITTANCE REGISTERED');
            showReceipt({
              customer_name: gatewayData.customer_name,
              claimed_amount: amount,
              claimed_utr: utr,
              link_code: code,
              claimed_at: new Date().toISOString()
            });

          } catch (err) {
            showToast(err.message || 'SUBMISSION FAILED');
            submitRemittanceBtn.disabled = false;
            submitRemittanceBtn.textContent = 'DISPATCH SETTLEMENT RECEIPT';
          }
        });

        // ─── 3D Holographic Cockpit Tilt (Desktop) ──────────────────────────────────
        if (window.matchMedia('(min-width: 900px)').matches && cockpitShell) {
          document.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const { innerWidth, innerHeight } = window;
            const xPct = (clientX / innerWidth - 0.5) * 2;
            const yPct = (clientY / innerHeight - 0.5) * 2;

            const rotY = (xPct * 2.5).toFixed(2);
            const rotX = (-yPct * 2.5).toFixed(2);

            cockpitShell.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
          });
        }

        // ─── Background Cosmic Starfield Telemetry Engine ───────────────────────────
        function initStarfield() {
          const canvas = document.getElementById('starfieldCanvas');
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          let width = (canvas.width = window.innerWidth);
          let height = (canvas.height = window.innerHeight);

          window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
          });

          const STAR_COUNT = 85;
          const stars = [];

          for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
              x: Math.random() * width,
              y: Math.random() * height,
              size: Math.random() * 1.6 + 0.4,
              speedX: (Math.random() - 0.5) * 0.25,
              speedY: (Math.random() - 0.5) * 0.25,
              alpha: Math.random() * 0.6 + 0.2
            });
          }

          function renderStarfield() {
            ctx.clearRect(0, 0, width, height);

            // Draw faint constellation connections
            for (let i = 0; i < STAR_COUNT; i++) {
              for (let j = i + 1; j < STAR_COUNT; j++) {
                const dx = stars[i].x - stars[j].x;
                const dy = stars[i].y - stars[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 110) {
                  ctx.beginPath();
                  ctx.moveTo(stars[i].x, stars[i].y);
                  ctx.lineTo(stars[j].x, stars[j].y);
                  ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * (1 - dist / 110)})`;
                  ctx.stroke();
                }
              }
            }

            // Draw drifting particles
            for (let i = 0; i < STAR_COUNT; i++) {
              const s = stars[i];
              s.x += s.speedX;
              s.y += s.speedY;

              if (s.x < 0) s.x = width;
              if (s.x > width) s.x = 0;
              if (s.y < 0) s.y = height;
              if (s.y > height) s.y = 0;

              ctx.beginPath();
              ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
              ctx.fill();
            }

            requestAnimationFrame(renderStarfield);
          }

          renderStarfield();
        }

        // Initialize
        initStarfield();
        fetchGatewayData();
      })();
