// Public Product & Batch Verification Controller - Utkal Chemical Aushadhalaya
document.addEventListener('DOMContentLoaded', () => {
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const productContent = document.getElementById('productContent');

    // Stage 1 Centered Header Search Elements
    const headerSearchContainer = document.getElementById('headerSearchContainer');
    const headerSearchInput = document.getElementById('headerSearchInput');
    const headerAutofillGhost = document.getElementById('headerAutofillGhost');
    const headerSearchDropdown = document.getElementById('headerSearchDropdown');
    const headerSearchExpandBtn = document.getElementById('headerSearchExpandBtn');
    const headerRecChips = document.getElementById('headerRecChips');
    const headerQuickCatalog = document.getElementById('headerQuickCatalog');

    // Stage 2 Full Modal Popup Search Elements
    const searchModal = document.getElementById('searchModal');
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    const searchResults = document.getElementById('searchResults');
    const autofillGhostText = document.getElementById('autofillGhostText');
    const recChipsContainer = document.getElementById('recChips');

    let allCatalogProducts = [];
    const fallbackProducts = [
        {
            id: '1',
            name: 'Brahmi Amla Hair Oil',
            category_name: 'Hair Care',
            classification: 'Standard',
            pack: '100 ml',
            mrp: 120,
            variants: [{ pack_size_value: '100', pack_size_type: 'ml', batches: [{ batch_no: 'BHA001', mrp: 120, mfg_date: '2023-01-15', exp_date: '2026-01-14' }] }]
        },
        {
            id: '2',
            name: 'Chyawanprash Special',
            category_name: 'Immunity Builder',
            classification: 'Gold',
            pack: '500 g',
            mrp: 350,
            variants: [{ pack_size_value: '500', pack_size_type: 'g', batches: [{ batch_no: 'CPS002', mrp: 350, mfg_date: '2023-05-10', exp_date: '2026-05-09' }] }]
        },
        {
            id: '3',
            name: 'Ashwagandha Churna',
            category_name: 'Wellness',
            classification: 'Standard',
            pack: '100 g',
            mrp: 180,
            variants: [{ pack_size_value: '100', pack_size_type: 'g', batches: [{ batch_no: 'AWC003', mrp: 180, mfg_date: '2023-08-20', exp_date: '2025-08-19' }] }]
        },
        {
            id: '4',
            name: 'Triphala Guggulu',
            category_name: 'Digestive Health',
            classification: 'Standard',
            pack: '60 Tablets',
            mrp: 150,
            variants: [{ pack_size_value: '60', pack_size_type: 'Tablets', batches: [{ batch_no: 'TPG004', mrp: 150, mfg_date: '2023-02-11', exp_date: '2026-02-10' }] }]
        }
    ];

    let activeResultIndex = -1;
    let currentAutofillSuggestion = '';

    // Extract SKU/ID from URL pathname or query param
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
    const isBatchQr = pathParts.length >= 3 && pathParts[pathParts.length - 2] === 'batch';
    const isProductQr = pathParts.length >= 3 && pathParts[pathParts.length - 2] === 'product';
    const isCatalogQr = isBatchQr || isProductQr;
    const scannedBatch = isBatchQr ? {
        batchNo: pathParts[pathParts.length - 1],
        productId: urlParams.get('sku'),
        variantId: urlParams.get('variant_id'),
        batchId: urlParams.get('batch_id')
    } : null;
    let sku = (isBatchQr ? scannedBatch.productId : null) || urlParams.get('sku') || urlParams.get('id');

    if (!sku) {
        sku = pathParts[pathParts.length - 1];
        if (sku === 'public-product.html' || sku === '') {
            sku = null;
        }
    }

    // Default fallback demo if opened directly without param
    if (!sku) {
        sku = '1';
    }

    // Initialize Page, Search Engine & Custom Mouse Cursor
    initCustomCursor();
    initSearchEngine();
    fetchProductData(sku, scannedBatch, isCatalogQr);

    // ========================================================
    // CUSTOM MATCHING THEMED TRADITIONAL ARROW MOUSE CURSOR
    // ========================================================
    function initCustomCursor() {
        const dot = document.getElementById('customCursorDot');
        const ring = document.getElementById('customCursorRing');
        if (!dot || !ring) return;

        let mouseX = -100;
        let mouseY = -100;
        let ringX = -100;
        let ringY = -100;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            // Point of the traditional arrow SVG starts at (0, 0)
            dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
        });

        function animateRing() {
            ringX += (mouseX - ringX) * 0.22;
            ringY += (mouseY - ringY) * 0.22;
            ring.style.transform = `translate3d(${ringX - 18}px, ${ringY - 18}px, 0)`;
            requestAnimationFrame(animateRing);
        }
        requestAnimationFrame(animateRing);

        // Hover interactive state binding
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('a, button, input, .search-result-card, .rec-chip, .trust-pill, .header-preview-item, [role="button"]');
            if (target) {
                document.body.classList.add('cursor-hover');
            } else {
                document.body.classList.remove('cursor-hover');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.add('cursor-active');
        });
        document.addEventListener('mouseup', () => {
            document.body.classList.remove('cursor-active');
        });
    }

    // Random Array Sampling Utility
    function getRandomSample(arr, size) {
        if (!arr || arr.length === 0) return [];
        const shuffled = [...arr].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(size, arr.length));
    }

    // ========================================================
    // DATA FETCHING & RENDER ENGINE
    // ========================================================
    async function fetchProductData(productSku, scannedBatch = null, strictCatalogLookup = false) {
        try {
            const response = await fetch(`/api/products/public/${productSku}`);
            let product = null;

            if (response.ok) {
                product = await response.json();
                if (product && product.name && product.name.toLowerCase().startsWith('utkal ')) {
                    product.name = product.name.substring(6).trim();
                }
            } else {
                // Fallback attempt: fetch from list if public sku direct route returns 404
                const listResp = await fetch('/api/products/public/catalog');
                if (listResp.ok) {
                    const allProducts = await listResp.json();
                    allCatalogProducts = allProducts.map(p => {
                        if (p.name && p.name.toLowerCase().startsWith('utkal ')) {
                            p.name = p.name.substring(6).trim();
                        }
                        return p;
                    }).sort(() => 0.5 - Math.random());
                    product = allCatalogProducts.find(p => String(p.id) === String(productSku) || String(p.name).toLowerCase() === String(productSku).toLowerCase());
                }
            }

            // Ensure catalog is populated for search & dynamic tags
            if (allCatalogProducts.length === 0) {
                try {
                    const catResp = await fetch('/api/products/public/catalog');
                    if (catResp.ok) {
                        const rawCats = await catResp.json();
                        allCatalogProducts = rawCats.map(p => {
                            if (p.name && p.name.toLowerCase().startsWith('utkal ')) {
                                p.name = p.name.substring(6).trim();
                            }
                            return p;
                        }).sort(() => 0.5 - Math.random());
                    }
                } catch (e) { }
            }
            
            // Fallback to static mock data if API is empty/unreachable
            if ((!allCatalogProducts || allCatalogProducts.length === 0) && !strictCatalogLookup) {
                allCatalogProducts = fallbackProducts;
            }

            if (!product) {
                product = allCatalogProducts.find(p => String(p.id) === String(productSku) || String(p.name).toLowerCase() === String(productSku).toLowerCase());
            }

            if (!product) {
                throw new Error('Product not found. The QR may refer to a catalog entry that is no longer available.');
            }

            if (scannedBatch?.batchId) {
                const batchExists = (product.variants || []).some(variant =>
                    (!scannedBatch.variantId || String(variant.id) === String(scannedBatch.variantId)) &&
                    (variant.batches || []).some(batch => String(batch.id) === String(scannedBatch.batchId))
                );
                if (!batchExists) {
                    throw new Error('This batch QR does not match the current product catalog.');
                }
            }

            // Dynamically refresh search recommendations & randomized catalogs
            renderRecommendations();
            renderHeaderQuickCatalog();

            const relatedProducts = getRandomSample(allCatalogProducts.filter(p => String(p.id) !== String(product.id)), 3);
            renderProduct(product, relatedProducts, scannedBatch);
        } catch (error) {
            console.error('Failed to load product details:', error);
            showError();
        }
    }

    function renderProduct(product, related = [], scannedBatch = null) {
        const isGold = product.classification === 'Gold';
        const categoryName = product.category_name || 'Healthcare Formula';

        // Calculate dynamic font size for bottle label so long names wrap cleanly without overflowing
        const nameLen = (product.name || '').length;
        const labelFontSize = nameLen > 14 ? '0.50rem' : (nameLen > 10 ? '0.58rem' : '0.68rem');

        let html = `
      <!-- Hero Product Section -->
      <section class="product-hero">
        <div class="hero-text-col">
          <span class="product-category-tag">UTKAL CHEMICAL • ${categoryName}</span>
          <h1 class="hero-product-title">
            ${formatTitle(product.name)}
          </h1>

          <div class="badge-row">
            <div class="badge-classification ${isGold ? 'gold' : 'standard'}">
              ${isGold ? '★ PREMIUM FORMULA' : 'STANDARD FORMULATION'}
            </div>
            <div class="badge-classification gold">
              🏅 GMP CERTIFIED
            </div>
            <div class="badge-verified">
              ✓ BATCH VERIFIED
            </div>
          </div>

          <p class="hero-description">
            Authentic formulation crafted by <strong>Utkal Chemical Aushadhalaya</strong> — <em>Odisha's 2nd oldest AYUSH registered company (Estd. 1952)</em>. Manufactured in compliance with strict Good Manufacturing Practices (GMP) to ensure high efficacy, safety, and purity.
          </p>
        </div>

        <div class="product-mockup-wrapper">
          <div class="glass-card product-mockup-card">
            <div class="bracket-corner top-left"></div>
            <div class="bracket-corner top-right"></div>
            <div class="bracket-corner bottom-left"></div>
            <div class="bracket-corner bottom-right"></div>

            <div class="product-bottle-graphic">
              <div class="bottle-cap"></div>
              <div class="bottle-label">
                <div class="bottle-label-title" style="font-size: ${labelFontSize};">${product.name.toUpperCase()}</div>
                <div class="bottle-label-company">UTKAL CHEMICAL</div>
              </div>
            </div>

            <p style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.4rem;">
              Certified Authentic Product Record
            </p>
            <p style="font-size: 0.72rem; color: #555; font-weight: 800; margin-bottom: 0.8rem; text-transform: uppercase;">
              🏅 GMP Certified • Estd. 1952
            </p>

            <button class="btn-buy" onclick="window.print()">VERIFY & PRINT RECORD</button>
          </div>
        </div>
      </section>

      <!-- Highlighted Credentials Grid (4 Key Points) -->
      <section class="features-grid">
        <div class="feature-card">
          <div class="bracket-corner top-right"></div>
          <div class="icon-box icon-yellow">🏅</div>
          <h3>GMP CERTIFIED</h3>
          <p>Manufactured under stringent Good Manufacturing Practice guidelines with total quality control.</p>
        </div>

        <div class="feature-card">
          <div class="bracket-corner top-right"></div>
          <div class="icon-box icon-blue">🏛️</div>
          <h3>SINCE 1952</h3>
          <p>Odisha's 2nd oldest AYUSH registered company, bringing 70+ years of trusted healthcare legacy.</p>
        </div>

        <div class="feature-card">
          <div class="bracket-corner top-right"></div>
          <div class="icon-box icon-green">🧪</div>
          <h3>AUTHENTIC FORMULA</h3>
          <p>Compounded using pure active ingredients adhering to traditional & scientifically tested standards.</p>
        </div>

        <div class="feature-card">
          <div class="bracket-corner top-right"></div>
          <div class="icon-box icon-red">🛡️</div>
          <h3>FULL TRACEABILITY</h3>
          <p>Transparent batch verification, registered manufacturing numbers, and clear expiry tracking.</p>
        </div>
      </section>

      <!-- Available Variants & Batches Section -->
      <section class="variants-section">
        <div class="section-title-wrapper">
          <h2 class="section-title">📦 AVAILABLE PACK SIZES & BATCHES</h2>
        </div>
    `;

        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(variant => {
                const batchCount = variant.batches ? variant.batches.length : 0;
                html += `
          <div class="variant-card">
            <div class="variant-header">
              <span class="pack-size">PACK SIZE: ${variant.pack_size_value} ${variant.pack_size_type}</span>
              <span class="batch-count-badge">${batchCount} ${batchCount === 1 ? 'BATCH' : 'BATCHES'}</span>
            </div>
        `;

                if (variant.batches && variant.batches.length > 0) {
                    html += `<div class="batches-container">`;
                    variant.batches.forEach(batch => {
                        const mrpFormatted = typeof batch.mrp === 'number' ? batch.mrp.toFixed(2) : parseFloat(batch.mrp || 0).toFixed(2);
                        const isScannedBatch = scannedBatch && (
                            scannedBatch.batchId
                                ? String(batch.id) === String(scannedBatch.batchId)
                                : String(batch.batch_no || '').toLowerCase() === String(scannedBatch.batchNo || '').toLowerCase()
                        );
                        html += `
              <div class="batch-item"${isScannedBatch ? ' style="outline:3px solid #16a34a; outline-offset:2px;"' : ''}>
                ${isScannedBatch ? '<div style="font-weight:700; color:#15803d; margin-bottom:8px;">✓ Scanned batch</div>' : ''}
                <div class="batch-field">
                  <span class="batch-label">Batch Number</span>
                  <span class="batch-value">${batch.batch_no}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Maximum Retail Price</span>
                  <span class="batch-value price">₹${mrpFormatted}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Manufacturing Date</span>
                  <span class="batch-value">${formatDate(batch.mfg_date)}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Expiry Date</span>
                  <span class="batch-value">${formatDate(batch.exp_date)}</span>
                </div>
              </div>
            `;
                    });
                    html += `</div>`;
                } else {
                    html += `<div style="padding: 1.2rem; font-size: 0.9rem; color: #666; font-weight: 600;">No active batches registered for this pack size.</div>`;
                }

                html += `</div>`;
            });
        } else {
            html += `
        <div class="glass-card" style="text-align: center; padding: 2rem;">
          <p style="font-weight: 700; color: #555;">No specific variants or batches registered yet for this product.</p>
        </div>
      `;
        }

        html += `</section>`;

        // Related Products Section (Randomized)
        if (related && related.length > 0) {
            html += `
        <section class="related-products-section">
          <div class="section-title-wrapper">
            <h2 class="section-title">🧪 MORE FROM UTKAL CHEMICAL AUSHADHALAYA</h2>
          </div>
          <div class="related-grid">
      `;

            related.forEach(item => {
                const cat = item.category_name || 'UTKAL FORMULA';
                html += `
          <div class="related-card">
            <div>
              <div class="related-cat">${cat}</div>
              <h3 class="related-title">${item.name}</h3>
            </div>
            <a href="/public-product.html?sku=${item.id}" class="btn-view-product">VIEW DETAILS</a>
          </div>
        `;
            });

            html += `
          </div>
        </section>
      `;
        }

        productContent.innerHTML = html;

        // Switch states
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        productContent.style.display = 'block';
    }

    function showError() {
        loadingState.style.display = 'none';
        productContent.style.display = 'none';
        errorState.style.display = 'block';
    }

    // ========================================================
    // TWO-STAGE SEARCH: CENTERED HEADER EXPAND + DYNAMIC MODAL MORPHING
    // ========================================================
    async function initSearchEngine() {
        try {
            const resp = await fetch('/api/products/public/catalog');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.length > 0) {
                    allCatalogProducts = data.map(p => {
                        if (p.name && p.name.toLowerCase().startsWith('utkal ')) {
                            p.name = p.name.substring(6).trim();
                        }
                        return p;
                    }).sort(() => 0.5 - Math.random());
                }
            }
        } catch (e) {
            console.warn('Search engine catalog fetch failed:', e);
        }

        if (!allCatalogProducts || allCatalogProducts.length === 0) {
            allCatalogProducts = fallbackProducts;
        }

        renderHeaderQuickCatalog();
        renderRecommendations();

        // --- STAGE 1: Header Search Click / Focus (Expands Downwards directly below) ---
        if (headerSearchInput) {
            headerSearchInput.addEventListener('focus', () => {
                renderHeaderQuickCatalog(); // Re-randomize on focus!
                openHeaderDropdown();
            });
            headerSearchInput.addEventListener('click', () => {
                renderHeaderQuickCatalog();
                openHeaderDropdown();
            });
            
            // STAGE 2 DYNAMIC MORPHING CONVERSION: As soon as user starts typing in header
            headerSearchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val.length > 0) {
                    closeHeaderDropdown();
                    openSearchModalWithQuery(val);
                }
            });
        }

        // Manual Expand Button in Top Right of Popdown Dropdown
        if (headerSearchExpandBtn) {
            headerSearchExpandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeHeaderDropdown();
                openSearchModalWithQuery(headerSearchInput ? headerSearchInput.value : '');
            });
        }

        // Global Click outside to collapse Header Dropdown
        document.addEventListener('click', (e) => {
            if (headerSearchContainer && !headerSearchContainer.contains(e.target) && !searchModal.contains(e.target)) {
                closeHeaderDropdown();
            }
        });

        // Stage 2 Modal Controls
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', closeSearchModal);
        }
        if (searchModal) {
            searchModal.addEventListener('click', (e) => {
                if (e.target === searchModal) closeSearchModal();
            });
        }

        // Global Hotkey (Ctrl + K / Cmd + K / ESC)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (searchModal.classList.contains('active')) {
                    closeSearchModal();
                } else {
                    closeHeaderDropdown();
                    openSearchModalWithQuery('');
                }
            } else if (e.key === 'Escape') {
                closeHeaderDropdown();
                if (searchModal.classList.contains('active')) {
                    closeSearchModal();
                }
            }
        });

        // Search Input Events in Modal
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('keydown', handleSearchKeydown);
        }

        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                handleSearchInput();
                searchInput.focus();
            });
        }

        renderRecommendations();
    }

    function openHeaderDropdown() {
        if (!headerSearchDropdown) return;
        headerSearchDropdown.classList.add('active');
        const box = headerSearchInput.closest('.header-search-box');
        if (box) box.classList.add('active');
    }

    function closeHeaderDropdown() {
        if (!headerSearchDropdown) return;
        headerSearchDropdown.classList.remove('active');
        const box = headerSearchInput.closest('.header-search-box');
        if (box) box.classList.remove('active');
    }

    function openSearchModalWithQuery(initialQuery = '') {
        searchModal.classList.remove('closing');
        searchModal.style.display = 'flex';
        void searchModal.offsetWidth; // Reflow for morphing animation
        searchModal.classList.add('active');
        
        searchInput.value = initialQuery;
        activeResultIndex = -1;
        
        handleSearchInput();
        setTimeout(() => {
            searchInput.focus();
            searchInput.setSelectionRange(initialQuery.length, initialQuery.length);
        }, 50);
    }

    function closeSearchModal() {
        if (!searchModal.classList.contains('active')) return;
        searchModal.classList.add('closing');
        setTimeout(() => {
            searchModal.classList.remove('active');
            searchModal.classList.remove('closing');
            searchModal.style.display = 'none';
            if (headerSearchInput) {
                headerSearchInput.value = '';
            }
        }, 220); // Smooth 220ms exit animation matching CSS timing
    }

    // DYNAMIC RECOMMENDATIONS derived from real database categories & catalog products
    function renderRecommendations() {
        const tagsSet = new Set();

        if (allCatalogProducts && allCatalogProducts.length > 0) {
            // 1. Extract real unique categories
            allCatalogProducts.forEach(p => {
                const cat = p.category_name || p.category;
                if (cat && cat.trim()) {
                    tagsSet.add(cat.trim());
                }
            });

            // 2. Extract random product names
            getRandomSample(allCatalogProducts, 3).forEach(p => {
                if (p.name) tagsSet.add(p.name);
            });
        }

        // 3. Essential brand tag highlights
        tagsSet.add('GMP Certified');
        tagsSet.add('Gold Series');

        // Pick top 6 dynamic tags
        const dynamicTags = Array.from(tagsSet).slice(0, 6);
        let html = dynamicTags.map(tag => `<button class="rec-chip" data-rec="${tag}">${tag}</button>`).join('');

        if (recChipsContainer) recChipsContainer.innerHTML = html;
        if (headerRecChips) headerRecChips.innerHTML = html;

        // Bind clicks for recommendation chips
        document.querySelectorAll('.rec-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.rec;
                closeHeaderDropdown();
                openSearchModalWithQuery(text);
            });
        });
    }

    // RANDOMIZED QUICK CATALOG PREVIEW
    function renderHeaderQuickCatalog() {
        if (!headerQuickCatalog || allCatalogProducts.length === 0) return;
        const randomItems = getRandomSample(allCatalogProducts, 3);
        let html = '';
        randomItems.forEach(p => {
            const cat = p.category_name || 'Ayush Product';
            html += `
        <a href="/public-product.html?sku=${p.id}" class="header-preview-item">
          <span>${p.name} <small style="color: #666; font-weight: 600;">(${cat})</small></span>
          <span>➔</span>
        </a>
      `;
        });
        headerQuickCatalog.innerHTML = html;
    }

    function handleSearchInput() {
        const query = searchInput.value;
        searchClearBtn.style.display = query ? 'flex' : 'none';

        if (!query.trim()) {
            if (autofillGhostText) autofillGhostText.innerHTML = '';
            if (headerAutofillGhost) headerAutofillGhost.innerHTML = '';
            currentAutofillSuggestion = '';
            renderDefaultRecommendationsView();
            return;
        }

        // Perform Fuzzy Search
        const results = performFuzzySearch(query, allCatalogProducts);
        activeResultIndex = -1;
        renderSearchResults(results, query);

        // Update Visual Autofill Ghost Hint
        updateAutofillGhost(query, results);
    }

    // RANDOMIZED FEATURED CATALOG SEARCH VIEW
    function renderDefaultRecommendationsView() {
        if (allCatalogProducts.length === 0) {
            searchResults.innerHTML = `<div class="no-results-box">Start typing to search Utkal Chemical products...</div>`;
            return;
        }

        const randomFeatured = getRandomSample(allCatalogProducts, 5);
        let html = `<div style="font-size: 0.7rem; font-weight: 900; color: #666; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 0.5rem;">FEATURED CATALOG SEARCH</div>`;
        randomFeatured.forEach((p, idx) => {
            const cat = p.category_name || 'Ayush Product';
            const packText = p.pack || (p.variants && p.variants.length > 0 ? `${p.variants[0].pack_size_value} ${p.variants[0].pack_size_type}` : 'Standard');
            const priceText = p.mrp ? `₹${parseFloat(p.mrp).toFixed(2)}` : 'Verified';

            html += `
        <a href="/public-product.html?sku=${p.id}" class="search-result-card" data-index="${idx}">
          <div class="search-res-info">
            <span class="search-res-cat">${cat}</span>
            <span class="search-res-name">${p.name}</span>
            <span class="search-res-meta">Pack: ${packText} • GMP Certified</span>
          </div>
          <div class="search-res-action">
            <span class="search-res-price">${priceText}</span>
            <span class="search-res-arrow">➔</span>
          </div>
        </a>
      `;
        });
        searchResults.innerHTML = html;
    }

    // ========================================================
    // FUZZY SEARCH ALGORITHM WITH TYPO TOLERANCE & HIGHLIGHTING
    // ========================================================
    function performFuzzySearch(query, catalog) {
        const q = (query || '').trim();
        if (!q) return catalog;

        // Fast-Path: Rust WebAssembly high-precision typo-tolerant fuzzy search (<0.5ms)
        if (typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded()) {
            try {
                const wasmResults = window.SuiteCoreBridge.searchCatalog(q, catalog, { min_score: 25.0, limit: 100 });
                if (Array.isArray(wasmResults) && wasmResults.length > 0) {
                    return wasmResults;
                }
            } catch (err) {
                console.warn('[PublicProduct] WASM fuzzy search fallback:', err);
            }
        }

        const qLower = q.toLowerCase();
        const scored = [];

        catalog.forEach(item => {
            const name = (item.name || '').toLowerCase();
            const cat = (item.category_name || '').toLowerCase();
            const skuStr = String(item.id || '').toLowerCase();
            const classStr = (item.classification || '').toLowerCase();

            let score = 0;

            // Exact match
            if (name === q) score += 100;
            // Starts with query
            else if (name.startsWith(q)) score += 80;
            // Word boundary match
            else if (name.includes(' ' + q)) score += 60;
            // Substring match
            else if (name.includes(q)) score += 40;
            // Category / SKU / Class match
            else if (cat.includes(q) || skuStr.includes(q) || classStr.includes(q)) score += 30;
            else {
                // Character sequence fuzzy match
                const fScore = calculateFuzzyMatchScore(q, name);
                if (fScore > 0.4) {
                    score += Math.round(fScore * 25);
                }
            }

            if (score > 0) {
                scored.push({ item, score });
            }
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.map(s => s.item);
    }

    function calculateFuzzyMatchScore(pattern, target) {
        let patternIdx = 0;
        let targetIdx = 0;
        let matchedCount = 0;

        while (patternIdx < pattern.length && targetIdx < target.length) {
            if (pattern[patternIdx] === target[targetIdx]) {
                matchedCount++;
                patternIdx++;
            }
            targetIdx++;
        }

        if (patternIdx === pattern.length) {
            return matchedCount / target.length;
        }
        return 0;
    }

    function updateAutofillGhost(query, results) {
        if (!results || results.length === 0 || !query.trim()) {
            if (autofillGhostText) autofillGhostText.innerHTML = '';
            if (headerAutofillGhost) headerAutofillGhost.innerHTML = '';
            currentAutofillSuggestion = '';
            return;
        }

        const topMatch = results[0];
        const name = topMatch.name;
        const qLower = query.toLowerCase();
        const nameLower = name.toLowerCase();

        // Only show ghost text and Tab badge if the input is a strict prefix AND there are remaining un-typed characters!
        if (nameLower.startsWith(qLower) && nameLower !== qLower) {
            const remaining = name.substring(query.length);
            if (remaining.length > 0) {
                const html = `<span class="ghost-typed-space">${escapeHtml(query)}</span><span class="ghost-suggested-text">${escapeHtml(remaining)}</span><kbd class="ghost-tab-badge">Tab ↹</kbd>`;
                
                if (autofillGhostText) autofillGhostText.innerHTML = html;
                if (headerAutofillGhost) headerAutofillGhost.innerHTML = html;
                currentAutofillSuggestion = name;
                return;
            }
        }

        // If exact match (user pressed TAB or typed the full string), immediately hide the ghost and floating Tab badge!
        if (autofillGhostText) autofillGhostText.innerHTML = '';
        if (headerAutofillGhost) headerAutofillGhost.innerHTML = '';
        currentAutofillSuggestion = '';
    }

    function renderSearchResults(results, query) {
        if (!results || results.length === 0) {
            searchResults.innerHTML = `<div class="no-results-box">No products found matching "<strong>${escapeHtml(query)}</strong>". Try searching for Syrup, Ayush, or GMP products.</div>`;
            return;
        }

        let html = '';
        results.forEach((p, idx) => {
            const cat = p.category_name || 'Utkal Product';
            const highlightedName = highlightMatch(p.name, query);
            const packText = p.pack || (p.variants && p.variants.length > 0 ? `${p.variants[0].pack_size_value} ${p.variants[0].pack_size_type}` : 'Standard');
            const priceText = p.mrp ? `₹${parseFloat(p.mrp).toFixed(2)}` : 'Verified';

            html += `
        <a href="/public-product.html?sku=${p.id}" class="search-result-card" data-index="${idx}">
          <div class="search-res-info">
            <span class="search-res-cat">${cat}</span>
            <span class="search-res-name">${highlightedName}</span>
            <span class="search-res-meta">Pack: ${packText} • Verified Genuine</span>
          </div>
          <div class="search-res-action">
            <span class="search-res-price">${priceText}</span>
            <span class="search-res-arrow">➔</span>
          </div>
        </a>
      `;
        });

        searchResults.innerHTML = html;
    }

    // Keydown Navigation & Tab Autofill Handling
    function handleSearchKeydown(e) {
        const cards = searchResults.querySelectorAll('.search-result-card');

        if (e.key === 'Tab' || (e.key === 'ArrowRight' && searchInput.selectionStart === searchInput.value.length)) {
            if (currentAutofillSuggestion) {
                e.preventDefault();
                searchInput.value = currentAutofillSuggestion;
                handleSearchInput(); // Triggers updateAutofillGhost which clears the Tab badge!
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (cards.length === 0) return;
            activeResultIndex = (activeResultIndex + 1) % cards.length;
            updateActiveCard(cards);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (cards.length === 0) return;
            activeResultIndex = (activeResultIndex - 1 + cards.length) % cards.length;
            updateActiveCard(cards);
        } else if (e.key === 'Enter') {
            if (activeResultIndex >= 0 && cards[activeResultIndex]) {
                e.preventDefault();
                cards[activeResultIndex].click();
            } else if (cards.length > 0) {
                e.preventDefault();
                cards[0].click();
            }
        }
    }

    function updateActiveCard(cards) {
        cards.forEach((c, idx) => {
            if (idx === activeResultIndex) {
                c.classList.add('selected');
                c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                c.classList.remove('selected');
            }
        });
    }

    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);
        const q = query.trim();
        const regex = new RegExp(`(${escapeRegExp(q)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatTitle(name) {
        if (!name) return 'PRODUCT DETAILS';
        const parts = name.split(' ');
        if (parts.length > 1) {
            const first = parts.shift();
            return `${first} <span>${parts.join(' ')}</span>`;
        }
        return name;
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const day = date.getDate();
            const suffix = (day === 1 || day === 21 || day === 31) ? 'st' :
                (day === 2 || day === 22) ? 'nd' :
                    (day === 3 || day === 23) ? 'rd' : 'th';
            const month = date.toLocaleDateString('en-GB', { month: 'short' });
            const year = date.getFullYear();
            return `${day}${suffix} ${month} ${year}`;
        } catch (e) {
            return dateStr;
        }
    }
});
