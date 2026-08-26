/**
 * weather-utils.js - Shared utilities for weather-related components.
 */

export const getWeatherConditionText = (code) => {
  if (code === 0) return 'Clear Sky';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rainy';
  if (code <= 75) return 'Snowy';
  if (code <= 82) return 'Rain Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorm';
};

export const getWeatherIconByCode = (code) => {
  if (code === 0) return '☀️'; // Clear
  if (code <= 3) return '🌤️'; // Partly Cloudy
  if (code <= 48) return '🌫️'; // Foggy
  if (code <= 55) return '🌦️'; // Drizzle
  if (code <= 65) return '🌧️'; // Rainy
  if (code <= 75) return '❄️'; // Snowy
  if (code <= 82) return '🌧️'; // Rain Showers
  if (code <= 86) return '❄️'; // Snow Showers
  return '⛈️'; // Thunderstorm
};

/**
 * Returns AQI info (class and label) based on US AQI index.
 */
export const getAqiInfo = (aqi) => {
  if (aqi === undefined || aqi === null) return { class: '', label: 'Unknown' };
  if (aqi <= 50) return { class: 'good', label: 'Good' };
  if (aqi <= 100) return { class: 'moderate', label: 'Moderate' };
  if (aqi <= 150) return { class: 'sensitive', label: 'Unhealthy for Sensitive Groups' };
  if (aqi <= 200) return { class: 'unhealthy', label: 'Unhealthy' };
  if (aqi <= 300) return { class: 'very-unhealthy', label: 'Very Unhealthy' };
  return { class: 'hazardous', label: 'Hazardous' };
};
