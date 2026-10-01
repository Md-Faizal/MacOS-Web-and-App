import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/auth';

type UserLike = {
  id?: number | string;
  email?: string;
  username?: string;
  full_name?: string;
  display_name?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  query?: string | null;
  results?: any[] | null;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

type AIBubbleProps = {
  user?: UserLike | null;
};

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

const QUICK_PROMPTS = [
  'Revenue summary',
  'Top customers',
  'Unpaid invoices',
  'Low stock',
  'Customer activity',
  'Next best actions',
];

const DEFAULT_INSIGHTS = [
  { label: 'Revenue', value: '$84.2k', note: '+12.8%', tone: 'positive' },
  { label: 'Repeat customers', value: '68%', note: '+4.1%', tone: 'info' },
  { label: 'Inventory risk', value: '9 items', note: 'Needs review', tone: 'warning' },
];

const normalizeUserScope = (user?: UserLike | null) => {
  const rawIdentity = user?.id ?? user?.email ?? user?.username ?? user?.display_name ?? user?.full_name ?? 'guest';
  return `zentra-ai-${String(rawIdentity).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'guest'}`;
};

const createWelcomeMessages = (): ChatMessage[] => [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'I can help with sales, customer health, inventory, and daily operations. Ask me anything and I will use the live business context to answer it.',
  },
];

const createSession = (messages: ChatMessage[] = createWelcomeMessages()): ChatSession => ({
  id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New conversation',
  updatedAt: Date.now(),
  messages,
});

