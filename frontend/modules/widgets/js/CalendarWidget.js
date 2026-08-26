/**
 * CalendarWidget - Month-accurate grid view.
 */
export function createCalendarWidget() {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-calendar';
  container.style.height = 'auto';
  
  let timeSettings = JSON.parse(localStorage.getItem('mac-system-time-settings')) || { mode: 'auto' };

  const getSystemDate = () => {
    let now = new Date();
    if (timeSettings.mode === 'location' && timeSettings.timezone) {
      try {
        now = new Date(now.toLocaleString('en-US', { timeZone: timeSettings.timezone }));
      } catch (e) {}
    } else if (timeSettings.mode === 'manual' && timeSettings.manualOffset) {
      now = new Date(now.getTime() + timeSettings.manualOffset);
    }
    return now;
  };

  let currentDisplayDate = getSystemDate();
  
  const header = document.createElement('div');
  header.className = 'mac-w-calendar-header';
  
  const monthTitle = document.createElement('div');
  monthTitle.className = 'mac-w-calendar-month-title';
  monthTitle.title = 'Double-click to return to Today';
  monthTitle.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    currentDisplayDate = new Date();
    grid.classList.add('mac-w-reset-anim');
    renderGrid();
    setTimeout(() => grid.classList.remove('mac-w-reset-anim'), 500);
  });
  
  const navContainer = document.createElement('div');
  navContainer.className = 'mac-w-calendar-nav';
  
  const prevBtn = document.createElement('button');
  prevBtn.className = 'calendar-nav-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
    renderGrid();
  });
  
  const nextBtn = document.createElement('button');
  nextBtn.className = 'calendar-nav-btn';
  nextBtn.innerHTML = '›';
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
    renderGrid();
  });
  
  navContainer.appendChild(prevBtn);
  navContainer.appendChild(nextBtn);
  header.appendChild(monthTitle);
  header.appendChild(navContainer);
  
  const grid = document.createElement('div');
  grid.className = 'mac-w-calendar-grid';

  const renderGrid = () => {
    grid.innerHTML = '';
    const systemNow = getSystemDate();
    const year = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();
    
    monthTitle.textContent = currentDisplayDate.toLocaleDateString([], { month: 'long', year: year !== systemNow.getFullYear() ? 'numeric' : undefined });

    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    days.forEach((day, index) => {
      const dayEl = document.createElement('div');
      dayEl.className = 'mac-w-day-name';
      if (index === 0) dayEl.classList.add('is-sunday');
      dayEl.textContent = day;
      grid.appendChild(dayEl);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'mac-w-day-number';
      dayEl.textContent = d;
      
      const dayDate = new Date(year, month, d);
      if (dayDate.getDay() === 0) dayEl.classList.add('is-sunday');
      
      if (year === systemNow.getFullYear() && month === systemNow.getMonth() && d === systemNow.getDate()) {
        dayEl.classList.add('mac-w-day-today');
      }
      
      dayEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appBar) {
          window.appBar.launchApp('calendar', { date: dayDate });
        }
      });
      
      grid.appendChild(dayEl);
    }
  };

  renderGrid();
  container.appendChild(header);
  container.appendChild(grid);
  window.addEventListener('mac-time-sync', (e) => {
    timeSettings = e.detail;
    currentDisplayDate = getSystemDate();
    renderGrid();
  });

  return container;
}
