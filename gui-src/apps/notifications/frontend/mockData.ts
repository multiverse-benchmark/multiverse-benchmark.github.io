import type { BundledNotification } from './types'

// Helper to format timestamps to match backend format
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` // YYYY-MM-DD format
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}` // HH:MM:SS format
}

// Mock notification data for development and testing
export const MOCK_NOTIFICATIONS: BundledNotification[] = [
  {
    key: 'mock-whatsup-1',
    app_package_name: 'com.whatsup',
    localized_app_name: 'Whatsup',
    sender: {
      type: 'user',
      name: 'John Smith'
    },
    sender_id: 'whatsup_john_smith',
    message_count: 2,
    message_notifications: [
      {
        sender_name: 'John Smith',
        content: 'Hey! Are we still meeting at 3pm today?',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 15),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 15)
      },
      {
        sender_name: 'John Smith',
        content: 'I have the documents ready',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 10),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 10)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-messages-1',
    app_package_name: 'com.apple.messages',
    localized_app_name: 'Messages',
    sender: {
      type: 'user',
      name: 'Sarah Johnson'
    },
    sender_id: 'messages_sarah_johnson',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Sarah Johnson',
        content: 'Thanks for your help yesterday!',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 30),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 30)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-telegram-1',
    app_package_name: 'org.telegram.messenger',
    localized_app_name: 'Telegram',
    sender: {
      type: 'group',
      name: 'Dev Team'
    },
    sender_id: 'telegram_dev_team',
    message_count: 3,
    message_notifications: [
      {
        sender_name: 'Team Updates',
        content: 'New deployment scheduled for tonight',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 45),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 45)
      },
      {
        sender_name: 'Team Updates',
        content: 'Please review the changes',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 40),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 40)
      },
      {
        sender_name: 'Team Updates',
        content: 'Link: https://deploy.example.com',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 35),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 35)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-whatsup-2',
    app_package_name: 'com.whatsup',
    localized_app_name: 'Whatsup',
    sender: {
      type: 'user',
      name: 'Mom'
    },
    sender_id: 'whatsup_mom',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Mom',
        content: 'Don\'t forget to call grandma on her birthday!',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 2),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 2)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-messages-2',
    app_package_name: 'com.apple.messages',
    localized_app_name: 'Messages',
    sender: {
      type: 'user',
      name: 'Alex Chen'
    },
    sender_id: 'messages_alex_chen',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Alex Chen',
        content: 'Are you free for lunch tomorrow?',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 3),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 3)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-slick-1',
    app_package_name: 'com.slick',
    localized_app_name: 'Slick',
    sender: {
      type: 'group',
      name: '#general'
    },
    sender_id: 'slick_general',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Project Bot',
        content: 'Daily standup in 10 minutes',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 4),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 4)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-whatsup-3',
    app_package_name: 'com.whatsup',
    localized_app_name: 'Whatsup',
    sender: {
      type: 'user',
      name: 'Emily Davis'
    },
    sender_id: 'whatsup_emily_davis',
    message_count: 2,
    message_notifications: [
      {
        sender_name: 'Emily Davis',
        content: 'Can you send me the presentation slides?',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 5),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 5)
      },
      {
        sender_name: 'Emily Davis',
        content: 'I need them for tomorrow\'s meeting',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 5 + 1000 * 30),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 5 + 1000 * 30)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-telegram-2',
    app_package_name: 'org.telegram.messenger',
    localized_app_name: 'Telegram',
    sender: {
      type: 'group',
      name: 'Monthly Readers'
    },
    sender_id: 'telegram_book_club',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Book Club',
        content: 'Next meeting: Friday 7pm',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 6),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 6)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  },
  {
    key: 'mock-messages-3',
    app_package_name: 'com.apple.messages',
    localized_app_name: 'Messages',
    sender: {
      type: 'user',
      name: 'Mike Wilson'
    },
    sender_id: 'messages_mike_wilson',
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'Mike Wilson',
        content: 'Great work on the project!',
        content_type: 'text',
        date: formatDate(Date.now() - 1000 * 60 * 60 * 8),
        time_of_day: formatTime(Date.now() - 1000 * 60 * 60 * 8)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  }
]

// Enable/disable mock data (useful for development)
export const USE_MOCK_DATA = false

// Initial viewed notifications (7 out of 9 are pre-viewed, leaving 2 unread)
export const INITIAL_VIEWED_NOTIFICATIONS = [
  'mock-whatsup-1',
  'mock-messages-1',
  'mock-telegram-1',
  'mock-whatsup-2',
  'mock-messages-2',
  'mock-slick-1',
  'mock-whatsup-3'
]

// Counter for generating unique keys for new messages
let newMessageCounter = 1

// Generate a new mock notification (for refresh functionality)
// Uses timestamp to ensure truly unique keys that won't conflict with viewed notifications
export function generateNewMockNotification(): BundledNotification {
  const now = Date.now()
  newMessageCounter++

  return {
    key: `mock-new-${now}-${newMessageCounter}`, // Use timestamp + counter for uniqueness
    app_package_name: 'com.whatsup',
    localized_app_name: 'Whatsup',
    sender: {
      type: 'user',
      name: 'New Contact'
    },
    sender_id: `whatsup_new_${now}`,
    message_count: 1,
    message_notifications: [
      {
        sender_name: 'New Contact',
        content: `New message ${newMessageCounter} - Just checking in!`,
        content_type: 'text',
        date: formatDate(now),
        time_of_day: formatTime(now)
      }
    ],
    supported_actions: ['reply', 'mark_as_read']
  }
}
