export function createNotesWidget(instanceId) {
  const container = document.createElement('div');
  container.className = 'mac-widget-glass mac-w-notes';
  container.style.height = '100%';
  
  // Storage keys for local fallback
  const contentKey = `mac-widget-note-content-${instanceId}`;
  const titleKey = `mac-widget-note-title-${instanceId}`;

  const state = {
    title: localStorage.getItem(titleKey) || '',
    content: localStorage.getItem(contentKey) || '',
    isExpanded: localStorage.getItem('mac-note-expanded') === 'true'
  };

  const updateWidget = () => {
    container.classList.toggle('expanded', state.isExpanded);
    container.innerHTML = `
      <div class="mac-w-notes-container">
        <div class="mac-w-notes-header">
          <span class="mac-w-notes-icon">📝</span>
          <div class="mac-w-notes-title" 
               contenteditable="true" 
               spellcheck="false" 
               data-placeholder="Quick Note">${state.title}</div>
          <button class="mac-w-widget-resize-btn" type="button" title="${state.isExpanded ? 'Collapse note' : 'Expand note'}">${state.isExpanded ? '⤡' : '⤢'}</button>
        </div>
        <textarea class="mac-w-notes-editor" 
                  placeholder="Start typing your note..." 
                  spellcheck="false">${state.content}</textarea>
      </div>
    `;

    const titleEl = container.querySelector('.mac-w-notes-title');
    const editorEl = container.querySelector('.mac-w-notes-editor');
    const resizeBtn = container.querySelector('.mac-w-widget-resize-btn');

    const fetchServerNote = async () => {
      try {
        const response = await fetch(`/api/quick-notes/${instanceId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.title !== undefined) {
            state.title = data.title;
            state.content = data.content;
            
            // Update UI if user isn't actively typing
            if (document.activeElement !== titleEl) titleEl.textContent = state.title;
            if (document.activeElement !== editorEl) editorEl.value = state.content;
            
            // Update local cache
            localStorage.setItem(titleKey, state.title);
            localStorage.setItem(contentKey, state.content);
          }
        } else {
          console.warn(`NotesWidget: Server returned ${response.status} for fetch`, await response.text());
        }
      } catch (e) {
        console.error('NotesWidget: Failed to fetch from server:', e);
      }
    };

    let saveTimeout = null;
    const saveServerNote = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          const response = await fetch(`/api/quick-notes/${instanceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: state.title,
              content: state.content
            })
          });
          if (!response.ok) {
            console.warn(`NotesWidget: Server returned ${response.status} for save`);
          }
        } catch (e) {
          console.error('NotesWidget: Failed to save to server:', e);
        }
      }, 1000);
    };

    titleEl.addEventListener('input', () => {
      state.title = titleEl.textContent;
      localStorage.setItem(titleKey, state.title);
      saveServerNote();
    });

    editorEl.addEventListener('input', (e) => {
      state.content = e.target.value;
      localStorage.setItem(contentKey, state.content);
      saveServerNote();
    });

    resizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const shortcutEl = container.closest('.desktop-shortcut');
      if (!shortcutEl || !window.desktopManager) {
        state.isExpanded = !state.isExpanded;
        localStorage.setItem('mac-note-expanded', String(state.isExpanded));
        updateWidget();
        return;
      }

      const appId = shortcutEl.id.replace('shortcut-', '');
      const nextExpanded = !state.isExpanded;
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
        state.isExpanded = nextExpanded;
        localStorage.setItem('mac-note-expanded', String(state.isExpanded));
        updateWidget();
      }
    });

    [titleEl, editorEl].forEach(el => {
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('touchstart', (e) => e.stopPropagation());
    });

    fetchServerNote();
  };

  updateWidget();
  return container;
}
