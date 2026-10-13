/**
 * WeatherLocationModal - Modal for searching and selecting weather locations
 */
export class WeatherLocationModal {
  constructor(options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.onClose = options.onClose || (() => {});
    this.overlay = null;
    this.map = null;
    this.marker = null;
    this.searchTimeout = null;
    this.loadLeaflet().then(() => this.createModal());
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
    this.overlay.className = 'weather-modal-overlay';
    
    this.overlay.innerHTML = `
      <div class="weather-modal" style="width: 500px;">
        <div class="weather-modal-header">
          <h3 style="margin:0;">Change Location</h3>
          <button class="weather-modal-close" style="background:none;border:none;cursor:pointer;font-size:20px;">✕</button>
        </div>
        
        <div class="weather-search-container" style="display: flex; gap: 8px;">
          <input type="text" class="weather-search-input" placeholder="Type to search city..." style="flex: 1;">
          <button class="weather-btn current-loc-btn" title="Use Current Location" style="padding: 0 12px; height: 32px; min-width: unset;">📍</button>
        </div>
        
        <div class="weather-results" id="weatherSearchResults" style="max-height: 120px;"></div>
        
        <div class="weather-map-container" id="weatherMap" style="height: 250px; z-index: 1;"></div>
        <div id="weatherNearestCity" style="font-size: 11px; color: #007aff; margin-top: 5px; font-weight: 600; min-height: 15px;"></div>
        
        <div class="weather-modal-buttons">
          <button class="weather-btn secondary cancel-btn">Cancel</button>
          <button class="weather-btn primary ok-btn">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.initMap();
    this.setupEventListeners();
  }

  initMap() {
    const mapEl = this.overlay.querySelector('#weatherMap');
    this.map = L.map(mapEl).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      const nearestCityEl = this.overlay.querySelector('#weatherNearestCity');
      if (nearestCityEl) nearestCityEl.textContent = 'Finding nearest city...';
      
      this.updateSelectedLocation(lat, lng, 'Finding address...');
      
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await response.json();
        const cityName = data.address.city || data.address.town || data.address.village || data.address.suburb || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
        
        this.updateSelectedLocation(lat, lng, cityName);
        if (nearestCityEl) nearestCityEl.textContent = `Nearest City: ${cityName}`;
        this.overlay.querySelector('.weather-search-input').value = cityName;
      } catch (err) {
        this.updateSelectedLocation(lat, lng, `${lat.toFixed(2)}, ${lng.toFixed(2)}`);
        if (nearestCityEl) nearestCityEl.textContent = '';
      }
    });
  }

  updateSelectedLocation(lat, lon, name) {
    this.selectedLocation = { lat, lon, name };
    if (this.marker) this.map.removeLayer(this.marker);
    this.marker = L.marker([lat, lon]).addTo(this.map);
    if (name) this.marker.bindPopup(name).openPopup();
  }

  setupEventListeners() {
    const closeBtn = this.overlay.querySelector('.weather-modal-close');
    const cancelBtn = this.overlay.querySelector('.cancel-btn');
    const okBtn = this.overlay.querySelector('.ok-btn');
    const searchInput = this.overlay.querySelector('.weather-search-input');
    const locBtn = this.overlay.querySelector('.current-loc-btn');
    
    const close = () => {
      this.overlay.remove();
      this.onClose();
    };

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    locBtn.onclick = () => this.useCurrentLocation();

    searchInput.addEventListener('input', () => {
      clearTimeout(this.searchTimeout);
      const query = searchInput.value.trim();
      if (query.length > 2) {
        this.searchTimeout = setTimeout(() => this.searchCity(query), 500);
      }
    });

    okBtn.onclick = () => {
      if (this.selectedLocation) {
        this.onSelect(this.selectedLocation);
        close();
      } else {
        alert('Please select a location');
      }
    };
  }

  async useCurrentLocation() {
    const locBtn = this.overlay.querySelector('.current-loc-btn');
    const nearestCityEl = this.overlay.querySelector('#weatherNearestCity');
    
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

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
        const cityName = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || 'My Location';
        
        this.overlay.querySelector('.weather-search-input').value = cityName;
        if (nearestCityEl) nearestCityEl.textContent = `Nearest City: ${cityName}`;
        this.updateSelectedLocation(latitude, longitude, cityName);

      } catch (err) {
        console.error('Reverse geocoding failed:', err);
        if (nearestCityEl) nearestCityEl.textContent = 'Address lookup failed';
      } finally {
        locBtn.textContent = '📍';
        locBtn.disabled = false;
      }
    }, (err) => {
      console.warn('Geolocation error:', err);
      let errMsg = 'Could not get your location.';
      if (err.code === 1) {
        errMsg = 'Location permission was denied. Please allow location access in your browser or search for your city above.';
      } else if (err.code === 2) {
        errMsg = 'Location information is currently unavailable.';
      } else if (err.code === 3) {
        errMsg = 'Location request timed out. Please try again or search for your city.';
      }
      alert(errMsg);
      locBtn.textContent = '📍';
      locBtn.disabled = false;
      if (nearestCityEl) nearestCityEl.textContent = '';
    }, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000
    });
  }

  async searchCity(query) {
    const resultsContainer = this.overlay.querySelector('#weatherSearchResults');
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`);
      const data = await response.json();
      
      resultsContainer.innerHTML = '';
      if (data.results) {
        data.results.forEach(res => {
          const item = document.createElement('div');
          item.className = 'weather-result-item';
          item.textContent = `${res.name}, ${res.country || ''}`;
          item.onclick = () => {
            this.updateSelectedLocation(res.latitude, res.longitude, res.name);
            this.map.setView([res.latitude, res.longitude], 10);
            resultsContainer.innerHTML = '';
            this.overlay.querySelector('.weather-search-input').value = res.name;
            const nearestCityEl = this.overlay.querySelector('#weatherNearestCity');
            if (nearestCityEl) nearestCityEl.textContent = `Nearest City: ${res.name}`;
          };
          resultsContainer.appendChild(item);
        });
      }
    } catch (e) { console.error(e); }
  }
}
