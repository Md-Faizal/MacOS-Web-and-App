export function createRemindersWidget(id) {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-reminders';
  container.style.height = '100%';
  
  const storageKey = `mac-widget-reminders-${id}`;
  let reminders = JSON.parse(localStorage.getItem(storageKey)) || [];

  const fetchReminders = async () => {
    try {
      const response = await fetch(`/api/reminders/${id}`);
      const data = await response.json();
      if (data.success && Array.isArray(data.reminders)) {
        reminders = data.reminders;
        // Also update local cache
        localStorage.setItem(storageKey, JSON.stringify(reminders));
        render();
      }
    } catch (error) {
      console.warn('RemindersWidget: Failed to fetch from server, using local cache:', error);
    }
  };

  const render = () => {
    container.innerHTML = `
      <div class="mac-w-reminders-header">
        <span class="mac-w-reminders-title">Reminders</span>
        <span class="mac-w-reminders-count">${reminders.filter(r => !r.completed).length}</span>
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

    // Listeners
    container.querySelectorAll('.mac-w-reminder-item').forEach(item => {
      const rid = item.dataset.id;
      
      // Toggle completion
      item.onclick = (e) => {
        if (e.target.classList.contains('mac-w-reminder-delete')) return;
        const reminder = reminders.find(r => r.id.toString() === rid.toString());
        if (reminder) {
          reminder.completed = !reminder.completed;
          saveAndRender();
        }
      };

      // Delete item
      const delBtn = item.querySelector('.mac-w-reminder-delete');
      delBtn.onclick = (e) => {
        e.stopPropagation();
        reminders = reminders.filter(r => r.id.toString() !== rid.toString());
        saveAndRender();
      };
    });

    const input = container.querySelector('.mac-w-reminders-input');
    const addBtn = container.querySelector('.mac-w-reminders-add-btn');

    const addReminder = () => {
      const text = input.value.trim();
      if (text) {
        reminders.push({ id: Date.now().toString(), text, completed: false });
        saveAndRender();
      }
    };

    input.onkeypress = (e) => { if (e.key === 'Enter') addReminder(); };
    addBtn.onclick = addReminder;

    // Stop drag propagation
    input.onmousedown = (e) => e.stopPropagation();
    input.onkeydown = (e) => e.stopPropagation();
  };

  const saveAndRender = async () => {
    // Save to local cache immediately for snappy UI
    localStorage.setItem(storageKey, JSON.stringify(reminders));
    render();

    // Sync to server
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders })
      });
    } catch (error) {
      console.error('RemindersWidget: Failed to sync with server:', error);
    }
  };

  // Initial load
  render();
  fetchReminders();
  
  return container;
}
