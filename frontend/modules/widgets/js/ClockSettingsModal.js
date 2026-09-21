/**
 * ClockSettingsModal - Modal for configuring system-wide clock settings
 */
const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

export class ClockSettingsModal {
  constructor(options = {}) {
    this.onSave = options.onSave || (() => {});
    this.onClose = options.onClose || (() => {});
    this.settings = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-system-time-settings'))) || {
      mode: 'auto',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cityName: 'Local Time',
      manualOffset: 0
    };
    this.worldClocks = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks'))) || [
      { id: 'cupertino', name: 'Cupertino', timezone: 'America/Los_Angeles' },
      { id: 'london', name: 'London', timezone: 'Europe/London' },
      { id: 'tokyo', name: 'Tokyo', timezone: 'Asia/Tokyo' }
    ];
    this.overlay = null;
    this.map = null;
    this.marker = null;
    this.searchTimeout = null;
    
    // Initialize
    this.init();
  }

  async init() {
    await this.loadLeaflet();
    await this.fetchSettings();
    this.createModal();
  }

  async fetchSettings() {
    try {
      const response = await fetch('/api/clock/settings');
      if (response.ok) {
        const data = await response.json();
        this.settings = {
          mode: data.mode || 'auto',
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          cityName: data.cityName || 'Local Time',
          manualOffset: data.manualOffset || 0
        };
        this.worldClocks = data.worldClocks || [];
      }
    } catch (err) {
      console.warn('Failed to fetch clock settings from server, using defaults/local:', err);
      // Fallback to local storage if API fails (for offline support)
      const localSettings = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-system-time-settings')));
      if (localSettings) this.settings = localSettings;
      
      const localWorldClocks = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks')));
      if (localWorldClocks) this.worldClocks = localWorldClocks;
    }
  }

  async loadLeaflet() {
    if (window.L) return;
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  createModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'weather-modal-overlay clock-settings-overlay';
    
    this.overlay.innerHTML = `
      <div class="weather-modal clock-settings-modal" style="width: 500px;">
        <div class="weather-modal-header">
          <h3 style="margin:0;">Date & Time Settings</h3>
          <button class="weather-modal-close" style="background:none;border:none;cursor:pointer;font-size:20px;">✕</button>
        </div>
        
        <div class="clock-settings-modes">
          <label class="clock-mode-tab ${this.settings.mode === 'auto' ? 'active' : ''}" data-mode="auto">Automatic</label>
          <label class="clock-mode-tab ${this.settings.mode === 'location' ? 'active' : ''}" data-mode="location">Location</label>
          <label class="clock-mode-tab ${this.settings.mode === 'manual' ? 'active' : ''}" data-mode="manual">Manual</label>
          <label class="clock-mode-tab" data-mode="global">Global</label>
        </div>

        <div class="clock-settings-content">
          <!-- Auto Mode -->
          <div class="clock-panel auto-panel ${this.settings.mode === 'auto' ? 'active' : ''}">
            <p style="font-size: 13px; opacity: 0.8; margin-bottom: 0;">System will use the browser's local time automatically.</p>
            <div class="clock-preview" id="autoPreview">--:--:--</div>
          </div>

          <!-- Location Mode -->
          <div class="clock-panel location-panel ${this.settings.mode === 'location' ? 'active' : ''}">
            <div class="weather-search-container" style="display: flex; gap: 8px;">
              <input type="text" class="weather-search-input clock-city-input" placeholder="Search city for timezone..." value="${this.settings.mode === 'location' ? this.settings.cityName : ''}">
              <button class="weather-btn current-loc-btn" title="Use Current Location" style="padding: 0 12px; height: 32px; flex-shrink: 0; min-width: unset;">📍</button>
            </div>
            <div class="weather-results" id="clockCityResults" style="max-height: 120px;"></div>
            <div class="weather-map-container" id="clockMap" style="height: 180px; margin-top: 10px; z-index: 1;"></div>
            <div id="clockNearestCity" style="font-size: 11px; color: #007aff; margin-top: 5px; font-weight: 600; min-height: 15px;"></div>
            <div class="clock-preview" id="locationPreview">--:--:--</div>
          </div>

          <!-- Manual Mode -->
          <div class="clock-panel manual-panel ${this.settings.mode === 'manual' ? 'active' : ''}">
            <div class="manual-pickers-container">
              <div class="mac-w-picker-highlight"></div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-year">▲</button>
                <div class="mac-w-picker" id="picker-year" data-type="year"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-year">▼</button>
              </div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-month">▲</button>
                <div class="mac-w-picker" id="picker-month" data-type="month"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-month">▼</button>
              </div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-date">▲</button>
                <div class="mac-w-picker" id="picker-date" data-type="date"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-date">▼</button>
              </div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-hour">▲</button>
                <div class="mac-w-picker" id="picker-hour" data-type="hour"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-hour">▼</button>
              </div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-min">▲</button>
                <div class="mac-w-picker" id="picker-min" data-type="min"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-min">▼</button>
              </div>
              <div class="mac-w-picker-column">
                <button class="mac-w-picker-arrow up" data-target="picker-ampm">▲</button>
                <div class="mac-w-picker" id="picker-ampm" data-type="ampm"></div>
                <button class="mac-w-picker-arrow down" data-target="picker-ampm">▼</button>
              </div>
            </div>
            <div class="manual-reset-container">
              <button class="manual-reset-btn">Reset to System Time</button>
            </div>
            <div class="clock-preview" id="manualPreview">--:--:--</div>
          </div>

          <!-- Global Mode (World Clocks Management) -->
          <div class="clock-panel global-panel">
            <div class="weather-search-container">
              <input type="text" class="weather-search-input world-search-input" placeholder="Add a city to World Clock...">
            </div>
            <div class="weather-results" id="worldSearchResults" style="max-height: 100px;"></div>
            
            <div style="margin-top: 10px; font-weight: 700; font-size: 13px;">Manage World Clocks</div>
            <div class="world-clock-list" style="max-height: 160px; overflow-y: auto; margin-top: 5px; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 5px;"></div>
          </div>
        </div>
        
        <div class="weather-modal-buttons">
          <button class="weather-btn secondary cancel-btn">Cancel</button>
          <button class="weather-btn primary save-btn">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.initMap();
    this.initPickers();
    this.setupEventListeners();
    this.startPreviews();
    this.renderWorldClockList();
  }

  renderWorldClockList() {
    const list = this.overlay.querySelector('.world-clock-list');
    if (!list) return;
    
    list.innerHTML = '';
    if (this.worldClocks.length === 0) {
      list.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; opacity: 0.5;">No world clocks added.</div>';
    }

    this.worldClocks.forEach((wc, index) => {
      const item = document.createElement('div');
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);';
      
      item.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 13px;">${wc.name}</div>
          <div style="font-size: 10px; opacity: 0.6;">${wc.timezone}</div>
        </div>
        <button class="remove-wc-btn" data-index="${index}" style="background: none; border: none; color: #ff3b30; cursor: pointer; font-size: 16px;">✕</button>
      `;
      
      item.querySelector('.remove-wc-btn').onclick = (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.worldClocks.splice(idx, 1);
        this.renderWorldClockList();
      };
      
      list.appendChild(item);
    });
  }

  initPickers() {
    const currentYear = new Date().getFullYear();
    const years = [];
    // Initial range: 10 years before and 50 years after current
    for (let i = currentYear - 10; i <= currentYear + 50; i++) years.push(i);
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dates = [];
    for (let i = 1; i <= 31; i++) dates.push(i);
    const hours = [];
    for (let i = 1; i <= 12; i++) hours.push(i);
    const mins = [];
    for (let i = 0; i <= 59; i++) mins.push(i.toString().padStart(2, '0'));
    const ampms = ['AM', 'PM'];

    this.renderPicker('picker-year', years);
    this.renderPicker('picker-month', months);
    this.renderPicker('picker-date', dates);
    this.renderPicker('picker-hour', hours);
    this.renderPicker('picker-min', mins);
    this.renderPicker('picker-ampm', ampms);

    const current = new Date(Date.now() + this.settings.manualOffset);
    this.setPickerValue('picker-year', current.getFullYear());
    this.setPickerValue('picker-month', months[current.getMonth()]);
    this.setPickerValue('picker-date', current.getDate());
    
    // Additional logic for infinite year scroll
    const yearPicker = this.overlay.querySelector('#picker-year');
    yearPicker.addEventListener('scroll', () => {
      const top = yearPicker.scrollTop;
      const bottom = yearPicker.scrollHeight - yearPicker.scrollTop - yearPicker.offsetHeight;
      
      if (top < 50) {
        // Prepend Years
        const firstYear = parseInt(yearPicker.querySelector('.mac-w-picker-item[data-value]').dataset.value);
        for (let i = 1; i <= 5; i++) {
          const div = document.createElement('div');
          div.className = 'mac-w-picker-item';
          div.textContent = firstYear - i;
          div.dataset.value = firstYear - i;
          yearPicker.insertBefore(div, yearPicker.children[1]); // Insert after padding
          yearPicker.scrollTop += 35; // Adjust scroll to stay on same item
        }
      } else if (bottom < 50) {
        // Append Years
        const lastYear = parseInt(Array.from(yearPicker.querySelectorAll('.mac-w-picker-item[data-value]')).pop().dataset.value);
        for (let i = 1; i <= 5; i++) {
          const div = document.createElement('div');
          div.className = 'mac-w-picker-item';
          div.textContent = lastYear + i;
          div.dataset.value = lastYear + i;
          yearPicker.insertBefore(div, yearPicker.lastChild); // Insert before padding
        }
      }
    });

    let h12 = current.getHours();
    const isPm = h12 >= 12;
    h12 = h12 % 12 || 12;
    this.setPickerValue('picker-hour', h12);
    this.setPickerValue('picker-min', current.getMinutes().toString().padStart(2, '0'));
    this.setPickerValue('picker-ampm', isPm ? 'PM' : 'AM');
  }

  renderPicker(id, items) {
    const picker = this.overlay.querySelector(`#${id}`);
    picker.innerHTML = '<div class="mac-w-picker-item" style="height:70px; cursor:default;"></div>';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'mac-w-picker-item';
      div.textContent = item;
      div.dataset.value = item;
      picker.appendChild(div);
    });
    picker.innerHTML += '<div class="mac-w-picker-item" style="height:70px; cursor:default;"></div>';
  }

  setPickerValue(id, value) {
    const picker = this.overlay.querySelector(`#${id}`);
    const items = picker.querySelectorAll('.mac-w-picker-item[data-value]');
    for (const item of items) {
      if (item.dataset.value == value) {
        picker.scrollTop = item.offsetTop - picker.offsetHeight / 2 + item.offsetHeight / 2;
        break;
      }
    }
  }

  getPickerValue(id) {
    const picker = this.overlay.querySelector(`#${id}`);
    const items = picker.querySelectorAll('.mac-w-picker-item[data-value]');
    if (!items.length) return null;

    const pickerCenter = picker.getBoundingClientRect().top + picker.offsetHeight / 2;
    let closest = null;
    let minDist = Infinity;

    items.forEach(item => {
      item.classList.remove('selected');
      const dist = Math.abs(pickerCenter - (item.getBoundingClientRect().top + item.offsetHeight / 2));
      if (dist < minDist) {
        minDist = dist;
        closest = item;
      }
    });

    if (closest) {
      closest.classList.add('selected');
      return closest.dataset.value;
    }
    return null;
  }

  initMap() {
    const mapEl = this.overlay.querySelector('#clockMap');
    this.map = L.map(mapEl).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);

    this.map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      this.updateSelectedLocation(lat, lng, 'Finding...');
      try {
        const tzResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=auto&current=temperature_2m`);
        const tzData = await tzResponse.json();
        const cityResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const cityData = await cityResponse.json();
        const cityName = cityData.address.city || cityData.address.town || cityData.address.village || 'Location';

        this.settings.timezone = tzData.timezone;
        this.settings.cityName = cityName;
        this.updateSelectedLocation(lat, lng, cityName);
        this.overlay.querySelector('.clock-city-input').value = cityName;
      } catch (err) {}
    });
  }

  updateSelectedLocation(lat, lon, name) {
    if (this.marker) this.map.removeLayer(this.marker);
    this.marker = L.marker([lat, lon]).addTo(this.map);
    if (name) this.marker.bindPopup(name).openPopup();
  }

  setupEventListeners() {
    const closeBtn = this.overlay.querySelector('.weather-modal-close');
    const cancelBtn = this.overlay.querySelector('.cancel-btn');
    const saveBtn = this.overlay.querySelector('.save-btn');
    const tabs = this.overlay.querySelectorAll('.clock-mode-tab');
    const cityInput = this.overlay.querySelector('.clock-city-input');
    const worldInput = this.overlay.querySelector('.world-search-input');
    const arrows = this.overlay.querySelectorAll('.mac-w-picker-arrow');
    const resetBtn = this.overlay.querySelector('.manual-reset-btn');
    const pickers = this.overlay.querySelectorAll('.mac-w-picker');
    const currentLocBtn = this.overlay.querySelector('.current-loc-btn');

    currentLocBtn.onclick = () => this.useCurrentLocation();

    arrows.forEach(arrow => {
      arrow.onclick = () => {
        const targetId = arrow.dataset.target;
        const picker = this.overlay.querySelector(`#${targetId}`);
        const isUp = arrow.classList.contains('up');
        picker.scrollBy({
          top: isUp ? -35 : 35,
          behavior: 'smooth'
        });
      };
    });

    const calcManualOffset = () => {
      const year = parseInt(this.getPickerValue('picker-year'));
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(this.getPickerValue('picker-month'));
      const date = parseInt(this.getPickerValue('picker-date'));
      let hour = parseInt(this.getPickerValue('picker-hour'));
      const minute = parseInt(this.getPickerValue('picker-min'));
      const isPm = this.getPickerValue('picker-ampm') === 'PM';

      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;

      const targetDate = new Date(year, month, date, hour, minute, 0);
      this.settings.manualOffset = targetDate.getTime() - Date.now();
    };

    pickers.forEach(p => {
      p.onscroll = () => {
        clearTimeout(p.scrollTimeout);
        p.scrollTimeout = setTimeout(calcManualOffset, 100);
      };
    });

    resetBtn.onclick = () => {
      this.settings.manualOffset = 0;
      this.initPickers();
    };

    const close = () => {
      this.overlay.remove();
      this.onClose();
    };

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        this.settings.mode = mode; // Correctly update current mode
        
        this.overlay.querySelectorAll('.clock-panel').forEach(p => p.classList.remove('active'));
        this.overlay.querySelector(`.${mode}-panel`).classList.add('active');
        
        if (mode === 'location' && this.map) {
          setTimeout(() => this.map.invalidateSize(), 100);
        }
        
        if (mode === 'manual') {
          calcManualOffset(); // Ensure offset is calculated when switching
        }
      };
    });

    cityInput.oninput = () => {
      clearTimeout(this.searchTimeout);
      const query = cityInput.value.trim();
      if (query.length > 2) this.searchTimeout = setTimeout(() => this.searchCity(query, '#clockCityResults'), 500);
    };

    worldInput.oninput = () => {
      clearTimeout(this.searchTimeout);
      const query = worldInput.value.trim();
      if (query.length > 2) this.searchTimeout = setTimeout(() => this.searchCity(query, '#clockCityResults'), 500);
    };

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      if (this.settings.mode === 'manual') {
        calcManualOffset(); // Final sync before saving
      }

      try {
        const response = await fetch('/api/clock/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: this.settings.mode,
            timezone: this.settings.timezone,
            cityName: this.settings.cityName,
            manualOffset: this.settings.manualOffset,
            worldClocks: this.worldClocks
          })
        });

        if (!response.ok) throw new Error('Failed to save settings to server');

        // Success - update local as well for immediate feedback and fallbacks
        localStorage.setItem(getScopedStorageKey('mac-system-time-settings'), JSON.stringify(this.settings));
        localStorage.setItem(getScopedStorageKey('mac-world-clocks'), JSON.stringify(this.worldClocks));
        
        window.dispatchEvent(new CustomEvent('mac-time-sync', { detail: this.settings }));
        window.dispatchEvent(new CustomEvent('mac-world-clock-sync'));
        this.onSave(this.settings);
        close();
      } catch (err) {
        console.error('Save failed:', err);
        alert('Failed to save settings: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
      }
    };
  }

  async useCurrentLocation() {
    const locBtn = this.overlay.querySelector('.current-loc-btn');
    const nearestCityEl = this.overlay.querySelector('#clockNearestCity');
    
    locBtn.textContent = '⏳';
    locBtn.disabled = true;
    if (nearestCityEl) nearestCityEl.textContent = 'Fetching geolocation...';

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      
      if (this.map) {
        this.map.setView([latitude, longitude], 12);
        this.updateSelectedLocation(latitude, longitude, 'Finding your city...');
      }

      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await response.json();
        const cityName = data.address.city || data.address.town || data.address.village || data.address.suburb || 'My Location';
        
        // Get timezone for these coordinates
        const tzResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`);
        const tzData = await tzResponse.json();

        this.settings.timezone = tzData.timezone;
        this.settings.cityName = cityName;
        this.settings.mode = 'location';

        this.overlay.querySelector('.clock-city-input').value = cityName;
        if (nearestCityEl) nearestCityEl.textContent = cityName;
        this.updateSelectedLocation(latitude, longitude, cityName);

      } catch (err) {
        console.error('Reverse geocoding failed:', err);
        if (nearestCityEl) nearestCityEl.textContent = 'Address lookup failed';
      } finally {
        locBtn.textContent = '📍';
        locBtn.disabled = false;
      }
    }, (err) => {
      console.error('Geolocation error:', err);
      alert('Could not get your location: ' + err.message);
      locBtn.textContent = '📍';
      locBtn.disabled = false;
      if (nearestCityEl) nearestCityEl.textContent = '';
    });
  }

  async searchCity(query, resultsId, isWorld = false) {
    const resultsContainer = this.overlay.querySelector(resultsId);
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`);
      const data = await response.json();
      resultsContainer.innerHTML = '';
      if (data.results) {
        data.results.forEach(res => {
          const item = document.createElement('div');
          item.className = 'weather-result-item';
          item.textContent = `${res.name}, ${res.country || ''} (${res.timezone})`;
          item.onclick = () => {
            if (isWorld) {
              if (this.worldClocks.length >= 10) return alert('Maximum 10 world clocks allowed.');
              this.worldClocks.push({ id: Date.now().toString(), name: res.name, timezone: res.timezone });
              this.renderWorldClockList();
              this.overlay.querySelector('.world-search-input').value = '';
              resultsContainer.innerHTML = '';
            } else {
              this.settings.timezone = res.timezone;
              this.settings.cityName = res.name;
              this.settings.mode = 'location';
              this.overlay.querySelector('.clock-city-input').value = res.name;
              if (this.map) {
                this.map.setView([res.latitude, res.longitude], 10);
                this.updateSelectedLocation(res.latitude, res.longitude, res.name);
              }
              resultsContainer.innerHTML = '';
            }
          };
          resultsContainer.appendChild(item);
        });
      }
    } catch (e) {}
  }

  startPreviews() {
    const update = () => {
      if (!document.body.contains(this.overlay)) return;
      const now = new Date();
      this.overlay.querySelector('#autoPreview').textContent = now.toLocaleTimeString();
      try {
        const locTime = new Date(now.toLocaleString('en-US', { timeZone: this.settings.timezone }));
        this.overlay.querySelector('#locationPreview').textContent = locTime.toLocaleTimeString();
      } catch (e) {
        this.overlay.querySelector('#locationPreview').textContent = 'Invalid Timezone';
      }
      const manualTime = new Date(now.getTime() + this.settings.manualOffset);
      this.overlay.querySelector('#manualPreview').textContent = manualTime.toLocaleTimeString();
      requestAnimationFrame(update);
    };
    update();
  }
}

