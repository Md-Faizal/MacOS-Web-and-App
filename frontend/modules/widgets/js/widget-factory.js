import { createClockWidget } from './ClockWidget.js';
import { createCalendarWidget } from './CalendarWidget.js';
import { createWeatherWidget } from './WeatherWidget.js';
import { createBatteryWidget } from './BatteryWidget.js';
import { createNotesWidget } from './NotesWidget.js';
import { createRemindersWidget } from './RemindersWidget.js';
import { createWelcomeClockWidget } from './WelcomeClockWidget.js';

/**
 * WidgetFactory - Central dispatcher for creating functional macOS-style widgets.
 * Now modularized for better maintainability.
 */
export class WidgetFactory {
  static create(type, id) {
    const widgetMap = {
      'clock': createClockWidget,
      'calendar': createCalendarWidget,
      'weather': createWeatherWidget,
      'battery': createBatteryWidget,
      'notes': createNotesWidget,
      'reminders': createRemindersWidget,
      'welcomeclock': createWelcomeClockWidget
    };

    const creator = widgetMap[type.toLowerCase()];
    if (creator) {
      return creator(id);
    }
    
    return this.createPlaceholderWidget(type);
  }

  static createPlaceholderWidget(type) {
    const container = document.createElement('div');
    container.className = 'mac-widget-glass';
    container.innerHTML = `
      <div style="font-weight: 700; color: var(--mac-w-text-primary);">${type}</div>
      <div style="font-size: 11px; margin-top: 4px; color: var(--mac-w-text-secondary);">Widget implementation coming soon.</div>
    `;
    return container;
  }
}
