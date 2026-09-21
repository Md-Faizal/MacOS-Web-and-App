import { getCelestialState, lerpColor } from './celestial-utils.js';

/**
 * ClockBigViewModal - A full-screen detailed view of a specific world clock.
 * Features a large analog clock, celestial animations, and location details.
 */
const getScopedStorageKey = (baseKey) => {
    const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
    return `${baseKey}__user_${safeUserId}`;
};

export class ClockBigViewModal {
    constructor(options) {
        this.isLocal = options.isLocal || false;
        this.timezone = options.timezone;
        this.cityName = options.cityName || (this.isLocal ? 'Local Time' : 'Global Clock');
        this.onClose = options.onClose || (() => {});
        this.overlay = null;
        this.interval = null;
        this.settings = this.isLocal ? (JSON.parse(localStorage.getItem(this.getScopedStorageKey('mac-system-time-settings'))) || { mode: 'auto' }) : null;
        
        this.createModal();
    }

    createModal() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'mac-w-big-view-overlay';
        
        this.overlay.innerHTML = `
            <div class="mac-w-big-view-modal">
                <button class="mac-w-big-view-close">✕</button>
                
                <div class="mac-w-big-view-content">
                    <div class="mac-w-big-view-left">
                        <div class="mac-w-analog-clock big">
                            <div class="mac-w-stars"></div>
                            <div class="mac-w-moon"></div>
                            <div class="mac-w-sun"></div>
                            <div class="mac-w-haze"></div>
                            <div class="mac-w-ripple-container"></div>
                            <div class="mac-w-clock-hand mac-w-hour-hand"></div>
                            <div class="mac-w-clock-hand mac-w-minute-hand"></div>
                            <div class="mac-w-clock-hand mac-w-second-hand"></div>
                            <div class="mac-w-clock-center"></div>
                            ${Array.from({ length: 60 }).map((_, i) => {
                                const isHour = i % 5 === 0;
                                if (isHour) {
                                    return `
                                        <div class="mac-w-clock-number" style="transform: translate(-50%, -50%) rotate(${i * 6}deg) translateY(var(--number-offset, -95px)) rotate(${-i * 6}deg)">
                                            ${i / 5 === 0 ? 12 : i / 5}
                                        </div>
                                        <div class="mac-w-clock-marker hour" style="transform: translateX(-50%) rotate(${i * 6}deg)"></div>
                                    `;
                                } else {
                                    return `<div class="mac-w-clock-marker minute" style="transform: translateX(-50%) rotate(${i * 6}deg)"></div>`;
                                }
                            }).join('')}
                        </div>
                    </div>
                    
                    <div class="mac-w-big-view-right">
                        <h1 class="mac-w-big-city-name">${this.cityName}</h1>
                        <div class="mac-w-big-timezone">${this.timezone || 'System Timezone'}</div>
                        <div class="mac-w-big-digital-time">00:00:00</div>
                        <div class="mac-w-big-date">Wednesday, 25 March</div>
                        
                        <div class="mac-w-big-details">
                            <div class="mac-w-detail-item">
                                <span class="label">Status:</span>
                                <span class="value status-val">--</span>
                            </div>
                            <div class="mac-w-detail-item">
                                <span class="label">Sunrise:</span>
                                <span class="value sunrise-val">06:12 AM</span>
                            </div>
                            <div class="mac-w-detail-item">
                                <span class="label">Sunset:</span>
                                <span class="value sunset-val">06:45 PM</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        
        // Add stars
        const starsContainer = this.overlay.querySelector('.mac-w-stars');
        for (let i = 0; i < 40; i++) {
            const star = document.createElement('div');
            star.className = 'mac-w-star';
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${Math.random() * 100}%`;
            star.style.opacity = Math.random();
            starsContainer.appendChild(star);
        }

        this.setupEventListeners();
        this.tick();
        this.interval = setInterval(() => this.tick(), 50); // 20fps for smooth sweep
        
        // Entry animation
        requestAnimationFrame(() => {
            this.overlay.classList.add('active');
        });
    }

    setupEventListeners() {
        const closeBtn = this.overlay.querySelector('.mac-w-big-view-close');
        
        const close = () => {
            clearInterval(this.interval);
            if (this.isLocal && this.syncHandler) {
                window.removeEventListener('mac-time-sync', this.syncHandler);
            }
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
        
        // Escape key to close
        this.keydownHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', this.keydownHandler);

        // Sync with system time settings if local
        if (this.isLocal) {
            this.syncHandler = (e) => {
                this.settings = e.detail;
                this.timezone = this.settings.mode === 'location' ? this.settings.timezone : null;
                this.cityName = this.settings.mode === 'location' ? this.settings.cityName : 'Local Time';
                
                // Update UI elements immediately
                const cityNameEl = this.overlay.querySelector('.mac-w-big-city-name');
                const timezoneEl = this.overlay.querySelector('.mac-w-big-timezone');
                if (cityNameEl) cityNameEl.textContent = this.cityName;
                if (timezoneEl) timezoneEl.textContent = this.timezone || 'System Timezone';
            };
            window.addEventListener('mac-time-sync', this.syncHandler);
        }
    }

    tick() {
        let now = new Date();
        
        // Apply manual offset if in local manual mode
        if (this.isLocal && this.settings && this.settings.mode === 'manual' && this.settings.manualOffset) {
            now = new Date(now.getTime() + this.settings.manualOffset);
        }

        if (this.timezone) {
            try {
                const ms = now.getMilliseconds();
                const locStr = now.toLocaleString('en-US', { timeZone: this.timezone });
                now = new Date(locStr);
                now.setMilliseconds(ms);
            } catch (e) {}
        }

        const ms = now.getMilliseconds();
        const seconds = now.getSeconds() + ms / 1000;
        const minutes = now.getMinutes() + seconds / 60;
        const hours = now.getHours() + minutes / 60;

        // Update Labels
        this.overlay.querySelector('.mac-w-big-digital-time').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        this.overlay.querySelector('.mac-w-big-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const statusVal = this.overlay.querySelector('.status-val');

        // Update Analog Clock & Celestial State
        const analogClock = this.overlay.querySelector('.mac-w-analog-clock');
        const hourHand = analogClock.querySelector('.mac-w-hour-hand');
        const minuteHand = analogClock.querySelector('.mac-w-minute-hand');
        const secondHand = analogClock.querySelector('.mac-w-second-hand');
        const moon = analogClock.querySelector('.mac-w-moon');
        const sun = analogClock.querySelector('.mac-w-sun');
        const starsContainer = analogClock.querySelector('.mac-w-stars');
        const haze = analogClock.querySelector('.mac-w-haze');
        const rippleContainer = analogClock.querySelector('.mac-w-ripple-container');

        // Celestial Logic
        const { stage, nextStage, progress } = getCelestialState(now);
        const celestialType = stage.type || (stage.sunPos !== null ? 'day' : 'night');
        statusVal.textContent = stage.name;

        // Dynamic Gradient
        const sky1 = lerpColor(stage.colors[0], nextStage.colors[0], progress);
        const sky2 = lerpColor(stage.colors[1], nextStage.colors[1], progress);
        analogClock.style.setProperty('--sky-color-1', sky1);
        analogClock.style.setProperty('--sky-color-2', sky2);
        
        const glowAlpha = stage.glow + (nextStage.glow - stage.glow) * progress;
        analogClock.style.setProperty('--glow-alpha', glowAlpha);
        analogClock.style.setProperty('--glow-radius', '40px');

        // Position & Opacity of Sun/Moon
        analogClock.classList.remove('day', 'evening', 'night');
        analogClock.classList.add(celestialType);

        if (celestialType === 'day') {
            sun.style.opacity = 1;
            moon.style.opacity = 0;
            starsContainer.style.opacity = 0;
        } else if (celestialType === 'evening') {
            if (stage.name === 'Dusk') {
                // Sun fades out quickly, Moon rises quickly
                sun.style.opacity = Math.max(0, 1 - (progress * 2)); // Faded by 50% progress
                moon.style.opacity = Math.min(1, progress * 1.5);    // Full by ~66% progress
                starsContainer.style.opacity = progress * 0.5;
            } else if (stage.name === 'Dawn') {
                sun.style.opacity = progress;
                moon.style.opacity = 1 - progress;
                starsContainer.style.opacity = (1 - progress) * 0.3;
            }
        } else {
            sun.style.opacity = 0;
            moon.style.opacity = 1;
            starsContainer.style.opacity = stage.name === 'Twilight' ? 0.3 + (progress * 0.7) : 1;
        }

        const sunStart = stage.sunPos !== null ? stage.sunPos : -135;
        const sunEnd = nextStage.sunPos !== null ? nextStage.sunPos : 135;
        const sunAngle = sunStart + (sunEnd - sunStart) * progress;
        sun.style.transform = `rotate(${sunAngle}deg) translateY(var(--celestial-offset, -100px)) rotate(${-sunAngle}deg)`;

        const moonStart = stage.moonPos !== null ? stage.moonPos : -135;
        const moonEnd = nextStage.moonPos !== null ? nextStage.moonPos : 135;
        const moonAngle = moonStart + (moonEnd - moonStart) * progress;
        moon.style.transform = `rotate(${moonAngle}deg) translateY(var(--celestial-offset, -100px)) rotate(${-moonAngle}deg)`;


        // Weather Effects
        const weatherData = JSON.parse(localStorage.getItem(this.getScopedStorageKey('weatherDataCache'))) || {};
        const weatherIcon = weatherData.icon || '☀️';
        
        if (haze) haze.style.opacity = (weatherIcon.includes('☁️') || weatherIcon.includes('🌫️')) ? 0.5 : 0;
        
        if (weatherIcon.includes('🌧️') || weatherIcon.includes('🌦️') || weatherIcon.includes('⛈️')) {
            if (rippleContainer && Math.random() > 0.6) {
                const ripple = document.createElement('div');
                ripple.className = 'mac-w-ripple';
                ripple.style.left = `${Math.random() * 100}%`;
                ripple.style.top = `${Math.random() * 100}%`;
                ripple.style.width = ripple.style.height = `${Math.random() * 20 + 10}px`;
                rippleContainer.appendChild(ripple);
                setTimeout(() => ripple.remove(), 2000);
            }
        } else {
            if (rippleContainer) rippleContainer.innerHTML = '';
        }

        const stars = starsContainer.querySelectorAll('.mac-w-star');
        stars.forEach(s => {
            if ((weatherIcon.includes('☀️') || weatherIcon.includes('🌙')) && Math.random() > 0.95) {
                s.classList.add('mac-w-twinkle');
            } else {
                s.classList.remove('mac-w-twinkle');
            }
        });

        const secDeg = (seconds / 60) * 360;
        const minDeg = (minutes / 60) * 360;
        const hourDeg = ((hours % 12) / 12) * 360;

        secondHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
        minuteHand.style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
        hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
        
        // Dynamic Highlights
        const numbers = this.overlay.querySelectorAll('.mac-w-clock-number');
        const markers = this.overlay.querySelectorAll('.mac-w-clock-marker');
        const currHour = (Math.floor(hours) % 12) || 12;
        const currMinIdx = Math.floor(minutes) % 60;
        
        // Numbers: Current hour Red
        numbers.forEach(num => {
            const val = parseInt(num.textContent);
            num.classList.toggle('current-hour', val === currHour);
        });

        // Markers: Current minute Red
        markers.forEach((m, idx) => {
            m.classList.toggle('current-marker', idx === currMinIdx);
        });
    }
}