const getStoredSessions = (user?: UserLike | null): ChatSession[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(`zentra-ai-chat-sessions-${normalizeUserScope(user)}`);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatAssistantText = (text: string) => {
  if (!text) return '';

  const escaped = escapeHtml(text);
  const withBold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const withEmphasis = withBold.replace(/\*(.*?)\*/g, '<em>$1</em>');
  const withCode = withEmphasis.replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = withCode.split('\n');
  let listType: 'ul' | 'ol' | null = null;
  const formatted: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (listType) {
        formatted.push(listType === 'ol' ? '</ol>' : '</ul>');
        listType = null;
      }
      continue;
    }

    if (/^-\s+/.test(trimmed) || /^\*\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        if (listType) {
          formatted.push('</ol>');
        }
        formatted.push('<ul class="zentra-ai-list">');
        listType = 'ul';
      }
      formatted.push(`<li>${trimmed.replace(/^[-*]\s+/, '')}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        if (listType) {
          formatted.push('</ul>');
        }
        formatted.push('<ol class="zentra-ai-list">');
        listType = 'ol';
      }
      formatted.push(`<li>${trimmed.replace(/^\d+\.\s+/, '')}</li>`);
      continue;
    }

    if (listType) {
      formatted.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    }

    formatted.push(`<p>${trimmed}</p>`);
  }

  if (listType) {
    formatted.push(listType === 'ol' ? '</ol>' : '</ul>');
  }

  return formatted.join('');
};

export function AIBubble({ user }: AIBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: 20, y: 20 });
  const [panelSize, setPanelSize] = useState({ width: 440, height: 620 });

  const dragState = useRef<{ active: boolean; pointerId: number | null; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 20,
    originY: 20,
  });
  const panelDragState = useRef<{ active: boolean; pointerId: number | null; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 20,
    originY: 20,
  });
  const panelResizeState = useRef<{ active: boolean; pointerId: number | null; startX: number; startY: number; originWidth: number; originHeight: number }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originWidth: 440,
    originHeight: 620,
  });
  const dragMoved = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const sessionId = useRef(`zentra-ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const sessionKey = useMemo(() => normalizeUserScope(user), [user]);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const cached = getStoredSessions(user);
    return cached.length > 0 ? cached : [createSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const cached = getStoredSessions(user);
    return cached[0]?.id ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeSessionId) ?? sessions[0] ?? createSession(),
    [sessions, activeSessionId],
  );

  const messages = activeSession?.messages ?? createWelcomeMessages();
  const latestAssistant = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant') ?? messages[0],
    [messages],
  );

  useEffect(() => {
    setSessions(getStoredSessions(user));
    setActiveSessionId(current => current || getStoredSessions(user)[0]?.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }, [sessionKey, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`zentra-ai-chat-sessions-${sessionKey}`, JSON.stringify(sessions));
  }, [sessions, sessionKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    setBubblePosition({ x: Math.max(18, width - 92), y: Math.max(18, height - 110) });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isThinking]);

  const activeModelLabel = useMemo(
    () => MODEL_OPTIONS.find(option => option.value === selectedModel)?.label ?? 'Gemini 2.5 Flash',
    [selectedModel],
  );

  const insightCards = useMemo(() => [
    ...DEFAULT_INSIGHTS,
    { label: 'AI status', value: isThinking ? 'Working…' : 'Online', note: activeModelLabel, tone: isThinking ? 'info' : 'positive' },
  ], [activeModelLabel, isThinking]);

  const updateActiveSession = (nextMessages: ChatMessage[], overrideTitle?: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== activeSessionId) return session;
      return {
        ...session,
        title: overrideTitle ?? session.title,
        updatedAt: Date.now(),
        messages: nextMessages,
      };
    }));
  };

  const createFreshChat = () => {
    const nextSession = createSession();
    setSessions(prev => [nextSession, ...prev]);
    setActiveSessionId(nextSession.id);
    setIsHistoryOpen(true);
    setInput('');
  };

  const clearCurrentChat = () => {
    const replacement = createSession();
    setSessions(prev => [replacement, ...prev.filter(session => session.id !== activeSessionId)]);
    setActiveSessionId(replacement.id);
    setInput('');
  };

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isThinking) return;

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    const title = messages.length <= 1 ? trimmed.slice(0, 28) || 'New chat' : activeSession.title;
    updateActiveSession(nextMessages, title);
    setInput('');
    setIsThinking(true);

    try {
      const data = await apiFetch<any>('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          sessionId: sessionId.current,
          useContext: true,
          model: selectedModel,
        }),
      });

      if (!data?.success) {
        const detail = data?.details || data?.error || 'The AI service is unavailable right now.';
        const message = detail === 'CSRF validation failed'
          ? 'The request was blocked by the browser security token. I have refreshed the secure session and you can retry immediately.'
          : `I hit a problem while processing that request. ${detail}`;

        updateActiveSession([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: message,
          },
        ]);
        return;
      }

      const answer = data.response || 'I found the answer in your data but the response came back empty.';
      const finalResults = Array.isArray(data.results) ? data.results : [];
      updateActiveSession([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: answer,
          query: data.query ?? null,
          results: finalResults,
        },
      ], title);
    } catch (error) {
      console.error('AI query failed:', error);
      updateActiveSession([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'I could not connect to the AI service. Please try again in a moment.',
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    void sendPrompt(input);
  };

  const startVoiceCapture = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      if (transcript) {
        setInput(prev => prev ? `${prev} ${transcript}`.trim() : transcript);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleBubblePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    dragState.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bubblePosition.x,
      originY: bubblePosition.y,
    };
    dragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBubblePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current.active || event.pointerId !== dragState.current.pointerId) return;

    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;
    const maxX = Math.max(16, window.innerWidth - 110);
    const maxY = Math.max(16, window.innerHeight - 110);
    const x = Math.min(Math.max(16, dragState.current.originX + deltaX), maxX);
    const y = Math.min(Math.max(16, dragState.current.originY + deltaY), maxY);

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragMoved.current = true;
    }

    setBubblePosition({ x, y });
  };

  const handleBubblePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragState.current.pointerId === event.pointerId) {
      dragState.current = { active: false, pointerId: null, startX: 0, startY: 0, originX: bubblePosition.x, originY: bubblePosition.y };
    }
  };

  const handleBubbleClick = () => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setIsOpen(prev => !prev);
  };

  const handlePanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement)?.closest('button, select, textarea, input')) return;

    panelDragState.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelLeft,
      originY: panelTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDragState.current.active || event.pointerId !== panelDragState.current.pointerId) return;

    const deltaX = event.clientX - panelDragState.current.startX;
    const deltaY = event.clientY - panelDragState.current.startY;
    const nextLeft = Math.max(18, Math.min(window.innerWidth - panelSize.width - 24, panelDragState.current.originX + deltaX));
    const nextTop = Math.max(18, Math.min(window.innerHeight - panelSize.height - 24, panelDragState.current.originY + deltaY));

    setBubblePosition({ x: nextLeft + panelSize.width - 60, y: nextTop + 42 });
    panelDragState.current = { ...panelDragState.current, originX: nextLeft, originY: nextTop };
  };

  const handlePanelPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panelDragState.current.pointerId === event.pointerId) {
      panelDragState.current = { active: false, pointerId: null, startX: 0, startY: 0, originX: panelLeft, originY: panelTop };
    }
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    panelResizeState.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: panelSize.width,
      originHeight: panelSize.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panelResizeState.current.active || event.pointerId !== panelResizeState.current.pointerId) return;

    const deltaX = event.clientX - panelResizeState.current.startX;
    const deltaY = event.clientY - panelResizeState.current.startY;
    const nextWidth = Math.min(Math.max(350, panelResizeState.current.originWidth + deltaX), Math.min(560, window.innerWidth - 48));
    const nextHeight = Math.min(Math.max(420, panelResizeState.current.originHeight + deltaY), Math.min(780, window.innerHeight - 48));
    setPanelSize({ width: nextWidth, height: nextHeight });
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panelResizeState.current.pointerId === event.pointerId) {
      panelResizeState.current = { active: false, pointerId: null, startX: 0, startY: 0, originWidth: panelSize.width, originHeight: panelSize.height };
    }
  };

  const panelLeft = Math.max(18, Math.min(window.innerWidth - panelSize.width - 24, bubblePosition.x - panelSize.width - 24));
  const panelTop = Math.max(18, Math.min(window.innerHeight - panelSize.height - 24, bubblePosition.y - panelSize.height + 110));

  return (
    <>
      <button
        type="button"
        className={`zentra-ai-bubble ${isOpen ? 'is-open' : ''}`}
        aria-label="Open AI assistant"
        onClick={handleBubbleClick}
        onPointerDown={handleBubblePointerDown}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={handleBubblePointerUp}
        onPointerLeave={handleBubblePointerUp}
        style={{ left: bubblePosition.x, top: bubblePosition.y }}
      >
        <span className="zentra-ai-bubble-glow" aria-hidden="true" />
        <span className="zentra-ai-bubble-core">✦</span>
      </button>

      {isOpen && (
        <div
          className={`zentra-ai-panel ${compactMode ? 'is-compact' : ''}`}
          style={{ left: panelLeft, top: panelTop, width: panelSize.width, height: panelSize.height }}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          onPointerLeave={handlePanelPointerUp}
        >
          <div className="zentra-ai-header" onPointerDown={handlePanelPointerDown}>
            <div className="zentra-ai-title-wrap">
              <div className="zentra-ai-dot" aria-hidden="true" />
              <div>
                <div className="zentra-ai-title">Zentra AI</div>
                <div className="zentra-ai-status">{activeModelLabel}</div>
              </div>
            </div>

            <div className="zentra-ai-header-actions">
              <button type="button" className="zentra-ai-history-toggle" onClick={() => setIsHistoryOpen(prev => !prev)}>
                {isHistoryOpen ? 'Hide' : 'History'}
              </button>
              <select
                value={selectedModel}
                onChange={event => setSelectedModel(event.target.value)}
                className="zentra-ai-model"
                aria-label="Select AI model"
              >
                {MODEL_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" className="zentra-ai-compact-button" onClick={() => setCompactMode(prev => !prev)} aria-label="Toggle compact mode">
                {compactMode ? 'Expand' : 'Min'}
              </button>
              <button type="button" className="zentra-ai-close" onClick={() => setIsOpen(false)} aria-label="Close assistant">
                ×
              </button>
            </div>
          </div>

          <div className="zentra-ai-insight-row">
            {insightCards.map(card => (
              <div key={card.label} className={`zentra-ai-insight-card tone-${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.note}</small>
              </div>
            ))}
          </div>

          <div className="zentra-ai-shell">
            {isHistoryOpen && (
              <aside className="zentra-ai-history-panel">
                <div className="zentra-ai-history-header">
                  <span>Conversations</span>
                  <button type="button" className="zentra-ai-new-chat" onClick={createFreshChat}>New</button>
                </div>

                <div className="zentra-ai-history-list">
                  {sessions.map(session => (
                    <button
                      key={session.id}
                      type="button"
                      className={`zentra-ai-history-item ${session.id === activeSessionId ? 'active' : ''}`}
                      onClick={() => setActiveSessionId(session.id)}
                    >
                      <span className="zentra-ai-history-title">{session.title}</span>
                      <span className="zentra-ai-history-meta">
                        {new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </button>
                  ))}
                </div>

                <button type="button" className="zentra-ai-clear-button" onClick={clearCurrentChat}>
                  Clear current chat
                </button>
              </aside>
            )}

            <main className="zentra-ai-main-panel">
              {compactMode ? (
                <div className="zentra-ai-compact-summary">
                  <div className="zentra-ai-compact-label">Latest insight</div>
                  <div className="zentra-ai-compact-copy">{latestAssistant?.content || 'Ask me anything about your business.'}</div>
                </div>
              ) : (
                <div className="zentra-ai-messages">
                  {messages.map(message => {
                    const isUser = message.role === 'user';
                    return (
                      <div key={message.id} className={`zentra-ai-message ${isUser ? 'zentra-ai-message-user' : 'zentra-ai-message-assistant'}`}>
                        <div className="zentra-ai-bubble-message">
                          <div dangerouslySetInnerHTML={{ __html: formatAssistantText(message.content) }} />
                          {message.query && (
                            <details className="zentra-ai-details">
                              <summary>View SQL</summary>
                              <pre>{message.query}</pre>
                            </details>
                          )}
                          {message.results && message.results.length > 0 && (
                            <div className="zentra-ai-results">
                              {Object.keys(message.results[0]).map(key => (
                                <span key={key} className="zentra-ai-chip">{key}</span>
                              ))}
                              <div className="zentra-ai-table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      {Object.keys(message.results[0]).map(key => (
                                        <th key={key}>{key.replace(/_/g, ' ')}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {message.results.slice(0, 5).map((row, index) => (
                                      <tr key={`${row.id ?? index}-${index}`}>
                                        {Object.keys(message.results[0]).map(col => (
                                          <td key={`${col}-${index}`}>{String(row[col] ?? '')}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isThinking && (
                    <div className="zentra-ai-message zentra-ai-message-assistant">
                      <div className="zentra-ai-bubble-message">
                        <div className="zentra-ai-loader" aria-label="Thinking">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}

              <div className="zentra-ai-prompt-row">
                <div className="zentra-ai-suggestions">
                  {QUICK_PROMPTS.map(prompt => (
                    <button key={prompt} type="button" className="zentra-ai-suggestion" onClick={() => void sendPrompt(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleSubmit} className="zentra-ai-form">
                  <div className="zentra-ai-input-shell">
                    <textarea
                      value={input}
                      onChange={event => setInput(event.target.value)}
                      rows={1}
                      placeholder="Ask about revenue, customers, inventory..."
                      className="zentra-ai-input"
                      onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void sendPrompt(input);
                        }
                      }}
                    />
                    <div className="zentra-ai-composer-actions">
                      <button
                        type="button"
                        className={`zentra-ai-mic ${isListening ? 'active' : ''}`}
                        aria-label="Voice input"
                        onClick={startVoiceCapture}
                      >
                        ◉
                      </button>
                      <button type="submit" className="zentra-ai-send" disabled={isThinking || !input.trim()}>
                        Send
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </main>
          </div>
          <div
            className="zentra-ai-resize-handle"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerLeave={handleResizePointerUp}
            aria-label="Resize assistant window"
          />
        </div>
      )}
    </>
  );
}
