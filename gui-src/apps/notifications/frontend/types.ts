// Type definitions for Notifications App

export interface MessageSender {
  type: 'user' | 'group'
  name: string
}

export interface MessageNotification {
  sender_name: string
  content: string
  content_type: 'text' | 'image' | 'audio' | 'video'
  date: string
  time_of_day: string
}

export interface BundledNotification {
  key: string
  localized_app_name: string
  app_package_name: string
  sender: MessageSender
  message_count: number
  message_notifications: MessageNotification[]
  supported_actions: string[]
  sender_id: string
}

export interface NotificationsResponse {
  bundled_message_notifications: BundledNotification[]
  total_message_count: number
  status_code: string
  is_permission_denied: boolean
  action_card_content_passthrough?: string | null
  card_id?: string | null
  skip_reply_disclaimer?: boolean | null
}

export interface ReplyResponse {
  action_card_content_passthrough: string
  card_id?: string | null
  emitted_action_count: number
}
