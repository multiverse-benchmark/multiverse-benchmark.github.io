import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Slick"

interface Channel {
  id: string
  name: string
  is_private: boolean
  topic?: string
  purpose?: string
  num_members?: number
}

interface UserProfile {
  display_name?: string
  real_name?: string
  image?: string
  image_48?: string
  image_72?: string
  status_text?: string
  status_emoji?: string
  phone?: string
  title?: string
}

interface User {
  id: string
  name: string
  real_name?: string
  profile?: UserProfile
}

interface Reaction {
  name: string
  count: number
  users: string[]
}

interface Reply {
  ts: string
  user: string
  text: string
  reactions?: Reaction[]
  thread_ts?: string | null
}

interface Message {
  ts: string
  user: string
  text: string
  thread_ts?: string
  reply_count?: number
  reply_users?: string[]
  replies?: Reply[]
  reactions?: Reaction[]
  is_starred?: boolean
  is_ephemeral?: boolean
  ephemeral_user?: string
}

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

interface AppProps {
  onClose: () => void
  setAdminHandler?: (handler: (() => void) | null) => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

// Common Slick emoji shortcodes to Unicode
const emojiMap: Record<string, string> = {
  // Hands & gestures
  '+1': '👍', 'thumbsup': '👍', '-1': '👎', 'thumbsdown': '👎',
  'raised_hands': '🙌', 'clap': '👏', 'wave': '👋', 'pray': '🙏',
  'muscle': '💪', 'ok_hand': '👌', 'point_up': '☝️', 'point_down': '👇',
  'point_left': '👈', 'point_right': '👉', 'raised_hand': '✋',
  'raising_hand': '🙋', 'hand': '✋', 'fist': '✊', 'v': '✌️',
  'crossed_fingers': '🤞', 'call_me_hand': '🤙', 'handshake': '🤝',

  // Faces & emotions
  'smile': '😄', 'laughing': '😆', 'blush': '😊', 'grinning': '😀',
  'joy': '😂', 'rofl': '🤣', 'relaxed': '☺️', 'wink': '😉',
  'heart_eyes': '😍', 'kissing_heart': '😘', 'yum': '😋',
  'stuck_out_tongue': '😛', 'stuck_out_tongue_winking_eye': '😜',
  'thinking_face': '🤔', 'thinking': '🤔', 'face_with_monocle': '🧐',
  'sunglasses': '😎', 'nerd_face': '🤓', 'confused': '😕',
  'cry': '😢', 'sob': '😭', 'angry': '😠', 'rage': '😡',
  'scream': '😱', 'fearful': '😨', 'cold_sweat': '😰',
  'sweat': '😓', 'weary': '😩', 'tired_face': '😫',
  'sleeping': '😴', 'mask': '😷', 'nauseated_face': '🤢',
  'smirk': '😏', 'unamused': '😒', 'rolling_eyes': '🙄',
  'grimacing': '😬', 'lying_face': '🤥', 'shushing_face': '🤫',
  'zipper_mouth_face': '🤐', 'face_with_raised_eyebrow': '🤨',
  'neutral_face': '😐', 'expressionless': '😑', 'no_mouth': '😶',
  'face_in_clouds': '😶‍🌫️', 'smiling_face_with_tear': '🥲',
  'partying_face': '🥳', 'hot_face': '🥵', 'cold_face': '🥶',
  'pleading_face': '🥺', 'face_holding_back_tears': '🥹',

  // Hearts & love
  'heart': '❤️', 'orange_heart': '🧡', 'yellow_heart': '💛',
  'green_heart': '💚', 'blue_heart': '💙', 'purple_heart': '💜',
  'black_heart': '🖤', 'white_heart': '🤍', 'brown_heart': '🤎',
  'broken_heart': '💔', 'sparkling_heart': '💖', 'heartbeat': '💓',
  'two_hearts': '💕', 'revolving_hearts': '💞', 'heartpulse': '💗',

  // Celebration & objects
  'fire': '🔥', 'tada': '🎉', 'confetti_ball': '🎊', 'balloon': '🎈',
  'rocket': '🚀', 'eyes': '👀', 'eye': '👁️',
  'star': '⭐', 'star2': '🌟', 'sparkles': '✨', 'dizzy': '💫',
  'boom': '💥', 'collision': '💥', 'zap': '⚡', 'snowflake': '❄️',
  'gift': '🎁', 'trophy': '🏆', 'medal': '🏅', 'crown': '👑',

  // Tech & office
  'phone': '📱', 'telephone': '📞', 'computer': '💻', 'desktop_computer': '🖥️',
  'keyboard': '⌨️', 'laptop': '💻', 'email': '📧', 'envelope': '✉️',
  'inbox_tray': '📥', 'outbox_tray': '📤', 'package': '📦',
  'clipboard': '📋', 'memo': '📝', 'pencil': '✏️', 'pen': '🖊️',
  'file_folder': '📁', 'open_file_folder': '📂', 'card_index': '📇',
  'calendar': '📅', 'date': '📅', 'spiral_calendar': '🗓️',
  'chart_with_upwards_trend': '📈', 'chart_with_downwards_trend': '📉',
  'bar_chart': '📊', 'link': '🔗', 'paperclip': '📎',
  'lock': '🔒', 'unlock': '🔓', 'key': '🔑', 'gear': '⚙️',
  'wrench': '🔧', 'hammer': '🔨', 'tools': '🛠️',

  // Status & symbols
  'white_check_mark': '✅', 'check': '✅', 'heavy_check_mark': '✔️',
  'x': '❌', 'negative_squared_cross_mark': '❎',
  'warning': '⚠️', 'no_entry': '⛔', 'stop_sign': '🛑',
  'question': '❓', 'grey_question': '❔',
  'exclamation': '❗', 'grey_exclamation': '❕',
  'bulb': '💡', 'mag': '🔍', 'mag_right': '🔎',

  // Food & drink
  'coffee': '☕', 'tea': '🍵', 'pizza': '🍕', 'hamburger': '🍔',
  'fries': '🍟', 'hotdog': '🌭', 'taco': '🌮', 'burrito': '🌯',
  'beer': '🍺', 'beers': '🍻', 'wine_glass': '🍷', 'cocktail': '🍸',
  'cake': '🍰', 'birthday': '🎂', 'cookie': '🍪', 'doughnut': '🍩',
  'ice_cream': '🍨', 'apple': '🍎', 'banana': '🍌', 'avocado': '🥑',

  // Animals
  'dog': '🐕', 'dog2': '🐶', 'cat': '🐱', 'cat2': '🐈',
  'monkey': '🐒', 'monkey_face': '🐵', 'unicorn': '🦄',
  'bear': '🐻', 'panda_face': '🐼', 'pig': '🐷', 'cow': '🐮',
  'chicken': '🐔', 'penguin': '🐧', 'bird': '🐦', 'eagle': '🦅',
  'wolf': '🐺', 'fox_face': '🦊', 'lion': '🦁', 'tiger': '🐯',
  'horse': '🐴', 'bee': '🐝', 'bug': '🐛', 'butterfly': '🦋',
  'snail': '🐌', 'octopus': '🐙', 'fish': '🐟', 'whale': '🐳',
  'shark': '🦈', 'crab': '🦀', 'turtle': '🐢', 'snake': '🐍',

  // Nature & weather
  'sun': '☀️', 'sunny': '☀️', 'moon': '🌙', 'full_moon': '🌕',
  'cloud': '☁️', 'rain_cloud': '🌧️', 'thunder_cloud_and_rain': '⛈️',
  'rainbow': '🌈', 'umbrella': '☂️', 'snowman': '⛄',
  'herb': '🌿', 'four_leaf_clover': '🍀', 'maple_leaf': '🍁',
  'fallen_leaf': '🍂', 'leaves': '🍃', 'mushroom': '🍄',
  'palm_tree': '🌴', 'cactus': '🌵', 'christmas_tree': '🎄',
  'seedling': '🌱', 'blossom': '🌼', 'rose': '🌹', 'tulip': '🌷',
  'sunflower': '🌻', 'cherry_blossom': '🌸', 'hibiscus': '🌺',
  'earth_americas': '🌎', 'earth_africa': '🌍', 'earth_asia': '🌏',
  'mountain': '⛰️', 'volcano': '🌋', 'ocean': '🌊',

  // Misc
  '100': '💯', 'zzz': '💤', 'speech_balloon': '💬', 'thought_balloon': '💭',
  'heavy_plus_sign': '➕', 'heavy_minus_sign': '➖', 'heavy_division_sign': '➗',
  'heavy_multiplication_x': '✖️',
  'red_circle': '🔴', 'orange_circle': '🟠', 'yellow_circle': '🟡',
  'green_circle': '🟢', 'large_blue_circle': '🔵', 'purple_circle': '🟣',
  'white_circle': '⚪', 'black_circle': '⚫', 'brown_circle': '🟤',
  'red_square': '🟥', 'orange_square': '🟧', 'yellow_square': '🟨',
  'green_square': '🟩', 'blue_square': '🟦', 'purple_square': '🟪',
  'white_large_square': '⬜', 'black_large_square': '⬛',
  'arrow_up': '⬆️', 'arrow_down': '⬇️', 'arrow_left': '⬅️', 'arrow_right': '➡️',
  'arrow_upper_right': '↗️', 'arrow_lower_right': '↘️',
  'arrow_lower_left': '↙️', 'arrow_upper_left': '↖️',
  'arrows_counterclockwise': '🔄', 'rewind': '⏪', 'fast_forward': '⏩',
  'information_source': 'ℹ️', 'abc': '🔤', 'abcd': '🔡',
  'capital_abcd': '🔠', '1234': '🔢', 'symbols': '🔣',
  'a': '🅰️', 'b': '🅱️', 'o2': '🅾️', 'parking': '🅿️',
  'new': '🆕', 'free': '🆓', 'up': '🆙', 'cool': '🆒', 'ok': '🆗',
  'ng': '🆖', 'sos': '🆘', 'id': '🆔', 'vs': '🆚',
}

const getEmoji = (name: string): string => {
  // Remove colons if present
  const cleanName = name.replace(/:/g, '')
  return emojiMap[cleanName] || `:${cleanName}:`
}

interface DmConversation {
  id: string
  name: string
  userId: string  // The other user's ID
}

interface SearchResult {
  ts: string
  text: string
  user: string
  channel: {
    id: string
    name: string
  }
}

interface Reminder {
  id: string
  text: string
  user: string
  time: number
  complete_ts?: number
  recurring?: boolean
  channel?: string
}

interface UserGroup {
  id: string
  name: string
  handle: string
  description: string
  users: string[]
  user_count?: string
  disabled?: boolean
  date_create?: number
  date_update?: number
  created_by?: string
}

interface ScheduledMessage {
  id: string
  channel_id: string
  post_at: number
  text: string
  date_created?: number
}

interface FileResult {
  id: string
  name: string
  title?: string
  filetype?: string
  user?: string
  created?: string
  size?: number
  channels?: string[]
}

// Custom tooltip component with short delay and nice styling
function Tooltip({ children, content }: { children: React.ReactNode, content: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShow(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setShow(false)
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-[9999] px-2.5 py-1.5 text-xs bg-[#1a1d21] text-white rounded-md shadow-lg border border-[#3a3d41] whitespace-nowrap pointer-events-none">
          {content}
          <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-[#1a1d21]" />
        </div>
      )}
    </div>
  )
}

export default function SlickApp({ setRefreshHandler }: AppProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [dmConversations, setDmConversations] = useState<DmConversation[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [selectedDmUser, setSelectedDmUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [channelMembers, setChannelMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [showMembersList, setShowMembersList] = useState(false)
  const [selectedThread, setSelectedThread] = useState<Message | null>(null)
  const [threadMessages, setThreadMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadInput, setThreadInput] = useState('')
  const [emojiPickerMessageTs, setEmojiPickerMessageTs] = useState<string | null>(null)
  const [showToolbarEmojiPicker, setShowToolbarEmojiPicker] = useState(false)
  const [editingMessageTs, setEditingMessageTs] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  // Create Channel Modal state
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDescription, setNewChannelDescription] = useState('')
  const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(false)
  const [createChannelLoading, setCreateChannelLoading] = useState(false)
  const [createChannelError, setCreateChannelError] = useState<string | null>(null)
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  // Leave channel state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)
  // Browse channels state
  const [showBrowseChannels, setShowBrowseChannels] = useState(false)
  const [browseChannels, setBrowseChannels] = useState<Channel[]>([])
  const [browseChannelsLoading, setBrowseChannelsLoading] = useState(false)
  const [joiningChannel, setJoiningChannel] = useState<string | null>(null)
  // DM user picker state
  const [showDmPicker, setShowDmPicker] = useState(false)
  const [dmPickerSearch, setDmPickerSearch] = useState('')
  const [openingDm, setOpeningDm] = useState(false)
  // Edit topic state
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicInput, setTopicInput] = useState('')
  const [topicSaving, setTopicSaving] = useState(false)
  // User presence state (simulated for now - can be hooked to real API later)
  const [userPresence, setUserPresence] = useState<Record<string, 'active' | 'away' | 'offline'>>({})

  // Sidebar section state
  const [activeSidebarSection, setActiveSidebarSection] = useState<'channels' | 'reminders' | 'usergroups' | 'scheduled' | 'files' | 'settings' | 'admin' | 'people'>('channels')

  // Reminders state
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [newReminderText, setNewReminderText] = useState('')
  const [newReminderTime, setNewReminderTime] = useState('')
  const [reminderLoading, setReminderLoading] = useState(false)

  // User Groups state
  const [userGroups, setUserGroups] = useState<UserGroup[]>([])
  const [showAddUserGroup, setShowAddUserGroup] = useState(false)
  const [showEditUserGroup, setShowEditUserGroup] = useState<UserGroup | null>(null)
  const [showManageMembers, setShowManageMembers] = useState<UserGroup | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupHandle, setNewGroupHandle] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])
  const [userGroupLoading, setUserGroupLoading] = useState(false)

