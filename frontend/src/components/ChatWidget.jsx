import { useEffect, useRef, useState } from 'react'
import { askChatbot } from '../services/chatbotService'
import { DnaHelix } from './DnaEffects' // sidebar logo er same DNA icon, header e
import './ChatWidget.css'

const INITIAL_GREETING = {
  id: 'greeting',
  role: 'assistant',
  text: "Hello! I'm the ForenTrace Assistant. I can answer questions about ForenTrace, cases, DNA samples, DNA matching, laboratories, and accounts. Ask me anything about using the system, in English or বাংলা.",
  isGreeting: true,
}

const SUGGESTIONS = [
  'What is ForenTrace?',
  'How do I register a DNA sample?',
  'How does DNA matching work?',
]

const MAX_LEN = 500

function getErrorMessage(error) {
  const status = error?.response?.status
  const apiMsg = error?.response?.data?.message

  if (status === 400) return apiMsg || 'Please type a valid question (up to 500 characters).'
  if (status === 429) return apiMsg || 'Too many questions asked from this IP, please try again after a few minutes.'
  if (status === 500) return apiMsg || 'The assistant is not available right now. Please try again later.'
  if (status) return apiMsg || `Request failed (${status}). Please try again.`
  if (error?.request || error?.message === 'Network Error' || !error?.response) {
    return 'The assistant could not be reached. Please check your connection and try again.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([INITIAL_GREETING])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true) // suggested question gula lukano / dekhano
  const [isMaximized, setIsMaximized] = useState(false) // boro kore dekhano (prai pura screen)
  const [size, setSize] = useState(null) // user drag kore je size dilo { w, h } — null hole default 380x560
  const [isResizing, setIsResizing] = useState(false)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const panelRef = useRef(null)
  const chipsRef = useRef(null)

  // Mouse er chaka (upor-niche) ghurale suggestion chip gula pashe scroll hoy.
  // passive: false lage, noile preventDefault kaj kore na (pichoner page scroll hoye jeto).
  useEffect(() => {
    const row = chipsRef.current
    if (!row) return
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      row.scrollLeft += e.deltaY
    }
    row.addEventListener('wheel', onWheel, { passive: false })
    return () => row.removeEventListener('wheel', onWheel)
  }, [isOpen, showSuggestions])

  // Panel niche-dane atkano, tai upor-bam kona tene boro/choto kora hoy.
  // Mouse jotota bame/upore jay, width/height totota bare.
  const startResize = (e) => {
    e.preventDefault()
    const rect = panelRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    setIsMaximized(false)
    setIsResizing(true)

    const onMove = (ev) => {
      const w = Math.min(Math.max(rect.width + (startX - ev.clientX), 320), window.innerWidth - 44)
      const h = Math.min(Math.max(rect.height + (startY - ev.clientY), 380), window.innerHeight - 44)
      setSize({ w, h })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setIsResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Auto-scroll to newest message
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  const clearChat = () => {
    setMessages([INITIAL_GREETING])
    setInput('')
  }

  const sendQuestion = async (rawQuestion) => {
    const trimmed = rawQuestion.trim()
    if (!trimmed) return
    if (isLoading) return

    // Frontend guard: enforce 500 char (backend authoritative)
    if (trimmed.length > MAX_LEN) {
      const errMsg = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: 'Question must be 500 characters or fewer.',
        isError: true,
      }
      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text: trimmed }, errMsg])
      return
    }

    const userMsg = { id: `user-${Date.now()}`, role: 'user', text: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const history = []
      for (let i = 0; i < messages.length - 1; i++) {
        const user = messages[i]
        const assistant = messages[i + 1]
        if (user.role === 'user' && assistant.role === 'assistant' && !assistant.isError) {
          history.push(
            { role: 'user', text: user.text.slice(0, MAX_LEN) },
            { role: 'assistant', text: assistant.text.slice(0, 2000) }
          )
        }
      }
      const data = await askChatbot(trimmed, history.slice(-6))
      // Expected shapes:
      // { answer, inContext: boolean, sources: [] }
      const answer = data?.answer ?? ''
      const inContext = data?.inContext
      const sources = Array.isArray(data?.sources) ? data.sources : []

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: answer || 'No answer returned.',
        inContext,
        sources,
        isOffTopic: inContext === false,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (error) {
      const msg = getErrorMessage(error)
      const isRateLimit = error?.response?.status === 429
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: msg,
          isError: true,
          isRateLimit,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLoading) return
    if (!input.trim()) return
    sendQuestion(input)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) {
        sendQuestion(input)
      }
    }
  }

  const handleSuggestion = (text) => {
    if (isLoading) return
    sendQuestion(text)
  }

  const charCount = input.length
  const isOverLimit = charCount > MAX_LEN
  const canSend = input.trim().length > 0 && !isOverLimit && !isLoading

  return (
    <div className="ft-chat-widget">
      {!isOpen && (
        <button
          type="button"
          className="ft-chat-launcher"
          aria-label="Open ForenTrace Assistant"
          onClick={() => setIsOpen(true)}
        >
          <span className="ft-chat-launcher-icon" aria-hidden="true"><DnaHelix rungs={3} /></span>
          <span className="ft-chat-launcher-text">Help</span>
        </button>
      )}

      {isOpen && (
        <div
          ref={panelRef}
          className={`ft-chat-panel${isMaximized ? ' ft-chat-panel-max' : ''}${isResizing ? ' ft-chat-panel-resizing' : ''}`}
          // CSS variable diye size — tai mobile er media query (full screen) eta ke override korte pare
          style={size ? { '--ft-chat-w': `${size.w}px`, '--ft-chat-h': `${size.h}px` } : undefined}
          role="dialog"
          aria-label="ForenTrace Assistant chat"
        >
          <div
            className="ft-chat-resize"
            onPointerDown={startResize}
            title="Drag to resize"
            aria-hidden="true"
          />
          <div className="ft-chat-header">
            <span className="ft-chat-avatar"><DnaHelix rungs={4} /></span>
            <div className="ft-chat-header-text">
              <h2 className="ft-chat-title">ForenTrace Assistant <span className="live-dot" aria-hidden="true" /></h2>
              <p className="ft-chat-subtitle">Ask about using ForenTrace.</p>
            </div>
            <button
              type="button"
              className="ft-chat-icon-btn ft-chat-max"
              aria-label={isMaximized ? 'Restore chat size' : 'Maximize chat'}
              title={isMaximized ? 'Restore' : 'Maximize'}
              onClick={() => setIsMaximized((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {isMaximized
                  ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                  : <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />}
              </svg>
            </button>
            <button
              type="button"
              className="ft-chat-icon-btn"
              aria-label="Close chat"
              title="Close chat"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="ft-chat-messages" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`ft-chat-msg ft-chat-msg-${m.role}${m.isError ? ' ft-chat-msg-error' : ''}${m.isOffTopic ? ' ft-chat-msg-offtopic' : ''}`}
              >
                <div className="ft-chat-bubble">
                  <p className="ft-chat-text">{m.text}</p>
                  {m.isOffTopic && (
                    <span className="ft-chat-offtopic-badge">Outside knowledge scope</span>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="ft-chat-sources" aria-label="Sources">
                      {m.sources.map((s) => (
                        <span key={s} className="ft-chat-source-tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="ft-chat-msg ft-chat-msg-assistant">
                <div className="ft-chat-bubble ft-chat-typing">
                  <span className="ft-chat-dot" />
                  <span className="ft-chat-dot" />
                  <span className="ft-chat-dot" />
                  <span className="visually-hidden">Assistant is typing</span>
                </div>
              </div>
            )}
          </div>

          <div className="ft-chat-footer">
          {/* Suggested question — shudhu 💡 button on thakle dekhay */}
          {showSuggestions && (
            <div id="ft-chat-chip-list" ref={chipsRef} className="ft-chat-suggestions" aria-label="Suggested questions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ft-chat-chip"
                  onClick={() => handleSuggestion(s)}
                  disabled={isLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="ft-chat-input-area" onSubmit={handleSubmit}>
            <label htmlFor="ft-chat-input" className="visually-hidden">
              Ask a question
            </label>
            <textarea
              id="ft-chat-input"
              ref={textareaRef}
              className="ft-chat-textarea"
              placeholder="Ask in English or বাংলা..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={MAX_LEN + 50}
              disabled={isLoading}
              aria-label="Ask a question about ForenTrace"
            />
            <div className="ft-chat-controls">
              <span className={`ft-chat-count ${isOverLimit ? 'ft-chat-count-error' : ''}`} aria-live="polite">
                {charCount}/{MAX_LEN}
              </span>
              <div className="ft-chat-actions">
                {/* 💡 — suggested question dekhano / lukano */}
                <button
                  type="button"
                  className={`ft-chat-suggest-toggle${showSuggestions ? ' is-active' : ''}`}
                  onClick={() => setShowSuggestions((v) => !v)}
                  aria-pressed={showSuggestions}
                  aria-controls="ft-chat-chip-list"
                  aria-label={showSuggestions ? 'Hide suggested questions' : 'Show suggested questions'}
                  title="Suggested questions"
                >
                  💡
                </button>
                <button
                  type="button"
                  className="ft-chat-clear"
                  onClick={clearChat}
                  disabled={isLoading}
                >
                  Clear chat
                </button>
                <button type="submit" className="ft-chat-send" disabled={!canSend}>
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      )}
    </div>
  )
}
