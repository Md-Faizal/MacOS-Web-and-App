import { ClockSettingsModal } from './ClockSettingsModal.js';
import { ClockBigViewModal } from './ClockBigViewModal.js';
import { CELESTIAL_STAGES, getCelestialState, lerpColor } from './celestial-utils.js';

/**
 * ClockWidget - Functional analog and digital clock with global sync.
 * Supports expanding to show "World Clock" view with local and global panels.
 */
const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

export function createClockWidget() {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-clock';
  container.style.height = '100%';
  
  // State
  let state = {
    isExpanded: localStorage.getItem(getScopedStorageKey('mac-clock-expanded')) === 'true',
    // Default world clocks if none exist
    worldClocks: JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks'))) || [
      { id: 'cupertino', name: 'Cupertino', timezone: 'America/Los_Angeles' },
      { id: 'london', name: 'London', timezone: 'Europe/London' },
      { id: 'tokyo', name: 'Tokyo', timezone: 'Asia/Tokyo' }
    ],
    timeSettings: JSON.parse(localStorage.getItem(getScopedStorageKey('mac-system-time-settings'))) || { mode: 'auto' }
  };

  // Async fetch from server
  const fetchServerSettings = async () => {
    try {
      const response = await fetch('/api/clock/settings');
      if (response.ok) {
        const data = await response.json();
        state.worldClocks = data.worldClocks || [];
        state.timeSettings = {
          mode: data.mode || 'auto',
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          cityName: data.cityName || 'Local Time',
          manualOffset: data.manualOffset || 0
        };
        // Update local storage for next fast-boot
        localStorage.setItem(getScopedStorageKey('mac-world-clocks'), JSON.stringify(state.worldClocks));
        localStorage.setItem(getScopedStorageKey('mac-system-time-settings'), JSON.stringify(state.timeSettings));
        
        // Re-render only if needed (expanded vs non-expanded might change)
        updateWidget();
      }
    } catch (e) {
      console.warn('ClockWidget: Failed to fetch server settings:', e);
    }
  };

  fetchServerSettings();

  const createClockEl = (isSmall = false, timezone = null, cityName = null) => {
    const clockContainer = document.createElement('div');
    clockContainer.className = isSmall ? 'mac-w-world-card' : 'mac-w-clock-container';
    
    if (isSmall) {
      const header = document.createElement('div');
      header.className = 'mac-w-world-card-header';
      
      const name = document.createElement('div');
      name.className = 'mac-w-world-name';
      name.textContent = cityName || (timezone ? timezone.split('/').pop().replace('_', ' ') : 'Local');
      header.appendChild(name);

      const offset = document.createElement('div');
      offset.className = 'mac-w-world-offset';
      header.appendChild(offset);
      
      clockContainer.appendChild(header);
    }

    const analogClock = document.createElement('div');
    analogClock.className = `mac-w-analog-clock ${isSmall ? 'small' : ''}`;
    
    const starsContainer = document.createElement('div');
    starsContainer.className = 'mac-w-stars';
    for (let i = 0; i < (isSmall ? 8 : 15); i++) {
        const star = document.createElement('div');
        star.className = 'mac-w-star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.opacity = Math.random();
        starsContainer.appendChild(star);
    }
    
    const moon = document.createElement('div');
    moon.className = 'mac-w-moon';
    const sun = document.createElement('div');
    sun.className = 'mac-w-sun';

    const haze = document.createElement('div');
    haze.className = 'mac-w-haze';
    const rippleContainer = document.createElement('div');
    rippleContainer.className = 'mac-w-ripple-container';
    
    analogClock.appendChild(starsContainer);
    analogClock.appendChild(moon);
    analogClock.appendChild(sun);
    analogClock.appendChild(haze);
    analogClock.appendChild(rippleContainer);
    
    const hourHand = document.createElement('div');
    hourHand.className = 'mac-w-clock-hand mac-w-hour-hand';
    const minuteHand = document.createElement('div');
    minuteHand.className = 'mac-w-clock-hand mac-w-minute-hand';
    const secondHand = document.createElement('div');
    secondHand.className = 'mac-w-clock-hand mac-w-second-hand';
    const center = document.createElement('div');
    center.className = 'mac-w-clock-center';
    
    analogClock.appendChild(hourHand);
    analogClock.appendChild(minuteHand);
    analogClock.appendChild(secondHand);
    analogClock.appendChild(center);

    // Add markers and numbers
    for (let i = 0; i < 60; i++) {
        const isHour = i % 5 === 0;
        
        if (isHour) {
            // Add numbers
            const hourNum = i / 5 === 0 ? 12 : i / 5;
            const numEl = document.createElement('div');
            numEl.className = 'mac-w-clock-number';
            numEl.textContent = hourNum;
            const angle = i * 6;
            numEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(${isSmall ? -16 : -38}px) rotate(${-angle}deg)`;
            analogClock.appendChild(numEl);

            // Add a small hour marker line pointing to the number
            const hourMarker = document.createElement('div');
            hourMarker.className = 'mac-w-clock-marker hour';
            hourMarker.style.transform = `translateX(-50%) rotate(${i * 6}deg)`;
            analogClock.appendChild(hourMarker);
        } else {
            // Add minute markers only
            const marker = document.createElement('div');
            marker.className = 'mac-w-clock-marker minute';
            marker.style.transform = `translateX(-50%) rotate(${i * 6}deg)`;
            analogClock.appendChild(marker);
        }
    }
    
    clockContainer.appendChild(analogClock);

    if (!isSmall) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'mac-w-time-label';
      const dateLabel = document.createElement('div');
      dateLabel.className = 'mac-w-date-label';
      clockContainer.appendChild(timeLabel);
      clockContainer.appendChild(dateLabel);
    } else {
      const digitalTime = document.createElement('div');
      digitalTime.className = 'mac-w-world-digital';
      const dayDate = document.createElement('div');
      dayDate.className = 'mac-w-world-daydate';
      clockContainer.appendChild(digitalTime);
      clockContainer.appendChild(dayDate);
    }

    return clockContainer;
  };

  const updateWidget = () => {
    container.innerHTML = '';
    
    const resizeBtn = document.createElement('button');
    resizeBtn.className = 'mac-w-clock-resize-btn';
    resizeBtn.innerHTML = state.isExpanded ? '⤡' : '⤢';
    resizeBtn.title = 'Resize Widget';
    container.appendChild(resizeBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'mac-w-clock-settings-btn';
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Date & Time Settings';
    container.appendChild(settingsBtn);

    if (state.isExpanded) {
      container.classList.add('expanded');
      
      const expandedView = document.createElement('div');
      expandedView.className = 'mac-w-expanded-view';
      
      // Left Section (Local)
      const localSection = document.createElement('div');
      localSection.className = 'mac-w-local-section';
      const localClock = createClockEl(false);
      localClock.style.cursor = 'pointer';
      localClock.title = 'Open Detailed View';
      localClock.onclick = (e) => {
        e.stopPropagation();
        openMainModal();
      };
      localSection.appendChild(localClock);
      expandedView.appendChild(localSection);
      
      // Divider
      const divider = document.createElement('div');
      divider.className = 'mac-w-divider';
      expandedView.appendChild(divider);
      
      // Right Section (World Clocks Scroll)
      const worldSection = document.createElement('div');
      worldSection.className = 'mac-w-world-section';
      
      const worldScroll = document.createElement('div');
      worldScroll.className = 'mac-w-world-scroll';
      
      state.worldClocks.forEach(wc => {
        const card = createClockEl(true, wc.timezone, wc.name);
        card.style.cursor = 'pointer';
        card.onclick = (e) => {
          e.stopPropagation();
          new ClockBigViewModal({
            timezone: wc.timezone,
            cityName: wc.name
          });
        };
        worldScroll.appendChild(card);
      });
      
      worldSection.appendChild(worldScroll);
      expandedView.appendChild(worldSection);
      
      // Middle-click/Wheel horizontal scrolling
      worldScroll.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          worldScroll.scrollLeft += e.deltaY;
        }
      }, { passive: false });

      // Prevent widget dragging when interacting with scroll area
      ['mousedown', 'touchstart', 'mousemove', 'touchmove'].forEach(evt => {
        worldScroll.addEventListener(evt, (e) => {
          e.stopPropagation();
        }, { passive: true });
      });
      
      container.appendChild(expandedView);
    } else {
      container.classList.remove('expanded');
      const localClock = createClockEl(false);
      localClock.style.cursor = 'pointer';
      localClock.title = 'Open Detailed View';
      localClock.onclick = (e) => {
        e.stopPropagation();
        openMainModal();
      };
      container.appendChild(localClock);
    }

    resizeBtn.onclick = (e) => {
      e.stopPropagation();
      const shortcutEl = container.closest('.desktop-shortcut');
      if (shortcutEl && window.desktopManager) {
        const appId = shortcutEl.id.replace('shortcut-', '');
        const newSpanX = state.isExpanded ? 2 : 4;
        const newSpanY = 2;

        if (!state.isExpanded) {
          if (window.desktopManager.canResizeShortcut(appId, newSpanX, newSpanY)) {
            if (window.desktopManager.resizeShortcut(appId, newSpanX, newSpanY)) {
              state.isExpanded = true;
              localStorage.setItem(getScopedStorageKey('mac-clock-expanded'), 'true');
              updateWidget();
            }
          } else {
            container.classList.add('no-space-shake');
            setTimeout(() => container.classList.remove('no-space-shake'), 400);
          }
        } else {
          if (window.desktopManager.resizeShortcut(appId, newSpanX, newSpanY)) {
            state.isExpanded = false;
            localStorage.setItem(getScopedStorageKey('mac-clock-expanded'), 'false');
            updateWidget();
          }
        }
      }
    };

    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      new ClockSettingsModal({
        onSave: (settings) => {
          state.timeSettings = settings;
          state.worldClocks = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks'))) || state.worldClocks;
          updateWidget();
          tick();
        }
      });
    };
  };

  const openMainModal = () => {
    new ClockBigViewModal({
      isLocal: true,
      timezone: state.timeSettings.mode === 'location' ? state.timeSettings.timezone : (state.timeSettings.mode === 'auto' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null),
      cityName: state.timeSettings.cityName || 'Local Time'
    });
  };

  const tick = () => {
    let baseTime = new Date();
    const ms = baseTime.getMilliseconds();
    
    // Calculate System/Local Time
    if (state.timeSettings.mode === 'location' && state.timeSettings.timezone) {
      try {
        const locStr = baseTime.toLocaleString('en-US', { timeZone: state.timeSettings.timezone });
        baseTime = new Date(locStr);
        baseTime.setMilliseconds(ms);
      } catch (e) {}
    } else if (state.timeSettings.mode === 'manual') {
      baseTime = new Date(baseTime.getTime() + (state.timeSettings.manualOffset || 0));
    }

    if (state.isExpanded) {
      // Update Local
      const localEl = container.querySelector('.mac-w-local-section .mac-w-clock-container');
      if (localEl) updateClockVisuals(localEl, baseTime, false);
      
      // Update World Clocks
      const worldCards = container.querySelectorAll('.mac-w-world-card');
      state.worldClocks.forEach((wc, idx) => {
        const el = worldCards[idx];
        if (!el) return;
        
        let tzTime = new Date();
        if (wc.timezone) {
          try {
            const ms = tzTime.getMilliseconds();
            const locStr = tzTime.toLocaleString('en-US', { timeZone: wc.timezone });
            tzTime = new Date(locStr);
            tzTime.setMilliseconds(ms);
          } catch(e) {}
        }
        
        // Calculate offset vs baseTime (Local)
        const offsetMs = tzTime.getTime() - baseTime.getTime();
        const offsetHrs = Math.round((offsetMs / 3600000) * 10) / 10;
        const offsetText = offsetHrs === 0 ? 'SAME' : (offsetHrs > 0 ? `+${offsetHrs}` : `${offsetHrs}`) + ' HRS';
        
        const offsetEl = el.querySelector('.mac-w-world-offset');
        if (offsetEl) offsetEl.textContent = offsetText;
        
        updateClockVisuals(el, tzTime, true);
      });
    } else {
      const el = container.querySelector('.mac-w-clock-container');
      if (el) updateClockVisuals(el, baseTime, false);
    }
  };

  const updateClockVisuals = (clockContainer, now, isSmall) => {
    const analogClock = clockContainer.querySelector('.mac-w-analog-clock');
    const hourHand = analogClock.querySelector('.mac-w-hour-hand');
    const minuteHand = analogClock.querySelector('.mac-w-minute-hand');
    const secondHand = analogClock.querySelector('.mac-w-second-hand');
    const moon = analogClock.querySelector('.mac-w-moon');
    const sun = analogClock.querySelector('.mac-w-sun');
    const starsContainer = analogClock.querySelector('.mac-w-stars');
    const haze = analogClock.querySelector('.mac-w-haze');
    const rippleContainer = analogClock.querySelector('.mac-w-ripple-container');
    
    // Calculate Celestial State
    const { stage, nextStage, progress } = getCelestialState(now);
    const celestialType = stage.type || (stage.sunPos !== null ? 'day' : 'night');
    
    // Dynamic Gradient Shift (Lerp)
    const sky1 = lerpColor(stage.colors[0], nextStage.colors[0], progress);
    const sky2 = lerpColor(stage.colors[1], nextStage.colors[1], progress);
    analogClock.style.setProperty('--sky-color-1', sky1);
    analogClock.style.setProperty('--sky-color-2', sky2);
    
    // Glow Intensity
    const glowAlpha = stage.glow + (nextStage.glow - stage.glow) * progress;
    analogClock.style.setProperty('--glow-alpha', glowAlpha);
    analogClock.style.setProperty('--glow-radius', `${isSmall ? 10 : 20}px`);

    // Position & Opacity of Sun/Moon
    analogClock.classList.remove('day', 'evening', 'night');
    analogClock.classList.add(celestialType);

    if (celestialType === 'day') {
        sun.style.opacity = 1;
        moon.style.opacity = 0;
        starsContainer.style.opacity = 0;
    } else if (celestialType === 'evening') {
        // Transition phases
        if (stage.name === 'Dusk') {
            // Sun fades out quickly, Moon rises quickly
            sun.style.opacity = Math.max(0, 1 - (progress * 2)); // Faded by 50% progress
            moon.style.opacity = Math.min(1, progress * 1.5);    // Full by ~66% progress
            starsContainer.style.opacity = progress * 0.5;
        } else if (stage.name === 'Dawn') {
            sun.style.opacity = progress;
            moon.style.opacity = 1 - progress;
            starsContainer.style.opacity = (1 - progress) * 0.3;
        } else {
            sun.style.opacity = 0.5;
            moon.style.opacity = 0.5;
        }
    } else {
        sun.style.opacity = 0;
        moon.style.opacity = 1;
        starsContainer.style.opacity = stage.name === 'Twilight' ? 0.3 + (progress * 0.7) : 1;
    }

    // Always calculate positions if within reasonable range
    const sunStart = stage.sunPos !== null ? stage.sunPos : -135;
    const sunEnd = nextStage.sunPos !== null ? nextStage.sunPos : 135;
    const sunAngle = sunStart + (sunEnd - sunStart) * progress;
    sun.style.transform = `rotate(${sunAngle}deg) translateY(${isSmall ? -25 : -40}px) rotate(${-sunAngle}deg)`;

    const moonStart = stage.moonPos !== null ? stage.moonPos : -135;
    const moonEnd = nextStage.moonPos !== null ? nextStage.moonPos : 135;
    const moonAngle = moonStart + (moonEnd - moonStart) * progress;
    moon.style.transform = `rotate(${moonAngle}deg) translateY(${isSmall ? -25 : -40}px) rotate(${-moonAngle}deg)`;


    // Weather Effects Integration
    const weatherData = JSON.parse(localStorage.getItem(getScopedStorageKey('weatherDataCache'))) || {};
    const weatherIcon = weatherData.icon || '☀️';
    
    // Reset weather effects
    if (haze) haze.style.opacity = 0;
    if (rippleContainer) rippleContainer.innerHTML = '';
    const stars = starsContainer.querySelectorAll('.mac-w-star');
    stars.forEach(s => s.classList.remove('mac-w-twinkle'));

    if (weatherIcon.includes('☁️') || weatherIcon.includes('🌫️')) {
      if (haze) haze.style.opacity = 0.5;
    } else if (weatherIcon.includes('🌧️') || weatherIcon.includes('🌦️') || weatherIcon.includes('⛈️')) {
      if (rippleContainer && Math.random() > 0.7) {
        const ripple = document.createElement('div');
        ripple.className = 'mac-w-ripple';
        ripple.style.left = `${Math.random() * 100}%`;
        ripple.style.top = `${Math.random() * 100}%`;
        ripple.style.width = ripple.style.height = `${Math.random() * 10 + 5}px`;
        rippleContainer.appendChild(ripple);
        setTimeout(() => ripple.remove(), 2000);
      }
    } else if (weatherIcon.includes('☀️') || weatherIcon.includes('🌙')) {
      stars.forEach(s => {
        if (Math.random() > 0.8) s.classList.add('mac-w-twinkle');
      });
    }

    const ms = now.getMilliseconds();
    const seconds = now.getSeconds() + ms / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = now.getHours() + minutes / 60;

    const secDeg = (seconds / 60) * 360;
    const minDeg = (minutes / 60) * 360;
    const hourDeg = ((hours % 12) / 12) * 360;

    secondHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
    minuteHand.style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
    hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
    
    // Highlight Current Hour and current minute marker
    const numbers = clockContainer.querySelectorAll('.mac-w-clock-number');
    const markers = clockContainer.querySelectorAll('.mac-w-clock-marker');
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

    if (!isSmall) {
      const timeLabel = clockContainer.querySelector('.mac-w-time-label');
      const dateLabel = clockContainer.querySelector('.mac-w-date-label');
      if (timeLabel) timeLabel.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      if (dateLabel) dateLabel.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    } else {
      const digitalTime = clockContainer.querySelector('.mac-w-world-digital');
      const dayDate = clockContainer.querySelector('.mac-w-world-daydate');
      if (digitalTime) digitalTime.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      if (dayDate) dayDate.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    }
  };

  window.addEventListener('mac-time-sync', (e) => {
    state.timeSettings = e.detail;
    state.worldClocks = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks'))) || state.worldClocks;
    updateWidget();
    tick();
  });
  
  // Also listen for world clock specific changes
  window.addEventListener('mac-world-clock-sync', () => {
    state.worldClocks = JSON.parse(localStorage.getItem(getScopedStorageKey('mac-world-clocks'))) || [];
    updateWidget();
  });

  // Listen for login/sync events to refresh from server
  window.addEventListener('mac-auth-success', fetchServerSettings);

  updateWidget();
  tick();
  
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      const shouldBeExpanded = entry.contentRect.width > 250;
      if (shouldBeExpanded !== state.isExpanded) {
        state.isExpanded = shouldBeExpanded;
        localStorage.setItem(getScopedStorageKey('mac-clock-expanded'), shouldBeExpanded ? 'true' : 'false');
        updateWidget();
      }
    }
  });
  resizeObserver.observe(container);

  updateWidget();
  const interval = setInterval(tick, 50); // 20fps for smooth sweep
  tick();
  
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      clearInterval(interval);
      observer.disconnect();
      resizeObserver.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
}
