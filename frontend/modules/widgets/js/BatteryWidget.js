/**
 * BatteryWidget - Live system battery status.
 */
export function createBatteryWidget() {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-battery';
  
  const visual = document.createElement('div');
  visual.className = 'mac-w-battery-visual';
  
  const level = document.createElement('div');
  level.className = 'mac-w-battery-level';
  level.style.width = '85%';
  
  const tip = document.createElement('div');
  tip.className = 'mac-w-battery-tip';
  
  visual.appendChild(level);
  visual.appendChild(tip);
  
  const text = document.createElement('div');
  text.className = 'mac-w-battery-text';
  text.textContent = '85%';
  
  const statusText = document.createElement('div');
  statusText.style.cssText = 'font-size: 10px; color: var(--mac-w-text-secondary); margin-top: 2px;';
  statusText.textContent = 'Power Mode: Normal';

  container.appendChild(visual);
  container.appendChild(text);
  container.appendChild(statusText);

  if (navigator.getBattery) {
    navigator.getBattery().then(bat => {
      const update = () => {
        const isDesktop = (bat.level === 1 && bat.charging && bat.chargingTime === 0 && bat.dischargingTime === Infinity);
        
        if (isDesktop) {
          level.style.width = '100%';
          level.style.background = '#34c759';
          text.textContent = '100%';
          statusText.textContent = 'Power Adapter Connected';
          visual.classList.add('ac-power');
        } else {
          const l = Math.round(bat.level * 100);
          level.style.width = l + '%';
          text.textContent = l + '%';
          statusText.textContent = bat.charging ? 'Charging...' : 'On Battery';
          level.style.background = bat.charging ? '#34c759' : (l < 20 ? '#ff3b30' : '#34c759');
          visual.classList.toggle('charging', bat.charging);
          visual.classList.remove('ac-power');
        }
      };
      update();
      bat.addEventListener('levelchange', update);
      bat.addEventListener('chargingchange', update);
    }).catch(() => {
      // Fallback if promise fails
      text.textContent = '100%';
      statusText.textContent = 'AC Power Connected';
      visual.classList.add('ac-power');
    });
  } else {
    // Fallback if not supported
    text.textContent = '100%';
    statusText.textContent = 'AC Power Connected';
    visual.classList.add('ac-power');
  }

  return container;
}
