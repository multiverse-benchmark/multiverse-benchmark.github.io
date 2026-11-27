import { useState } from 'react'
import { MessageSquare, ChevronDown, ChevronUp, Image, Mic, Video, Trash2 } from 'lucide-react'
import type { BundledNotification } from '../types'
import { ReplyPanel } from './ReplyPanel'

interface NotificationCardProps {
  notification: BundledNotification
  onReply: (bundle: BundledNotification, message: string) => Promise<void>
  onView: (notificationKey: string) => void
  onDelete: (notificationKey: string) => void
  isUnread: boolean
}

function formatTime(date: string, time: string): string {
  try {
    const datetime = new Date(`${date}T${time}`)
    const now = new Date()
    const diff = now.getTime() - datetime.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return datetime.toLocaleDateString()
  } catch {
    return `${date} ${time}`
  }
}

function getContentIcon(contentType: string) {
  switch (contentType) {
    case 'image':
      return <Image className="w-3.5 h-3.5" />
    case 'audio':
      return <Mic className="w-3.5 h-3.5" />
    case 'video':
      return <Video className="w-3.5 h-3.5" />
    default:
      return null
  }
}

function getAppColor(appName: string): string {
  const colors: Record<string, string> = {
    'Whatsup': 'from-green-500 to-green-600',
    'Telegram': 'from-blue-400 to-blue-500',
    'Messages': 'from-blue-500 to-blue-600',
    'Slick': 'from-purple-500 to-purple-600',
    'GridwellChat': 'from-red-500 to-red-600',
    'SMS': 'from-gray-500 to-gray-600',
  }
  return colors[appName] || 'from-gray-400 to-gray-500'
}

export function NotificationCard({ notification, onReply, onView, onDelete, isUnread }: NotificationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showReply, setShowReply] = useState(false)

  const latestMessage = notification.message_notifications[notification.message_notifications.length - 1]
  const hasReply = notification.supported_actions.includes('reply')
  const appColor = getAppColor(notification.localized_app_name)

  const handleExpand = () => {
    if (!isExpanded) {
      // Mark as viewed when expanding (user is reading the notification)
      onView(notification.key)
    }
    setIsExpanded(!isExpanded)
  }

  const handleReply = async (message: string) => {
    await onReply(notification, message)
    setShowReply(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering expand
    onDelete(notification.key)
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[var(--border-color)] overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.01] animate-slideIn">
      {/* Card Header - Clickable to expand/collapse */}
      <div
        className="p-4 cursor-pointer hover:bg-[var(--bg-tertiary)]/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-start space-x-3">
          {/* App Icon */}
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${appColor} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-bold text-lg">
              {notification.localized_app_name[0]}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">
                  {notification.localized_app_name}
                </h3>
                {notification.message_count > 1 && (
                  <span className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium px-2 py-0.5 rounded-full">
                    {notification.message_count}
                  </span>
                )}
                {isUnread && (
                  <span className="w-2 h-2 bg-[var(--danger-color)] rounded-full" title="Unread"></span>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleDelete}
                  className="text-[var(--text-tertiary)] hover:text-[var(--danger-color)] transition-colors p-1"
                  aria-label="Delete notification"
                  title="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation() // Prevent double-triggering from parent div
                    handleExpand()
                  }}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  title={isExpanded ? 'Collapse' : 'View details'}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-sm font-medium text-[var(--text-primary)] mb-0.5">
              {notification.sender.name}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{notification.key}]</span>
              {notification.sender.type === 'group' && (
                <span className="text-[var(--text-tertiary)] text-xs ml-1">(group)</span>
              )}
            </p>

            {latestMessage && (
              <>
                <div className="flex items-start space-x-1.5">
                  {getContentIcon(latestMessage.content_type)}
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2 flex-1">
                    {latestMessage.content}
                  </p>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                  {formatTime(latestMessage.date, latestMessage.time_of_day)}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content with smooth slide animation */}
      <div
        className={`border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]/30 transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{
          transitionProperty: 'max-height, opacity, padding',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className={`transition-all duration-300 ${isExpanded ? 'p-4' : 'p-0'}`}>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              All Messages ({notification.message_count})
            </h4>
            {notification.message_notifications.map((msg, idx) => (
              <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-3 shadow-sm border border-[var(--border-color)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {msg.sender_name}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {formatTime(msg.date, msg.time_of_day)}
                  </span>
                </div>
                <div className="flex items-start space-x-1.5">
                  {getContentIcon(msg.content_type)}
                  <p className="text-sm text-[var(--text-secondary)]">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-3">
            {hasReply && (
              showReply ? (
                <ReplyPanel
                  onSend={handleReply}
                  onCancel={() => setShowReply(false)}
                />
              ) : (
                <button
                  onClick={() => setShowReply(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-[var(--accent-color)] text-white rounded-xl hover:bg-[var(--accent-hover)] transition-colors w-full justify-center font-medium text-sm shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Reply</span>
                </button>
              )
            )}
            {!hasReply && (
              <p className="text-sm text-[var(--text-tertiary)] italic text-center py-2">
                Reply not available for this notification
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
