import { EyeOff } from 'lucide-react'
import type { BundledNotification } from '../types'
import { NotificationCard } from './NotificationCard'

interface NotificationGroupProps {
  appName: string
  notifications: BundledNotification[]
  onReply: (bundle: BundledNotification, message: string) => Promise<void>
  onView: (notificationKey: string) => void
  onDelete: (notificationKey: string) => void
  onMarkUnread: (notificationKey: string) => void
  unreadKeys: Set<string>
  viewedNotifications: Set<string>
}

export function NotificationGroup({ appName, notifications, onReply, onView, onDelete, onMarkUnread, unreadKeys, viewedNotifications }: NotificationGroupProps) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4 px-1">
        {appName} <span className="text-[var(--text-tertiary)]">({notifications.length})</span>
      </h2>
      <div className="space-y-3">
        {notifications.map((notification) => {
          const isUnread = unreadKeys.has(notification.key) && !viewedNotifications.has(notification.key)
          return (
            <div key={notification.key} className="relative">
              <NotificationCard
                notification={notification}
                onReply={onReply}
                onView={onView}
                onDelete={onDelete}
                isUnread={isUnread}
              />
              {!isUnread && (
                <button
                  onClick={() => onMarkUnread(notification.key)}
                  className="absolute top-3 right-20 flex items-center space-x-1 px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors z-10"
                  title="Mark as unread"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Unread</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