  // Scheduled Messages state
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([])
  const [showScheduleMessage, setShowScheduleMessage] = useState(false)
  const [scheduleChannel, setScheduleChannel] = useState('')
  const [scheduleText, setScheduleText] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // File Search state
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileResults, setFileResults] = useState<FileResult[]>([])
  const [fileSearchLoading, setFileSearchLoading] = useState(false)

  // File Management state
  const [files, setFiles] = useState<FileResult[]>([])
  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showRemoteFileDialog, setShowRemoteFileDialog] = useState(false)
  const [showExternalUploadDialog, setShowExternalUploadDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState<string | null>(null)
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState<string | null>(null)
  const [fileFilters, setFileFilters] = useState<{ channel_id?: string; user_id?: string; types?: string }>({})
  const [filesPagination, setFilesPagination] = useState<{ cursor?: string; hasMore: boolean }>({ hasMore: false })
  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadContent, setUploadContent] = useState('')
  const [uploadFilename, setUploadFilename] = useState('')
  const [uploadFiletype, setUploadFiletype] = useState('')
  const [uploadChannels, setUploadChannels] = useState('')
  const [uploadComment, setUploadComment] = useState('')
  // Remote file form state
  const [remoteExternalId, setRemoteExternalId] = useState('')
  const [remoteExternalUrl, setRemoteExternalUrl] = useState('')
  const [remoteTitle, setRemoteTitle] = useState('')
  const [remoteFiletype, setRemoteFiletype] = useState('')
  const [remoteIndexContent, setRemoteIndexContent] = useState('')
  // External upload form state
  const [extUploadFilename, setExtUploadFilename] = useState('')
  const [extUploadLength, setExtUploadLength] = useState('')
  const [extUploadAltTxt, setExtUploadAltTxt] = useState('')
  const [extUploadSnippetType, setExtUploadSnippetType] = useState('')
  const [extUploadUrl, setExtUploadUrl] = useState<string | null>(null)
  const [extUploadFileId, setExtUploadFileId] = useState<string | null>(null)
  const [extUploadChannel, setExtUploadChannel] = useState('')
  const [extUploadComment, setExtUploadComment] = useState('')
  // Share dialog state
  const [shareChannelIds, setShareChannelIds] = useState('')
  // File detail state
  const [fileDetailLoading, setFileDetailLoading] = useState(false)

  // User Settings state
  const [userProfileEdit, setUserProfileEdit] = useState<{
    display_name?: string
    real_name?: string
    status_text?: string
    status_emoji?: string
    phone?: string
    title?: string
  }>({})
  const [userSettingsLoading, setUserSettingsLoading] = useState(false)
  const [currentPresence, setCurrentPresence] = useState<'active' | 'away'>('active')
  const [userSettingsMessage, setUserSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null)
  const [photoInputKey, setPhotoInputKey] = useState(0)

  // Channel Management state
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedInviteUsers, setSelectedInviteUsers] = useState<string[]>([])
  const [channelSettingsLoading, setChannelSettingsLoading] = useState(false)
  const [showRenameChannel, setShowRenameChannel] = useState(false)
  const [newChannelNameInput, setNewChannelNameInput] = useState('')
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showKickModal, setShowKickModal] = useState(false)
  const [selectedKickUser, setSelectedKickUser] = useState<string | null>(null)
  const [purposeInput, setPurposeInput] = useState('')
  const [editingPurpose, setEditingPurpose] = useState(false)

  // Read cursor / unread tracking state
  const [readCursors, setReadCursors] = useState<Record<string, string>>({}) // channelId -> last read ts
  const [channelLatestTs, setChannelLatestTs] = useState<Record<string, string>>({}) // channelId -> latest msg ts

  // Admin state
  const [showAdminInvite, setShowAdminInvite] = useState(false)
  const [adminInviteEmail, setAdminInviteEmail] = useState('')
  const [adminInviteName, setAdminInviteName] = useState('')
  const [adminInviteLoading, setAdminInviteLoading] = useState(false)

  // People directory state
  const [peopleList, setPeopleList] = useState<any[]>([])
  const [peopleCursor, setPeopleCursor] = useState<string | undefined>(undefined)
  const [peopleHasMore, setPeopleHasMore] = useState(false)
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [peopleEmailSearch, setPeopleEmailSearch] = useState('')
  const [peopleEmailSearchResult, setPeopleEmailSearchResult] = useState<any | null>(null)
  const [peopleEmailSearchError, setPeopleEmailSearchError] = useState<string | null>(null)

  // User profile modal state
  const [profileModalUser, setProfileModalUser] = useState<any | null>(null)
  const [profileModalLoading, setProfileModalLoading] = useState(false)

  // User identity state
  const [userIdentity, setUserIdentity] = useState<{ user_name?: string; team_name?: string; team_id?: string } | null>(null)

  // Reaction detail state (get_message_reactions)
  const [reactionDetailPopup, setReactionDetailPopup] = useState<{ channel: string; ts: string; reactions: any[] } | null>(null)
  const [reactionDetailLoading, setReactionDetailLoading] = useState(false)

  // User reactions state (list_user_reactions)
  const [userReactions, setUserReactions] = useState<any[]>([])
  const [showUserReactions, setShowUserReactions] = useState(false)
  const [userReactionsLoading, setUserReactionsLoading] = useState(false)

  // Unified search state (search_all_content)
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState('')
  const [unifiedSearchResults, setUnifiedSearchResults] = useState<{ messages: any[]; files: any[] }>({ messages: [], files: [] })
  const [unifiedSearchLoading, setUnifiedSearchLoading] = useState(false)
  const [showUnifiedSearch, setShowUnifiedSearch] = useState(false)

  // User group members state (list_user_group_members)
  const [groupMembersList, setGroupMembersList] = useState<any[]>([])
  const [showGroupMembers, setShowGroupMembers] = useState<string | null>(null)
  const [groupMembersLoading, setGroupMembersLoading] = useState(false)

  // Reminder detail state (get_reminder_info)
  const [reminderDetail, setReminderDetail] = useState<any>(null)
  const [reminderDetailLoading, setReminderDetailLoading] = useState(false)

  // Ephemeral message state (post_ephemeral_message)
  const [showEphemeralDialog, setShowEphemeralDialog] = useState(false)
  const [ephemeralUser, setEphemeralUser] = useState('')
  const [ephemeralText, setEphemeralText] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const membersListRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const toolbarEmojiPickerRef = useRef<HTMLDivElement>(null)
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null)
  const topicSaveInProgressRef = useRef(false)
  const loadInitialDataRef = useRef<() => void>(() => {})
  const channelSettingsRef = useRef<HTMLDivElement>(null)

  const api = useBackendAPI('slick')

  // Rebuild user map from backend state - called during refresh
  // Shared helper: normalise a raw profile so image_72/48 fall back to image
  // Also ensures base64 image data gets a proper data URI prefix for display
  const normalizeImageValue = (img: unknown): string | undefined => {
    if (!img || typeof img !== 'string') return undefined
    // Already a data URL or http URL - use as-is
    if (img.startsWith('data:') || img.startsWith('http')) return img
    // Raw base64 - wrap in data URI
    if (img.length > 100) return `data:image/png;base64,${img}`
    return img
  }
  const buildProfileWithImage = (rawProfile: Record<string, unknown>): UserProfile => {
    const image = normalizeImageValue(rawProfile.image_72 || rawProfile.image)
    return {
      ...rawProfile,
      image: image,
      image_72: image,
      image_48: normalizeImageValue(rawProfile.image_48) || image,
    } as UserProfile
  }

  const rebuildUserMap = useCallback(async () => {
    console.log('[SlickApp] rebuildUserMap called')
    try {
      const stateResponse = await fetch('./api/services/slick/state').then(r => r.json())
      const usersFromState = stateResponse?.state?.users || {}
      const userEntries = Object.entries(usersFromState)
      console.log('[SlickApp] rebuildUserMap found', userEntries.length, 'users in state')
      if (userEntries.length > 0) {
        setUsers(prev => {
          const userMap: Record<string, User> = {}
          userEntries.forEach(([userId, userData]: [string, unknown]) => {
            const data = userData as Record<string, unknown>
            const rawProfile = (data.profile || {}) as Record<string, unknown>
            const newProfile = buildProfileWithImage(rawProfile)
            // Preserve locally-set profile photos (e.g. from upload) if backend doesn't have them
            const existingProfile = prev[userId]?.profile
            if (existingProfile?.image && existingProfile.image.startsWith('data:') && !newProfile.image?.startsWith('data:')) {
              newProfile.image = existingProfile.image
              newProfile.image_72 = existingProfile.image_72 || existingProfile.image
              newProfile.image_48 = existingProfile.image_48 || existingProfile.image
            }
            userMap[userId] = {
              id: userId,
              name: (data.name as string) || userId,
              real_name: data.real_name as string | undefined,
              profile: newProfile,
            }
          })
          console.log('[SlickApp] rebuildUserMap setting', Object.keys(userMap).length, 'users')
          return userMap
        })
      } else {
        console.log('[SlickApp] rebuildUserMap: no users found, keeping existing')
      }
    } catch (e) {
      console.warn('[SlickApp] rebuildUserMap error:', e)
    }
  }, [])

  // Stable callback for refreshing the app - used by admin panel
  const refreshApp = useCallback(async () => {
    console.log('[SlickApp] refreshApp called')
    // Always rebuild user map first to ensure it's up to date
    await rebuildUserMap()
    // Then run the full reload and WAIT for it to complete
    await loadInitialDataRef.current()
    console.log('[SlickApp] refreshApp completed')
  }, [rebuildUserMap])


  // Register refresh handler to reload data from database
  // This is used by the admin panel to refresh the app after state changes
  // Use a ref to avoid re-render loop: setRefreshHandler may be a React state setter,
  // so passing a bare function would be interpreted as a functional update.
  const refreshAppRef = useRef(refreshApp)
  refreshAppRef.current = refreshApp
  useEffect(() => {
    if (setRefreshHandler) {
      // Double-arrow to pass a function VALUE, not a functional update
      const handler = () => { refreshAppRef.current() }
      setRefreshHandler(handler)
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the ref always up to date with the latest loadInitialData
  useEffect(() => {
    loadInitialDataRef.current = loadInitialData
  })

  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [])

  // Scroll to bottom when messages change (but not for reaction updates)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  useEffect(() => {
    if (shouldScrollToBottom) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    }
  }, [messages, shouldScrollToBottom])

  // Scroll to bottom when thread messages change
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages])

  // Auto-reload files when filters change
  useEffect(() => {
    if (activeSidebarSection === 'files') {
      loadFiles()
    }
  }, [activeSidebarSection, fileFilters.channel_id, fileFilters.user_id, fileFilters.types])

  // Close members list and emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (membersListRef.current && !membersListRef.current.contains(e.target as Node)) {
        setShowMembersList(false)
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerMessageTs(null)
      }
      if (toolbarEmojiPickerRef.current && !toolbarEmojiPickerRef.current.contains(e.target as Node)) {
        setShowToolbarEmojiPicker(false)
      }
      if (channelSettingsRef.current && !channelSettingsRef.current.contains(e.target as Node)) {
        setShowChannelSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadInitialData = async () => {
    setLoading(true)
    setError(null)
    try {
      // First, get the essential data (channels, current user, DMs)
      const [channelsResult, currentUserResult, dmConversationsResult] = await Promise.all([
        api.callTool('list_user_conversations', { types: 'public_channel,private_channel', exclude_archived: true }),
        api.callTool('get_current_user_id', {}),
        api.callTool('list_user_conversations', { types: 'im', exclude_archived: true }),
      ])

      const rawChannels = channelsResult?.channels || []
      // Extract topic/purpose from nested conversations object if not at top level
      const channelList: Channel[] = rawChannels.map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private ?? false,
        topic: ch.topic || ch.conversations?.topic || undefined,
        purpose: ch.purpose || ch.conversations?.purpose || undefined,
        num_members: ch.num_members,
      }))
      setChannels(channelList)

      // Get current user ID
      const currUserId = currentUserResult?.user_id
      setCurrentUserId(currUserId)

      // Get users from state endpoint (doesn't require admin privileges)
      // Only update the user map if we successfully get user data
      // Keep a local reference for use in DM processing below
      let localUserMap: Record<string, User> = {}
      try {
        const stateResponse = await fetch('./api/services/slick/state').then(r => r.json())
        const usersFromState = stateResponse?.state?.users || {}
        const userEntries = Object.entries(usersFromState)
        // Only update if we have users - prevents clearing on error/empty response
        if (userEntries.length > 0) {
          userEntries.forEach(([userId, userData]: [string, any]) => {
            const rawProfile = userData.profile || {}
            localUserMap[userId] = {
              id: userId,
              name: userData.name || userId,
              real_name: userData.real_name,
              profile: buildProfileWithImage(rawProfile),
            }
          })
          console.log('[SlickApp] loadInitialData setting users:', Object.keys(localUserMap).length, 'users')
          setUsers(localUserMap)
        } else {
          console.log('[SlickApp] loadInitialData: no users in state, keeping existing user map')
        }
      } catch (e) {
        console.warn('Could not load users from state:', e)
        // Keep existing user map on error
      }

      // Process DM conversations to extract the other participant
      const dmChannels = dmConversationsResult?.channels || []
      const dms: DmConversation[] = []
      for (const dm of dmChannels) {
        if (dm.is_im) {
          // For DMs, we need to find who the other person is
          // Try to get members for this DM channel
          try {
            const membersResult = await api.callTool('get_conversation_members', {
              channel: dm.id,
            })
            const members = membersResult?.members || []
            // Find the other user (not the current user), or self for self-DMs
            const otherUserId = members.length === 1 ? members[0] : (members.find((id: string) => id !== currUserId) || members[0])
            if (otherUserId) {
              const isSelf = otherUserId === currUserId
              const otherUser = localUserMap[otherUserId]
              const baseName = otherUser?.profile?.display_name || otherUser?.real_name || otherUser?.name || otherUserId
              dms.push({
                id: dm.id,
                name: isSelf ? `${baseName} (you)` : baseName,
                userId: otherUserId,
              })
            }
          } catch (e) {
            // If we can't get members, use the channel name or ID
            dms.push({
              id: dm.id,
              name: dm.name || dm.id,
              userId: dm.id,
            })
          }
        }
      }
      setDmConversations(dms)

      // Check if the currently selected channel still exists in the new data
      // If not, reset the selection to avoid errors
      if (selectedChannel) {
        const channelStillExists = channelList.some(c => c.id === selectedChannel.id)
        if (channelStillExists) {
          await loadMessages(selectedChannel.id)
          // Also refresh thread if open - but verify the thread still exists
          if (selectedThread) {
            try {
              await refreshThread(selectedThread.ts, selectedChannel.id)
            } catch {
              // Thread no longer exists, close it
              setSelectedThread(null)
              setThreadMessages([])
            }
          }
        } else {
          // Channel no longer exists - reset selection
          console.log('[SlickApp] Selected channel no longer exists, resetting')
          setSelectedChannel(null)
          setSelectedThread(null)
          setThreadMessages([])
          setMessages([])
          // Select first available channel if any
          if (channelList.length > 0) {
            setSelectedChannel(channelList[0])
            await loadMessages(channelList[0].id)
          }
        }
      } else if (channelList.length > 0) {
        setSelectedChannel(channelList[0])
        await loadMessages(channelList[0].id)
      }

      // Load read cursors for unread indicators
      await loadReadCursors()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Helper to refresh thread without changing loading state
  const refreshThread = async (threadTs: string, channelId: string) => {
    try {
      // Use get_conversation_replies API
      const repliesResult = await api.callTool('get_conversation_replies', {
        channel: channelId,
        ts: threadTs,
        limit: 1000,
        include_all_metadata: true,
      }) as { ok?: boolean; messages?: Message[]; has_more?: boolean }

      const threadMsgs: Message[] = repliesResult?.messages || []
      if (threadMsgs.length > 0) {
        setThreadMessages(threadMsgs)
        setSelectedThread(threadMsgs[0])
      }
    } catch (err) {
      console.error('Failed to refresh thread:', err)
    }
  }

  // Fetch slick state, returning the state object or null on failure
  const fetchSlickState = async (): Promise<any> => {
    try {
      const resp = await fetch('./api/services/slick/state').then(r => r.json())
      return resp?.state ?? null
    } catch {
      return null
    }
  }

  // Helper: resolve channel members from pre-fetched state and message authors
  const resolveChannelMembersFromState = (channelId: string, msgs: Message[], stateData?: any): string[] => {
    const stateMembers = stateData?.channels?.[channelId]?.conversations?.members || []
    const msgAuthors = msgs.map((m: Message) => m.user).filter((u): u is string => Boolean(u))
    const combined = [...new Set([...stateMembers, ...msgAuthors])]
    if (combined.length > 0) return combined
    if (currentUserId) return [currentUserId]
    return []
  }

  // Returns the latest message ts for the channel (useful for marking read)
  const loadMessages = async (channelId: string): Promise<string | undefined> => {
    setMessagesLoading(true)
    setChannelMembers([])
    let msgs: Message[] = []
    let latestMsgTs: string | undefined
    // Single state fetch shared by ephemeral loading and member resolution
    let stateData: any = await fetchSlickState()
    try {
      try {
        // Use get_conversation_history API for paginated message loading
        const historyResult = await api.callTool('get_conversation_history', {
          channel: channelId,
          limit: 100,
        }) as { ok?: boolean; messages?: Message[]; has_more?: boolean }

        msgs = historyResult?.messages || []

        // Merge ephemeral messages from state into channel messages
        if (stateData) {
          const ephemeralMsgs = stateData.ephemeral_messages || []
          const nowTs = (Date.now() / 1000).toFixed(6)
          const channelEphemerals: Message[] = ephemeralMsgs
            .filter((em: any) => em.channel === channelId)
            .map((em: any, idx: number) => ({
              ts: em.ts || `${(parseFloat(nowTs) + idx * 0.000001).toFixed(6)}`,
              user: em.user || currentUserId || '',
              text: em.text || '',
              is_ephemeral: true,
              ephemeral_user: em.user,
            }))
          if (channelEphemerals.length > 0) {
            // Deduplicate by ts before merging
            const existingTs = new Set(msgs.map(m => m.ts))
            const newEphemerals = channelEphemerals.filter(e => !existingTs.has(e.ts))
            msgs = [...msgs, ...newEphemerals]
            msgs.sort((a, b) => (parseFloat(b.ts) || 0) - (parseFloat(a.ts) || 0))
          }
        }

        // Messages from history API are newest-first, reverse for chronological display
        setMessages([...msgs].reverse())

        // Track latest message ts for unread indicators
        if (msgs.length > 0) {
          latestMsgTs = msgs[0]?.ts // newest message (first in API response)
          if (latestMsgTs) {
            setChannelLatestTs(prev => ({ ...prev, [channelId]: latestMsgTs! }))
          }
        }
      } catch (err) {
        console.error('Failed to load messages via history API:', err)
      }

      // Load members: merge API members with state members and message authors
      let memberIds: string[] = []
      try {
        const membersResult = await api.callTool('get_conversation_members', {
          channel: channelId,
        })
        memberIds = membersResult?.members || []
      } catch (memberErr) {
        console.warn('Failed to load channel members via API:', memberErr)
      }
      // Augment with state members and message authors for completeness
      const stateMemberIds = resolveChannelMembersFromState(channelId, msgs, stateData)
      memberIds = [...new Set([...memberIds, ...stateMemberIds])]
      setChannelMembers(memberIds)
      // Fetch presence for members (non-blocking)
      if (memberIds.length > 0) {
        fetchPresenceForUsers(memberIds)
      }
    } finally {
      setMessagesLoading(false)
    }
    return latestMsgTs
  }

  // Fetch presence status for a list of users from the API
  const fetchPresenceForUsers = async (userIds: string[]) => {
    // Only fetch for users we don't already have presence data for
    const unknownIds = userIds.filter(id => !userPresence[id])
    if (unknownIds.length === 0) return

    const presenceUpdates: Record<string, 'active' | 'away' | 'offline'> = {}
    // Fetch in parallel but limit to first 30 to avoid excessive API calls
    const idsToFetch = unknownIds.slice(0, 30)
    await Promise.allSettled(
      idsToFetch.map(async (userId) => {
        try {
          const result = await api.callTool('get_user_presence', { user_id: userId })
          if (result?.presence) {
            presenceUpdates[userId] = result.presence === 'active' ? 'active' : result.presence === 'away' ? 'away' : 'offline'
          }
        } catch {
          // Silently ignore individual presence fetch failures
        }
      })
    )
    if (Object.keys(presenceUpdates).length > 0) {
      setUserPresence(prev => ({ ...prev, ...presenceUpdates }))
    }
  }

  // Mark a channel as read by calling mark_conversation_read API
  const markChannelRead = async (channelId: string, latestTs?: string) => {
    const ts = latestTs || channelLatestTs[channelId]
    if (!ts) return
    try {
      await api.callTool('mark_conversation_read', {
        channel: channelId,
        ts: ts,
      })
    } catch {
      // API may fail - silently fall through to client-side tracking
    }
    // Always update local read cursor as fallback
    setReadCursors(prev => ({ ...prev, [channelId]: ts }))
  }

  // Load read cursors from state for unread indicators
  const loadReadCursors = async () => {
    try {
      const stateResponse = await fetch('./api/services/slick/state').then(r => r.json())
      const channelsData = stateResponse?.state?.channels || {}
      const cursors: Record<string, string> = {}
      const latestTs: Record<string, string> = {}

      for (const [channelId, channelData] of Object.entries(channelsData) as [string, any][]) {
        // Get read cursor for current user - sanitize to handle strings/floats/integers
        const rawCursor = channelData?.conversations?.read_cursors?.[currentUserId || '']
        if (rawCursor != null) {
          const numVal = Number(rawCursor)
          if (!isNaN(numVal)) {
            cursors[channelId] = String(Math.floor(numVal))
          }
        }
        // Get latest message ts
        const msgs = channelData?.messages || []
        if (msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.ts) {
            latestTs[channelId] = lastMsg.ts
          }
        }
      }

      setReadCursors(cursors)
      setChannelLatestTs(latestTs)
    } catch (err) {
      console.warn('Failed to load read cursors:', err)
    }
  }

  const selectChannel = async (channel: Channel) => {
    // Reset any editing states from previous channel
    setEditingTopic(false)
    setTopicInput('')
    setEditingPurpose(false)
    setPurposeInput('')
    setShowChannelSettings(false)

    // Switch back to channels view when selecting a channel
    setActiveSidebarSection('channels')

    setSelectedChannel(channel)
    setSelectedDmUser(null)
    const latestTs = await loadMessages(channel.id)
    await markAsRead(channel.id, latestTs)
  }

  // Shared helper: update read cursor and mark channel/DM as read
  const markAsRead = async (conversationId: string, latestTs?: string) => {
    if (latestTs) {
      setReadCursors(prev => prev[conversationId] === latestTs ? prev : { ...prev, [conversationId]: latestTs })
      await markChannelRead(conversationId, latestTs)
    } else {
      await markChannelRead(conversationId)
    }
  }

  const selectDmConversation = async (dm: DmConversation) => {
    setMessagesLoading(true)
    // Switch back to channels view when selecting a DM
    setActiveSidebarSection('channels')

    const user = users[dm.userId]
    setSelectedDmUser(user || { id: dm.userId, name: dm.name })
    setSelectedChannel({
      id: dm.id,
      name: dm.name,
      is_private: true,
    })
    const latestTs = await loadMessages(dm.id)
    await markAsRead(dm.id, latestTs)
  }

  // Shared helper: reload messages and scroll to bottom after sending
  const reloadAndScrollToBottom = async (channelId: string) => {
    setShouldScrollToBottom(true)
    await loadMessages(channelId)
    // Use multiple attempts to ensure scroll after DOM update
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    })
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedChannel) return

    // Handle /me command
    if (messageInput.trim().startsWith('/me ')) {
      await sendMeMessage()
      return
    }

    try {
      await api.callTool('post_chat_message', {
        channel: selectedChannel.id,
        text: messageInput,
      })
      setMessageInput('')
      await reloadAndScrollToBottom(selectedChannel.id)
      // Mark as read after sending
      await markChannelRead(selectedChannel.id)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const openThread = async (message: Message) => {
    setSelectedThread(message)
    setThreadLoading(true)
    setThreadMessages([])
    try {
      if (!selectedChannel) return
      // Use get_conversation_replies API for thread loading
      // Use the thread_ts if available (for reply messages), otherwise use ts (for parent messages)
      const threadTs = message.thread_ts || message.ts
      const repliesResult = await api.callTool('get_conversation_replies', {
        channel: selectedChannel.id,
        ts: threadTs,
        limit: 1000,
        include_all_metadata: true,
      }) as { ok?: boolean; messages?: Message[]; has_more?: boolean }

      const threadMsgs: Message[] = repliesResult?.messages || []
      setThreadMessages(threadMsgs)
      // Update selected thread with latest data from API (first message is parent)
      if (threadMsgs.length > 0) {
        setSelectedThread(threadMsgs[0])
      }
    } catch (err) {
      console.error('Failed to load thread:', err)
    } finally {
      setThreadLoading(false)
    }
  }

  const closeThread = () => {
    setSelectedThread(null)
    setThreadMessages([])
    setThreadInput('')
  }

  const sendThreadReply = async () => {
    if (!threadInput.trim() || !selectedChannel || !selectedThread) return

    try {
      await api.callTool('post_chat_message', {
        channel: selectedChannel.id,
        text: threadInput,
        thread_ts: selectedThread.ts,
      })
      setThreadInput('')
      // Reload thread messages
      await openThread(selectedThread)
      // Also reload main channel to update reply count
      await loadMessages(selectedChannel.id)
    } catch (err) {
      console.error('Failed to send thread reply:', err)
    }
  }

  const handleThreadKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendThreadReply()
    }
  }

  const toggleReaction = async (channelId: string, messageTs: string, reactionName: string, hasReacted: boolean) => {
    // Save scroll position
    const scrollPos = messagesContainerRef.current?.scrollTop ?? 0

    try {
      if (hasReacted) {
        const result = await api.callTool('remove_reaction_from_message', {
          channel_id: channelId,
          message_ts: messageTs,
          name: reactionName,
          user_id: currentUserId,
        })
        if (!result?.ok) {
          const errorMsg = result?.error || 'Unknown error'
          alert(`Cannot remove reaction: ${errorMsg}`)
          return
        }
      } else {
        const result = await api.callTool('add_reaction_to_message', {
          channel_id: channelId,
          message_ts: messageTs,
          name: reactionName,
        })
        if (!result?.ok) {
          const errorMsg = result?.error || 'Unknown error'
          alert(`Cannot add reaction: ${errorMsg}`)
          return
        }
      }
      // Reload messages without scrolling to bottom
      setShouldScrollToBottom(false)
      await loadMessages(channelId)
      // Restore scroll position
      requestAnimationFrame(() => {
        messagesContainerRef.current?.scrollTo(0, scrollPos)
      })
      setShouldScrollToBottom(true)
    } catch (err: unknown) {
      console.error('Failed to toggle reaction:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Cannot toggle reaction: ${errorMessage}`)
    }
  }

  const addReaction = async (channelId: string, messageTs: string, reactionName: string) => {
    // Save scroll position
    const scrollPos = messagesContainerRef.current?.scrollTop ?? 0

    try {
      const result = await api.callTool('add_reaction_to_message', {
        channel_id: channelId,
        message_ts: messageTs,
        name: reactionName,
      })
      if (!result?.ok) {
        const errorMsg = result?.error || 'Unknown error'
        alert(`Cannot add reaction: ${errorMsg}`)
        return
      }
      // Reload messages without scrolling to bottom
      setShouldScrollToBottom(false)
      await loadMessages(channelId)
      // Restore scroll position
      requestAnimationFrame(() => {
        messagesContainerRef.current?.scrollTo(0, scrollPos)
      })
      setShouldScrollToBottom(true)
    } catch (err: unknown) {
      console.error('Failed to add reaction:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Cannot add reaction: ${errorMessage}`)
    }
  }

  // Toggle message starred state
  const toggleMessageStar = async (channelId: string, messageTs: string) => {
    const scrollPos = messagesContainerRef.current?.scrollTop ?? 0
    // Update locally immediately for responsive UI
    setMessages(prev => prev.map(msg =>
      msg.ts === messageTs ? { ...msg, is_starred: !msg.is_starred } : msg
    ))
    // Also update in backend state
    try {
      const state = await fetchSlickState()
      if (state) {
        const channelData = state.channels?.[channelId]
        if (channelData?.messages) {
          const msgIdx = channelData.messages.findIndex((m: any) => m.ts === messageTs)
          if (msgIdx >= 0) {
            channelData.messages[msgIdx].is_starred = !channelData.messages[msgIdx].is_starred
            await fetch('./api/services/slick/state', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(state),
            })
          }
        }
      }
    } catch (err) {
      console.warn('Failed to persist star state:', err)
    }
    // Restore scroll position
    requestAnimationFrame(() => {
      messagesContainerRef.current?.scrollTo(0, scrollPos)
    })
  }

  const startEditMessage = (message: Message) => {
    setEditingMessageTs(message.ts)
    setEditText(message.text)
  }

  const cancelEdit = () => {
    setEditingMessageTs(null)
    setEditText('')
  }

  const saveEdit = async (channelId: string, messageTs: string) => {
    if (!editText.trim()) return

    const scrollPos = messagesContainerRef.current?.scrollTop ?? 0

    try {
      await api.callTool('update_chat_message', {
        channel: channelId,
        ts: messageTs,
        text: editText.trim(),
      })
      setEditingMessageTs(null)
      setEditText('')
      setShouldScrollToBottom(false)
      await loadMessages(channelId)
      requestAnimationFrame(() => {
        messagesContainerRef.current?.scrollTo(0, scrollPos)
      })
      setShouldScrollToBottom(true)
      // Also reload thread if open
      if (selectedThread) {
        await openThread(selectedThread)
      }
    } catch (err) {
      console.error('Failed to edit message:', err)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent, channelId: string, messageTs: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit(channelId, messageTs)
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const deleteMessage = async (channelId: string, messageTs: string) => {
    const scrollPos = messagesContainerRef.current?.scrollTop ?? 0

    try {
      await api.callTool('delete_chat_message', {
        channel: channelId,
        ts: messageTs,
      })
      setShowDeleteConfirm(null)
      setShouldScrollToBottom(false)
      await loadMessages(channelId)
      requestAnimationFrame(() => {
        messagesContainerRef.current?.scrollTo(0, scrollPos)
      })
      setShouldScrollToBottom(true)
      // Also reload thread if open
      if (selectedThread) {
        // If we deleted the parent message, close the thread
        if (selectedThread.ts === messageTs) {
          closeThread()
        } else {
          await openThread(selectedThread)
        }
      }
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
  }

  // Create Channel handlers
  const openCreateChannelModal = () => {
    setShowCreateChannel(true)
    setNewChannelName('')
    setNewChannelDescription('')
    setNewChannelIsPrivate(false)
    setCreateChannelError(null)
  }

  const closeCreateChannelModal = () => {
    setShowCreateChannel(false)
    setNewChannelName('')
    setNewChannelDescription('')
    setNewChannelIsPrivate(false)
    setCreateChannelError(null)
    setCreateChannelLoading(false)
  }

  const createChannel = async () => {
    if (!newChannelName.trim()) {
      setCreateChannelError('Channel name is required')
      return
    }

    // Validate channel name format (lowercase, no spaces, alphanumeric and hyphens)
    const validName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (validName.length < 1) {
      setCreateChannelError('Channel name must contain at least one alphanumeric character')
      return
    }

    setCreateChannelLoading(true)
    setCreateChannelError(null)

    try {
      const createResult = await api.callTool('create_channel', {
        name: validName,
        is_private: newChannelIsPrivate,
      })

      // Set channel purpose/description if provided
      if (newChannelDescription.trim() && createResult?.channel?.id) {
        await api.callTool('set_conversation_purpose', {
          channel: createResult.channel.id,
          purpose: newChannelDescription.trim(),
        })
      }

      // Close modal and refresh channel list
      closeCreateChannelModal()
      await loadInitialData()
    } catch (err) {
      console.error('Failed to create channel:', err)
      setCreateChannelError(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setCreateChannelLoading(false)
    }
  }

  const handleCreateChannelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      createChannel()
    } else if (e.key === 'Escape') {
      closeCreateChannelModal()
    }
  }

  // Search handlers
  const performSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    setSearchLoading(true)
    setShowSearchResults(true)

    try {
      // search_messages returns List[Dict] directly, not nested under messages.matches
      const results = await api.callTool('search_messages', {
        query: searchQuery.trim(),
      })

      // Transform search results to our format
      // API returns: { ts, text, user, channel (id), channel_name, ... }
      const messages = Array.isArray(results) ? results : []
      const transformedResults: SearchResult[] = messages.map((msg: { ts: string; text: string; user: string; channel: string; channel_name: string }) => ({
        ts: msg.ts,
        text: msg.text,
        user: msg.user,
        channel: { id: msg.channel, name: msg.channel_name || 'Unknown' },
      }))

      setSearchResults(transformedResults)
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      performSearch()
    } else if (e.key === 'Escape') {
      setShowSearchResults(false)
      setSearchQuery('')
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowSearchResults(false)
  }

  const navigateToSearchResult = async (result: SearchResult) => {
    // Find the channel and navigate to it
    const targetChannel = channels.find(c => c.id === result.channel.id)
    if (targetChannel) {
      await selectChannel(targetChannel)
      // Close search results after navigation
      setShowSearchResults(false)
    }
  }

  // Leave channel handlers
  const openLeaveConfirm = () => {
    setShowLeaveConfirm(true)
  }

  const closeLeaveConfirm = () => {
    setShowLeaveConfirm(false)
  }

  const leaveChannel = async () => {
    if (!selectedChannel) return

    setLeaveLoading(true)
    try {
      await api.callTool('leave_conversation', { channel: selectedChannel.id })

      // Reload channel list from API to get accurate list of channels user is member of
      // Filter out the left channel client-side since API might still return it (admin visibility)
      const leftChannelId = selectedChannel.id
      const channelsResult = await api.callTool('list_user_conversations', { types: 'public_channel,private_channel', exclude_archived: true })
      const freshChannels = (channelsResult?.channels || []).filter(
        (c: Channel) => c.id !== leftChannelId
      )
      setChannels(freshChannels)

      // Select first available channel from the fresh list
      if (freshChannels.length > 0) {
        setSelectedChannel(freshChannels[0])
        setSelectedDmUser(null)
        await loadMessages(freshChannels[0].id)
      } else {
        setSelectedChannel(null)
        setMessages([])
        setChannelMembers([])
      }

      setShowLeaveConfirm(false)
    } catch (err) {
      console.error('Failed to leave channel:', err)
    } finally {
      setLeaveLoading(false)
    }
  }

  // Check if we can show leave button (not a DM, and more than 1 channel)
  const canLeaveChannel = selectedChannel && !selectedDmUser && channels.length > 1

  // Browse channels - list all workspace channels
  const openBrowseChannels = async () => {
    setShowBrowseChannels(true)
    setBrowseChannelsLoading(true)
    try {
      const result = await api.callTool('list_channels', {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
      })
      setBrowseChannels(result?.channels || [])
    } catch (err) {
      console.error('Failed to list channels:', err)
    } finally {
      setBrowseChannelsLoading(false)
    }
  }

  // Join a channel from browse view
  const joinChannel = async (channel: Channel) => {
    setJoiningChannel(channel.id)
    try {
      await api.callTool('join_conversation', { channel: channel.id })
      // Refresh the user's channel list
      const channelsResult = await api.callTool('list_user_conversations', { types: 'public_channel,private_channel', exclude_archived: true })
      const newChannels = channelsResult?.channels || []
      setChannels(newChannels)
      // Close browse modal and navigate to the joined channel
      setShowBrowseChannels(false)
      const joinedChannel = newChannels.find((c: Channel) => c.id === channel.id) || channel
      selectChannel(joinedChannel)
    } catch (err) {
      console.error('Failed to join channel:', err)
      alert(`Failed to join channel: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setJoiningChannel(null)
    }
  }

  // Open DM with a user
  const openDmWithUser = async (userId: string) => {
    setOpeningDm(true)
    try {
      const result = await api.callTool('open_conversation', { users: userId, return_im: true })
      if (result?.ok && result?.channel?.id) {
        const dmChannelId = result.channel.id
        // Refresh DM list
        const dmConversationsResult = await api.callTool('list_user_conversations', { types: 'im', exclude_archived: true })
        const dmChannels = dmConversationsResult?.channels || []
        const dms: DmConversation[] = []
        for (const dm of dmChannels) {
          if (dm.is_im) {
            try {
              const membersResult = await api.callTool('get_conversation_members', { channel: dm.id })
              const members = membersResult?.members || []
              // For self-DMs, both members are the current user
              const isSelfDm = members.length <= 1 || members.every((id: string) => id === currentUserId)
              const otherUserId = isSelfDm ? currentUserId : members.find((id: string) => id !== currentUserId)
              if (otherUserId) {
                const otherUser = users[otherUserId]
                const displayName = isSelfDm
                  ? `${otherUser?.profile?.display_name || otherUser?.real_name || otherUser?.name || otherUserId} (you)`
                  : otherUser?.profile?.display_name || otherUser?.real_name || otherUser?.name || otherUserId
                dms.push({
                  id: dm.id,
                  name: displayName,
                  userId: otherUserId,
                })
              }
            } catch {
              dms.push({ id: dm.id, name: dm.name || dm.id, userId: dm.id })
            }
          }
        }
        setDmConversations(dms)
        // Navigate to the new DM
        const newDm = dms.find(d => d.id === dmChannelId)
        if (newDm) {
          selectDmConversation(newDm)
        }
        setShowDmPicker(false)
        setDmPickerSearch('')
      }
    } catch (err) {
      console.error('Failed to open DM:', err)
      alert(`Failed to open DM: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setOpeningDm(false)
    }
  }

  // Close/hide a DM conversation
  const closeDmConversation = async (e: React.MouseEvent, dmId: string) => {
    e.stopPropagation()
    try {
      await api.callTool('close_conversation', { channel: dmId })
      setDmConversations(prev => prev.filter(dm => dm.id !== dmId))
      // If this was the selected conversation, deselect
      if (selectedChannel?.id === dmId) {
        setSelectedChannel(channels[0] || null)
        setSelectedDmUser(null)
        if (channels[0]) {
          await loadMessages(channels[0].id)
        } else {
          setMessages([])
        }
      }
    } catch (err) {
      console.error('Failed to close DM:', err)
    }
  }

  // Topic editing handlers
  const startEditingTopic = () => {
    if (!selectedChannel) return
    setTopicInput(selectedChannel.topic || '')
    setEditingTopic(true)
  }

  const cancelEditingTopic = () => {
    setEditingTopic(false)
    setTopicInput('')
  }

  const saveTopic = async () => {
    if (!selectedChannel) return
    if (topicSaveInProgressRef.current) return
    topicSaveInProgressRef.current = true

    // If same as current, just cancel (allow empty to clear topic)
    if (topicInput.trim() === (selectedChannel.topic || '')) {
      cancelEditingTopic()
      topicSaveInProgressRef.current = false
      return
    }

    setTopicSaving(true)
    try {
      const result = await api.callTool('set_conversation_topic', {
        channel: selectedChannel.id,
        topic: topicInput.trim(),
      })

      if (!result?.ok) {
        const errorMsg = result?.error || 'Unknown error'
        alert(`Cannot set topic: ${errorMsg}`)
        setEditingTopic(false)
        setTopicInput('')
        return
      }

      // Update local state
      setSelectedChannel({
        ...selectedChannel,
        topic: topicInput.trim(),
      })

      // Update in channels list
      setChannels(channels.map(c =>
        c.id === selectedChannel.id
          ? { ...c, topic: topicInput.trim() }
          : c
      ))

      setEditingTopic(false)
    } catch (err: unknown) {
      console.error('Failed to save topic:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Cannot set topic: ${errorMessage}`)
      setEditingTopic(false)
      setTopicInput('')
    } finally {
      setTopicSaving(false)
      topicSaveInProgressRef.current = false
    }
  }

  const handleTopicKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveTopic()
    } else if (e.key === 'Escape') {
      cancelEditingTopic()
    }
  }

  const formatTimestamp = (ts: string) => {
    const date = new Date(parseFloat(ts) * 1000)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDateSeparator = (ts: string) => {
    const date = new Date(parseFloat(ts) * 1000)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const isToday = date.toDateString() === today.toDateString()
    const isYesterday = date.toDateString() === yesterday.toDateString()

    if (isToday) {
      return 'Today'
    } else if (isYesterday) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      })
    }
  }

  const getDateKey = (ts: string) => {
    const date = new Date(parseFloat(ts) * 1000)
    return date.toDateString()
  }

  const getUserName = (userId: string) => {
    const user = users[userId]
    if (!user) return userId
    // Check profile fields first, then top-level fields
    return user.profile?.display_name || user.profile?.real_name || user.real_name || user.name || userId
  }

  const getChannelName = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId)
    return channel ? channel.name : channelId
  }

  const getUserAvatar = (userId: string) => {
    const user = users[userId]
    // Check profile image fields (image_72/image_48 for Slick standard, image for DB storage)
    const avatarUrl = user?.profile?.image_72 || user?.profile?.image_48 || user?.profile?.image
    if (avatarUrl) return avatarUrl
    // Generate a color based on user ID
    const colors = ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688', '#4CAF50', '#FF9800']
    const colorIndex = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[colorIndex]
  }

  // Get user presence status from API data
  const getUserPresence = (userId: string): 'active' | 'away' | 'offline' => {
    // Return real presence data from API if available
    if (userPresence[userId]) {
      return userPresence[userId]
    }
    // Default to offline for unknown users (presence will be loaded asynchronously)
    return 'offline'
  }

  // Get presence indicator color class
  const getPresenceColor = (presence: 'active' | 'away' | 'offline') => {
    switch (presence) {
      case 'active': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  // Presence indicator component
  const PresenceIndicator = ({ userId, size = 'sm' }: { userId: string, size?: 'sm' | 'md' | 'lg' }) => {
    const presence = getUserPresence(userId)
    const sizeClasses = {
      sm: 'w-2.5 h-2.5',
      md: 'w-3 h-3',
      lg: 'w-3.5 h-3.5'
    }
    return (
      <span
        className={`absolute bottom-0 right-0 ${sizeClasses[size]} ${getPresenceColor(presence)} rounded-full border-2 border-[#1a1d21]`}
        title={presence.charAt(0).toUpperCase() + presence.slice(1)}
      />
    )
  }

  // Convert local users state to display list format
  const usersAsDisplayList = () => Object.values(users).map(u => ({
    id: u.id, name: u.name, real_name: u.real_name, profile: u.profile,
  }))

  // ========== PEOPLE DIRECTORY HANDLERS ==========
  const loadPeopleDirectory = async (cursor?: string) => {
    try {
      setPeopleLoading(true)
      const params: any = { limit: 50 }
      if (cursor) params.cursor = cursor
      const result = await api.callTool('list_users', params)
      const members = result?.members || []
      if (cursor) {
        setPeopleList(prev => [...prev, ...members])
      } else {
        // Merge API results with local user state to ensure all users are shown
        const apiUserIds = new Set(members.map((m: any) => m.id))
        const extraLocalUsers = usersAsDisplayList().filter(u => !apiUserIds.has(u.id))
        setPeopleList([...members, ...extraLocalUsers])
      }
      const nextCursor = result?.response_metadata?.next_cursor
      setPeopleCursor(nextCursor || undefined)
      setPeopleHasMore(!!nextCursor)
    } catch (err) {
      console.error('Failed to load people directory:', err)
      setPeopleList(usersAsDisplayList())
    } finally {
      setPeopleLoading(false)
    }
  }

  const openUserProfile = async (userId: string) => {
    try {
      setProfileModalLoading(true)
      setProfileModalUser(null)
      const result = await api.callTool('get_user_info', { user_id: userId })
      if (result?.user) {
        setProfileModalUser(result.user)
      }
    } catch (err) {
      console.error('Failed to load user profile:', err)
    } finally {
      setProfileModalLoading(false)
    }
  }

  const lookupUserByEmail = async () => {
    if (!peopleEmailSearch.trim()) return
    try {
      setPeopleLoading(true)
      setPeopleEmailSearchError(null)
      setPeopleEmailSearchResult(null)
      const result = await api.callTool('lookup_user_by_email', { email: peopleEmailSearch.trim() })
      if (result?.user) {
        setPeopleEmailSearchResult(result.user)
      } else {
        setPeopleEmailSearchError(result?.error || 'User not found')
      }
    } catch (err) {
      console.error('Failed to lookup user by email:', err)
      setPeopleEmailSearchError('Failed to lookup user')
    } finally {
      setPeopleLoading(false)
    }
  }

  // Unified people search: email lookup or name search
  const searchPeople = () => {
    if (peopleEmailSearch.includes('@')) {
      lookupUserByEmail()
    } else {
      const q = peopleEmailSearch.trim().toLowerCase()
      const found = Object.values(users).find(u =>
        u.real_name?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.profile?.display_name?.toLowerCase().includes(q)
      )
      if (found) {
        setPeopleEmailSearchResult(found)
        setPeopleEmailSearchError(null)
      } else {
        setPeopleEmailSearchResult(null)
        setPeopleEmailSearchError('No user found matching that name')
      }
    }
  }

  const deleteUserPhoto = async () => {
    try {
      setUserSettingsLoading(true)
      setUserSettingsMessage(null)
      await api.callTool('delete_user_photo', {})
      // Clear file selection and reset input
      setUserPhotoFile(null)
      setPhotoInputKey(k => k + 1)
      // Update local user state to remove photo
      if (currentUserId) {
        setUsers(prev => ({
          ...prev,
          [currentUserId]: {
            ...prev[currentUserId],
            profile: {
              ...prev[currentUserId]?.profile,
              image: undefined,
              image_48: undefined,
              image_72: undefined,
            },
          },
        }))
      }
      setUserSettingsMessage({ type: 'success', text: 'Photo removed successfully!' })
    } catch (err) {
      console.error('Failed to delete photo:', err)
      setUserSettingsMessage({ type: 'error', text: 'Failed to remove photo' })
    } finally {
      setUserSettingsLoading(false)
    }
  }

  const loadUserIdentity = async () => {
    try {
      const result = await api.callTool('get_user_identity', {})
      if (result?.user || result?.team) {
        setUserIdentity({
          user_name: result.user?.name,
          team_name: result.team?.name,
          team_id: result.team?.id,
        })
      }
    } catch (err) {
      console.error('Failed to load user identity:', err)
    }
  }

  // ========== REMINDERS HANDLERS ==========
  const loadReminders = async () => {
    try {
      setReminderLoading(true)
      const result = await api.callTool('list_reminders', {})
      setReminders(result?.reminders || [])
    } catch (err) {
      console.error('Failed to load reminders:', err)
    } finally {
      setReminderLoading(false)
    }
  }

  const addReminder = async () => {
    if (!newReminderText.trim() || !newReminderTime) return
    try {
      setReminderLoading(true)
      const timeInSeconds = Math.floor(new Date(newReminderTime).getTime() / 1000)
      await api.callTool('add_reminder', {
        text: newReminderText.trim(),
        ts: String(timeInSeconds),
      })
      setNewReminderText('')
      setNewReminderTime('')
      setShowAddReminder(false)
      await loadReminders()
    } catch (err) {
      console.error('Failed to add reminder:', err)
    } finally {
      setReminderLoading(false)
    }
  }

  const completeReminder = async (reminderId: string) => {
    try {
      const completeTs = String(Math.floor(Date.now() / 1000))
      await api.callTool('complete_reminder', { reminder_id: reminderId, complete_ts: completeTs })
      await loadReminders()
    } catch (err) {
      console.error('Failed to complete reminder:', err)
    }
  }

  const deleteReminder = async (reminderId: string) => {
    try {
      await api.callTool('delete_reminder', { reminder_id: reminderId })
      await loadReminders()
    } catch (err) {
      console.error('Failed to delete reminder:', err)
    }
  }

  // ========== USER GROUPS HANDLERS ==========
  const loadUserGroups = async () => {
    try {
      setUserGroupLoading(true)
      const result = await api.callTool('list_user_groups', { include_disabled: true, include_users: true })
      setUserGroups(result?.usergroups || [])
    } catch (err) {
      console.error('Failed to load user groups:', err)
    } finally {
      setUserGroupLoading(false)
    }
  }

  const createUserGroup = async () => {
    if (!newGroupName.trim() || !newGroupHandle.trim()) return
    try {
      setUserGroupLoading(true)
      await api.callTool('create_user_group', {
        name: newGroupName.trim(),
        handle: newGroupHandle.trim(),
        description: newGroupDescription.trim() || undefined,
      })
      setNewGroupName('')
      setNewGroupHandle('')
      setNewGroupDescription('')
      setShowAddUserGroup(false)
      await loadUserGroups()
    } catch (err) {
      console.error('Failed to create user group:', err)
    } finally {
      setUserGroupLoading(false)
    }
  }

  const updateUserGroup = async (groupId: string, updates: { name?: string; handle?: string; description?: string }) => {
    try {
      setUserGroupLoading(true)
      await api.callTool('update_user_group', {
        usergroup_id: groupId,
        ...updates,
      })
      setShowEditUserGroup(null)
      await loadUserGroups()
    } catch (err) {
      console.error('Failed to update user group:', err)
    } finally {
      setUserGroupLoading(false)
    }
  }

  const toggleUserGroup = async (groupId: string, disabled: boolean) => {
    try {
      if (disabled) {
        await api.callTool('enable_user_group', { usergroup_id: groupId })
      } else {
        await api.callTool('disable_user_group', { usergroup_id: groupId })
      }
      await loadUserGroups()
    } catch (err) {
      console.error('Failed to toggle user group:', err)
    }
  }

  const updateUserGroupMembers = async (groupId: string) => {
    try {
      setUserGroupLoading(true)
      await api.callTool('update_user_group_members', {
        usergroup: groupId,
        users: selectedGroupMembers.join(','),
      })
      setShowManageMembers(null)
      setSelectedGroupMembers([])
      await loadUserGroups()
    } catch (err) {
      console.error('Failed to update user group members:', err)
    } finally {
      setUserGroupLoading(false)
    }
  }

  const toggleGroupMember = (userId: string) => {
    setSelectedGroupMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  // ========== SCHEDULED MESSAGES TIMER ==========
  // Use refs so the interval callback always reads the latest values without triggering effect re-runs
  const scheduledMessagesRef = useRef(scheduledMessages)
  scheduledMessagesRef.current = scheduledMessages
  const selectedChannelRef = useRef(selectedChannel)
  selectedChannelRef.current = selectedChannel

  useEffect(() => {
    const checkScheduledMessages = async () => {
      const current = scheduledMessagesRef.current
      if (current.length === 0) return
      const now = Math.floor(Date.now() / 1000)
      const dueMessages = current.filter(msg => msg.post_at <= now)
      if (dueMessages.length === 0) return

      for (const msg of dueMessages) {
        try {
          await api.callTool('post_chat_message', {
            channel: msg.channel_id,
            text: msg.text,
          })
          await api.callTool('delete_scheduled_message', {
            channel: msg.channel_id,
            scheduled_message_id: msg.id,
          })
        } catch (err) {
          console.error('Failed to send scheduled message:', err)
        }
      }
      // Reload scheduled messages list
      try {
        const result = await api.callTool('list_scheduled_messages', {})
        setScheduledMessages(result?.scheduled_messages || [])
      } catch { /* ignore */ }
      // Reload current channel messages if applicable
      const ch = selectedChannelRef.current
      if (ch && dueMessages.some(m => m.channel_id === ch.id)) {
        await reloadAndScrollToBottom(ch.id)
      }
    }

    const interval = setInterval(checkScheduledMessages, 10000)
    return () => clearInterval(interval)
  }, []) // stable interval - reads from refs

  // ========== SCHEDULED MESSAGES HANDLERS ==========
  const loadScheduledMessages = async () => {
    try {
      setScheduleLoading(true)
      const result = await api.callTool('list_scheduled_messages', {})
      setScheduledMessages(result?.scheduled_messages || [])
    } catch (err) {
      console.error('Failed to load scheduled messages:', err)
    } finally {
      setScheduleLoading(false)
    }
  }

  const scheduleMessage = async () => {
    if (!scheduleChannel || !scheduleText.trim() || !scheduleTime) return
    try {
      setScheduleLoading(true)
      const postAtSeconds = Math.floor(new Date(scheduleTime).getTime() / 1000)
      await api.callTool('schedule_chat_message', {
        channel: scheduleChannel,
        text: scheduleText.trim(),
        post_at: postAtSeconds,
      })
      setScheduleChannel('')
      setScheduleText('')
      setScheduleTime('')
      setShowScheduleMessage(false)
      await loadScheduledMessages()
    } catch (err) {
      console.error('Failed to schedule message:', err)
    } finally {
      setScheduleLoading(false)
    }
  }

  const deleteScheduledMessage = async (channelId: string, scheduledMessageId: string) => {
    try {
      await api.callTool('delete_scheduled_message', {
        channel: channelId,
        scheduled_message_id: scheduledMessageId,
      })
      await loadScheduledMessages()
    } catch (err) {
      console.error('Failed to delete scheduled message:', err)
    }
  }

  // ========== FILE SEARCH HANDLERS ==========
  const searchFiles = async () => {
    if (!fileSearchQuery.trim()) return
    try {
      setFileSearchLoading(true)
      const result = await api.callTool('search_files', { query: fileSearchQuery.trim() })
      setFileResults(result || [])
    } catch (err) {
      console.error('Failed to search files:', err)
      setFileResults([])
    } finally {
      setFileSearchLoading(false)
    }
  }

  // ========== FILE MANAGEMENT HANDLERS ==========
  const loadFiles = async (cursor?: string) => {
    try {
      setFilesLoading(true)
      const params: any = {}
      if (fileFilters.channel_id) params.channel_id = fileFilters.channel_id
      if (fileFilters.user_id) params.user_id = fileFilters.user_id
      if (fileFilters.types) params.types = fileFilters.types
      if (cursor) params.cursor = cursor
      params.count = 20
      const result = await api.callTool('list_files', params)
      const fileList = result?.files || result || []
      if (cursor) {
        setFiles(prev => [...prev, ...fileList])
      } else {
        setFiles(fileList)
      }
      setFilesPagination({
        cursor: result?.response_metadata?.next_cursor || result?.next_cursor,
        hasMore: !!(result?.response_metadata?.next_cursor || result?.next_cursor),
      })
    } catch (err) {
      console.error('Failed to load files:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const loadFileDetail = async (fileId: string) => {
    try {
      setFileDetailLoading(true)
      const result = await api.callTool('get_file_info', { file_id: fileId })
      setSelectedFile(result?.file || result)
    } catch (err) {
      console.error('Failed to load file info:', err)
    } finally {
      setFileDetailLoading(false)
    }
  }

  const handleUploadFile = async () => {
    try {
      setFilesLoading(true)
      const params: any = {}
      if (uploadTitle) params.title = uploadTitle
      if (uploadContent) params.content = uploadContent
      if (uploadFilename) params.filename = uploadFilename
      if (uploadFiletype) params.filetype = uploadFiletype
      // Default to current channel if no channels specified
      const channelsToUpload = uploadChannels || (selectedChannel ? selectedChannel.id : '')
      if (channelsToUpload) params.channels = channelsToUpload
      if (uploadComment) params.initial_comment = uploadComment
      await api.callTool('upload_file', params)
      setShowUploadDialog(false)
      setUploadTitle(''); setUploadContent(''); setUploadFilename(''); setUploadFiletype(''); setUploadChannels(''); setUploadComment('')
      await loadFiles()
      // Also reload channel messages if the file was uploaded to the current channel
      if (selectedChannel && channelsToUpload.includes(selectedChannel.id)) {
        await loadMessages(selectedChannel.id)
      }
    } catch (err) {
      console.error('Failed to upload file:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleShareFile = async (fileId: string) => {
    if (!shareChannelIds.trim()) return
    try {
      setFilesLoading(true)
      const fileInfo = files.find(f => f.id === fileId) || fileResults.find((f: any) => f.id === fileId)
      const fileName = fileInfo?.name || fileInfo?.title || 'a file'
      const channelIdsList = shareChannelIds.trim().split(',').map(id => id.trim()).filter(Boolean)
      // Share file to channels
      try {
        await api.callTool('share_file', { file_id: fileId, channel_ids: shareChannelIds.trim() })
      } catch (e) {
        console.warn('share_file API call failed, will still post message:', e)
      }
      // Post a message in the channel(s) so the shared file appears in conversation
      for (const chId of channelIdsList) {
        try {
          await api.callTool('post_chat_message', { channel: chId, text: `📎 Shared a file: *${fileName}*` })
        } catch (e) {
          // Try joining and posting again
          try {
            await api.callTool('join_conversation', { channel: chId })
            await api.callTool('post_chat_message', { channel: chId, text: `📎 Shared a file: *${fileName}*` })
          } catch (e2) {
            console.warn('Failed to post share message after join:', chId, e2)
          }
        }
      }
      setShowShareDialog(null)
      setShareChannelIds('')
      await loadFiles()
      // Reload messages if the current channel was a share target
      if (selectedChannel && channelIdsList.includes(selectedChannel.id)) {
        await reloadAndScrollToBottom(selectedChannel.id)
      }
    } catch (err) {
      console.error('Failed to share file:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      setFilesLoading(true)
      await api.callTool('delete_file', { file_id: fileId })
      setShowDeleteFileConfirm(null)
      setSelectedFile(null)
      await loadFiles()
    } catch (err) {
      console.error('Failed to delete file:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleAddRemoteFile = async () => {
    try {
      setFilesLoading(true)
      const params: any = {
        external_id: remoteExternalId,
        external_url: remoteExternalUrl,
        title: remoteTitle,
      }
      if (remoteFiletype) params.filetype = remoteFiletype
      if (remoteIndexContent) params.indexable_file_contents = remoteIndexContent
      await api.callTool('add_remote_file', params)
      setShowRemoteFileDialog(false)
      setRemoteExternalId(''); setRemoteExternalUrl(''); setRemoteTitle(''); setRemoteFiletype(''); setRemoteIndexContent('')
      await loadFiles()
    } catch (err) {
      console.error('Failed to add remote file:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleRemoveRemoteFile = async (fileId: string) => {
    try {
      setFilesLoading(true)
      await api.callTool('remove_remote_file', { file: fileId })
      setSelectedFile(null)
      await loadFiles()
    } catch (err) {
      console.error('Failed to remove remote file:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleGetExternalUploadUrl = async () => {
    try {
      setFilesLoading(true)
      const params: any = {
        filename: extUploadFilename,
        length: parseInt(extUploadLength) || 0,
      }
      if (extUploadAltTxt) params.alt_txt = extUploadAltTxt
      if (extUploadSnippetType) params.snippet_type = extUploadSnippetType
      const result = await api.callTool('get_external_upload_url', params)
      setExtUploadUrl(result?.upload_url || null)
      setExtUploadFileId(result?.file_id || null)
    } catch (err) {
      console.error('Failed to get external upload URL:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  const handleFinishExternalUpload = async () => {
    if (!extUploadFileId) return
    try {
      setFilesLoading(true)
      const params: any = {
        files: [{ id: extUploadFileId, title: extUploadFilename }],
      }
      if (extUploadChannel) params.channel_id = extUploadChannel
      if (extUploadComment) params.initial_comment = extUploadComment
      await api.callTool('finish_external_file_upload', params)
      setShowExternalUploadDialog(false)
      setExtUploadFilename(''); setExtUploadLength(''); setExtUploadAltTxt(''); setExtUploadSnippetType('')
      setExtUploadUrl(null); setExtUploadFileId(null); setExtUploadChannel(''); setExtUploadComment('')
      await loadFiles()
    } catch (err) {
      console.error('Failed to finish external upload:', err)
    } finally {
      setFilesLoading(false)
    }
  }

  // ========== USER SETTINGS HANDLERS ==========
  const loadCurrentUserProfile = async () => {
    if (!currentUserId) return
    try {
      setUserSettingsLoading(true)

      // First try to use existing local user data if available
      const localUser = users[currentUserId]
      if (localUser?.profile) {
        const profile = localUser.profile
        setUserProfileEdit({
          display_name: profile.display_name || '',
          real_name: profile.real_name || '',
          status_text: profile.status_text || '',
          status_emoji: profile.status_emoji || '',
          phone: profile.phone || '',
          title: profile.title || '',
        })
      }

      // Try to get presence (may fail due to backend validation issues)
      try {
        const presenceResult = await api.callTool('get_user_presence', { user_id: currentUserId })
        if (presenceResult?.presence) {
          setCurrentPresence(presenceResult.presence === 'active' ? 'active' : 'away')
        }
      } catch {
        // Ignore presence errors
      }
    } catch (err) {
      console.error('Failed to load user profile:', err)
    } finally {
      setUserSettingsLoading(false)
    }
  }

  const setUserPresenceStatus = async (presence: 'active' | 'away') => {
    try {
      setUserSettingsLoading(true)
      await api.callTool('set_user_presence', { presence })
      setCurrentPresence(presence)
      // Also update userPresence state so the UI reflects the change
      if (currentUserId) {
        setUserPresence(prev => ({ ...prev, [currentUserId]: presence }))
      }
    } catch (err) {
      console.error('Failed to set presence:', err)
    } finally {
      setUserSettingsLoading(false)
    }
  }

  const updateUserProfile = async () => {
    try {
      setUserSettingsLoading(true)
      setUserSettingsMessage(null)

      // Build profile data - include all fields that have been set (even empty, to allow clearing)
      const profileData: Record<string, string> = {}
      const fields = ['display_name', 'real_name', 'status_text', 'status_emoji', 'phone', 'title'] as const
      for (const field of fields) {
        const value = userProfileEdit[field]
        if (value !== undefined) {
          profileData[field] = value.trim()
        }
      }

      if (Object.keys(profileData).length === 0) {
        setUserSettingsMessage({ type: 'error', text: 'Please fill in at least one field' })
        return
      }

      const result = await api.callTool('set_user_profile', { profile: profileData })
      if (result?.ok) {
        setUserSettingsMessage({ type: 'success', text: 'Profile updated successfully!' })
        // Update local users state with the new profile data
        if (currentUserId && result.profile) {
          setUsers(prevUsers => ({
            ...prevUsers,
            [currentUserId]: {
              ...prevUsers[currentUserId],
              profile: {
                ...prevUsers[currentUserId]?.profile,
                ...result.profile,
              },
            },
          }))
        }
        // Note: Not reloading profile as local state is already updated from result.profile
      } else {
        setUserSettingsMessage({ type: 'error', text: result?.error || 'Failed to update profile' })
      }
    } catch (err: unknown) {
      console.error('Failed to update profile:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile'
      setUserSettingsMessage({ type: 'error', text: errorMessage })
    } finally {
      setUserSettingsLoading(false)
    }
  }

  const updateUserPhoto = async () => {
    if (!userPhotoFile) {
      setUserSettingsMessage({ type: 'error', text: 'Please select a photo' })
      return
    }
    try {
      setUserSettingsLoading(true)
      setUserSettingsMessage(null)

      // Convert file to base64
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const dataUrlFull = reader.result as string
          // Send the full data URL so it persists as a displayable image
          await api.callTool('set_user_photo', { image: dataUrlFull })
          setUserSettingsMessage({ type: 'success', text: 'Photo updated successfully!' })
          // Store the data URL as the profile photo so it persists when navigating
          const dataUrl = reader.result as string
          if (currentUserId) {
            setUsers(prev => ({
              ...prev,
              [currentUserId]: {
                ...prev[currentUserId],
                profile: {
                  ...prev[currentUserId]?.profile,
                  image: dataUrl,
                  image_72: dataUrl,
                  image_48: dataUrl,
                },
              },
            }))
          }
          setUserPhotoFile(null)
          setPhotoInputKey(k => k + 1)
        } catch (err) {
          console.error('Failed to update photo:', err)
          setUserSettingsMessage({ type: 'error', text: 'Failed to update photo' })
        } finally {
          setUserSettingsLoading(false)
        }
      }
      reader.onerror = () => {
        setUserSettingsMessage({ type: 'error', text: 'Failed to read photo file' })
        setUserSettingsLoading(false)
      }
      reader.readAsDataURL(userPhotoFile)
    } catch (err) {
      console.error('Failed to update photo:', err)
      setUserSettingsMessage({ type: 'error', text: 'Failed to update photo' })
      setUserSettingsLoading(false)
    }
  }

  // ========== CHANNEL MANAGEMENT HANDLERS ==========
  const renameChannel = async () => {
    if (!selectedChannel || !newChannelNameInput.trim()) return
    try {
      setChannelSettingsLoading(true)
      await api.callTool('rename_conversation', {
        channel: selectedChannel.id,
        name: newChannelNameInput.trim(),
      })
      const newName = newChannelNameInput.trim()
      setSelectedChannel({ ...selectedChannel, name: newName })
      setChannels(channels.map(c => c.id === selectedChannel.id ? { ...c, name: newName } : c))
      setShowRenameChannel(false)
      setNewChannelNameInput('')
    } catch (err) {
      console.error('Failed to rename channel:', err)
    } finally {
      setChannelSettingsLoading(false)
    }
  }

  const archiveChannel = async () => {
    if (!selectedChannel) return
    try {
      setChannelSettingsLoading(true)
      await api.callTool('archive_conversation', { channel: selectedChannel.id })
      // Remove from channel list and select another
      const remainingChannels = channels.filter(c => c.id !== selectedChannel.id)
      setChannels(remainingChannels)
      if (remainingChannels.length > 0) {
        selectChannel(remainingChannels[0])
      } else {
        setSelectedChannel(null)
        setMessages([])
      }
      setShowArchiveConfirm(false)
    } catch (err) {
      console.error('Failed to archive channel:', err)
    } finally {
      setChannelSettingsLoading(false)
    }
  }

  const inviteToChannel = async () => {
    if (!selectedChannel || selectedInviteUsers.length === 0) return
    try {
      setChannelSettingsLoading(true)
      // Ensure current user is a member before inviting
      await api.callTool('join_conversation', { channel: selectedChannel.id }).catch(() => {})
      const result = await api.callTool('invite_to_conversation', {
        channel: selectedChannel.id,
        users: selectedInviteUsers.join(','),
        force: true,
      })
      if (result?.ok) {
        setShowInviteModal(false)
        setSelectedInviteUsers([])
        // Reload channel members and merge with state
        const membersResult = await api.callTool('get_conversation_members', { channel: selectedChannel.id })
        const apiMembers = membersResult?.members || []
        try {
          const stateData = await fetchSlickState()
          const fallbackIds = resolveChannelMembersFromState(selectedChannel.id, messages, stateData)
          setChannelMembers([...new Set([...apiMembers, ...fallbackIds])])
        } catch {
          setChannelMembers(apiMembers)
        }
      } else {
        alert(`Failed to invite users: ${result?.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      console.error('Failed to invite to channel:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to invite users: ${errorMessage}`)
    } finally {
      setChannelSettingsLoading(false)
    }
  }

  const toggleInviteUser = (userId: string) => {
    setSelectedInviteUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const kickFromChannel = async () => {
    if (!selectedChannel || !selectedKickUser) return
    try {
      setChannelSettingsLoading(true)
      const result = await api.callTool('kick_from_conversation', {
        channel: selectedChannel.id,
        user_id: selectedKickUser,
      })
      if (result?.ok) {
        setShowKickModal(false)
        setSelectedKickUser(null)
        // Reload channel members
        const membersResult = await api.callTool('get_conversation_members', { channel: selectedChannel.id })
        setChannelMembers(membersResult?.members || [])
      } else {
        alert(`Failed to remove user: ${result?.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      console.error('Failed to kick from channel:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to remove user: ${errorMessage}`)
    } finally {
      setChannelSettingsLoading(false)
    }
  }

  const setChannelPurpose = async () => {
    if (!selectedChannel) return
    try {
      setChannelSettingsLoading(true)
      const result = await api.callTool('set_conversation_purpose', {
        channel: selectedChannel.id,
        purpose: purposeInput.trim(),
      })
      if (result?.ok) {
        setSelectedChannel({ ...selectedChannel, purpose: purposeInput.trim() })
        setChannels(channels.map((c: Channel) => c.id === selectedChannel.id ? { ...c, purpose: purposeInput.trim() } : c))
        setEditingPurpose(false)
        setPurposeInput('')
      } else {
        console.error('Failed to set channel purpose:', result?.error)
        alert(`Failed to set purpose: ${result?.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      console.error('Failed to set channel purpose:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to set purpose: ${errorMessage}`)
    } finally {
      setChannelSettingsLoading(false)
    }
  }

  // ========== ADMIN HANDLERS ==========
  const inviteAdminUser = async () => {
    if (!adminInviteEmail.trim()) return
    try {
      setAdminInviteLoading(true)
      const result = await api.callTool('invite_admin_user', {
        email: adminInviteEmail.trim(),
        real_name: adminInviteName.trim() || undefined,
      })
      if (result?.ok) {
        setShowAdminInvite(false)
        setAdminInviteEmail('')
        setAdminInviteName('')
        // Refresh users
        await rebuildUserMap()
      } else {
        alert(`Failed to invite user: ${result?.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      console.error('Failed to invite admin user:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to invite user: ${errorMessage}`)
    } finally {
      setAdminInviteLoading(false)
    }
  }

  // ========== MISSING API HANDLERS ==========

  // send_me_message - /me command support
  const sendMeMessage = async () => {
    if (!messageInput.trim() || !selectedChannel) return
    const text = messageInput.replace(/^\/me\s+/, '')
    if (!text.trim()) return
    try {
      await api.callTool('send_me_message', {
        channel: selectedChannel.id,
        text: text.trim(),
      })
      setMessageInput('')
      await reloadAndScrollToBottom(selectedChannel.id)
    } catch (err) {
      console.error('Failed to send /me message:', err)
    }
  }

  // post_ephemeral_message
  const sendEphemeralMessage = async () => {
    if (!ephemeralText.trim() || !ephemeralUser || !selectedChannel) return
    try {
      await api.callTool('post_ephemeral_message', {
        channel: selectedChannel.id,
        user: ephemeralUser,
        text: ephemeralText.trim(),
      })
      setShowEphemeralDialog(false)
      setEphemeralText('')
      setEphemeralUser('')
      // Reload messages to show the ephemeral message in UI
      await reloadAndScrollToBottom(selectedChannel.id)
    } catch (err) {
      console.error('Failed to send ephemeral message:', err)
    }
  }

  // get_message_reactions - fetch detailed reactions for a message
  const loadMessageReactions = async (channelId: string, messageTs: string) => {
    try {
      setReactionDetailLoading(true)
      const result = await api.callTool('get_message_reactions', {
        channel_id: channelId,
        message_ts: messageTs,
        full: true,
      })
      setReactionDetailPopup({
        channel: channelId,
        ts: messageTs,
        reactions: result?.reactions || [],
      })
    } catch (err) {
      console.error('Failed to load message reactions:', err)
    } finally {
      setReactionDetailLoading(false)
    }
  }

  // list_user_reactions - fetch reactions added by current user
  const loadUserReactions = async () => {
    try {
      setUserReactionsLoading(true)
      const result = await api.callTool('list_user_reactions', { full: true })
      setUserReactions(result?.items || [])
      setShowUserReactions(true)
    } catch (err) {
      console.error('Failed to load user reactions:', err)
    } finally {
      setUserReactionsLoading(false)
    }
  }

  // search_all_content - unified search for messages and files
  const searchAllContent = async () => {
    if (!unifiedSearchQuery.trim()) return
    try {
      setUnifiedSearchLoading(true)
      const result = await api.callTool('search_all_content', {
        query: unifiedSearchQuery.trim(),
      })
      setUnifiedSearchResults({
        messages: result?.messages || [],
        files: result?.files || [],
      })
      setShowUnifiedSearch(true)
    } catch (err) {
      console.error('Failed to search all content:', err)
    } finally {
      setUnifiedSearchLoading(false)
    }
  }

  // list_user_group_members - fetch members of a specific user group
  const loadGroupMembers = async (groupId: string) => {
    try {
      setGroupMembersLoading(true)
      setShowGroupMembers(groupId)
      const result = await api.callTool('list_user_group_members', {
        usergroup_id: groupId,
      })
      setGroupMembersList(result?.users || [])
    } catch (err) {
      console.error('Failed to load group members:', err)
    } finally {
      setGroupMembersLoading(false)
    }
  }

  // get_reminder_info - fetch details for a specific reminder
  const loadReminderInfo = async (reminderId: string) => {
    try {
      setReminderDetailLoading(true)
      const result = await api.callTool('get_reminder_info', {
        reminder_id: reminderId,
      })
      setReminderDetail(result?.reminder || null)
    } catch (err) {
      console.error('Failed to load reminder info:', err)
    } finally {
      setReminderDetailLoading(false)
    }
  }

  // Format date/time for display
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1a1d21]">
        <div className="w-9 h-9 border-[3px] border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1a1d21] gap-4">
        <p className="text-red-400">{error}</p>
        <button
          className="px-5 py-2.5 bg-[#0D9488] hover:bg-[#14B8A6] text-white rounded-lg transition-all font-medium shadow-sm hover:shadow-md"
          onClick={loadInitialData}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-[#1a1d21]">
      {/* Sidebar */}
      <div className="w-72 bg-[#18181B] flex flex-col">
        {/* Workspace header */}
        <div className="h-14 flex items-center px-5">
          <span className="font-bold text-white text-[15px] tracking-tight">{APP_NAME}</span>
          <span className="ml-2 text-[#9a9b9e] text-xs">▾</span>
        </div>

        {/* Search bar */}
        <div className="px-3 pb-3 pt-1 relative">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9b9e] text-sm">🔍</span>
            <input
              type="text"
              className="w-full pl-8 pr-8 py-2 bg-[#222529] border border-transparent rounded-lg text-white text-sm placeholder-[#9a9b9e] focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
              placeholder="Search messages & files..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setUnifiedSearchQuery(e.target.value) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault()
                  setUnifiedSearchQuery(searchQuery)
                  searchAllContent()
                } else {
                  handleSearchKeyDown(e)
                }
              }}
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9a9b9e] hover:text-white text-xs z-[60] transition-colors"
                onClick={clearSearch}
              >
                ✕
              </button>
            )}
          </div>
          {searchQuery && !showSearchResults && (
            <button
              className="w-full mt-1.5 px-2.5 py-1.5 text-[#E8E8E8] hover:text-white text-xs text-left hover:bg-[#222529] rounded-md transition-colors"
              onClick={() => { setUnifiedSearchQuery(searchQuery); searchAllContent() }}
            >
              Search all content (messages + files)
            </button>
          )}
          {/* Search Results Panel */}
          {showSearchResults && (
            <div className="absolute left-3 right-3 top-full mt-1 max-h-80 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[#3a3d41] flex items-center justify-between">
              <span className="text-white text-sm font-semibold tracking-tight">Search Results</span>
              <button
                className="text-[#9a9b9e] hover:text-white text-xs transition-colors"
                onClick={clearSearch}
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-64">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-8 text-center text-[#9a9b9e] text-sm">
                  {searchQuery ? 'No messages found' : 'Enter a search term'}
                </div>
              ) : (
                searchResults.map(result => (
                  <button
                    key={result.ts}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-[#2c2d30] border-b border-[#3a3d41]/60 last:border-b-0 transition-colors"
                    onClick={() => navigateToSearchResult(result)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[#9a9b9e] text-xs">#</span>
                      <span className="text-[#14B8A6] text-xs font-medium">{result.channel.name}</span>
                      <span className="text-[#9a9b9e] text-xs ml-auto">{formatTimestamp(result.ts)}</span>
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{result.ts}]</span>
                    </div>
                    <div className="text-white text-sm truncate">{result.text}</div>
                    <div className="text-[#9a9b9e] text-xs mt-1">{getUserName(result.user)}</div>
                  </button>
                ))
              )}
            </div>
            </div>
          )}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto py-1 px-2">
          <div className="px-2 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider">Channels</span>
            <div className="flex items-center gap-1">
              <button
                className="text-[#9a9b9e] hover:text-white text-xs leading-none p-1 rounded hover:bg-[#222529] transition-colors"
                onClick={openBrowseChannels}
                title="Browse channels"
              >🔍</button>
              <button
                className="text-[#9a9b9e] hover:text-white text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-[#222529] transition-colors"
                onClick={openCreateChannelModal}
                title="Create channel"
              >+</button>
            </div>
          </div>
          {channels.map(channel => {
            const hasUnread = channelLatestTs[channel.id] && (
              !readCursors[channel.id] ||
              parseFloat(channelLatestTs[channel.id]) > parseFloat(readCursors[channel.id])
            )
            return (
              <button
                key={channel.id}
                className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2 rounded-md transition-all ${
                  selectedChannel?.id === channel.id
                    ? 'bg-[#0D9488] text-white shadow-sm'
                    : 'text-[#E8E8E8] hover:bg-[#222529]'
                }`}
                onClick={() => selectChannel(channel)}
              >
                <span className="text-sm opacity-70">{channel.is_private ? '🔒' : '#'}</span>
                <span className={`text-sm truncate flex-1 ${hasUnread ? 'font-semibold text-white' : ''}`}>{channel.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{channel.id}]</span></span>
                {hasUnread && selectedChannel?.id !== channel.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] flex-shrink-0" />
                )}
              </button>
            )
          })}

          {/* Direct Messages section */}
          <div className="px-2 pt-4 pb-1.5 flex items-center justify-between">
            <span className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider">Direct Messages</span>
            <button
              className="text-[#9a9b9e] hover:text-white text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-[#222529] transition-colors"
              onClick={() => { setShowDmPicker(true); setDmPickerSearch('') }}
              title="Open a direct message"
            >+</button>
          </div>
          {dmConversations.length > 0 ? (
            dmConversations.map(dm => {
              const avatarValue = getUserAvatar(dm.userId)
              const isColor = avatarValue.startsWith('#')
              const dmHasUnread = channelLatestTs[dm.id] && (
                !readCursors[dm.id] ||
                parseFloat(channelLatestTs[dm.id]) > parseFloat(readCursors[dm.id])
              )
              return (
                <div
                  key={dm.id}
                  className={`group w-full px-2.5 py-1.5 flex items-center gap-2.5 rounded-md transition-all cursor-pointer ${
                    selectedChannel?.id === dm.id && selectedDmUser
                      ? 'bg-[#0D9488] text-white shadow-sm'
                      : 'text-[#E8E8E8] hover:bg-[#222529]'
                  }`}
                  onClick={() => selectDmConversation(dm)}
                >
                  <div className="relative flex-shrink-0">
                    {isColor ? (
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: avatarValue }}
                      >
                        {dm.name.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <img src={avatarValue} alt="" className="w-5 h-5 rounded-md object-cover" />
                    )}
                    <PresenceIndicator userId={dm.userId} size="sm" />
                  </div>
                  <span className={`text-sm truncate flex-1 ${dmHasUnread ? 'font-semibold text-white' : ''}`}>{dm.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{dm.id}]</span></span>
                  {dmHasUnread && !(selectedChannel?.id === dm.id && selectedDmUser) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] flex-shrink-0" />
                  )}
                  <button
                    className="hidden group-hover:block text-[#9a9b9e] hover:text-white text-xs flex-shrink-0 transition-colors"
                    onClick={(e) => closeDmConversation(e, dm.id)}
                    title="Close conversation"
                  >✕</button>
                </div>
              )
            })
          ) : (
            <div className="px-3 py-2 text-[#9a9b9e] text-xs italic">
              No direct messages yet
            </div>
          )}

          {/* Additional Sections */}
          <div className="mt-5 pt-3 border-t border-[#3a3d41]/60 space-y-0.5">
            {/* People */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'people' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('people'); loadPeopleDirectory() }}
            >
              <span className="text-sm">👤</span>
              <span className="text-sm">People</span>
            </button>

            {/* Reminders */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'reminders' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('reminders'); loadReminders() }}
            >
              <span className="text-sm">🔔</span>
              <span className="text-sm">Reminders</span>
            </button>

            {/* User Groups */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'usergroups' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('usergroups'); loadUserGroups() }}
            >
              <span className="text-sm">👥</span>
              <span className="text-sm">User Groups</span>
            </button>

            {/* Scheduled Messages */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'scheduled' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('scheduled'); loadScheduledMessages() }}
            >
              <span className="text-sm">📅</span>
              <span className="text-sm">Scheduled</span>
            </button>

            {/* Files */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'files' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('files'); loadFiles() }}
            >
              <span className="text-sm">📁</span>
              <span className="text-sm">Files</span>
            </button>

            {/* Settings */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'settings' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => { setActiveSidebarSection('settings'); loadCurrentUserProfile(); loadUserIdentity() }}
            >
              <span className="text-sm">⚙️</span>
              <span className="text-sm">Settings</span>
            </button>

            {/* Admin */}
            <button
              className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 rounded-md transition-all ${
                activeSidebarSection === 'admin' ? 'bg-[#0D9488] text-white shadow-sm' : 'text-[#E8E8E8] hover:bg-[#222529]'
              }`}
              onClick={() => setActiveSidebarSection('admin')}
            >
              <span className="text-sm">🛡️</span>
              <span className="text-sm">Admin</span>
            </button>

            {/* Back to Channels */}
            {activeSidebarSection !== 'channels' && (
              <button
                className="w-full px-2.5 py-1.5 text-left flex items-center gap-2.5 text-[#9a9b9e] hover:bg-[#222529] hover:text-white mt-2 pt-2 rounded-md border-t border-[#3a3d41]/60 transition-all"
                onClick={() => setActiveSidebarSection('channels')}
              >
                <span className="text-sm">←</span>
                <span className="text-sm">Back to Channels</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content wrapper */}
      <div className="flex-1 flex">
        {/* Conditional content based on active section */}
        {activeSidebarSection === 'channels' ? (
        <>
        {/* Messages column */}
        <div className={`flex-1 flex flex-col bg-[#1a1d21] ${selectedThread ? 'max-w-[calc(100%-384px)]' : ''}`}>
        {/* Channel header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60 bg-[#1a1d21]">
          <div className="flex items-center">
            {selectedChannel && (
              <>
                <span className="font-semibold text-white tracking-tight">
                  {selectedDmUser ? (
                    // DM header - show user name without # prefix
                    <>{selectedChannel.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedChannel.id}]</span></>
                  ) : (
                    // Channel header - show with # or lock
                    <>{selectedChannel.is_private ? '🔒' : '#'} {selectedChannel.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedChannel.id}]</span></>
                  )}
                </span>
                {!selectedDmUser && (
                  <>
                    {editingTopic ? (
                      <div className="ml-3 flex items-center gap-2">
                        <input
                          type="text"
                          className="px-2.5 py-1 bg-[#222529] border border-[#565856] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 w-64 transition-all"
                          placeholder="Add a topic..."
                          value={topicInput}
                          onChange={e => setTopicInput(e.target.value)}
                          onKeyDown={handleTopicKeyDown}
                          onBlur={saveTopic}
                          autoFocus
                          disabled={topicSaving}
                        />
                        {topicSaving && (
                          <span className="w-4 h-4 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                        )}
                      </div>
                    ) : (
                      <button
                        className="ml-3 text-[#9a9b9e] text-sm truncate max-w-md hover:text-white hover:underline transition-colors group flex items-center gap-1"
                        onClick={startEditingTopic}
                        title="Edit topic"
                      >
                        {selectedChannel.topic || <span className="italic">Add a topic</span>}
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
                      </button>
                    )}
                    {/* Channel Settings Button */}
                    <div className="relative ml-2" ref={channelSettingsRef}>
                      <button
                        className="text-[#9a9b9e] hover:text-white hover:bg-[#222529] w-7 h-7 flex items-center justify-center rounded-md transition-all"
                        onClick={() => setShowChannelSettings(!showChannelSettings)}
                        title="Channel settings"
                      >
                        ⚙️
                      </button>
                      {showChannelSettings && (
                        <div className="absolute left-0 top-full mt-1 w-52 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-50 overflow-hidden p-1">
                          <button
                            className="w-full px-3 py-2 text-left text-white text-sm hover:bg-[#3a3d41] flex items-center gap-2 rounded-md transition-colors"
                            onClick={() => { setShowChannelSettings(false); setPurposeInput(selectedChannel.purpose || ''); setEditingPurpose(true) }}
                          >
                            Set Purpose
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-white text-sm hover:bg-[#3a3d41] flex items-center gap-2 rounded-md transition-colors"
                            onClick={() => { setShowChannelSettings(false); setNewChannelNameInput(selectedChannel.name); setShowRenameChannel(true) }}
                          >
                            Rename Channel
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-white text-sm hover:bg-[#3a3d41] flex items-center gap-2 rounded-md transition-colors"
                            onClick={() => { setShowChannelSettings(false); setShowInviteModal(true) }}
                          >
                            Invite to Channel
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-white text-sm hover:bg-[#3a3d41] flex items-center gap-2 rounded-md transition-colors"
                            onClick={() => { setShowChannelSettings(false); setShowKickModal(true) }}
                          >
                            Remove from Channel
                          </button>
                          <div className="mt-1 pt-1 border-t border-[#3a3d41]">
                            <button
                              className="w-full px-3 py-2 text-left text-red-400 text-sm hover:bg-red-900/20 flex items-center gap-2 rounded-md transition-colors"
                              onClick={() => { setShowChannelSettings(false); setShowArchiveConfirm(true) }}
                            >
                              Archive Channel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Channel members */}
          {!selectedDmUser && selectedChannel && (
            <div className="relative" ref={membersListRef}>
              <button
                className="flex items-center hover:bg-[#222529] rounded-lg px-2 py-1 transition-colors"
                onClick={async () => {
                  if (!showMembersList && selectedChannel) {
                    // Fetch members on open if not loaded
                    if (channelMembers.length === 0) {
                      let apiMembers: string[] = []
                      try {
                        const membersResult = await api.callTool('get_conversation_members', { channel: selectedChannel.id })
                        apiMembers = membersResult?.members || []
                      } catch (e) {
                        console.warn('Failed to load members on click:', e)
                      }
                      // Merge with state members and message authors
                      const stateData = await fetchSlickState()
                      const fallbackIds = resolveChannelMembersFromState(selectedChannel.id, messages, stateData)
                      setChannelMembers([...new Set([...apiMembers, ...fallbackIds])])
                    }
                  }
                  setShowMembersList(!showMembersList)
                }}
              >
                <div className="flex -space-x-2 items-center">
                  {channelMembers.length === 0 && <span className="text-[#9a9b9e] text-sm">👥</span>}
                  {channelMembers.slice(0, 5).map((memberId) => {
                    const avatarValue = getUserAvatar(memberId)
                    const isColor = avatarValue.startsWith('#')
                    return (
                      <div
                        key={memberId}
                        className="w-7 h-7 rounded-md ring-2 ring-[#1a1d21] flex items-center justify-center text-white text-xs font-semibold overflow-hidden"
                        style={{ backgroundColor: isColor ? avatarValue : undefined }}
                      >
                        {isColor ? (
                          getUserName(memberId).charAt(0).toUpperCase()
                        ) : (
                          <img src={avatarValue} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                    )
                  })}
                </div>
                <span className="ml-2 text-[#9a9b9e] text-sm">
                  {channelMembers.length || (selectedChannel?.num_members ?? '')}
                </span>
              </button>

              {/* Members dropdown */}
              {showMembersList && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#3a3d41]/60">
                    <span className="text-white font-semibold text-sm tracking-tight">
                      {channelMembers.length} {channelMembers.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <div className="p-1">
                    {channelMembers.map((memberId) => {
                      const avatarValue = getUserAvatar(memberId)
                      const isColor = avatarValue.startsWith('#')
                      const presence = getUserPresence(memberId)
                      return (
                        <div
                          key={memberId}
                          className="flex items-center gap-3 px-2.5 py-2 hover:bg-[#3a3d41] rounded-md cursor-pointer transition-colors"
                        >
                          <div className="relative flex-shrink-0">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold overflow-hidden"
                              style={{ backgroundColor: isColor ? avatarValue : undefined }}
                            >
                              {isColor ? (
                                getUserName(memberId).charAt(0).toUpperCase()
                              ) : (
                                <img src={avatarValue} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <PresenceIndicator userId={memberId} size="sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">
                              {getUserName(memberId)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{memberId}]</span>
                            </div>
                            <div className="text-[#9a9b9e] text-xs truncate">
                              @{users[memberId]?.name || memberId}
                              <span className="ml-2 text-[10px]">
                                ({presence === 'active' ? '🟢 Active' : presence === 'away' ? '🟡 Away' : '⚪ Offline'})
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leave channel button */}
          {canLeaveChannel && (
            <button
              className="ml-2 px-3 py-1.5 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#222529] rounded-md transition-all"
              onClick={openLeaveConfirm}
              title="Leave channel"
            >
              Leave
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-5" ref={messagesContainerRef}>
          {messagesLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-7 h-7 border-[3px] border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#9a9b9e] gap-1">
              <span className="text-5xl mb-4 opacity-80">💬</span>
              <p className="text-base font-medium text-[#E8E8E8]">No messages yet</p>
              <p className="text-sm">Be the first to send a message.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((message, index) => {
                const currentDateKey = getDateKey(message.ts)
                const prevDateKey = index > 0 ? getDateKey(messages[index - 1].ts) : null
                const showDateSeparator = index === 0 || currentDateKey !== prevDateKey

                const avatarValue = getUserAvatar(message.user)
                const isColor = avatarValue.startsWith('#')

                return (
                  <div key={message.ts}>
                    {showDateSeparator && (
                      <div className="flex items-center gap-4 my-5 first:mt-0">
                        <div className="flex-1 border-t border-[#3a3d41]/60" />
                        <span className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-[#222529]">
                          {formatDateSeparator(message.ts)}
                        </span>
                        <div className="flex-1 border-t border-[#3a3d41]/60" />
                      </div>
                    )}
                    <div className={`flex items-start gap-3 group hover:bg-[#1f2226] -mx-5 px-5 py-2 rounded-lg relative transition-colors ${message.is_ephemeral ? 'border-l-2 border-yellow-500/50 bg-yellow-900/10' : ''}`}>
                    {/* Ephemeral message indicator */}
                    {message.is_ephemeral && (
                      <div className="absolute top-0 right-4 text-xs text-yellow-500/70 italic">
                        Only visible to {message.ephemeral_user === currentUserId ? 'you' : getUserName(message.ephemeral_user || '')}
                      </div>
                    )}
                    {/* Hover action bar - appears on the right */}
                    <div className="absolute right-5 -top-3.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="flex items-center gap-0.5 bg-[#1a1d21] border border-[#3a3d41] rounded-lg shadow-lg p-1">
                        {/* Add reaction button */}
                        <div className="relative" ref={emojiPickerMessageTs === message.ts ? emojiPickerRef : undefined}>
                          <button
                            className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-white transition-colors"
                            onClick={() => setEmojiPickerMessageTs(emojiPickerMessageTs === message.ts ? null : message.ts)}
                            title="Add reaction"
                          >
                            <span className="text-base">😀</span>
                          </button>
                          {/* Emoji picker popup */}
                          {emojiPickerMessageTs === message.ts && (
                            <div className="absolute right-0 top-full mt-2 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-[9999] p-2.5 w-64">
                              <div className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Quick reactions</div>
                              <div className="grid grid-cols-8 gap-1">
                                {['thumbsup', 'heart', 'joy', 'fire', 'eyes', 'rocket', 'tada', 'white_check_mark',
                                  'thinking_face', 'clap', 'raised_hands', 'wave', '-1', 'pray', 'muscle', '100'].map(emoji => (
                                  <button
                                    key={emoji}
                                    className="w-7 h-7 flex items-center justify-center hover:bg-[#3a3d41] rounded-md text-lg transition-colors"
                                    onClick={() => {
                                      if (selectedChannel) {
                                        addReaction(selectedChannel.id, message.ts, emoji)
                                        setEmojiPickerMessageTs(null)
                                      }
                                    }}
                                  >
                                    {getEmoji(emoji)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Reply in thread button */}
                        <button
                          className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-white transition-colors"
                          onClick={() => openThread(message)}
                          title="Reply in thread"
                        >
                          <span className="text-base">💬</span>
                        </button>
                        {/* Star message button */}
                        <button
                          className={`p-1.5 hover:bg-[#2c2d30] rounded-md transition-colors ${message.is_starred ? 'text-yellow-400' : 'text-[#9a9b9e] hover:text-yellow-400'}`}
                          onClick={() => selectedChannel && toggleMessageStar(selectedChannel.id, message.ts)}
                          title={message.is_starred ? 'Unstar message' : 'Star message'}
                        >
                          <span className="text-base">{message.is_starred ? '⭐' : '☆'}</span>
                        </button>
                        {/* Edit button - only for own messages */}
                        {message.user === currentUserId && (
                          <button
                            className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-white transition-colors"
                            onClick={() => startEditMessage(message)}
                            title="Edit message"
                          >
                            <span className="text-base">✏️</span>
                          </button>
                        )}
                        {/* Delete button - only for own messages */}
                        {message.user === currentUserId && (
                          <button
                            className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-red-400 transition-colors"
                            onClick={() => setShowDeleteConfirm(message.ts)}
                            title="Delete message"
                          >
                            <span className="text-base">🗑️</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Delete confirmation popup - fixed position to escape overflow container */}
                    {showDeleteConfirm === message.ts && (
                      <div className="fixed right-8 top-1/2 -translate-y-1/2 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-[9999] p-4 w-72">
                        <p className="text-white text-sm mb-3">Delete this message? This cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                          <button
                            className="px-3 py-1.5 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                            onClick={() => setShowDeleteConfirm(null)}
                          >
                            Cancel
                          </button>
                          <button
                            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors shadow-sm"
                            onClick={() => selectedChannel && deleteMessage(selectedChannel.id, message.ts)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Avatar with presence indicator */}
                    <div className="flex-shrink-0 relative">
                      {isColor ? (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm"
                          style={{ backgroundColor: avatarValue }}
                        >
                          {getUserName(message.user).charAt(0).toUpperCase()}
                        </div>
                      ) : (
                        <img
                          src={avatarValue}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      )}
                      <PresenceIndicator userId={message.user} size="md" />
                    </div>

                    {/* Message content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span
                          className="font-semibold text-white text-[15px] cursor-pointer hover:underline tracking-tight"
                          onClick={() => openUserProfile(message.user)}
                        >
                          {getUserName(message.user)}
                        </span>
                        <span className="text-[#9a9b9e] text-xs">
                          {formatTimestamp(message.ts)}
                        </span>
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{message.ts}]</span>
                      </div>
                      {/* Message text or edit input */}
                      {editingMessageTs === message.ts ? (
                        <div className="mt-1">
                          <textarea
                            className="w-full px-3 py-2 bg-[#222529] border border-[#14B8A6] rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => selectedChannel && handleEditKeyDown(e, selectedChannel.id, message.ts)}
                            rows={2}
                            autoFocus
                          />
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <button
                              className="px-3 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-colors font-medium"
                              onClick={() => selectedChannel && saveEdit(selectedChannel.id, message.ts)}
                            >
                              Save
                            </button>
                            <button
                              className="px-3 py-1.5 text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                            <span className="text-[#9a9b9e] ml-2">Press Enter to save, Escape to cancel</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[#d1d2d3] text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                          {message.text}
                        </div>
                      )}

                      {/* Reactions */}
                      {message.reactions && message.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                          {message.reactions.map(reaction => {
                            const hasReacted = currentUserId ? reaction.users?.includes(currentUserId) : false
                            // Build tooltip with user names who reacted
                            const reactedUserNames = reaction.users?.map(uid => getUserName(uid)).join(', ') || ''
                            return (
                              <Tooltip
                                key={reaction.name}
                                content={
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-base">{getEmoji(reaction.name)}</span>
                                    <span>{reactedUserNames}</span>
                                  </span>
                                }
                              >
                                <button
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                                    hasReacted
                                      ? 'bg-[#134E4A]/40 border border-[#14B8A6]/60 text-white'
                                      : 'bg-[#222529] hover:bg-[#2c2d30] border border-[#3a3d41] hover:border-[#565856]'
                                  }`}
                                  onClick={() => selectedChannel && toggleReaction(selectedChannel.id, message.ts, reaction.name, hasReacted)}
                                >
                                  <span>{getEmoji(reaction.name)}</span>
                                  <span className={`font-medium ${hasReacted ? 'text-[#14B8A6]' : 'text-[#9a9b9e]'}`}>{reaction.count}</span>
                                </button>
                              </Tooltip>
                            )
                          })}
                          <button
                            className="text-[#9a9b9e] hover:text-white text-xs px-2 py-0.5 hover:bg-[#3a3d41] rounded-full transition-colors"
                            onClick={() => selectedChannel && loadMessageReactions(selectedChannel.id, message.ts)}
                            title="View reaction details"
                          >
                            ...
                          </button>
                        </div>
                      )}

                      {/* Thread indicator with avatars */}
                      {((message.reply_count && message.reply_count > 0) || (message.replies && message.replies.length > 0)) && (() => {
                        const replyCount = message.reply_count || (message.replies?.length ?? 0)
                        // Get unique users from replies or reply_users
                        const replyUserIds = message.reply_users?.length
                          ? message.reply_users
                          : [...new Set((message.replies || []).map(r => r.user))]
                        return (
                          <button
                            className="mt-2 flex items-center gap-2 text-[#14B8A6] text-xs hover:bg-[#222529] hover:text-[#2DD4BF] rounded-lg px-2.5 py-1.5 -ml-2.5 transition-all border border-transparent hover:border-[#3a3d41]"
                            onClick={() => openThread(message)}
                          >
                            {/* Reply user avatars */}
                            <div className="flex -space-x-1">
                              {replyUserIds.slice(0, 3).map((userId) => {
                                const avatarVal = getUserAvatar(userId)
                                const isCol = avatarVal.startsWith('#')
                                return (
                                  <div
                                    key={userId}
                                    className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden ring-1 ring-[#1a1d21]"
                                    style={{ backgroundColor: isCol ? avatarVal : undefined }}
                                  >
                                    {isCol ? (
                                      getUserName(userId).charAt(0).toUpperCase()
                                    ) : (
                                      <img src={avatarVal} alt="" className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <span className="font-semibold">
                              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                            </span>
                          </button>
                        )
                      })()}
                    </div>
                  </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message input */}
        <div className="px-5 pb-5 pt-2">
          <div className="bg-[#222529] border border-[#3a3d41] rounded-xl overflow-hidden focus-within:border-[#565856] focus-within:shadow-md transition-all">
            <textarea
              ref={messageTextareaRef}
              className="w-full px-4 py-3 bg-transparent text-white text-[15px] resize-none focus:outline-none placeholder-[#9a9b9e]"
              placeholder={selectedChannel ? `Message ${selectedDmUser ? '' : '#'}${selectedChannel.name}` : 'Select a channel'}
              rows={1}
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!selectedChannel}
            />
            <div className="flex items-center justify-between px-2.5 py-2 border-t border-[#3a3d41]/60">
              <div className="flex gap-0.5">
                <button
                  className="w-8 h-8 flex items-center justify-center text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                  onClick={() => {
                    // Focus the message input for attachment-style action
                    messageTextareaRef.current?.focus()
                  }}
                  title="Add attachment"
                >
                  <span className="text-lg">+</span>
                </button>
                <div className="relative" ref={toolbarEmojiPickerRef}>
                  <button
                    className="w-8 h-8 flex items-center justify-center text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                    onClick={() => setShowToolbarEmojiPicker(!showToolbarEmojiPicker)}
                    title="Add emoji"
                  >
                    <span className="text-base">😊</span>
                  </button>
                  {showToolbarEmojiPicker && (
                    <div className="absolute left-0 bottom-full mb-2 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-[9999] p-2.5 w-64">
                      <div className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Insert emoji</div>
                      <div className="grid grid-cols-8 gap-1">
                        {['thumbsup', 'heart', 'joy', 'fire', 'eyes', 'rocket', 'tada', 'white_check_mark',
                          'thinking_face', 'clap', 'raised_hands', 'wave', '-1', 'pray', 'muscle', '100'].map(emoji => (
                          <button
                            key={emoji}
                            className="w-7 h-7 flex items-center justify-center hover:bg-[#3a3d41] rounded-md text-lg transition-colors"
                            onClick={() => {
                              setMessageInput(prev => prev + getEmoji(emoji))
                              setShowToolbarEmojiPicker(false)
                              messageTextareaRef.current?.focus()
                            }}
                          >
                            {getEmoji(emoji)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="w-8 h-8 flex items-center justify-center text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                  onClick={() => {
                    setMessageInput(prev => prev + '@')
                    messageTextareaRef.current?.focus()
                  }}
                  title="Mention someone"
                >
                  <span className="text-base">@</span>
                </button>
                <button
                  className="w-8 h-8 flex items-center justify-center text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                  onClick={() => setShowEphemeralDialog(true)}
                  title="Send ephemeral message (visible only to one user)"
                >
                  <span className="text-base">👁</span>
                </button>
              </div>
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                  messageInput.trim()
                    ? 'bg-[#007a5a] text-white hover:bg-[#148567] shadow-sm hover:shadow-md'
                    : 'bg-[#3a3b3e] text-[#9a9b9e] cursor-not-allowed'
                }`}
                onClick={sendMessage}
                disabled={!messageInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Thread panel */}
      {selectedThread && (
        <div className="w-96 flex flex-col border-l border-[#3a3d41]/60 bg-[#1a1d21]">
          {/* Thread header */}
          <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60">
            <span className="font-semibold text-white tracking-tight">Thread</span>
            <button
              className="text-[#9a9b9e] hover:text-white hover:bg-[#222529] w-7 h-7 flex items-center justify-center rounded-md transition-all"
              onClick={closeThread}
            >
              ✕
            </button>
          </div>

          {/* Thread messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {threadLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-7 h-7 border-[3px] border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-1">
                {threadMessages.map((msg: Message, index: number) => {
                  const avatarValue = getUserAvatar(msg.user)
                  const isColor = avatarValue.startsWith('#')
                  const isParent = index === 0

                  return (
                    <div
                      key={msg.ts}
                      className={`flex items-start gap-3 group hover:bg-[#1f2226] -mx-5 px-5 py-2 rounded-lg relative transition-colors ${isParent ? 'pb-4 mb-2 border-b border-[#3a3d41]/60' : ''}`}
                    >
                      {/* Hover action bar for thread messages */}
                      <div className="absolute right-5 -top-3.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <div className="flex items-center gap-0.5 bg-[#1a1d21] border border-[#3a3d41] rounded-lg shadow-lg p-1">
                          <div className="relative" ref={emojiPickerMessageTs === msg.ts ? emojiPickerRef : undefined}>
                            <button
                              className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-white transition-colors"
                              onClick={() => setEmojiPickerMessageTs(emojiPickerMessageTs === msg.ts ? null : msg.ts)}
                              title="Add reaction"
                            >
                              <span className="text-base">😀</span>
                            </button>
                            {emojiPickerMessageTs === msg.ts && (
                              <div className="absolute right-0 top-full mt-2 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-[9999] p-2.5 w-64">
                                <div className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Quick reactions</div>
                                <div className="grid grid-cols-8 gap-1">
                                  {['thumbsup', 'heart', 'joy', 'fire', 'eyes', 'rocket', 'tada', 'white_check_mark',
                                    'thinking_face', 'clap', 'raised_hands', '+1', '-1', 'pray', 'muscle', '100'].map(emoji => (
                                    <button
                                      key={emoji}
                                      className="w-7 h-7 flex items-center justify-center hover:bg-[#3a3d41] rounded-md text-lg transition-colors"
                                      onClick={async () => {
                                        if (selectedChannel) {
                                          await addReaction(selectedChannel.id, msg.ts, emoji)
                                          setEmojiPickerMessageTs(null)
                                          // Reload thread to show updated reactions
                                          if (selectedThread) {
                                            await openThread(selectedThread)
                                          }
                                        }
                                      }}
                                    >
                                      {getEmoji(emoji)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Edit button - only for own messages */}
                          {msg.user === currentUserId && (
                            <button
                              className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-white transition-colors"
                              onClick={() => startEditMessage(msg)}
                              title="Edit message"
                            >
                              <span className="text-base">✏️</span>
                            </button>
                          )}
                          {/* Delete button - only for own messages */}
                          {msg.user === currentUserId && (
                            <button
                              className="p-1.5 hover:bg-[#2c2d30] rounded-md text-[#9a9b9e] hover:text-red-400 transition-colors"
                              onClick={() => setShowDeleteConfirm(msg.ts)}
                              title="Delete message"
                            >
                              <span className="text-base">🗑️</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Delete confirmation popup - fixed position to escape overflow container */}
                      {showDeleteConfirm === msg.ts && (
                        <div className="fixed right-8 top-1/2 -translate-y-1/2 bg-[#222529] border border-[#3a3d41] rounded-xl shadow-2xl z-[9999] p-4 w-72">
                          <p className="text-white text-sm mb-3">Delete this message? This cannot be undone.</p>
                          <div className="flex justify-end gap-2">
                            <button
                              className="px-3 py-1.5 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                              onClick={() => setShowDeleteConfirm(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors shadow-sm"
                              onClick={async () => {
                                if (selectedChannel) {
                                  await deleteMessage(selectedChannel.id, msg.ts)
                                  if (selectedThread && msg.ts !== selectedThread.ts) {
                                    await openThread(selectedThread)
                                  }
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {isColor ? (
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm"
                            style={{ backgroundColor: avatarValue }}
                          >
                            {getUserName(msg.user).charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <img
                            src={avatarValue}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        )}
                      </div>

                      {/* Message content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span
                            className="font-semibold text-white text-[15px] cursor-pointer hover:underline tracking-tight"
                            onClick={() => openUserProfile(msg.user)}
                          >
                            {getUserName(msg.user)}
                          </span>
                          <span className="text-[#9a9b9e] text-xs">
                            {formatTimestamp(msg.ts)}
                          </span>
                          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.ts}]</span>
                        </div>
                        {/* Message text or edit input */}
                        {editingMessageTs === msg.ts ? (
                          <div className="mt-1">
                            <textarea
                              className="w-full px-3 py-2 bg-[#222529] border border-[#14B8A6] rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => selectedChannel && handleEditKeyDown(e, selectedChannel.id, msg.ts)}
                              rows={2}
                              autoFocus
                            />
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <button
                                className="px-3 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-colors font-medium"
                                onClick={async () => {
                                  if (selectedChannel) {
                                    await saveEdit(selectedChannel.id, msg.ts)
                                    if (selectedThread) {
                                      await openThread(selectedThread)
                                    }
                                  }
                                }}
                              >
                                Save
                              </button>
                              <button
                                className="px-3 py-1.5 text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                              <span className="text-[#9a9b9e]">Enter to save, Esc to cancel</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[#d1d2d3] text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                            {msg.text}
                          </div>
                        )}

                        {/* Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {msg.reactions.map((reaction: Reaction) => {
                              const hasReacted = currentUserId ? reaction.users?.includes(currentUserId) : false
                              // Build tooltip with user names who reacted
                              const reactedUserNames = reaction.users?.map(uid => getUserName(uid)).join(', ') || ''
                              return (
                                <Tooltip
                                  key={reaction.name}
                                  content={
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-base">{getEmoji(reaction.name)}</span>
                                      <span>{reactedUserNames}</span>
                                    </span>
                                  }
                                >
                                  <button
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                                      hasReacted
                                        ? 'bg-[#134E4A]/40 border border-[#14B8A6]/60 text-white'
                                        : 'bg-[#222529] hover:bg-[#2c2d30] border border-[#3a3d41] hover:border-[#565856]'
                                    }`}
                                    onClick={async () => {
                                      if (selectedChannel) {
                                        await toggleReaction(selectedChannel.id, msg.ts, reaction.name, hasReacted)
                                        // Reload thread to show updated reactions
                                        if (selectedThread) {
                                          await openThread(selectedThread)
                                        }
                                      }
                                    }}
                                  >
                                    <span>{getEmoji(reaction.name)}</span>
                                    <span className={`font-medium ${hasReacted ? 'text-[#14B8A6]' : 'text-[#9a9b9e]'}`}>{reaction.count}</span>
                                  </button>
                                </Tooltip>
                              )
                            })}
                          </div>
                        )}

                        {/* Reply count indicator for parent message */}
                        {isParent && threadMessages.length > 1 && (
                          <div className="mt-2 text-[#9a9b9e] text-xs font-medium">
                            {threadMessages.length - 1} {threadMessages.length - 1 === 1 ? 'reply' : 'replies'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          {/* Thread reply input */}
          <div className="px-5 pb-5 pt-2">
            <div className="bg-[#222529] border border-[#3a3d41] rounded-xl overflow-hidden focus-within:border-[#565856] focus-within:shadow-md transition-all">
              <textarea
                className="w-full px-4 py-3 bg-transparent text-white text-[15px] resize-none focus:outline-none placeholder-[#9a9b9e]"
                placeholder="Reply..."
                rows={1}
                value={threadInput}
                onChange={e => setThreadInput(e.target.value)}
                onKeyDown={handleThreadKeyDown}
              />
              <div className="flex items-center justify-end px-2.5 py-2 border-t border-[#3a3d41]/60">
                <button
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    threadInput.trim()
                      ? 'bg-[#007a5a] text-white hover:bg-[#148567] shadow-sm hover:shadow-md'
                      : 'bg-[#3a3b3e] text-[#9a9b9e] cursor-not-allowed'
                  }`}
                  onClick={sendThreadReply}
                  disabled={!threadInput.trim()}
                >
                  Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
        ) : activeSidebarSection === 'reminders' ? (
          /* Reminders Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">Reminders</span>
              <button
                className="px-3.5 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-medium"
                onClick={() => setShowAddReminder(true)}
              >
                + Add Reminder
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {reminderLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              ) : reminders.length === 0 ? (
                <div className="text-center text-[#9a9b9e] py-12">
                  <div className="text-4xl mb-3 opacity-60">🔔</div>
                  <p>No reminders yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {reminders.map(reminder => (
                    <div key={reminder.id} className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-4 hover:border-[#3a3d41] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className={`text-white ${reminder.complete_ts ? 'line-through opacity-50' : ''}`}>{reminder.text}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reminder.id}]</span></p>
                          <p className="text-[#9a9b9e] text-sm mt-1">{formatDateTime(reminder.time)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            className="px-2.5 py-1 text-xs bg-[#3a3d41] hover:bg-[#4a4d51] text-white rounded-md transition-colors"
                            onClick={() => loadReminderInfo(reminder.id)}
                            title="View reminder details"
                          >
                            Details
                          </button>
                          {!reminder.complete_ts && (
                            <button
                              className="px-2.5 py-1 text-xs bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-colors"
                              onClick={() => completeReminder(reminder.id)}
                            >
                              Complete
                            </button>
                          )}
                          <button
                            className="px-2.5 py-1 text-xs bg-red-600/90 hover:bg-red-600 text-white rounded-md transition-colors"
                            onClick={() => deleteReminder(reminder.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeSidebarSection === 'usergroups' ? (
          /* User Groups Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">User Groups</span>
              <button
                className="px-3.5 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-medium"
                onClick={() => setShowAddUserGroup(true)}
              >
                + Create Group
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {userGroupLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              ) : userGroups.length === 0 ? (
                <div className="text-center text-[#9a9b9e] py-12">
                  <div className="text-4xl mb-3 opacity-60">👥</div>
                  <p>No user groups yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {userGroups.map(group => (
                    <div key={group.id} className={`bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-4 hover:border-[#3a3d41] transition-colors ${group.disabled ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold tracking-tight">{group.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{group.id}]</span></span>
                            <span className="text-[#9a9b9e] text-sm">@{group.handle}</span>
                            {group.disabled && <span className="text-[10px] bg-red-600/30 text-red-300 px-2 py-0.5 rounded-full font-medium">Disabled</span>}
                          </div>
                          {group.description && <p className="text-[#9a9b9e] text-sm mt-1">{group.description}</p>}
                          <p className="text-[#9a9b9e] text-xs mt-2">{group.users?.length || 0} members</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                          <button
                            className="px-2.5 py-1 text-xs bg-[#3a3d41] hover:bg-[#4a4d51] text-white rounded-md transition-colors"
                            onClick={() => loadGroupMembers(group.id)}
                            title="View group members"
                          >
                            View
                          </button>
                          <button
                            className="px-2.5 py-1 text-xs bg-[#3a3d41] hover:bg-[#4a4d51] text-white rounded-md transition-colors"
                            onClick={() => { setShowManageMembers(group); setSelectedGroupMembers(group.users || []) }}
                          >
                            Members
                          </button>
                          <button
                            className="px-2.5 py-1 text-xs bg-[#3a3d41] hover:bg-[#4a4d51] text-white rounded-md transition-colors"
                            onClick={() => setShowEditUserGroup(group)}
                          >
                            Edit
                          </button>
                          <button
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${group.disabled ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white`}
                            onClick={() => toggleUserGroup(group.id, !!group.disabled)}
                          >
                            {group.disabled ? 'Enable' : 'Disable'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeSidebarSection === 'scheduled' ? (
          /* Scheduled Messages Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">Scheduled Messages</span>
              <button
                className="px-3.5 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-medium"
                onClick={() => setShowScheduleMessage(true)}
              >
                + Schedule Message
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {scheduleLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              ) : scheduledMessages.length === 0 ? (
                <div className="text-center text-[#9a9b9e] py-12">
                  <div className="text-4xl mb-3 opacity-60">📅</div>
                  <p>No scheduled messages</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {scheduledMessages.map(msg => (
                    <div key={msg.id} className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-4 hover:border-[#3a3d41] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white">{msg.text}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.id}]</span></p>
                          <div className="flex items-center gap-4 mt-2 text-[#9a9b9e] text-sm">
                            <span>To: #{channels.find(c => c.id === msg.channel_id)?.name || msg.channel_id}</span>
                            <span>Scheduled: {formatDateTime(msg.post_at)}</span>
                          </div>
                        </div>
                        <button
                          className="px-2.5 py-1 text-xs bg-red-600/90 hover:bg-red-600 text-white rounded-md transition-colors flex-shrink-0"
                          onClick={() => deleteScheduledMessage(msg.channel_id, msg.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeSidebarSection === 'files' ? (
          /* Files Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">{selectedFile ? 'File Detail' : 'Files'}</span>
              {!selectedFile && (
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white text-xs rounded-md transition-colors font-medium shadow-sm" onClick={() => { setUploadChannels(selectedChannel?.id || ''); setShowUploadDialog(true) }}>Upload</button>
                  <button className="px-3 py-1.5 bg-[#134E4A] hover:bg-[#0F766E] text-white text-xs rounded-md transition-colors font-medium shadow-sm" onClick={() => setShowRemoteFileDialog(true)}>Add Remote</button>
                  <button className="px-3 py-1.5 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-xs rounded-md transition-colors font-medium shadow-sm" onClick={() => setShowExternalUploadDialog(true)}>External Upload</button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* File Detail View */}
              {selectedFile ? (
                <div>
                  <button className="text-[#14B8A6] hover:text-[#2DD4BF] hover:underline text-sm mb-4 transition-colors" onClick={() => setSelectedFile(null)}>← Back to file list</button>
                  {fileDetailLoading ? (
                    <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" /></div>
                  ) : (
                    <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 space-y-3">
                      <h3 className="text-white font-semibold text-lg tracking-tight">{selectedFile.name || selectedFile.title || 'Untitled'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedFile.id}]</span></h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-[#9a9b9e]">ID:</span> <span className="text-white">{selectedFile.id}</span></div>
                        <div><span className="text-[#9a9b9e]">Type:</span> <span className="text-white">{selectedFile.filetype || 'N/A'}</span></div>
                        <div><span className="text-[#9a9b9e]">Size:</span> <span className="text-white">{selectedFile.size ? `${selectedFile.size} bytes` : 'N/A'}</span></div>
                        <div><span className="text-[#9a9b9e]">User:</span> <span className="text-white">{selectedFile.user ? getUserName(selectedFile.user) : 'N/A'}</span></div>
                        <div><span className="text-[#9a9b9e]">Created:</span> <span className="text-white">{selectedFile.created ? new Date(Number(selectedFile.created) * 1000).toLocaleString() : 'N/A'}</span></div>
                        <div><span className="text-[#9a9b9e]">Updated:</span> <span className="text-white">{selectedFile.updated ? new Date(Number(selectedFile.updated) * 1000).toLocaleString() : 'N/A'}</span></div>
                      </div>
                      {selectedFile.channels && selectedFile.channels.length > 0 && (
                        <div><span className="text-[#9a9b9e] text-sm">Shared to:</span> <span className="text-white text-sm">{selectedFile.channels.map((ch: string) => getChannelName(ch)).join(', ')}</span></div>
                      )}
                      {selectedFile.comments && selectedFile.comments.length > 0 && (
                        <div>
                          <span className="text-[#9a9b9e] text-sm block mb-1">Comments:</span>
                          {selectedFile.comments.map((c: any, i: number) => (
                            <div key={i} className="bg-[#1a1d21] rounded p-2 mb-1 text-sm text-white">{c.comment || c.text || JSON.stringify(c)}</div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button className="px-3.5 py-1.5 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-sm rounded-md transition-colors font-medium shadow-sm" onClick={() => { setShowShareDialog(selectedFile.id); setShareChannelIds('') }}>Share</button>
                        {selectedFile.is_external ? (
                          <button className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors font-medium shadow-sm" onClick={() => handleRemoveRemoteFile(selectedFile.id)}>Remove Remote</button>
                        ) : (
                          <button className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors font-medium shadow-sm" onClick={() => setShowDeleteFileConfirm(selectedFile.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Search */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      className="flex-1 px-3.5 py-2 bg-[#222529] border border-[#3a3d41] rounded-lg text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 placeholder-[#9a9b9e] transition-all"
                      placeholder="Search files..."
                      value={fileSearchQuery}
                      onChange={e => setFileSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchFiles()}
                    />
                    <button className="px-3.5 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-lg transition-colors font-medium shadow-sm" onClick={searchFiles}>Search</button>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <select
                      className="px-2.5 py-1.5 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-xs focus:outline-none focus:border-[#14B8A6]"
                      value={fileFilters.channel_id || ''}
                      onChange={e => setFileFilters(f => ({ ...f, channel_id: e.target.value || undefined }))}
                    >
                      <option value="">All Channels</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                    </select>
                    <select
                      className="px-2.5 py-1.5 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-xs focus:outline-none focus:border-[#14B8A6]"
                      value={fileFilters.user_id || ''}
                      onChange={e => setFileFilters(f => ({ ...f, user_id: e.target.value || undefined }))}
                    >
                      <option value="">All Users</option>
                      {Object.values(users).map(u => <option key={u.id} value={u.id}>{getUserName(u.id)}</option>)}
                    </select>
                    <select
                      className="px-2.5 py-1.5 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-xs focus:outline-none focus:border-[#14B8A6]"
                      value={fileFilters.types || ''}
                      onChange={e => setFileFilters(f => ({ ...f, types: e.target.value || undefined }))}
                    >
                      <option value="">All Types</option>
                      <option value="jpg,jpeg,png,gif,bmp,svg,webp,tiff">Images</option>
                      <option value="text,txt,py,js,ts,html,css,json,xml,yaml,yml,md,sh,rb,java,c,cpp,go,rs">Snippets</option>
                      <option value="pdf">PDFs</option>
                      <option value="doc,docx">Docs</option>
                    </select>
                    <button className="px-3 py-1.5 bg-[#007a5a] hover:bg-[#148567] text-white text-xs rounded-md transition-colors font-medium" onClick={() => loadFiles()}>Apply Filters</button>
                  </div>

                  {/* Search Results */}
                  {fileSearchLoading ? (
                    <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" /></div>
                  ) : fileResults.length > 0 ? (
                    <div className="mb-5">
                      <h4 className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2">Search Results</h4>
                      <div className="space-y-1.5">
                        {fileResults.map(file => (
                          <div key={file.id} className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-[#2a2d31] hover:border-[#3a3d41] transition-all" onClick={() => loadFileDetail(file.id)}>
                            <span className="text-xl">📄</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium text-sm truncate">{file.name || file.title || 'Untitled'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{file.id}]</span></p>
                              <p className="text-[#9a9b9e] text-xs">{file.filetype?.toUpperCase()} {file.user ? '· ' + getUserName(file.user) : ''}</p>
                            </div>
                            <div className="flex gap-1">
                              <button className="px-2.5 py-1 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-xs rounded-md transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setShowShareDialog(file.id); setShareChannelIds('') }}>Share</button>
                              <button className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-xs rounded-md transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setShowDeleteFileConfirm(file.id) }}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : fileSearchQuery ? (
                    <div className="text-center text-[#9a9b9e] py-4 text-sm mb-4">No search results</div>
                  ) : null}

                  {/* File List (from list_files) */}
                  <h4 className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2">All Files</h4>
                  {filesLoading && files.length === 0 ? (
                    <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" /></div>
                  ) : files.length === 0 ? (
                    <div className="text-center text-[#9a9b9e] py-12 text-sm">
                      <div className="text-4xl mb-3 opacity-60">📁</div>
                      <p>No files found. Try adjusting filters or upload a file.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {files.map(file => (
                        <div key={file.id} className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-[#2a2d31] hover:border-[#3a3d41] transition-all" onClick={() => loadFileDetail(file.id)}>
                          <span className="text-xl">📄</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">{file.name || file.title || 'Untitled'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{file.id}]</span></p>
                            <p className="text-[#9a9b9e] text-xs">{file.filetype?.toUpperCase()} {file.size ? `· ${file.size} bytes` : ''} {file.user ? '· ' + getUserName(file.user) : ''}</p>
                          </div>
                          <div className="flex gap-1">
                            <button className="px-2.5 py-1 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-xs rounded-md transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setShowShareDialog(file.id); setShareChannelIds('') }}>Share</button>
                            <button className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-xs rounded-md transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setShowDeleteFileConfirm(file.id) }}>Delete</button>
                          </div>
                        </div>
                      ))}
                      {filesPagination.hasMore && (
                        <button className="w-full py-2 text-[#14B8A6] hover:text-[#2DD4BF] hover:underline text-sm transition-colors" onClick={() => loadFiles(filesPagination.cursor)} disabled={filesLoading}>
                          {filesLoading ? 'Loading...' : 'Load More'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Upload File Dialog */}
            {showUploadDialog && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl p-6 w-[480px] max-h-[80vh] overflow-y-auto">
                  <h3 className="text-white font-bold text-lg mb-4">Upload File</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Title</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Filename</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={uploadFilename} onChange={e => setUploadFilename(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Content</label>
                      <textarea className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 h-24 resize-none transition-all" value={uploadContent} onChange={e => setUploadContent(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">File Type</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" placeholder="e.g. text, python, javascript" value={uploadFiletype} onChange={e => setUploadFiletype(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Channel(s)</label>
                      <select className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={uploadChannels} onChange={e => setUploadChannels(e.target.value)}>
                        <option value="">Select channel</option>
                        {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Initial Comment (optional)</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={uploadComment} onChange={e => setUploadComment(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => setShowUploadDialog(false)}>Cancel</button>
                    <button className="px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={handleUploadFile} disabled={filesLoading}>Upload</button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Remote File Dialog */}
            {showRemoteFileDialog && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl p-6 w-[480px]">
                  <h3 className="text-white font-bold text-lg mb-4">Add Remote File</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">External ID *</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={remoteExternalId} onChange={e => setRemoteExternalId(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">External URL *</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={remoteExternalUrl} onChange={e => setRemoteExternalUrl(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Title *</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={remoteTitle} onChange={e => setRemoteTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">File Type (optional)</label>
                      <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={remoteFiletype} onChange={e => setRemoteFiletype(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[#9a9b9e] text-xs block mb-1">Indexable Content (optional)</label>
                      <textarea className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 h-20 resize-none transition-all" value={remoteIndexContent} onChange={e => setRemoteIndexContent(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => setShowRemoteFileDialog(false)}>Cancel</button>
                    <button className="px-4 py-2 bg-[#134E4A] hover:bg-[#0F766E] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={handleAddRemoteFile} disabled={filesLoading || !remoteExternalId || !remoteExternalUrl || !remoteTitle}>Add Remote File</button>
                  </div>
                </div>
              </div>
            )}

            {/* External Upload Dialog */}
            {showExternalUploadDialog && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl p-6 w-[480px]">
                  <h3 className="text-white font-bold text-lg mb-4">External Upload</h3>
                  {!extUploadUrl ? (
                    <div className="space-y-3">
                      <p className="text-[#9a9b9e] text-xs">Step 1: Get an upload URL</p>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Filename *</label>
                        <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadFilename} onChange={e => setExtUploadFilename(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Length (bytes) *</label>
                        <input type="number" className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadLength} onChange={e => setExtUploadLength(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Alt Text (optional)</label>
                        <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadAltTxt} onChange={e => setExtUploadAltTxt(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Snippet Type (optional)</label>
                        <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadSnippetType} onChange={e => setExtUploadSnippetType(e.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => setShowExternalUploadDialog(false)}>Cancel</button>
                        <button className="px-4 py-2 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={handleGetExternalUploadUrl} disabled={filesLoading || !extUploadFilename || !extUploadLength}>Get Upload URL</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[#9a9b9e] text-xs">Step 2: Finalize upload</p>
                      <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-lg p-3 text-xs">
                        <p className="text-[#9a9b9e]">Upload URL:</p>
                        <p className="text-[#14B8A6] break-all">{extUploadUrl}</p>
                        <p className="text-[#9a9b9e] mt-2">File ID:</p>
                        <p className="text-white">{extUploadFileId}</p>
                      </div>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Channel (optional)</label>
                        <select className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadChannel} onChange={e => setExtUploadChannel(e.target.value)}>
                          <option value="">No channel</option>
                          {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[#9a9b9e] text-xs block mb-1">Initial Comment (optional)</label>
                        <input className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={extUploadComment} onChange={e => setExtUploadComment(e.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => { setShowExternalUploadDialog(false); setExtUploadUrl(null); setExtUploadFileId(null) }}>Cancel</button>
                        <button className="px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={handleFinishExternalUpload} disabled={filesLoading}>Finish Upload</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Share File Dialog */}
            {showShareDialog && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl p-6 w-[400px]">
                  <h3 className="text-white font-bold text-lg mb-4">Share File</h3>
                  <div>
                    <label className="text-[#9a9b9e] text-xs block mb-1">Select Channel(s)</label>
                    <select className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all" value={shareChannelIds} onChange={e => setShareChannelIds(e.target.value)}>
                      <option value="">Select channel</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => setShowShareDialog(null)}>Cancel</button>
                    <button className="px-4 py-2 bg-[#0D9488] hover:bg-[#14B8A6] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={() => handleShareFile(showShareDialog)} disabled={filesLoading || !shareChannelIds}>Share</button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete File Confirmation */}
            {showDeleteFileConfirm && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl p-6 w-[400px]">
                  <h3 className="text-white font-bold text-lg mb-2">Delete File</h3>
                  <p className="text-[#9a9b9e] text-sm mb-4">Are you sure you want to delete this file? This action cannot be undone.</p>
                  <div className="flex justify-end gap-2">
                    <button className="px-4 py-2 bg-[#3a3d41] text-white text-sm rounded-md hover:bg-[#4a4d51] transition-colors font-medium" onClick={() => setShowDeleteFileConfirm(null)}>Cancel</button>
                    <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50" onClick={() => handleDeleteFile(showDeleteFileConfirm)} disabled={filesLoading}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeSidebarSection === 'settings' ? (
          /* Settings Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">User Settings</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Status Message */}
              {userSettingsMessage && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${userSettingsMessage.type === 'success' ? 'bg-green-600/15 text-green-300 border border-green-600/30' : 'bg-red-600/15 text-red-300 border border-red-600/30'}`}>
                  {userSettingsMessage.text}
                </div>
              )}

              {/* Identity / Team */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Identity</h3>
                {userIdentity ? (
                  <div className="space-y-1 text-sm">
                    {userIdentity.user_name && (
                      <div><span className="text-[#9a9b9e]">User:</span> <span className="text-white">{userIdentity.user_name}</span></div>
                    )}
                    {userIdentity.team_name && (
                      <div><span className="text-[#9a9b9e]">Team:</span> <span className="text-white">{userIdentity.team_name}</span></div>
                    )}
                    {userIdentity.team_id && (
                      <div><span className="text-[#9a9b9e]">Team ID:</span> <span className="text-[#9a9b9e]">{userIdentity.team_id}</span></div>
                    )}
                  </div>
                ) : (
                  <button
                    className="px-4 py-2 bg-[#3a3d41] hover:bg-[#4a4d51] text-white text-sm rounded-md transition-colors font-medium"
                    onClick={loadUserIdentity}
                  >
                    Load Identity
                  </button>
                )}
              </div>

              {/* My Reactions */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">My Reactions</h3>
                <button
                  className="px-4 py-2 bg-[#3a3d41] hover:bg-[#4a4d51] text-white text-sm rounded-md transition-colors font-medium disabled:opacity-50"
                  onClick={loadUserReactions}
                  disabled={userReactionsLoading}
                >
                  {userReactionsLoading ? 'Loading...' : 'View My Reactions'}
                </button>
              </div>

              {/* Presence */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Presence Status</h3>
                <div className="flex gap-2">
                  <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${currentPresence === 'active' ? 'bg-green-600 text-white shadow-sm' : 'bg-[#3a3d41] text-[#9a9b9e] hover:bg-[#4a4d51] hover:text-white'}`}
                    onClick={() => setUserPresenceStatus('active')}
                    disabled={userSettingsLoading}
                  >
                    Active
                  </button>
                  <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${currentPresence === 'away' ? 'bg-yellow-600 text-white shadow-sm' : 'bg-[#3a3d41] text-[#9a9b9e] hover:bg-[#4a4d51] hover:text-white'}`}
                    onClick={() => setUserPresenceStatus('away')}
                    disabled={userSettingsLoading}
                  >
                    Away
                  </button>
                </div>
              </div>

              {/* Photo */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Profile Photo</h3>
                <div className="space-y-3">
                  {currentUserId && (users[currentUserId]?.profile?.image_72 || users[currentUserId]?.profile?.image) && (
                    <div className="flex items-center gap-3">
                      <img
                        src={users[currentUserId]?.profile?.image_72 || users[currentUserId]?.profile?.image}
                        alt="Current profile photo"
                        className="w-16 h-16 rounded-xl object-cover shadow-sm"
                      />
                      <span className="text-[#9a9b9e] text-sm">Current photo</span>
                    </div>
                  )}
                  <input
                    key={photoInputKey}

                    type="file"
                    accept="image/*"
                    className="w-full text-sm text-[#9a9b9e] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#3a3d41] file:text-white file:cursor-pointer hover:file:bg-[#4a4d51] file:transition-colors"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserPhotoFile(e.target.files?.[0] || null)}
                  />
                  {userPhotoFile && (
                    <p className="text-[#9a9b9e] text-sm">Selected: {userPhotoFile.name}</p>
                  )}
                  <button
                    className="w-full px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:shadow-none"
                    onClick={updateUserPhoto}
                    disabled={userSettingsLoading || !userPhotoFile}
                  >
                    {userSettingsLoading ? 'Uploading...' : 'Upload Photo'}
                  </button>
                  {(() => {
                    const hasPhoto = currentUserId && (users[currentUserId]?.profile?.image_72 || users[currentUserId]?.profile?.image)
                    return <button
                      className="w-full px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-md transition-all font-medium disabled:opacity-50"
                      onClick={deleteUserPhoto}
                      disabled={userSettingsLoading || !hasPhoto}
                    >
                      Remove Photo
                    </button>
                  })()}
                </div>
              </div>

              {/* Profile */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Edit Profile</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Display Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="Display name"
                      value={userProfileEdit.display_name || ''}
                      onChange={e => setUserProfileEdit({ ...userProfileEdit, display_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Real Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="Real name"
                      value={userProfileEdit.real_name || ''}
                      onChange={e => setUserProfileEdit({ ...userProfileEdit, real_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Title</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="Job title"
                      value={userProfileEdit.title || ''}
                      onChange={e => setUserProfileEdit({ ...userProfileEdit, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Phone</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="Phone number"
                      value={userProfileEdit.phone || ''}
                      onChange={e => setUserProfileEdit({ ...userProfileEdit, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Status</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-16 px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                        placeholder="Emoji"
                        value={userProfileEdit.status_emoji || ''}
                        onChange={e => setUserProfileEdit({ ...userProfileEdit, status_emoji: e.target.value })}
                      />
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                        placeholder="Status text"
                        value={userProfileEdit.status_text || ''}
                        onChange={e => setUserProfileEdit({ ...userProfileEdit, status_text: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    className="w-full px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:shadow-none"
                    onClick={updateUserProfile}
                    disabled={userSettingsLoading}
                  >
                    {userSettingsLoading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeSidebarSection === 'people' ? (
          /* People Directory Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">People</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Search by Name or Email */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Search People</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                    placeholder="Search by name or email..."
                    value={peopleEmailSearch}
                    onChange={e => { setPeopleEmailSearch(e.target.value); setPeopleEmailSearchResult(null); setPeopleEmailSearchError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') searchPeople() }}
                  />
                  <button
                    className="px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:shadow-none"
                    onClick={searchPeople}
                    disabled={peopleLoading || !peopleEmailSearch.trim()}
                  >
                    Search
                  </button>
                </div>
                {peopleEmailSearchError && (
                  <p className="text-red-400 text-sm mt-2">{peopleEmailSearchError}</p>
                )}
                {peopleEmailSearchResult && (
                  <button
                    className="mt-3 w-full flex items-center gap-3 p-3 rounded-lg bg-[#1a1d21] hover:bg-[#2c2d30] border border-[#3a3d41]/40 hover:border-[#3a3d41] transition-all text-left"
                    onClick={() => openUserProfile(peopleEmailSearchResult.id)}
                  >
                    <div className="relative w-10 h-10 flex-shrink-0">
                      {(() => {
                        const av = peopleEmailSearchResult.profile?.image_72 || peopleEmailSearchResult.profile?.image_48
                        return av ? (
                          <img src={av} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#134E4A] flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                            {(peopleEmailSearchResult.real_name || peopleEmailSearchResult.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )
                      })()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-medium text-sm truncate">
                        {peopleEmailSearchResult.profile?.real_name || peopleEmailSearchResult.real_name || peopleEmailSearchResult.name}
                      </div>
                      <div className="text-[#9a9b9e] text-xs truncate">
                        {peopleEmailSearchResult.profile?.title && <span>{peopleEmailSearchResult.profile.title} · </span>}
                        @{peopleEmailSearchResult.name}
                      </div>
                    </div>
                  </button>
                )}
                {/* Name search results from local user state */}
                {peopleEmailSearch.trim() && !peopleEmailSearch.includes('@') && (() => {
                  const q = peopleEmailSearch.toLowerCase()
                  const nameResults = Object.values(users).filter(u =>
                    u.name?.toLowerCase().includes(q) ||
                    u.real_name?.toLowerCase().includes(q) ||
                    u.profile?.display_name?.toLowerCase().includes(q)
                  )
                  return nameResults.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {nameResults.map(u => {
                        const av = u.profile?.image_72 || u.profile?.image_48
                        return (
                          <button
                            key={u.id}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-[#1a1d21] hover:bg-[#2c2d30] border border-[#3a3d41]/40 hover:border-[#3a3d41] transition-all text-left"
                            onClick={() => openUserProfile(u.id)}
                          >
                            <div className="relative w-10 h-10 flex-shrink-0">
                              {av ? (
                                <img src={av} alt="" className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#134E4A] flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                                  {(u.real_name || u.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-white font-medium text-sm truncate">
                                {u.profile?.display_name || u.real_name || u.name}
                              </div>
                              <div className="text-[#9a9b9e] text-xs truncate">@{u.name}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-[#9a9b9e] text-sm mt-2">No users found matching "{peopleEmailSearch}"</p>
                  )
                })()}
              </div>

              {/* User List */}
              <div className="bg-[#222529] border border-[#3a3d41] rounded-lg p-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">All Members</h3>
                {peopleLoading && peopleList.length === 0 ? (
                  <div className="text-[#9a9b9e] text-sm text-center py-4">Loading members...</div>
                ) : peopleList.length === 0 ? (
                  <div className="text-[#9a9b9e] text-sm text-center py-4">No members found</div>
                ) : (
                  <div className="space-y-1">
                    {peopleList.map((member: any) => {
                      const avatar = member.profile?.image_72 || member.profile?.image_48
                      return (
                        <button
                          key={member.id}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#1a1d21] transition-colors text-left"
                          onClick={() => openUserProfile(member.id)}
                        >
                          <div className="relative w-9 h-9 flex-shrink-0">
                            {avatar ? (
                              <img src={avatar} alt="" className="w-9 h-9 rounded-lg object-cover" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-[#134E4A] flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                                {(member.real_name || member.name || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm font-medium truncate">
                                {member.profile?.real_name || member.real_name || member.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{member.id}]</span>
                              </span>
                              {member.is_admin && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-600/20 text-yellow-300 border border-yellow-600/40">Admin</span>
                              )}
                              {member.is_bot && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-600/40">Bot</span>
                              )}
                            </div>
                            <div className="text-[#9a9b9e] text-xs truncate">
                              {member.profile?.title && <span>{member.profile.title} · </span>}
                              {member.profile?.status_emoji && <span>{getEmoji(member.profile.status_emoji)} </span>}
                              {member.profile?.status_text && <span>{member.profile.status_text} · </span>}
                              @{member.name}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                    {peopleHasMore && (
                      <button
                        className="w-full py-2 text-[#14B8A6] hover:text-white text-sm transition-colors"
                        onClick={() => loadPeopleDirectory(peopleCursor)}
                        disabled={peopleLoading}
                      >
                        {peopleLoading ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeSidebarSection === 'admin' ? (
          /* Admin Panel */
          <div className="flex-1 flex flex-col bg-[#1a1d21]">
            <div className="h-14 flex items-center px-5 border-b border-[#3a3d41]/60">
              <span className="font-semibold text-white tracking-tight">Admin</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Invite User */}
              <div className="bg-[#222529] border border-[#3a3d41]/60 rounded-xl p-5 mb-4">
                <h3 className="text-white font-semibold mb-4 tracking-tight">Invite User</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Email *</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="user@example.com"
                      value={adminInviteEmail}
                      onChange={e => setAdminInviteEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9a9b9e] text-sm mb-1">Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#1a1d21] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                      placeholder="John Doe"
                      value={adminInviteName}
                      onChange={e => setAdminInviteName(e.target.value)}
                    />
                  </div>
                  <button
                    className="w-full px-4 py-2 bg-[#007a5a] hover:bg-[#148567] text-white text-sm rounded-md transition-all shadow-sm hover:shadow-md font-semibold disabled:opacity-50 disabled:shadow-none"
                    onClick={inviteAdminUser}
                    disabled={adminInviteLoading || !adminInviteEmail.trim()}
                  >
                    {adminInviteLoading ? 'Inviting...' : 'Invite User'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[500px] max-w-[90vw]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Create a channel</h2>
              <button
                className="text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] p-1 rounded transition-colors"
                onClick={closeCreateChannelModal}
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 space-y-4">
              <p className="text-[#9a9b9e] text-sm">
                Channels are where your team communicates. They're best when organized around a topic — #marketing, for example.
              </p>

              {/* Error message */}
              {createChannelError && (
                <div className="bg-red-900/20 border border-red-500/40 text-red-300 px-3.5 py-2.5 rounded-lg text-sm">
                  {createChannelError}
                </div>
              )}

              {/* Channel name input */}
              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  Name
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9b9e]">
                    {newChannelIsPrivate ? '🔒' : '#'}
                  </span>
                  <input
                    type="text"
                    className="w-full px-3 pl-8 py-2 bg-[#222529] border border-[#3a3d41] rounded-lg text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 placeholder-[#9a9b9e] transition-all"
                    placeholder="e.g. plan-budget"
                    value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    onKeyDown={handleCreateChannelKeyDown}
                    autoFocus
                  />
                </div>
                <p className="text-[#9a9b9e] text-xs mt-1">
                  Channel names can't contain spaces or special characters.
                </p>
              </div>

              {/* Description input */}
              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  Description <span className="text-[#9a9b9e] font-normal">(optional)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-lg text-white text-sm resize-none focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 placeholder-[#9a9b9e] transition-all"
                  placeholder="What's this channel about?"
                  rows={2}
                  value={newChannelDescription}
                  onChange={e => setNewChannelDescription(e.target.value)}
                />
              </div>

              {/* Private channel toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-semibold">Make private</div>
                  <div className="text-[#9a9b9e] text-xs mt-0.5 leading-relaxed">
                    When a channel is set to private, it can only be viewed or joined by invitation.
                  </div>
                </div>
                <button
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    newChannelIsPrivate ? 'bg-[#007a5a]' : 'bg-[#3a3d41]'
                  }`}
                  onClick={() => setNewChannelIsPrivate(!newChannelIsPrivate)}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                      newChannelIsPrivate ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#3a3d41]/60">
              <button
                className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                onClick={closeCreateChannelModal}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                  newChannelName.trim() && !createChannelLoading
                    ? 'bg-[#007a5a] text-white hover:bg-[#148567] shadow-sm hover:shadow-md'
                    : 'bg-[#3a3b3e] text-[#9a9b9e] cursor-not-allowed'
                }`}
                onClick={createChannel}
                disabled={!newChannelName.trim() || createChannelLoading}
              >
                {createChannelLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Channel Confirmation Modal */}
      {showLeaveConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Leave #{selectedChannel.name}?</h2>
              <button
                className="text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] p-1 rounded transition-colors"
                onClick={closeLeaveConfirm}
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4">
              <p className="text-[#9a9b9e] text-sm">
                You will no longer receive messages from this channel. You can rejoin at any time.
              </p>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#3a3d41]/60">
              <button
                className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors"
                onClick={closeLeaveConfirm}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                  leaveLoading
                    ? 'bg-red-600/50 text-white/70 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md'
                }`}
                onClick={leaveChannel}
                disabled={leaveLoading}
              >
                {leaveLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Leaving...
                  </span>
                ) : (
                  'Leave Channel'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Reminder Modal */}
      {showAddReminder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Add Reminder</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowAddReminder(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Reminder Text</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  placeholder="What do you need to remember?"
                  value={newReminderText}
                  onChange={e => setNewReminderText(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">When</label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  value={newReminderTime}
                  onChange={e => setNewReminderTime(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowAddReminder(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={addReminder}
                  disabled={reminderLoading || !newReminderText.trim() || !newReminderTime}
                >
                  {reminderLoading ? 'Adding...' : 'Add Reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Group Modal */}
      {showAddUserGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Create User Group</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowAddUserGroup(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Name *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  placeholder="Engineering Team"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Handle * (mention name)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  placeholder="engineering"
                  value={newGroupHandle}
                  onChange={e => setNewGroupHandle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 resize-none transition-all"
                  rows={2}
                  placeholder="A short description of this group"
                  value={newGroupDescription}
                  onChange={e => setNewGroupDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowAddUserGroup(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={createUserGroup}
                  disabled={userGroupLoading || !newGroupName.trim() || !newGroupHandle.trim()}
                >
                  {userGroupLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Group Modal */}
      {showEditUserGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Edit User Group</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowEditUserGroup(null)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  defaultValue={showEditUserGroup.name}
                  id="edit-group-name"
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Handle</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  defaultValue={showEditUserGroup.handle}
                  id="edit-group-handle"
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 resize-none transition-all"
                  rows={2}
                  defaultValue={showEditUserGroup.description}
                  id="edit-group-description"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowEditUserGroup(null)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={() => {
                    const name = (document.getElementById('edit-group-name') as HTMLInputElement)?.value
                    const handle = (document.getElementById('edit-group-handle') as HTMLInputElement)?.value
                    const description = (document.getElementById('edit-group-description') as HTMLTextAreaElement)?.value
                    updateUserGroup(showEditUserGroup.id, { name, handle, description })
                  }}
                  disabled={userGroupLoading}
                >
                  {userGroupLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageMembers && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[450px] max-w-[90vw] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Manage Members: {showManageMembers.name}</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => { setShowManageMembers(null); setSelectedGroupMembers([]) }}>✕</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <label className="block text-[#9a9b9e] text-sm mb-2">Select members ({selectedGroupMembers.length} selected)</label>
              <div className="space-y-1 max-h-64 overflow-y-auto border border-[#3a3d41] rounded-lg p-2 bg-[#1a1d21]">
                {Object.keys(users).length === 0 ? (
                  <div className="text-[#9a9b9e] text-sm text-center py-4">No users available</div>
                ) : (
                  Object.entries(users).map(([userId, user]) => (
                    <label
                      key={userId}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-[#3a3d41] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-[#565856] bg-[#222529] text-[#007a5a] focus:ring-[#007a5a]"
                        checked={selectedGroupMembers.includes(userId)}
                        onChange={() => toggleGroupMember(userId)}
                      />
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-7 h-7 rounded-md bg-[#134E4A] flex items-center justify-center text-white text-xs font-semibold">
                          {(user.profile?.display_name || user.name || userId).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white text-sm">{user.profile?.display_name || user.name || userId}</span>
                        <span className="text-[#9a9b9e] text-xs">({userId})</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#3a3d41]/60">
              <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => { setShowManageMembers(null); setSelectedGroupMembers([]) }}>Cancel</button>
              <button
                className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                onClick={() => updateUserGroupMembers(showManageMembers.id)}
                disabled={userGroupLoading}
              >
                {userGroupLoading ? 'Updating...' : 'Update Members'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Message Modal */}
      {showScheduleMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[450px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Schedule Message</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowScheduleMessage(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Channel</label>
                <select
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  value={scheduleChannel}
                  onChange={e => setScheduleChannel(e.target.value)}
                >
                  <option value="">Select a channel</option>
                  {channels.map(ch => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Message</label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 resize-none transition-all"
                  rows={3}
                  placeholder="Your message..."
                  value={scheduleText}
                  onChange={e => setScheduleText(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Send At</label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowScheduleMessage(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={scheduleMessage}
                  disabled={scheduleLoading || !scheduleChannel || !scheduleText.trim() || !scheduleTime}
                >
                  {scheduleLoading ? 'Scheduling...' : 'Schedule Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Channel Modal */}
      {showRenameChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Rename Channel</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowRenameChannel(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">New Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  value={newChannelNameInput}
                  onChange={e => setNewChannelNameInput(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowRenameChannel(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={renameChannel}
                  disabled={channelSettingsLoading || !newChannelNameInput.trim()}
                >
                  {channelSettingsLoading ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Channel Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Archive Channel</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowArchiveConfirm(false)}>✕</button>
            </div>
            <div className="p-6">
              <p className="text-[#9a9b9e] mb-4">
                Are you sure you want to archive #{selectedChannel?.name}? This will hide it from the channel list.
              </p>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowArchiveConfirm(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={archiveChannel}
                  disabled={channelSettingsLoading}
                >
                  {channelSettingsLoading ? 'Archiving...' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite to Channel Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Invite to #{selectedChannel?.name}</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => { setShowInviteModal(false); setSelectedInviteUsers([]) }}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-2">Select users to invite {selectedInviteUsers.length > 0 && `(${selectedInviteUsers.length} selected)`}</label>
                <div className="max-h-60 overflow-y-auto space-y-1 bg-[#1a1d21] border border-[#3a3d41] rounded-lg p-2">
                  {Object.entries(users)
                    .filter(([userId]) => !channelMembers.includes(userId))
                    .map(([userId, user]) => {
                      const avatarValue = getUserAvatar(userId)
                      const isColor = avatarValue.startsWith('#')
                      const isSelected = selectedInviteUsers.includes(userId)
                      return (
                        <div
                          key={userId}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all ${
                            isSelected ? 'bg-green-600/20 border border-green-500/50' : 'border border-transparent hover:bg-[#3a3d41]'
                          }`}
                          onClick={() => toggleInviteUser(userId)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInviteUser(userId)}
                            className="w-4 h-4 accent-green-500"
                          />
                          <div className="relative flex-shrink-0">
                            {isColor ? (
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-semibold"
                                style={{ backgroundColor: avatarValue }}
                              >
                                {getUserName(userId).charAt(0).toUpperCase()}
                              </div>
                            ) : (
                              <img src={avatarValue} alt="" className="w-8 h-8 rounded-md object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">{getUserName(userId)}</div>
                            <div className="text-[#9a9b9e] text-xs truncate">@{user?.name || userId}</div>
                          </div>
                        </div>
                      )
                    })}
                  {Object.keys(users).filter(userId => !channelMembers.includes(userId)).length === 0 && (
                    <div className="text-[#9a9b9e] text-sm text-center py-4">All users are already in this channel</div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => { setShowInviteModal(false); setSelectedInviteUsers([]) }}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={inviteToChannel}
                  disabled={channelSettingsLoading || selectedInviteUsers.length === 0}
                >
                  {channelSettingsLoading ? 'Inviting...' : `Invite${selectedInviteUsers.length > 0 ? ` (${selectedInviteUsers.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kick from Channel Modal */}
      {showKickModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Remove from #{selectedChannel?.name}</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => { setShowKickModal(false); setSelectedKickUser(null) }}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-2">Select member to remove</label>
                <div className="max-h-60 overflow-y-auto space-y-1 bg-[#1a1d21] border border-[#3a3d41] rounded-lg p-2">
                  {channelMembers
                    .filter(memberId => memberId !== currentUserId)
                    .map(memberId => {
                      const user = users[memberId]
                      const avatarValue = getUserAvatar(memberId)
                      const isColor = avatarValue.startsWith('#')
                      return (
                        <div
                          key={memberId}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all ${
                            selectedKickUser === memberId ? 'bg-red-600/20 border border-red-500/50' : 'border border-transparent hover:bg-[#3a3d41]'
                          }`}
                          onClick={() => setSelectedKickUser(selectedKickUser === memberId ? null : memberId)}
                        >
                          <div className="relative flex-shrink-0">
                            {isColor ? (
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-semibold"
                                style={{ backgroundColor: avatarValue }}
                              >
                                {getUserName(memberId).charAt(0).toUpperCase()}
                              </div>
                            ) : (
                              <img src={avatarValue} alt="" className="w-8 h-8 rounded-md object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">{getUserName(memberId)}</div>
                            <div className="text-[#9a9b9e] text-xs truncate">@{user?.name || memberId}</div>
                          </div>
                          {selectedKickUser === memberId && (
                            <span className="text-red-400 text-xs font-medium">Selected</span>
                          )}
                        </div>
                      )
                    })}
                  {channelMembers.filter(m => m !== currentUserId).length === 0 && (
                    <div className="text-[#9a9b9e] text-sm text-center py-4">No other members in this channel</div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => { setShowKickModal(false); setSelectedKickUser(null) }}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={kickFromChannel}
                  disabled={channelSettingsLoading || !selectedKickUser}
                >
                  {channelSettingsLoading ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Browse Channels Modal */}
      {showBrowseChannels && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[520px] max-w-[90vw] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Browse Channels</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowBrowseChannels(false)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {browseChannelsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              ) : browseChannels.length === 0 ? (
                <div className="text-[#9a9b9e] text-sm text-center py-8">No channels found</div>
              ) : (
                <div className="space-y-1">
                  {browseChannels.map(ch => {
                    const isJoined = channels.some(c => c.id === ch.id)
                    return (
                      <div key={ch.id} className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-[#222529] transition-colors">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">{ch.is_private ? '🔒' : '#'} {ch.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{ch.id}]</span></span>
                            {ch.num_members != null && (
                              <span className="text-[#9a9b9e] text-xs">{ch.num_members} members</span>
                            )}
                          </div>
                          {ch.topic && <div className="text-[#9a9b9e] text-xs mt-0.5 truncate">{ch.topic}</div>}
                        </div>
                        {isJoined ? (
                          <span className="text-[#9a9b9e] text-xs px-3 py-1">Joined</span>
                        ) : (
                          <button
                            className="px-3 py-1 bg-[#007a5a] hover:bg-[#148567] text-white text-xs rounded-md transition-all shadow-sm hover:shadow-md font-medium disabled:opacity-50 disabled:shadow-none"
                            onClick={() => joinChannel(ch)}
                            disabled={joiningChannel === ch.id}
                          >
                            {joiningChannel === ch.id ? 'Joining...' : 'Join'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DM User Picker Modal */}
      {showDmPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">New Direct Message</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowDmPicker(false)}>✕</button>
            </div>
            <div className="px-4 py-3 border-b border-[#3a3d41]">
              <input
                type="text"
                className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm placeholder-[#9a9b9e] focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                placeholder="Search users..."
                value={dmPickerSearch}
                onChange={e => setDmPickerSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {openingDm && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#14B8A6]/20 border-t-[#14B8A6] rounded-full animate-spin" />
                </div>
              )}
              {!openingDm && Object.values(users)
                .filter(u => {
                  if (!dmPickerSearch) return true
                  const q = dmPickerSearch.toLowerCase()
                  return (u.name?.toLowerCase().includes(q) || u.real_name?.toLowerCase().includes(q) || u.profile?.display_name?.toLowerCase().includes(q))
                })
                .map(u => {
                  const avatarValue = getUserAvatar(u.id)
                  const isColor = avatarValue.startsWith('#')
                  return (
                    <button
                      key={u.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#222529] text-left transition-colors"
                      onClick={() => openDmWithUser(u.id)}
                    >
                      <div className="relative flex-shrink-0">
                        {isColor ? (
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
                            style={{ backgroundColor: avatarValue }}
                          >
                            {(u.profile?.display_name || u.real_name || u.name || '?').charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <img src={avatarValue} alt="" className="w-9 h-9 rounded-lg object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">
                          {u.profile?.display_name || u.real_name || u.name}
                          {u.id === currentUserId && <span className="text-[#9a9b9e] ml-1">(you)</span>}
                          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{u.id}]</span>
                        </div>
                        <div className="text-[#9a9b9e] text-xs truncate">@{u.name}</div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {(profileModalUser || profileModalLoading) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setProfileModalUser(null); setProfileModalLoading(false) }}>
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Profile</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => { setProfileModalUser(null); setProfileModalLoading(false) }}>✕</button>
            </div>
            {profileModalLoading ? (
              <div className="p-6 text-center text-[#9a9b9e]">Loading profile...</div>
            ) : profileModalUser ? (
              <div className="p-6">
                {/* Avatar + Name */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 flex-shrink-0">
                    {profileModalUser.profile?.image_72 ? (
                      <img src={profileModalUser.profile.image_72} alt="" className="w-16 h-16 rounded-xl object-cover shadow-md" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-[#134E4A] flex items-center justify-center text-white text-xl font-semibold shadow-md">
                        {(profileModalUser.real_name || profileModalUser.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-white text-lg font-bold tracking-tight">{profileModalUser.profile?.real_name || profileModalUser.real_name || profileModalUser.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{profileModalUser.id}]</span></div>
                    {profileModalUser.profile?.display_name && profileModalUser.profile.display_name !== profileModalUser.profile?.real_name && (
                      <div className="text-[#9a9b9e] text-sm">Display: {profileModalUser.profile.display_name}</div>
                    )}
                    <div className="text-[#9a9b9e] text-sm">@{profileModalUser.name}</div>
                  </div>
                </div>
                {/* Status */}
                {(profileModalUser.profile?.status_text || profileModalUser.profile?.status_emoji) && (
                  <div className="mb-4 px-3 py-2 bg-[#222529] border border-[#3a3d41]/60 rounded-lg text-sm text-white">
                    {profileModalUser.profile?.status_emoji && <span>{getEmoji(profileModalUser.profile.status_emoji)} </span>}
                    {profileModalUser.profile?.status_text}
                  </div>
                )}
                {/* Details */}
                <div className="space-y-2 text-sm">
                  {profileModalUser.profile?.title && (
                    <div><span className="text-[#9a9b9e]">Title:</span> <span className="text-white">{profileModalUser.profile.title}</span></div>
                  )}
                  {profileModalUser.profile?.phone && (
                    <div><span className="text-[#9a9b9e]">Phone:</span> <span className="text-white">{profileModalUser.profile.phone}</span></div>
                  )}
                  {profileModalUser.profile?.email && (
                    <div><span className="text-[#9a9b9e]">Email:</span> <span className="text-white">{profileModalUser.profile.email}</span></div>
                  )}
                  {profileModalUser.tz && (
                    <div><span className="text-[#9a9b9e]">Timezone:</span> <span className="text-white">{profileModalUser.tz_label || profileModalUser.tz}</span></div>
                  )}
                  {/* Badges */}
                  <div className="flex gap-2 pt-2">
                    {profileModalUser.is_admin && (
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-yellow-600/20 text-yellow-300 border border-yellow-600/40">Admin</span>
                    )}
                    {profileModalUser.is_owner && (
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-600/40">Owner</span>
                    )}
                    {profileModalUser.is_bot && (
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-600/40">Bot</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Reaction Detail Popup */}
      {reactionDetailPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Reaction Details</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setReactionDetailPopup(null)}>✕</button>
            </div>
            <div className="p-6 max-h-80 overflow-y-auto">
              {reactionDetailLoading ? (
                <div className="text-center text-[#9a9b9e]">Loading...</div>
              ) : reactionDetailPopup.reactions.length === 0 ? (
                <div className="text-center text-[#9a9b9e]">No reactions</div>
              ) : (
                <div className="space-y-3">
                  {reactionDetailPopup.reactions.map((r: any) => (
                    <div key={r.name} className="flex items-start gap-3">
                      <span className="text-2xl">{getEmoji(r.name)}</span>
                      <div>
                        <div className="text-white text-sm font-medium">:{r.name}: ({r.count})</div>
                        <div className="text-[#9a9b9e] text-xs mt-0.5">
                          {r.users?.map((uid: string) => getUserName(uid)).join(', ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Reactions Modal */}
      {showUserReactions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[500px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">My Reactions</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowUserReactions(false)}>✕</button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {userReactionsLoading ? (
                <div className="text-center text-[#9a9b9e]">Loading...</div>
              ) : userReactions.length === 0 ? (
                <div className="text-center text-[#9a9b9e]">No reactions found</div>
              ) : (
                <div className="space-y-3">
                  {userReactions.map((item: any, idx: number) => (
                    <div key={idx} className="bg-[#222529] border border-[#3a3d41]/60 rounded-lg p-3 hover:border-[#3a3d41] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white text-sm font-medium">{item.message?.text?.substring(0, 80) || 'Message'}{item.message?.text?.length > 80 ? '...' : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {item.reactions?.map((r: any) => (
                          <span key={r.name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#2c2d30] border border-[#3a3d41] rounded-full text-xs">
                            <span>{getEmoji(r.name)}</span>
                            <span className="text-[#9a9b9e]">{r.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Search Results Modal */}
      {showUnifiedSearch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[600px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Search All Content</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowUnifiedSearch(false)}>✕</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {unifiedSearchLoading ? (
                <div className="text-center text-[#9a9b9e]">Searching...</div>
              ) : (
                <>
                  {unifiedSearchResults.messages.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2">Messages ({unifiedSearchResults.messages.length})</h3>
                      <div className="space-y-2">
                        {unifiedSearchResults.messages.slice(0, 20).map((msg: any, idx: number) => (
                          <div key={idx} className="bg-[#222529] border border-[#3a3d41]/60 rounded-lg p-3 hover:border-[#3a3d41] transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#14B8A6] text-xs">#{msg.channel_name || getChannelName(msg.channel || '')}</span>
                              <span className="text-[#9a9b9e] text-xs">{msg.user ? getUserName(msg.user) : ''}</span>
                            </div>
                            <p className="text-white text-sm">{msg.text?.substring(0, 200)}{msg.text?.length > 200 ? '...' : ''}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.ts}]</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {unifiedSearchResults.files.length > 0 && (
                    <div>
                      <h3 className="text-[#9a9b9e] text-[11px] font-semibold uppercase tracking-wider mb-2">Files ({unifiedSearchResults.files.length})</h3>
                      <div className="space-y-2">
                        {unifiedSearchResults.files.slice(0, 20).map((file: any, idx: number) => (
                          <div key={idx} className="bg-[#222529] border border-[#3a3d41]/60 rounded-lg p-3 flex items-center gap-3 hover:border-[#3a3d41] transition-colors">
                            <span className="text-xl">📄</span>
                            <div>
                              <p className="text-white text-sm font-medium">{file.name || file.title || 'Untitled'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{file.id}]</span></p>
                              <p className="text-[#9a9b9e] text-xs">{file.filetype?.toUpperCase()} {file.user ? '- ' + getUserName(file.user) : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {unifiedSearchResults.messages.length === 0 && unifiedSearchResults.files.length === 0 && (
                    <div className="text-center text-[#9a9b9e]">No results found</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group Members Modal */}
      {showGroupMembers && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Group Members</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => { setShowGroupMembers(null); setGroupMembersList([]) }}>✕</button>
            </div>
            <div className="p-6 max-h-80 overflow-y-auto">
              {groupMembersLoading ? (
                <div className="text-center text-[#9a9b9e]">Loading...</div>
              ) : groupMembersList.length === 0 ? (
                <div className="text-center text-[#9a9b9e]">No members found</div>
              ) : (
                <div className="space-y-2">
                  {groupMembersList.map((member: any) => {
                    const memberId = typeof member === 'string' ? member : member.id
                    return (
                      <div key={memberId} className="flex items-center gap-3 p-2.5 bg-[#222529] rounded-lg">
                        <div className="w-8 h-8 rounded-md bg-[#134E4A] flex items-center justify-center text-white text-sm font-semibold">
                          {getUserName(memberId).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white text-sm">{getUserName(memberId)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{memberId}]</span></div>
                          <div className="text-[#9a9b9e] text-xs">@{users[memberId]?.name || memberId}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reminder Detail Modal */}
      {reminderDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Reminder Details</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setReminderDetail(null)}>✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div><span className="text-[#9a9b9e] text-sm">Text:</span> <span className="text-white text-sm">{reminderDetail.text}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reminderDetail.id}]</span></span></div>
              {reminderDetail.time && (
                <div><span className="text-[#9a9b9e] text-sm">Time:</span> <span className="text-white text-sm">{formatDateTime(reminderDetail.time)}</span></div>
              )}
              {reminderDetail.creator && (
                <div><span className="text-[#9a9b9e] text-sm">Creator:</span> <span className="text-white text-sm">{getUserName(reminderDetail.creator)}</span></div>
              )}
              {reminderDetail.complete_ts ? (
                <div><span className="text-[#9a9b9e] text-sm">Status:</span> <span className="text-green-400 text-sm">Completed at {formatDateTime(reminderDetail.complete_ts)}</span></div>
              ) : (
                <div><span className="text-[#9a9b9e] text-sm">Status:</span> <span className="text-yellow-400 text-sm">Pending</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral Message Dialog */}
      {showEphemeralDialog && selectedChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Send Ephemeral Message</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setShowEphemeralDialog(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[#9a9b9e] text-xs">Ephemeral messages are only visible to the selected user.</p>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">User</label>
                <select
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all"
                  value={ephemeralUser}
                  onChange={e => setEphemeralUser(e.target.value)}
                >
                  <option value="">Select user</option>
                  {channelMembers.filter(memberId => memberId !== currentUserId).map(memberId => (
                    <option key={memberId} value={memberId}>{getUserName(memberId)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Message</label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 resize-none transition-all"
                  rows={3}
                  placeholder="Type an ephemeral message..."
                  value={ephemeralText}
                  onChange={e => setEphemeralText(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setShowEphemeralDialog(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={sendEphemeralMessage}
                  disabled={!ephemeralText.trim() || !ephemeralUser}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set Purpose Modal */}
      {editingPurpose && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1d21] border border-[#3a3d41]/80 rounded-xl shadow-2xl w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3d41]/60">
              <h2 className="text-lg font-bold text-white">Set Channel Purpose</h2>
              <button className="text-[#9a9b9e] hover:text-white" onClick={() => setEditingPurpose(false)}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#9a9b9e] text-sm mb-1">Purpose</label>
                <textarea
                  className="w-full px-3 py-2 bg-[#222529] border border-[#3a3d41] rounded-md text-white text-sm focus:outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]/20 resize-none transition-all"
                  rows={3}
                  placeholder="What is this channel about?"
                  value={purposeInput}
                  onChange={e => setPurposeInput(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-4 py-2 text-sm text-[#9a9b9e] hover:text-white hover:bg-[#3a3d41] rounded-md transition-colors" onClick={() => setEditingPurpose(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm font-semibold bg-[#007a5a] hover:bg-[#148567] text-white rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
                  onClick={setChannelPurpose}
                  disabled={channelSettingsLoading || purposeInput.trim() === (selectedChannel?.purpose || '')}
                >
                  {channelSettingsLoading ? 'Saving...' : 'Set Purpose'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
