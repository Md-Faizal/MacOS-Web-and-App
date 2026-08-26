import"./modulepreload-polyfill-Dezn_h7o.js";document.addEventListener(`DOMContentLoaded`,()=>{let e=document.getElementById(`loadingState`),t=document.getElementById(`errorState`),n=document.getElementById(`productContent`),r=document.getElementById(`headerSearchContainer`),i=document.getElementById(`headerSearchInput`),a=document.getElementById(`headerAutofillGhost`),o=document.getElementById(`headerSearchDropdown`),s=document.getElementById(`headerSearchExpandBtn`),c=document.getElementById(`headerRecChips`),l=document.getElementById(`headerQuickCatalog`),u=document.getElementById(`searchModal`),d=document.getElementById(`searchInput`),f=document.getElementById(`searchClearBtn`),p=document.getElementById(`searchCloseBtn`),m=document.getElementById(`searchResults`),h=document.getElementById(`autofillGhostText`),g=document.getElementById(`recChips`),_=[],v=[{id:`1`,name:`Brahmi Amla Hair Oil`,category_name:`Hair Care`,classification:`Standard`,pack:`100 ml`,mrp:120,variants:[{pack_size_value:`100`,pack_size_type:`ml`,batches:[{batch_no:`BHA001`,mrp:120,mfg_date:`2023-01-15`,exp_date:`2026-01-14`}]}]},{id:`2`,name:`Chyawanprash Special`,category_name:`Immunity Builder`,classification:`Gold`,pack:`500 g`,mrp:350,variants:[{pack_size_value:`500`,pack_size_type:`g`,batches:[{batch_no:`CPS002`,mrp:350,mfg_date:`2023-05-10`,exp_date:`2026-05-09`}]}]},{id:`3`,name:`Ashwagandha Churna`,category_name:`Wellness`,classification:`Standard`,pack:`100 g`,mrp:180,variants:[{pack_size_value:`100`,pack_size_type:`g`,batches:[{batch_no:`AWC003`,mrp:180,mfg_date:`2023-08-20`,exp_date:`2025-08-19`}]}]},{id:`4`,name:`Triphala Guggulu`,category_name:`Digestive Health`,classification:`Standard`,pack:`60 Tablets`,mrp:150,variants:[{pack_size_value:`60`,pack_size_type:`Tablets`,batches:[{batch_no:`TPG004`,mrp:150,mfg_date:`2023-02-11`,exp_date:`2026-02-10`}]}]}],y=-1,b=``,x=new URLSearchParams(window.location.search),S=x.get(`sku`)||x.get(`id`);if(!S){let e=window.location.pathname.split(`/`);S=e[e.length-1],(S===`public-product.html`||S===``)&&(S=null)}S||=`1`,C(),O(),T(S);function C(){let e=document.getElementById(`customCursorDot`),t=document.getElementById(`customCursorRing`);if(!e||!t)return;let n=-100,r=-100,i=-100,a=-100;document.addEventListener(`mousemove`,t=>{n=t.clientX,r=t.clientY,e.style.transform=`translate3d(${n}px, ${r}px, 0)`});function o(){i+=(n-i)*.22,a+=(r-a)*.22,t.style.transform=`translate3d(${i-18}px, ${a-18}px, 0)`,requestAnimationFrame(o)}requestAnimationFrame(o),document.addEventListener(`mouseover`,e=>{e.target.closest(`a, button, input, .search-result-card, .rec-chip, .trust-pill, .header-preview-item, [role="button"]`)?document.body.classList.add(`cursor-hover`):document.body.classList.remove(`cursor-hover`)}),document.addEventListener(`mousedown`,()=>{document.body.classList.add(`cursor-active`)}),document.addEventListener(`mouseup`,()=>{document.body.classList.remove(`cursor-active`)})}function w(e,t){return!e||e.length===0?[]:[...e].sort(()=>.5-Math.random()).slice(0,Math.min(t,e.length))}async function T(e){try{let t=await fetch(`/api/products/public/${e}`),n=null;if(t.ok)n=await t.json(),n&&n.name&&n.name.toLowerCase().startsWith(`utkal `)&&(n.name=n.name.substring(6).trim());else{let t=await fetch(`/api/products/public/catalog`);t.ok&&(_=(await t.json()).map(e=>(e.name&&e.name.toLowerCase().startsWith(`utkal `)&&(e.name=e.name.substring(6).trim()),e)).sort(()=>.5-Math.random()),n=_.find(t=>String(t.id)===String(e)||String(t.name).toLowerCase()===String(e).toLowerCase()))}if(_.length===0)try{let e=await fetch(`/api/products/public/catalog`);e.ok&&(_=(await e.json()).map(e=>(e.name&&e.name.toLowerCase().startsWith(`utkal `)&&(e.name=e.name.substring(6).trim()),e)).sort(()=>.5-Math.random()))}catch{}if((!_||_.length===0)&&(_=v),n||(n=_.find(t=>String(t.id)===String(e)||String(t.name).toLowerCase()===String(e).toLowerCase()),n||=_[0]),!n)throw Error(`Product not found`);N(),P();let r=w(_.filter(e=>String(e.id)!==String(n.id)),3);E(n,r)}catch(e){console.error(`Failed to load product details:`,e),D()}}function E(r,i=[]){let a=r.classification===`Gold`,o=r.category_name||`Healthcare Formula`,s=(r.name||``).length,c=s>14?`0.50rem`:s>10?`0.58rem`:`0.68rem`,l=`
      <!-- Hero Product Section -->
      <section class="product-hero">
        <div class="hero-text-col">
          <span class="product-category-tag">UTKAL CHEMICAL • ${o}</span>
          <h1 class="hero-product-title">
            ${K(r.name)}
          </h1>

          <div class="badge-row">
            <div class="badge-classification ${a?`gold`:`standard`}">
              ${a?`★ PREMIUM FORMULA`:`STANDARD FORMULATION`}
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
                <div class="bottle-label-title" style="font-size: ${c};">${r.name.toUpperCase()}</div>
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
    `;r.variants&&r.variants.length>0?r.variants.forEach(e=>{let t=e.batches?e.batches.length:0;l+=`
          <div class="variant-card">
            <div class="variant-header">
              <span class="pack-size">PACK SIZE: ${e.pack_size_value} ${e.pack_size_type}</span>
              <span class="batch-count-badge">${t} ${t===1?`BATCH`:`BATCHES`}</span>
            </div>
        `,e.batches&&e.batches.length>0?(l+=`<div class="batches-container">`,e.batches.forEach(e=>{let t=typeof e.mrp==`number`?e.mrp.toFixed(2):parseFloat(e.mrp||0).toFixed(2);l+=`
              <div class="batch-item">
                <div class="batch-field">
                  <span class="batch-label">Batch Number</span>
                  <span class="batch-value">${e.batch_no}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Maximum Retail Price</span>
                  <span class="batch-value price">₹${t}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Manufacturing Date</span>
                  <span class="batch-value">${q(e.mfg_date)}</span>
                </div>
                <div class="batch-field">
                  <span class="batch-label">Expiry Date</span>
                  <span class="batch-value">${q(e.exp_date)}</span>
                </div>
              </div>
            `}),l+=`</div>`):l+=`<div style="padding: 1.2rem; font-size: 0.9rem; color: #666; font-weight: 600;">No active batches registered for this pack size.</div>`,l+=`</div>`}):l+=`
        <div class="glass-card" style="text-align: center; padding: 2rem;">
          <p style="font-weight: 700; color: #555;">No specific variants or batches registered yet for this product.</p>
        </div>
      `,l+=`</section>`,i&&i.length>0&&(l+=`
        <section class="related-products-section">
          <div class="section-title-wrapper">
            <h2 class="section-title">🧪 MORE FROM UTKAL CHEMICAL AUSHADHALAYA</h2>
          </div>
          <div class="related-grid">
      `,i.forEach(e=>{let t=e.category_name||`UTKAL FORMULA`;l+=`
          <div class="related-card">
            <div>
              <div class="related-cat">${t}</div>
              <h3 class="related-title">${e.name}</h3>
            </div>
            <a href="/public-product.html?sku=${e.id}" class="btn-view-product">VIEW DETAILS</a>
          </div>
        `}),l+=`
          </div>
        </section>
      `),n.innerHTML=l,e.style.display=`none`,t.style.display=`none`,n.style.display=`block`}function D(){e.style.display=`none`,n.style.display=`none`,t.style.display=`block`}async function O(){try{let e=await fetch(`/api/products/public/catalog`);if(e.ok){let t=await e.json();t&&t.length>0&&(_=t.map(e=>(e.name&&e.name.toLowerCase().startsWith(`utkal `)&&(e.name=e.name.substring(6).trim()),e)).sort(()=>.5-Math.random()))}}catch(e){console.warn(`Search engine catalog fetch failed:`,e)}(!_||_.length===0)&&(_=v),P(),N(),i&&(i.addEventListener(`focus`,()=>{P(),k()}),i.addEventListener(`click`,()=>{P(),k()}),i.addEventListener(`input`,e=>{let t=e.target.value;t.length>0&&(A(),j(t))})),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),A(),j(i?i.value:``)}),document.addEventListener(`click`,e=>{r&&!r.contains(e.target)&&!u.contains(e.target)&&A()}),p&&p.addEventListener(`click`,M),u&&u.addEventListener(`click`,e=>{e.target===u&&M()}),document.addEventListener(`keydown`,e=>{(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`k`?(e.preventDefault(),u.classList.contains(`active`)?M():(A(),j(``))):e.key===`Escape`&&(A(),u.classList.contains(`active`)&&M())}),d&&(d.addEventListener(`input`,F),d.addEventListener(`keydown`,V)),f&&f.addEventListener(`click`,()=>{d.value=``,F(),d.focus()}),N()}function k(){if(!o)return;o.classList.add(`active`);let e=i.closest(`.header-search-box`);e&&e.classList.add(`active`)}function A(){if(!o)return;o.classList.remove(`active`);let e=i.closest(`.header-search-box`);e&&e.classList.remove(`active`)}function j(e=``){u.classList.remove(`closing`),u.style.display=`flex`,u.offsetWidth,u.classList.add(`active`),d.value=e,y=-1,F(),setTimeout(()=>{d.focus(),d.setSelectionRange(e.length,e.length)},50)}function M(){u.classList.contains(`active`)&&(u.classList.add(`closing`),setTimeout(()=>{u.classList.remove(`active`),u.classList.remove(`closing`),u.style.display=`none`,i&&(i.value=``)},220))}function N(){let e=new Set;_&&_.length>0&&(_.forEach(t=>{let n=t.category_name||t.category;n&&n.trim()&&e.add(n.trim())}),w(_,3).forEach(t=>{t.name&&e.add(t.name)})),e.add(`GMP Certified`),e.add(`Gold Series`);let t=Array.from(e).slice(0,6).map(e=>`<button class="rec-chip" data-rec="${e}">${e}</button>`).join(``);g&&(g.innerHTML=t),c&&(c.innerHTML=t),document.querySelectorAll(`.rec-chip`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.rec;A(),j(n)})})}function P(){if(!l||_.length===0)return;let e=w(_,3),t=``;e.forEach(e=>{let n=e.category_name||`Ayush Product`;t+=`
        <a href="/public-product.html?sku=${e.id}" class="header-preview-item">
          <span>${e.name} <small style="color: #666; font-weight: 600;">(${n})</small></span>
          <span>➔</span>
        </a>
      `}),l.innerHTML=t}function F(){let e=d.value;if(f.style.display=e?`flex`:`none`,!e.trim()){h&&(h.innerHTML=``),a&&(a.innerHTML=``),b=``,I();return}let t=L(e,_);y=-1,B(t,e),z(e,t)}function I(){if(_.length===0){m.innerHTML=`<div class="no-results-box">Start typing to search Utkal Chemical products...</div>`;return}let e=w(_,5),t=`<div style="font-size: 0.7rem; font-weight: 900; color: #666; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 0.5rem;">FEATURED CATALOG SEARCH</div>`;e.forEach((e,n)=>{let r=e.category_name||`Ayush Product`,i=e.pack||(e.variants&&e.variants.length>0?`${e.variants[0].pack_size_value} ${e.variants[0].pack_size_type}`:`Standard`),a=e.mrp?`₹${parseFloat(e.mrp).toFixed(2)}`:`Verified`;t+=`
        <a href="/public-product.html?sku=${e.id}" class="search-result-card" data-index="${n}">
          <div class="search-res-info">
            <span class="search-res-cat">${r}</span>
            <span class="search-res-name">${e.name}</span>
            <span class="search-res-meta">Pack: ${i} • GMP Certified</span>
          </div>
          <div class="search-res-action">
            <span class="search-res-price">${a}</span>
            <span class="search-res-arrow">➔</span>
          </div>
        </a>
      `}),m.innerHTML=t}function L(e,t){let n=e.toLowerCase().trim(),r=[];return t.forEach(e=>{let t=(e.name||``).toLowerCase(),i=(e.category_name||``).toLowerCase(),a=String(e.id||``).toLowerCase(),o=(e.classification||``).toLowerCase(),s=0;if(t===n)s+=100;else if(t.startsWith(n))s+=80;else if(t.includes(` `+n))s+=60;else if(t.includes(n))s+=40;else if(i.includes(n)||a.includes(n)||o.includes(n))s+=30;else{let e=R(n,t);e>.4&&(s+=Math.round(e*25))}s>0&&r.push({item:e,score:s})}),r.sort((e,t)=>t.score-e.score),r.map(e=>e.item)}function R(e,t){let n=0,r=0,i=0;for(;n<e.length&&r<t.length;)e[n]===t[r]&&(i++,n++),r++;return n===e.length?i/t.length:0}function z(e,t){if(!t||t.length===0||!e.trim()){h&&(h.innerHTML=``),a&&(a.innerHTML=``),b=``;return}let n=t[0].name,r=e.toLowerCase(),i=n.toLowerCase();if(i.startsWith(r)&&i!==r){let t=n.substring(e.length);if(t.length>0){let r=`<span class="ghost-typed-space">${G(e)}</span><span class="ghost-suggested-text">${G(t)}</span><kbd class="ghost-tab-badge">Tab ↹</kbd>`;h&&(h.innerHTML=r),a&&(a.innerHTML=r),b=n;return}}h&&(h.innerHTML=``),a&&(a.innerHTML=``),b=``}function B(e,t){if(!e||e.length===0){m.innerHTML=`<div class="no-results-box">No products found matching "<strong>${G(t)}</strong>". Try searching for Syrup, Ayush, or GMP products.</div>`;return}let n=``;e.forEach((e,r)=>{let i=e.category_name||`Utkal Product`,a=U(e.name,t),o=e.pack||(e.variants&&e.variants.length>0?`${e.variants[0].pack_size_value} ${e.variants[0].pack_size_type}`:`Standard`),s=e.mrp?`₹${parseFloat(e.mrp).toFixed(2)}`:`Verified`;n+=`
        <a href="/public-product.html?sku=${e.id}" class="search-result-card" data-index="${r}">
          <div class="search-res-info">
            <span class="search-res-cat">${i}</span>
            <span class="search-res-name">${a}</span>
            <span class="search-res-meta">Pack: ${o} • Verified Genuine</span>
          </div>
          <div class="search-res-action">
            <span class="search-res-price">${s}</span>
            <span class="search-res-arrow">➔</span>
          </div>
        </a>
      `}),m.innerHTML=n}function V(e){let t=m.querySelectorAll(`.search-result-card`);if(e.key===`Tab`||e.key===`ArrowRight`&&d.selectionStart===d.value.length)b&&(e.preventDefault(),d.value=b,F());else if(e.key===`ArrowDown`){if(e.preventDefault(),t.length===0)return;y=(y+1)%t.length,H(t)}else if(e.key===`ArrowUp`){if(e.preventDefault(),t.length===0)return;y=(y-1+t.length)%t.length,H(t)}else e.key===`Enter`&&(y>=0&&t[y]?(e.preventDefault(),t[y].click()):t.length>0&&(e.preventDefault(),t[0].click()))}function H(e){e.forEach((e,t)=>{t===y?(e.classList.add(`selected`),e.scrollIntoView({block:`nearest`,behavior:`smooth`})):e.classList.remove(`selected`)})}function U(e,t){if(!t)return G(e);let n=t.trim(),r=RegExp(`(${W(n)})`,`gi`);return e.replace(r,`<mark>$1</mark>`)}function W(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}function G(e){return(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function K(e){if(!e)return`PRODUCT DETAILS`;let t=e.split(` `);return t.length>1?`${t.shift()} <span>${t.join(` `)}</span>`:e}function q(e){if(!e)return`N/A`;try{let t=new Date(e);if(isNaN(t.getTime()))return e;let n=t.getDate();return`${n}${n===1||n===21||n===31?`st`:n===2||n===22?`nd`:n===3||n===23?`rd`:`th`} ${t.toLocaleDateString(`en-GB`,{month:`short`})} ${t.getFullYear()}`}catch{return e}}});