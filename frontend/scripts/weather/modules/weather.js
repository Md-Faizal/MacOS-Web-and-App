// ========================================
// STANDARDIZED WEATHER COMPONENT SCRIPT
// ======================================== 

class WeatherDisplay {
  constructor(elementId, options = {}) {
    this.element = document.getElementById(elementId);
    this.options = {
      updateInterval: options.updateInterval || 600000, // 10 minutes
      useMetricUnits: options.useMetricUnits !== false, // Celsius by default
      fallbackLocation: options.fallbackLocation || { lat: 37.7749, lon: -122.4194 }, // San Francisco
      cacheExpiration: options.cacheExpiration || 3600000, // 1 hour in milliseconds
      ...options
    };
    
    this.weatherIconElement = null;
    this.weatherTempElement = null;
    this.updateIntervalId = null;
    
    this.init();
  }

  getLocationCache() {
    try {
      const cached = localStorage.getItem('weatherLocationCache');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.expiration > Date.now()) {
          return data;
        } else {
          localStorage.removeItem('weatherLocationCache');
        }
      }
    } catch (error) {
      console.log('Cache read error:', error);
    }
    return null;
  }

  saveLocationCache(lat, lon) {
    try {
      const cacheData = {
        lat: lat,
        lon: lon,
        expiration: Date.now() + this.options.cacheExpiration
      };
      localStorage.setItem('weatherLocationCache', JSON.stringify(cacheData));
    } catch (error) {
      console.log('Cache write error:', error);
    }
  }

  getWeatherCache() {
    try {
      const cached = localStorage.getItem('weatherDataCache');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.expiration > Date.now()) {
          return data;
        } else {
          localStorage.removeItem('weatherDataCache');
        }
      }
    } catch (error) {
      console.log('Cache read error:', error);
    }
    return null;
  }

  saveWeatherCache(icon, temp) {
    try {
      const cacheData = {
        icon: icon,
        temp: temp,
        expiration: Date.now() + this.options.cacheExpiration
      };
      localStorage.setItem('weatherDataCache', JSON.stringify(cacheData));
    } catch (error) {
      console.log('Cache write error:', error);
    }
  }

  getWeatherIcon(code) {
    if (code === 0) return '☀️'; // Clear
    if (code <= 3) return '🌤️'; // Partly Cloudy
    if (code <= 48) return '🌫️'; // Foggy
    if (code <= 55) return '🌦️'; // Drizzle
    if (code <= 65) return '🌧️'; // Rainy
    if (code <= 75) return '❄️'; // Snowy
    if (code <= 82) return '🌧️'; // Rain Showers
    if (code <= 86) return '❄️'; // Snow Showers
    return '⛈️'; // Thunderstorm
  }

  init() {
    // Robust null check for the main element
    if (!this.element) return;

    // Listen for sync events from the widget
    window.addEventListener('mac-weather-sync', (e) => {
      const { lat, lon, unit, code, temp } = e.detail;
      this.options.useMetricUnits = (unit === 'C');
      
      if (code !== undefined && temp !== undefined) {
        // Direct update from widget, no need to fetch
        const icon = this.getWeatherIcon(code);
        this.updateDisplay(icon, Math.round(temp));
        this.saveWeatherCache(icon, Math.round(temp));
        this.saveLocationCache(lat, lon);
      } else {
        this.fetchWeather(lat, lon);
      }
    });

    // Find or create weather icon and temperature elements
    let iconElement = this.element.querySelector('.weather-icon');
    let tempElement = this.element.querySelector('.weather-temp');

    if (!iconElement) {
      iconElement = document.createElement('span');
      iconElement.className = 'weather-icon';
      iconElement.textContent = '☁️';
      this.element.insertBefore(iconElement, this.element.firstChild);
    }

    if (!tempElement) {
      tempElement = document.createElement('span');
      tempElement.className = 'weather-temp';
      tempElement.textContent = '--°';
      this.element.appendChild(tempElement);
    }

    this.weatherIconElement = iconElement;
    this.weatherTempElement = tempElement;

    if (!this.element.classList.contains('weather-display')) {
      this.element.classList.add('weather-display');
    }

    this.fetchWeatherByLocation();
  }

  fetchWeatherByLocation() {
    // Priority 1: Widget localStorage (Shared persistence)
    const widgetLat = localStorage.getItem('weather-lat');
    const widgetLon = localStorage.getItem('weather-lon');
    const widgetUnit = localStorage.getItem('weather-unit');

    if (widgetLat && widgetLon) {
      if (widgetUnit) this.options.useMetricUnits = (widgetUnit === 'C');
      this.fetchWeather(parseFloat(widgetLat), parseFloat(widgetLon));
      return;
    }

    // Priority 2: Standard cache
    const cache = this.getLocationCache();
    if (cache) {
      this.fetchWeather(cache.lat, cache.lon);
      return;
    }

    // Priority 3: Geolocation fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.saveLocationCache(lat, lon);
          this.fetchWeather(lat, lon);
        },
        error => {
          this.fetchWeather(this.options.fallbackLocation.lat, this.options.fallbackLocation.lon);
        }
      );
    } else {
      this.fetchWeather(this.options.fallbackLocation.lat, this.options.fallbackLocation.lon);
    }
  }

  fetchWeather(latitude, longitude) {
    const units = this.options.useMetricUnits ? 'celsius' : 'fahrenheit';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=${units}`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        const temp = Math.round(data.current.temperature_2m);
        const code = data.current.weather_code;
        const icon = this.getWeatherIcon(code);

        this.updateDisplay(icon, temp);
        this.saveWeatherCache(icon, temp);
        
        // Set up auto-refresh if interval is specified
        if (this.options.updateInterval) {
          this.scheduleUpdate();
        }
      })
      .catch(error => {
        console.log('Weather fetch error:', error);
        this.updateDisplay('☁️', '--');
      });
  }

  updateDisplay(icon, temp) {
    if (this.weatherIconElement) {
      this.weatherIconElement.textContent = icon;
    }
    if (this.weatherTempElement) {
      const tempText = typeof temp === 'number' ? `${temp}°` : temp;
      this.weatherTempElement.textContent = tempText;
    }
  }

  scheduleUpdate() {
    // Clear existing interval if any
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
    }

    // Schedule new update
    this.updateIntervalId = setInterval(() => {
      this.fetchWeatherByLocation();
    }, this.options.updateInterval);
  }

  setBackgroundBrightness(brightnessTreshold = 200) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let brightness = 0;

      // Sample every 10th pixel for performance
      for (let i = 0; i < data.length; i += 40) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        brightness += (r * 299 + g * 587 + b * 114) / 1000;
      }

      brightness = brightness / (data.length / 40);

      // Apply brightness classes
      const bgClass = brightness > brightnessTreshold ? 'light-bg' : 'dark-bg';
      const bgClassRemove = brightness > brightnessTreshold ? 'dark-bg' : 'light-bg';

      this.element.classList.remove(bgClassRemove);
      this.element.classList.add(bgClass);
    };

    img.src = '/assets/Wallpaper/Static/tahoe-beach/tahoe-beach.light.jpg';
  }

  destroy() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
    }
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.WeatherDisplay = WeatherDisplay;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherDisplay;
}
