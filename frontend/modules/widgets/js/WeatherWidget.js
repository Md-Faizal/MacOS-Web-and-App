import { WeatherLocationModal } from './WeatherLocationModal.js';
import { WeatherBigViewModal } from './WeatherBigViewModal.js';
import { getWeatherConditionText, getWeatherIconByCode, getAqiInfo } from './weather-utils.js';

/**
 * WeatherWidget - Real-time animated weather card.
 */
export function createWeatherWidget() {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-weather';
  container.style.height = '100%';
  
  // State
  let state = {
    city: localStorage.getItem('weather-city') || 'London',
    lat: localStorage.getItem('weather-lat') || 51.5074,
    lon: localStorage.getItem('weather-lon') || -0.1278,
    unit: localStorage.getItem('weather-unit') || 'C',
    isExpanded: localStorage.getItem('weather-expanded') === 'true',
    data: null
  };

  const fetchServerSettings = async () => {
    try {
      const response = await fetch('/api/weather/settings');
      if (response.ok) {
        const data = await response.json();
        
        // If the server says these are default settings, try to get current location
        if (data.isDefault) {
          const success = await tryFetchCurrentLocation();
          if (success) return; 
          // If geolocation fails, continue with defaults
        }

        state.city = data.city || state.city;
        state.lat = data.lat || state.lat;
        state.lon = data.lon || state.lon;
        state.unit = data.unit || state.unit;
        state.isExpanded = !!data.isExpanded;
        
        // Sync back to local for faster next boot
        localStorage.setItem('weather-city', state.city);
        localStorage.setItem('weather-lat', state.lat);
        localStorage.setItem('weather-lon', state.lon);
        localStorage.setItem('weather-unit', state.unit);
        localStorage.setItem('weather-expanded', state.isExpanded);

        updateWidget();
        fetchWeather();
      }
    } catch (e) {
      console.warn('WeatherWidget: Failed to fetch server settings:', e);
    }
  };

  const tryFetchCurrentLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get city name
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await response.json();
          const cityName = data.address.city || data.address.town || data.address.village || data.address.suburb || 'My Location';
          
          state.city = cityName;
          state.lat = latitude;
          state.lon = longitude;
          
          localStorage.setItem('weather-city', state.city);
          localStorage.setItem('weather-lat', state.lat);
          localStorage.setItem('weather-lon', state.lon);
          
          saveServerSettings();
          updateWidget();
          fetchWeather();
          resolve(true);
        } catch (err) {
          console.error('WeatherWidget: Reverse geocoding failed:', err);
          resolve(false);
        }
      }, (err) => {
        console.warn('WeatherWidget: Geolocation denied or failed:', err);
        resolve(false);
      }, { timeout: 10000 });
    });
  };

  const saveServerSettings = async () => {
    try {
      await fetch('/api/weather/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: state.city,
          lat: state.lat,
          lon: state.lon,
          unit: state.unit,
          isExpanded: state.isExpanded ? 1 : 0
        })
      });
    } catch (e) {
      console.error('WeatherWidget: Failed to save settings to server:', e);
    }
  };

  // Initial fetch
  fetchServerSettings();

  const updateWidget = async () => {
    // Add/remove expanded class based on state
    if (state.isExpanded) {
      container.classList.add('expanded');
    } else {
      container.classList.remove('expanded');
    }

    let forecastHtml = '';
    if (state.isExpanded && state.data && state.data.forecast) {
      forecastHtml = `
        <div class="mac-w-forecast">
          ${state.data.forecast.slice(0, 7).map(day => {
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day.date);
            const icon = getWeatherIconByCode(day.code);
            return `
              <div class="mac-w-forecast-day">
                <span class="mac-w-forecast-date">${dayName}</span>
                <span class="mac-w-forecast-icon">${icon}</span>
                <span class="mac-w-forecast-temps">${Math.round(day.high)}° / ${Math.round(day.low)}°</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    const aqiInfo = getAqiInfo(state.data?.aqi);
    const hasAqi = state.data?.aqi !== undefined && state.data?.aqi !== null;
    const aqiSmall = hasAqi ? `<div class="mac-w-aqi-badge mac-w-aqi-small ${aqiInfo.class}" title="AQI: ${aqiInfo.label}">AQI ${state.data.aqi}</div>` : '';
    const aqiLarge = hasAqi ? `<div class="mac-w-aqi-badge mac-w-aqi-large ${aqiInfo.class}" title="AQI: ${aqiInfo.label}">AQI ${state.data.aqi}</div>` : '';

    container.innerHTML = `
      <div class="mac-w-weather-bg" id="weatherBg"></div>
      <div class="mac-w-weather-content">
        <div class="mac-w-weather-header"></div>
        <div class="mac-w-weather-primary">
          <div class="mac-w-weather-main-info">
            <div class="mac-w-weather-city-container">
              <div class="mac-w-weather-city" title="Change Location">${state.city}</div>
            </div>
            <div class="mac-w-weather-temp-container">
              <div class="mac-w-weather-temp" title="Toggle Unit">${state.data ? Math.round(state.data.temp) : '--'}°</div>
              ${aqiSmall}
            </div>
          </div>
          <div class="mac-w-weather-footer">
            ${aqiLarge}
            <div class="mac-w-weather-info-group">
              <div class="mac-w-weather-condition">${state.data ? state.data.condition : 'Loading...'}</div>
              <div class="mac-w-weather-stats">H: ${state.data ? Math.round(state.data.high) : '--'}° L: ${state.data ? Math.round(state.data.low) : '--'}°</div>
            </div>
            <button class="mac-w-weather-resize-btn">
              ${state.isExpanded ? '⤡' : '⤢'}
            </button>
          </div>
        </div>
        ${forecastHtml}
      </div>
    `;

    // Re-bind events
    const content = container.querySelector('.mac-w-weather-content');
    content.querySelector('.mac-w-weather-city').onclick = (e) => {
      e.stopPropagation();
      new WeatherLocationModal({
        onSelect: (loc) => {
          state.city = loc.name;
          state.lat = loc.lat;
          state.lon = loc.lon;
          localStorage.setItem('weather-city', state.city);
          localStorage.setItem('weather-lat', state.lat);
          localStorage.setItem('weather-lon', state.lon);
          saveServerSettings();
          fetchWeather();
        }
      });
    };

    content.querySelector('.mac-w-weather-temp').onclick = (e) => {
      e.stopPropagation();
      state.unit = state.unit === 'C' ? 'F' : 'C';
      localStorage.setItem('weather-unit', state.unit);
      saveServerSettings();
      fetchWeather();
    };

    const forecastEl = content.querySelector('.mac-w-forecast');
    if (forecastEl) {
      ['mousedown', 'touchstart', 'mousemove', 'touchmove'].forEach(evt => {
        forecastEl.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
      });
    }

    content.querySelector('.mac-w-weather-resize-btn').onclick = (e) => {
      e.stopPropagation();
      const shortcutEl = container.closest('.desktop-shortcut');
      if (shortcutEl && window.desktopManager) {
        const appId = shortcutEl.id.replace('shortcut-', '');
        const newSpanX = state.isExpanded ? 2 : 4; // Expand width
        const newSpanY = 2; // Fixed height

        if (!state.isExpanded) {
          // Trying to expand - check space
          if (window.desktopManager.canResizeShortcut(appId, newSpanX, newSpanY)) {
            if (window.desktopManager.resizeShortcut(appId, newSpanX, newSpanY)) {
              state.isExpanded = true;
              localStorage.setItem('weather-expanded', 'true');
              updateWidget();
            }
          } else {
            // Shake/flash animation to indicate no space
            container.style.transform = 'translate(-2px, 0)';
            setTimeout(() => container.style.transform = 'translate(2px, 0)', 50);
            setTimeout(() => container.style.transform = 'translate(-2px, 0)', 100);
            setTimeout(() => container.style.transform = '', 150);
          }
        } else {
          // Shrinking is always allowed
          if (window.desktopManager.resizeShortcut(appId, newSpanX, newSpanY)) {
            state.isExpanded = false;
            localStorage.setItem('weather-expanded', 'false');
            saveServerSettings();
            updateWidget();
          }
        }
      }
    };

    container.onclick = () => {
      if (state.data) {
        new WeatherBigViewModal({
          data: state.data,
          city: state.city
        });
      }
    };

    applyAnimations();
  };

  const fetchWeather = async () => {
    const units = state.unit === 'C' ? 'celsius' : 'fahrenheit';
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&current=temperature_2m,weather_code,is_day,windspeed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&temperature_unit=${units}`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${state.lat}&longitude=${state.lon}&current=us_aqi`;

    try {
      // Fetch weather first (priority)
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();
      
      // Attempt AQI separately - don't let it break main weather
      let aqi = null;
      try {
        const aqiRes = await fetch(aqiUrl);
        if (aqiRes.ok) {
          const aqiData = await aqiRes.json();
          aqi = aqiData.current?.us_aqi;
        }
      } catch (err) {
        console.warn('AQI fetch failed:', err);
      }
      
      state.data = {
        temp: weatherData.current.temperature_2m,
        windspeed: weatherData.current.windspeed_10m,
        condition: getWeatherConditionText(weatherData.current.weather_code),
        high: weatherData.daily.temperature_2m_max[0],
        low: weatherData.daily.temperature_2m_min[0],
        code: weatherData.current.weather_code,
        isDay: weatherData.current.is_day,
        aqi: aqi,
        sunrise: new Date(weatherData.daily.sunrise[0]),
        sunset: new Date(weatherData.daily.sunset[0]),
        forecast: weatherData.daily.time.map((time, index) => ({
          date: new Date(time),
          code: weatherData.daily.weather_code[index],
          high: weatherData.daily.temperature_2m_max[index],
          low: weatherData.daily.temperature_2m_min[index]
        }))
      };
      
      // Dispatch sync event for other components (top bar, etc.)
      window.dispatchEvent(new CustomEvent('mac-weather-sync', {
        detail: { 
          lat: state.lat, 
          lon: state.lon, 
          unit: state.unit, 
          name: state.city,
          code: state.data.code,
          temp: state.data.temp,
          aqi: state.data.aqi
        }
      }));

      updateWidget();
    } catch (e) {
      console.error('Weather fetch error:', e);
    }
  };

  const getAqiInfo = (aqi) => {
    if (aqi === undefined || aqi === null) return { class: '', label: 'Unknown' };
    if (aqi <= 50) return { class: 'good', label: 'Good' };
    if (aqi <= 100) return { class: 'moderate', label: 'Moderate' };
    if (aqi <= 150) return { class: 'sensitive', label: 'Unhealthy for Sensitive Groups' };
    if (aqi <= 200) return { class: 'unhealthy', label: 'Unhealthy' };
    if (aqi <= 300) return { class: 'very-unhealthy', label: 'Very Unhealthy' };
    return { class: 'hazardous', label: 'Hazardous' };
  };

  // Local weather text/icon functions removed as they are now in weather-utils.js

  const applyAnimations = () => {
    const bg = container.querySelector('#weatherBg');
    if (!state.data) return;

    // Clear previous
    bg.innerHTML = '';
    
    const code = state.data.code;
    container.classList.remove('clear', 'clouds', 'rain', 'snow', 'day', 'night', 'sunrise', 'sunset');

    // Time of day
    const now = new Date();
    const sunrise = state.data.sunrise;
    const sunset = state.data.sunset;
    
    // Check for sunrise/sunset (within 45 mins)
    const diffSunrise = Math.abs(now - sunrise) / 60000;
    const diffSunset = Math.abs(now - sunset) / 60000;

    if (diffSunrise < 45) container.classList.add('sunrise');
    else if (diffSunset < 45) container.classList.add('sunset');
    else if (state.data.isDay) container.classList.add('day');
    else container.classList.add('night');

    const windspeed = state.data.windspeed || 0;
    
    if (code >= 95) {
      container.classList.add('storm');
      addStorm(bg);
    } else if (code >= 71 && code <= 86 && ![80, 81, 82].includes(code)) {
      container.classList.add('snow');
      addSnow(bg);
    } else if (code >= 51 && code <= 82) {
      container.classList.add('rain');
      addRain(bg);
    } else if (windspeed > 25) {
      container.classList.add('windy');
      addWind(bg);
    } else if (code >= 45 && code <= 48) {
      container.classList.add('fog');
      addFog(bg);
    } else if (code >= 1 && code <= 3) {
      container.classList.add('clouds');
      addClouds(bg);
    } else {
      container.classList.add('clear');
      addClear(bg);
    }
  };

  const addClear = (parent) => {
    const sunOrMoon = document.createElement('div');
    sunOrMoon.className = state.data.isDay ? 'mac-w-sun' : 'mac-w-moon';
    parent.appendChild(sunOrMoon);
    
    if (!state.data.isDay) {
      for (let i = 0; i < 5; i++) {
        const star = document.createElement('div');
        star.className = 'mac-w-star';
        star.style.left = `${Math.random() * 80 + 10}%`;
        star.style.top = `${Math.random() * 80 + 10}%`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        parent.appendChild(star);
      }
    }
  };

  const addClouds = (parent) => {
    for (let i = 0; i < 3; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'mac-w-cloud';
      cloud.style.top = `${15 + i * 25}%`;
      cloud.style.opacity = `${0.3 + Math.random() * 0.4}`;
      cloud.style.transform = `scale(${0.8 + Math.random() * 0.5})`;
      cloud.style.animationDuration = `${20 + Math.random() * 15}s`;
      cloud.style.animationDelay = `${-Math.random() * 20}s`;
      parent.appendChild(cloud);
    }
  };

  const addRain = (parent) => {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const drop = document.createElement('div');
      drop.className = 'mac-w-rain-drop';
      drop.style.left = `${Math.random() * 100}%`;
      drop.style.top = `${Math.random() * 100}%`;
      drop.style.animationDuration = `${0.4 + Math.random() * 0.3}s`;
      drop.style.animationDelay = `${-Math.random() * 2}s`;
      parent.appendChild(drop);
    }
  };

  const addSnow = (parent) => {
    for (let i = 0; i < 25; i++) {
      const flake = document.createElement('div');
      flake.className = 'mac-w-snow-flake';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.top = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${3 + Math.random() * 3}s`;
      flake.style.animationDelay = `${-Math.random() * 5}s`;
      parent.appendChild(flake);
    }
  };

  const addStorm = (parent) => {
    addRain(parent);
    const flash = document.createElement('div');
    flash.className = 'mac-w-lightning';
    parent.appendChild(flash);
  };

  const addFog = (parent) => {
    for (let i = 0; i < 3; i++) {
      const mist = document.createElement('div');
      mist.className = 'mac-w-mist';
      mist.style.top = `${30 + i * 20}%`;
      mist.style.animationDuration = `${8 + Math.random() * 4}s`;
      mist.style.animationDelay = `${-Math.random() * 8}s`;
      parent.appendChild(mist);
    }
  };

  const addWind = (parent) => {
    for (let i = 0; i < 10; i++) {
      const line = document.createElement('div');
      line.className = 'mac-w-wind-line';
      line.style.top = `${Math.random() * 100}%`;
      line.style.left = `${Math.random() * 100}%`;
      line.style.animationDuration = `${0.8 + Math.random() * 0.5}s`;
      line.style.animationDelay = `${-Math.random() * 2}s`;
      parent.appendChild(line);
    }
  };

  // Observe container size to automatically toggle expanded state
  // This ensures syncing with DesktopManager's saved spanX/spanY across loads
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      // Standard 2x2 width is ~170px, 4x2 width is ~350px
      const shouldBeExpanded = entry.contentRect.width > 250;
      
      if (shouldBeExpanded !== state.isExpanded) {
        state.isExpanded = shouldBeExpanded;
        localStorage.setItem('weather-expanded', shouldBeExpanded ? 'true' : 'false');
        saveServerSettings();
        
        // Re-render to show/hide forecast based on true size
        if (state.data) updateWidget(); 
      }
    }
  });
  resizeObserver.observe(container);

  updateWidget();
  fetchWeather();
  
  return container;
}
