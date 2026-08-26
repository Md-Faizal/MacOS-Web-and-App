import { getWeatherConditionText, getWeatherIconByCode, getAqiInfo } from './weather-utils.js';

/**
 * WeatherBigViewModal - A full-screen detailed weather forecast.
 * Features current conditions, 7-day forecast, and atmospheric details.
 */
export class WeatherBigViewModal {
  constructor(options) {
    this.data = options.data || {};
    this.city = options.city || 'Local Weather';
    this.onClose = options.onClose || (() => {});
    this.overlay = null;

    this.createModal();
  }

  createModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'mac-w-weather-big-view-overlay';

    const aqiInfo = getAqiInfo(this.data.aqi);
    const forecastHtml = this.data.forecast.map(day => {
      const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short' }).format(day.date);
      const icon = getWeatherIconByCode(day.code);
      const condition = getWeatherConditionText(day.code);
      return `
        <div class="mac-w-big-forecast-row">
          <div class="mac-w-big-forecast-day">${dayName}</div>
          <div class="mac-w-big-forecast-icon">${icon}</div>
          <div class="mac-w-big-forecast-condition">${condition}</div>
          <div class="mac-w-big-forecast-temp">
            <span class="high">${Math.round(day.high)}°</span>
            <span class="low">${Math.round(day.low)}°</span>
          </div>
        </div>
      `;
    }).join('');

    this.overlay.innerHTML = `
      <div class="mac-w-weather-big-view-modal">
        <button class="mac-w-weather-big-view-close">✕</button>
        <div class="mac-w-weather-big-view-content">
          <div class="mac-w-weather-big-view-left">
            <div class="mac-w-big-header">
              <h1 class="mac-w-big-city">${this.city}</h1>
              <div class="mac-w-big-temp">${Math.round(this.data.temp)}°</div>
              <div class="mac-w-big-condition">${this.data.condition}</div>
              <div class="mac-w-big-hi-lo">H: ${Math.round(this.data.high)}°  L: ${Math.round(this.data.low)}°</div>
              ${this.data.aqi !== undefined ? `<div class="mac-w-big-aqi-banner ${aqiInfo.class}">AQI ${this.data.aqi} • ${aqiInfo.label}</div>` : ''}
            </div>

            <div class="mac-w-big-stats-grid">
              <div class="mac-w-big-stat-card">
                <div class="label">Sunrise</div>
                <div class="value">${this.data.sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div class="mac-w-big-stat-card">
                <div class="label">Sunset</div>
                <div class="value">${this.data.sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div class="mac-w-big-stat-card">
                <div class="label">Wind</div>
                <div class="value">${this.data.windspeed} km/h</div>
              </div>
            </div>
          </div>

          <div class="mac-w-weather-big-view-right">
            <h2 class="mac-w-section-title">7-Day Forecast</h2>
            <div class="mac-w-big-forecast-list">
              ${forecastHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEventListeners();

    // Entry animation
    requestAnimationFrame(() => {
      this.overlay.classList.add('active');
    });
  }

  setupEventListeners() {
    const closeBtn = this.overlay.querySelector('.mac-w-weather-big-view-close');

    const close = () => {
      this.overlay.classList.remove('active');
      setTimeout(() => {
        this.overlay.remove();
        this.onClose();
      }, 400);
    };

    closeBtn.onclick = close;
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) close();
    };

    this.keydownHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', this.keydownHandler);
  }
}
