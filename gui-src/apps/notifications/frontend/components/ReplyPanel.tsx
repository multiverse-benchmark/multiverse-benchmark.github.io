import { useState } from 'react'
import { Send, X } from 'lucide-react'

interface ReplyPanelProps {
  onSend: (message: string) => Promise<void>
  onCancel: () => void
}

export function ReplyPanel({ onSend, onCancel }: ReplyPanelProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!message.trim() || sending) return

    // Clear previous errors
    setError(null)
    setSending(true)

    try {
      await onSend(message.trim())
      setMessage('')
      // Success - panel will be closed by parent
    } catch (err) {
      // Show error to user
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reply. Please try again.'
      setError(errorMessage)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="space-y-3">
      {/* Error Display */}
      {error && (
        <div className="bg-[var(--danger-color)]/10 border border-[var(--danger-color)]/30 rounded-lg p-3 flex items-start space-x-2">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm text-[var(--danger-color)]">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="flex-shrink-0 text-[var(--danger-color)] hover:text-[var(--danger-color)]/80"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your reply..."
          className="w-full px-4 py-3 pr-12 border-2 border-[var(--border-color)] rounded-xl focus:border-[var(--accent-color)] focus:outline-none resize-none text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] transition-colors"
          rows={3}
          autoFocus
          disabled={sending}
        />
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Cancel reply"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex justify-end space-x-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-sm font-medium"
          disabled={sending}
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="flex items-center space-x-2 px-4 py-2 bg-[var(--accent-color)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
        >
          <Send className="w-4 h-4" />
          <span>{sending ? 'Sending...' : 'Send Reply'}</span>
        </button>
      </div>
    </div>
  )
}
