/**
 * CalendarApp - A macOS-style calendar application
 * Extends the standardized AppWindow for calendar functionality
 */

class CalendarApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const width = window.innerWidth;
    let config = { appId: 'calendar', appName: 'Calendar', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    this.events = this.loadEvents();
    this.apiUrl = '/api/calendar';
    this._syncGeneration = 0;
    // Allow initialDate from callbacks
    this.currentDate = (callbacks && callbacks.initialDate) ? new Date(callbacks.initialDate) : new Date();
    this.viewMode = 'month'; // 'day', 'week', 'month', 'year'
    this.selectedDate = new Date(this.currentDate);
    this.setupCalendarUI();
    this.syncEventsFromServer();

    if (window.CoreDataBus) {
      this._dataBusCalendarUnsub = window.CoreDataBus.subscribeDomain('calendar:', () => {
        this.syncEventsFromServer();
      });
    }
  }


  setupCalendarUI() {
    this.loadExternalStyles();
    this.buildCalendarLayout();
    this.setupCalendarHeaderControls();
    this.setupCalendarEventListeners();
    this.renderCalendar();
    window.currentCalendarApp = this;
  }

  normalizeEvent(event) {
    return {
      ...event,
      startDate: new Date(event.startDate || event.date),
      endDate: new Date(event.endDate || event.end_date || event.date),
      startTime: event.startTime || event.start_time || event.time || '',
      endTime: event.endTime || event.end_time || ''
    };
  }

  async syncEventsFromServer() {
    const generation = ++this._syncGeneration;
    try {
      const response = await fetch(this.apiUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
      const events = await response.json();
      if (!Array.isArray(events)) throw new Error('Invalid Calendar response');
      if (generation !== this._syncGeneration) return;
      this.events = events.map(event => this.normalizeEvent(event));
      this.saveEventsToStorage();
      this.renderCalendar();
    } catch (error) {
      console.warn('[Calendar] Server sync unavailable; keeping local events.', error);
    }
  }

  buildCalendarLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <div class="calendar-container">
        <!-- Sidebar -->
        <div class="calendar-sidebar">
          <div class="sidebar-header">
            <h3>Calendars</h3>
          </div>
          <div class="calendar-list">
            <div class="calendar-item checked">
              <input type="checkbox" id="cal-personal" checked>
              <label for="cal-personal"><span class="cal-dot personal"></span>Personal</label>
            </div>
            <div class="calendar-item checked">
              <input type="checkbox" id="cal-work" checked>
              <label for="cal-work"><span class="cal-dot work"></span>Work</label>
            </div>
            <div class="calendar-item checked">
              <input type="checkbox" id="cal-family" checked>
              <label for="cal-family"><span class="cal-dot family"></span>Family</label>
            </div>
            <div class="calendar-item checked">
              <input type="checkbox" id="cal-school" checked>
              <label for="cal-school"><span class="cal-dot school"></span>School</label>
            </div>
          </div>

          <div class="sidebar-divider"></div>

          <!-- Mini Calendar -->
          <div class="mini-calendar">
            <div class="mini-header">
              <button class="mini-nav prev">‹</button>
              <span class="mini-month-year"></span>
              <button class="mini-nav next">›</button>
            </div>
            <div class="mini-weekdays">
              <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
            </div>
            <div class="mini-days"></div>
          </div>
        </div>

        <!-- Main Calendar View -->
        <div class="calendar-main">
          <!-- Calendar Grid -->
          <div class="calendar-grid">
            <div class="weekdays">
              <div class="weekday">Sun</div>
              <div class="weekday">Mon</div>
              <div class="weekday">Tue</div>
              <div class="weekday">Wed</div>
              <div class="weekday">Thu</div>
              <div class="weekday">Fri</div>
              <div class="weekday">Sat</div>
            </div>
            <div class="calendar-days"></div>
          </div>

          <!-- Event Details Sidebar (for month/week view) -->
          <div class="event-details-panel">
            <div class="event-details-header">Events</div>
            <div class="event-list"></div>
          </div>
        </div>
      </div>

      <!-- Event Modal -->
      <div class="event-modal" style="display: none;">
        <div class="event-modal-content">
          <div class="event-modal-header">
            <h2>New Event</h2>
            <button class="modal-close">✕</button>
          </div>
          <form class="event-form">
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="event-title" placeholder="Event title" required>
            </div>
            <div class="form-group">
              <label>Calendar</label>
              <select id="event-calendar">
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="family">Family</option>
                <option value="school">School</option>
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Start Date</label>
                <input type="date" id="event-start-date" required>
              </div>
              <div class="form-group">
                <label>Start Time</label>
                <input type="time" id="event-start-time">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>End Date</label>
                <input type="date" id="event-end-date" required>
              </div>
              <div class="form-group">
                <label>End Time</label>
                <input type="time" id="event-end-time">
              </div>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="event-description" placeholder="Add notes..." rows="4"></textarea>
            </div>
            <div class="form-buttons">
              <button type="button" class="btn-cancel">Cancel</button>
              <button type="submit" class="btn-save">Save Event</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Store element references
    this.calendarGrid = contentArea.querySelector('.calendar-days');
    this.miniCalendar = contentArea.querySelector('.mini-days');
    this.miniMonthYear = contentArea.querySelector('.mini-month-year');
    this.eventList = contentArea.querySelector('.event-list');
    this.eventModal = contentArea.querySelector('.event-modal');
    this.eventForm = contentArea.querySelector('.event-form');
  }

  setupCalendarHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (show/hide sidebar button)
    const leftControls = document.createElement('div');
    leftControls.className = 'calendar-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'calendar-header-btn';
    expandBtn.id = 'calendarExpandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(expandBtn);
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    
    // Create calendar controls container
    const calendarControls = document.createElement('div');
    calendarControls.className = 'calendar-controls';
    calendarControls.innerHTML = `
      <div class="view-buttons">
        <button class="view-btn day-btn" data-view="day">Day</button>
        <button class="view-btn week-btn" data-view="week">Week</button>
        <button class="view-btn month-btn active" data-view="month">Month</button>
        <button class="view-btn year-btn" data-view="year">Year</button>
      </div>
      <div class="date-nav">
        <button class="nav-btn prev">‹</button>
        <span class="current-date"></span>
        <button class="nav-btn next">›</button>
        <button class="today-btn">Today</button>
      </div>
      <div class="search-add">
        <input type="text" class="event-search" placeholder="Search events...">
        <button class="add-event-btn">+</button>
      </div>
    `;
    
    // Insert into title bar before the spacer
    const spacer = titleBar.querySelector('.title-spacer');
    if (spacer) {
      titleBar.insertBefore(calendarControls, spacer);
    } else {
      titleBar.appendChild(calendarControls);
    }
    
    // Update references to point to title bar controls
    this.viewButtons = calendarControls.querySelectorAll('.view-btn');
    this.monthBtn = calendarControls.querySelector('.month-btn');
    this.weekBtn = calendarControls.querySelector('.week-btn');
    this.dayBtn = calendarControls.querySelector('.day-btn');
    this.yearBtn = calendarControls.querySelector('.year-btn');
    this.prevBtn = calendarControls.querySelector('.nav-btn.prev');
    this.nextBtn = calendarControls.querySelector('.nav-btn.next');
    this.todayBtn = calendarControls.querySelector('.today-btn');
    this.currentDateDisplay = calendarControls.querySelector('.current-date');
    this.eventSearch = calendarControls.querySelector('.event-search');
    this.addEventBtn = calendarControls.querySelector('.add-event-btn');
  }

  setupCalendarEventListeners() {
    // Sidebar toggle button
    const expandBtn = document.getElementById('calendarExpandBtn');
    const sidebar = this.getContentArea().querySelector('.calendar-sidebar');
    expandBtn?.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });

    // View mode buttons
    this.viewButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.viewButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewMode = btn.dataset.view;
        this.renderCalendar();
      });
    });

    // Navigation buttons
    this.prevBtn?.addEventListener('click', () => {
      if (this.viewMode === 'month') {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      } else if (this.viewMode === 'week') {
        this.currentDate.setDate(this.currentDate.getDate() - 7);
      } else if (this.viewMode === 'day') {
        this.currentDate.setDate(this.currentDate.getDate() - 1);
      } else if (this.viewMode === 'year') {
        this.currentDate.setFullYear(this.currentDate.getFullYear() - 1);
      }
      this.renderCalendar();
    });

    this.nextBtn?.addEventListener('click', () => {
      if (this.viewMode === 'month') {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      } else if (this.viewMode === 'week') {
        this.currentDate.setDate(this.currentDate.getDate() + 7);
      } else if (this.viewMode === 'day') {
        this.currentDate.setDate(this.currentDate.getDate() + 1);
      } else if (this.viewMode === 'year') {
        this.currentDate.setFullYear(this.currentDate.getFullYear() + 1);
      }
      this.renderCalendar();
    });

    this.todayBtn?.addEventListener('click', () => {
      this.currentDate = new Date();
      this.renderCalendar();
    });

    // Mini calendar navigation
    const miniPrevBtn = this.getContentArea().querySelector('.mini-calendar .mini-nav.prev');
    const miniNextBtn = this.getContentArea().querySelector('.mini-calendar .mini-nav.next');

    miniPrevBtn?.addEventListener('click', () => {
      const miniDate = new Date(this.currentDate);
      miniDate.setMonth(miniDate.getMonth() - 1);
      this.currentDate = miniDate;
      this.renderCalendar();
    });

    miniNextBtn?.addEventListener('click', () => {
      const miniDate = new Date(this.currentDate);
      miniDate.setMonth(miniDate.getMonth() + 1);
      this.currentDate = miniDate;
      this.renderCalendar();
    });

    // Add event button
    this.addEventBtn?.addEventListener('click', () => this.showEventModal());

    // Event form
    this.eventForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEvent();
    });

    // Close button handler (search in modal directly)
    this.eventModal.querySelector('.modal-close')?.addEventListener('click', () => {
      this.eventModal.style.display = 'none';
    });

    // Cancel button handler (search in modal directly)
    this.eventModal.querySelector('.btn-cancel')?.addEventListener('click', () => {
      this.eventModal.style.display = 'none';
    });

    // Calendar selection
    this.getContentArea().querySelectorAll('.calendar-item input').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.renderCalendar());
    });
  }

  renderCalendar() {
    this.updateDateDisplay();
    this.renderMiniCalendar();
    // ensure `.month-mode` and `.hide-weekdays` classes reflect current view
    if (this.calendarGrid) {
      const gridContainer = this.calendarGrid.parentElement; // .calendar-grid
      if (gridContainer) {
        gridContainer.classList.toggle('month-mode', this.viewMode === 'month');
        gridContainer.classList.toggle('hide-weekdays', this.viewMode !== 'month');
      }
    }
    if (this.viewMode === 'month') {
      this.renderMonthView();
    } else if (this.viewMode === 'week') {
      this.renderWeekView();
    } else if (this.viewMode === 'day') {
      this.renderDayView();
    } else if (this.viewMode === 'year') {
      this.renderYearView();
    }
    
    this.renderEventList();
  }

  renderMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    this.calendarGrid.innerHTML = '';
    let currentDate = new Date(startDate);

    for (let i = 0; i < 42; i++) {
      const dayElement = document.createElement('div');
      dayElement.className = 'calendar-day';
      
      if (currentDate.getMonth() !== month) {
        dayElement.classList.add('other-month');
      }

      const dayNum = currentDate.getDate();
      const isToday = this.isToday(currentDate);
      const isSelected = this.isSameDay(currentDate, this.selectedDate);

      if (isToday) dayElement.classList.add('today');
      if (isSelected) dayElement.classList.add('selected');

      dayElement.innerHTML = `
        <div class="day-number">${dayNum}</div>
        <div class="day-events"></div>
      `;

      const dayEvents = dayElement.querySelector('.day-events');
      const eventsForDay = this.getEventsForDate(currentDate);
      eventsForDay.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = `event-item ${event.category}`;
        eventEl.textContent = event.title;
        eventEl.style.backgroundColor = this.getCategoryColor(event.category);
        eventEl.addEventListener('click', () => this.showEventDetails(event));
        dayEvents.appendChild(eventEl);
      });

      dayElement.addEventListener('click', () => {
        this.selectedDate = new Date(currentDate);
        this.renderCalendar();
      });

      this.calendarGrid.appendChild(dayElement);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  renderWeekView() {
    // Get the start of the week
    const weekStart = new Date(this.currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    this.calendarGrid.innerHTML = '';
    const weekContainer = document.createElement('div');
    weekContainer.className = 'week-view';

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);

      const dayColumn = document.createElement('div');
      dayColumn.className = 'week-day';
      if (this.isToday(date)) dayColumn.classList.add('today');

      const dayHeader = document.createElement('div');
      dayHeader.className = 'week-day-header';
      dayHeader.innerHTML = `
        <div class="week-day-name">${date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div class="week-day-number ${this.isToday(date) ? 'today-number' : ''}">${date.getDate()}</div>
      `;

      const dayEvents = document.createElement('div');
      dayEvents.className = 'week-day-events';
      const eventsForDay = this.getEventsForDate(date);
      eventsForDay.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = `event-item ${event.category}`;
        eventEl.textContent = event.title;
        eventEl.style.backgroundColor = this.getCategoryColor(event.category);
        dayEvents.appendChild(eventEl);
      });

      dayColumn.appendChild(dayHeader);
      dayColumn.appendChild(dayEvents);
      weekContainer.appendChild(dayColumn);
    }

    this.calendarGrid.appendChild(weekContainer);
  }

  renderDayView() {
    this.calendarGrid.innerHTML = '';
    const dayContainer = document.createElement('div');
    dayContainer.className = 'day-view';

    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.innerHTML = `
      <h2>${this.currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
    `;

    const dayEvents = document.createElement('div');
    dayEvents.className = 'day-events-list';
    const eventsForDay = this.getEventsForDate(this.currentDate);
    
    if (eventsForDay.length === 0) {
      dayEvents.innerHTML = '<p class="no-events">No events</p>';
    } else {
      eventsForDay.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = `event-detail ${event.category}`;
        eventEl.innerHTML = `
          <div class="event-time">${event.startTime || 'All day'}</div>
          <div class="event-info">
            <div class="event-title">${event.title}</div>
            <div class="event-desc">${event.description || ''}</div>
          </div>
        `;
        dayEvents.appendChild(eventEl);
      });
    }

    dayContainer.appendChild(dayHeader);
    dayContainer.appendChild(dayEvents);
    this.calendarGrid.appendChild(dayContainer);
  }

  renderYearView() {
    this.calendarGrid.innerHTML = '';
    const yearContainer = document.createElement('div');
    yearContainer.className = 'year-view';
    yearContainer.innerHTML = `<h2>${this.currentDate.getFullYear()}</h2>`;

    const monthsContainer = document.createElement('div');
    monthsContainer.className = 'months-grid';

    for (let month = 0; month < 12; month++) {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'month-mini';
      const firstDay = new Date(this.currentDate.getFullYear(), month, 1);
      const monthName = firstDay.toLocaleDateString('en-US', { month: 'short' });

      monthDiv.innerHTML = `<h3>${monthName}</h3>`;
      
      const daysContainer = document.createElement('div');
      daysContainer.className = 'month-mini-days';

      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());

      for (let i = 0; i < 35; i++) {
        const iterDate = new Date(startDate);
        const dayEl = document.createElement('div');
        dayEl.className = 'mini-day';
        if (iterDate.getMonth() !== month) dayEl.classList.add('other-month');
        if (this.isToday(iterDate)) dayEl.classList.add('today');
        if (this.isSameDay(iterDate, this.selectedDate)) dayEl.classList.add('selected');
        dayEl.textContent = iterDate.getDate();
        dayEl.title = iterDate.toDateString();
        dayEl.addEventListener('click', () => {
          this.selectedDate = new Date(iterDate);
          this.currentDate = new Date(iterDate);
          this.viewMode = 'month';
          this.renderCalendar();
        });
        daysContainer.appendChild(dayEl);
        startDate.setDate(startDate.getDate() + 1);
      }

      monthDiv.appendChild(daysContainer);
      monthsContainer.appendChild(monthDiv);
    }

    yearContainer.appendChild(monthsContainer);
    this.calendarGrid.appendChild(yearContainer);
  }

  renderMiniCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    this.miniMonthYear.textContent = this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    this.miniCalendar.innerHTML = '';
    let currentDate = new Date(startDate);

    for (let i = 0; i < 42; i++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'mini-day-cell';

      if (currentDate.getMonth() !== month) {
        dayEl.classList.add('other-month');
      }

      if (this.isToday(currentDate)) {
        dayEl.classList.add('today');
      }

      if (this.isSameDay(currentDate, this.selectedDate)) {
        dayEl.classList.add('selected');
      }

      dayEl.textContent = currentDate.getDate();
      dayEl.addEventListener('click', () => {
        this.selectedDate = new Date(currentDate);
        this.currentDate = new Date(currentDate);
        this.renderCalendar();
      });

      this.miniCalendar.appendChild(dayEl);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  renderEventList() {
    const selectedEvents = this.getEventsForDate(this.selectedDate);
    this.eventList.innerHTML = '';

    if (selectedEvents.length === 0) {
      this.eventList.innerHTML = '<p class="no-events">No events</p>';
    } else {
      selectedEvents.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = `event-list-item ${event.category}`;
        eventEl.innerHTML = `
          <div class="event-list-title">${event.title}</div>
          <div class="event-list-time">${event.startTime || 'All day'}</div>
          <div class="event-list-desc">${event.description || ''}</div>
        `;
        this.eventList.appendChild(eventEl);
      });
    }
  }

  updateDateDisplay() {
    this.currentDateDisplay.textContent = this.currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  getEventsForDate(date) {
    return this.events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);
      return date >= eventStart && date <= eventEnd;
    });
  }

  showEventModal(date = null) {
    const startDate = date ? date : this.selectedDate;
    document.getElementById('event-start-date').value = startDate.toISOString().split('T')[0];
    document.getElementById('event-end-date').value = startDate.toISOString().split('T')[0];
    
    // Move modal to document body to display outside app container
    const container = document.getElementById(this.containerId);
    if (container.contains(this.eventModal)) {
      document.body.appendChild(this.eventModal);
    }
    
    this.eventModal.style.display = 'flex';
  }

  async saveEvent() {
    const title = document.getElementById('event-title').value;
    const calendar = document.getElementById('event-calendar').value;
    const startDate = document.getElementById('event-start-date').value;
    const startTime = document.getElementById('event-start-time').value;
    const endDate = document.getElementById('event-end-date').value;
    const endTime = document.getElementById('event-end-time').value;
    const description = document.getElementById('event-description').value;

    const event = {
      id: Date.now().toString(),
      title,
      category: calendar,
      date: startDate,
      end_date: endDate,
      time: startTime,
      end_time: endTime,
      description
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
      const savedEvent = this.normalizeEvent(await response.json());
      this.events.push(savedEvent);
      window.CoreDataBus?.publish('calendar:event', 'created', { id: savedEvent.id });
    } catch (error) {
      console.error('[Calendar] Failed to save event:', error);
      window.showNotification?.('Calendar event could not be saved to the server.', 'error');
      return;
    }

    this.saveEventsToStorage();
    this.eventModal.style.display = 'none';
    this.eventForm.reset();
    this.renderCalendar();
  }

  showEventDetails(event) {
    alert(`${event.title}\n\n${event.description || 'No description'}`);
  }

  saveEventsToStorage() {
    localStorage.setItem('calendarEvents', JSON.stringify(this.events));
  }

  loadEvents() {
    const stored = localStorage.getItem('calendarEvents');
    return stored ? JSON.parse(stored) : this.getDefaultEvents();
  }

  getDefaultEvents() {
    const today = new Date();
    return [
      {
        id: '1',
        title: 'Team Meeting',
        category: 'work',
        startDate: today,
        endDate: today,
        startTime: '10:00',
        description: 'Weekly team sync'
      },
      {
        id: '2',
        title: 'Lunch',
        category: 'personal',
        startDate: today,
        endDate: today,
        startTime: '12:00',
        description: ''
      }
    ];
  }

  isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isSameDay(date1, date2) {
    return date1.toDateString() === date2.toDateString();
  }

  getCategoryColor(category) {
    const colors = {
      personal: '#2563eb',
      work: '#ef4444',
      family: '#22c55e',
      school: '#eab308'
    };
    return colors[category] || '#666';
  }

  loadExternalStyles() {
    if (document.getElementById('calendar-app-styles')) return;

    const link = document.createElement('link');
    link.id = 'calendar-app-styles';
    link.rel = 'stylesheet';
    link.href = '/modules/calendar/css/calendar.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }

}

// Export for use in other files
window.CalendarApp = CalendarApp;

