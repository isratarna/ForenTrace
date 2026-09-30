import { useEffect, useRef, useState } from 'react'
import { askChatbot } from '../services/chatbotService'
import './ChatWidget.css'

const INITIAL_GREETING = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! Ask me anything about how ForenTrace works, or try a suggestion below.",
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
  const [showSuggestions, setShowSuggestions] = useState(true)
  const listRef = useRef(null)
  const textareaRef = useRef(null)

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
    setShowSuggestions(true)
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
    setShowSuggestions(false)
    setIsLoading(true)

    try {
      const data = await askChatbot(trimmed)
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
          <span className="ft-chat-launcher-icon" aria-hidden="true">?</span>
          <span className="ft-chat-launcher-text">Help</span>
        </button>
      )}

      {isOpen && (
        <div className="ft-chat-panel" role="dialog" aria-label="ForenTrace Assistant chat">
          <div className="ft-chat-header">
            <div className="ft-chat-header-text">
              <h2 className="ft-chat-title">ForenTrace Assistant</h2>
              <p className="ft-chat-subtitle">Ask questions about the ForenTrace system.</p>
            </div>
            <button
              type="button"
              className="ft-chat-close"
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

          {showSuggestions && (
            <div className="ft-chat-suggestions" aria-label="Suggested questions">
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
              placeholder="Ask about ForenTrace, cases, DNA samples..."
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
                <button
                  type="button"
                  className={`ft-chat-suggest-toggle${showSuggestions ? ' is-active' : ''}`}
                  onClick={() => setShowSuggestions((v) => !v)}
                  aria-pressed={showSuggestions}
                  aria-label={showSuggestions ? 'Hide suggested questions' : 'Show suggested questions'}
                  title="Suggested questions"
                >
                  💡
                </button>
                <button
                  type="button"
                  className="ft-chat-clear"
                  onClick={clearChat}
                  disabled={isLoading && messages.length <= 1}
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
      )}
    </div>
  )
}
