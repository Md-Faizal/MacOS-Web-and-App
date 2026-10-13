const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

export function createRemindersWidget(id) {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-reminders';
  container.style.height = '100%';
  
  const storageKey = getScopedStorageKey(`mac-widget-reminders-${id}`);
  let reminders = JSON.parse(localStorage.getItem(storageKey)) || [];
  let isExpanded = localStorage.getItem(getScopedStorageKey(`mac-reminders-expanded-${id}`)) === 'true';

  const fetchReminders = async () => {
    try {
      const response = await fetch(`/api/reminders/${id}`);
      const data = await response.json();
      if (data.success && Array.isArray(data.reminders)) {
        if (data.reminders.length > 0) {
          reminders = data.reminders;
          localStorage.setItem(storageKey, JSON.stringify(reminders));
          render();
        } else if (reminders.length > 0) {
          // Local storage has reminders, but server returned empty for this new widget instance:
          // Sync local reminders to server instead of wiping!
          saveAndRender();
        }
      }
    } catch (error) {
      console.warn('RemindersWidget: Failed to fetch from server, using local cache:', error);
    }
  };

  const render = () => {
    container.classList.toggle('expanded', isExpanded);
    container.innerHTML = `
      <div class="mac-w-reminders-header">
        <span class="mac-w-reminders-title">Reminders</span>
        <div class="mac-w-reminders-header-actions">
          <span class="mac-w-reminders-count">${reminders.filter(r => !r.completed).length}</span>
          <button class="mac-w-widget-resize-btn" type="button" title="${isExpanded ? 'Collapse reminders' : 'Expand reminders'}">${isExpanded ? '⤡' : '⤢'}</button>
        </div>
      </div>
      <div class="mac-w-reminders-list">
        ${reminders.map(r => `
          <div class="mac-w-reminder-item ${r.completed ? 'completed' : ''}" data-id="${r.id}">
            <div class="mac-w-reminder-circle"></div>
            <span class="mac-w-reminder-text">${r.text}</span>
            <button class="mac-w-reminder-delete">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="mac-w-reminders-footer">
        <button class="mac-w-reminders-add-btn">+</button>
        <input type="text" class="mac-w-reminders-input" placeholder="New Reminder">
      </div>
    `;

    container.querySelectorAll('.mac-w-reminder-item').forEach(item => {
      const rid = item.dataset.id;
      item.onclick = (e) => {
        if (e.target.classList.contains('mac-w-reminder-delete')) return;
        const reminder = reminders.find(r => r.id.toString() === rid.toString());
        if (reminder) {
          reminder.completed = !reminder.completed;
          saveAndRender();
        }
      };

      const delBtn = item.querySelector('.mac-w-reminder-delete');
      delBtn.onclick = (e) => {
        e.stopPropagation();
        reminders = reminders.filter(r => r.id.toString() !== rid.toString());
        saveAndRender();
      };
    });

    const input = container.querySelector('.mac-w-reminders-input');
    const addBtn = container.querySelector('.mac-w-reminders-add-btn');
    const resizeBtn = container.querySelector('.mac-w-widget-resize-btn');

    const addReminder = () => {
      const text = input.value.trim();
      if (text) {
        reminders.push({ id: Date.now().toString(), text, completed: false });
        saveAndRender();
      }
    };

    input.onkeypress = (e) => { if (e.key === 'Enter') addReminder(); };
    addBtn.onclick = addReminder;
    resizeBtn.onclick = (e) => {
      e.stopPropagation();
      const shortcutEl = container.closest('.desktop-shortcut');
      if (!shortcutEl || !window.desktopManager) {
        isExpanded = !isExpanded;
        localStorage.setItem(getScopedStorageKey(`mac-reminders-expanded-${id}`), String(isExpanded));
        render();
        return;
      }

      const appId = shortcutEl.id.replace('shortcut-', '');
      const nextExpanded = !isExpanded;
      const newSpanX = nextExpanded ? 3 : 2;
      const newSpanY = 2;

      if (nextExpanded && !window.desktopManager.canResizeShortcut(appId, newSpanX, newSpanY)) {
        container.style.transform = 'translate(-2px, 0)';
        setTimeout(() => container.style.transform = 'translate(2px, 0)', 50);
        setTimeout(() => container.style.transform = 'translate(-2px, 0)', 100);
        setTimeout(() => container.style.transform = '', 150);
        return;
      }

      if (window.desktopManager.resizeShortcut(appId, newSpanX, newSpanY)) {
        isExpanded = nextExpanded;
        localStorage.setItem(getScopedStorageKey(`mac-reminders-expanded-${id}`), String(isExpanded));
        render();
      }
    };

    input.onmousedown = (e) => e.stopPropagation();
    input.onkeydown = (e) => e.stopPropagation();
  };

  const saveAndRender = async () => {
    localStorage.setItem(storageKey, JSON.stringify(reminders));
    render();

    try {
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1];
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);

      await fetch(`/api/reminders/${id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reminders })
      });
    } catch (error) {
      console.error('RemindersWidget: Failed to sync with server:', error);
    }
  };

  render();
  fetchReminders();
  
  return container;
}
