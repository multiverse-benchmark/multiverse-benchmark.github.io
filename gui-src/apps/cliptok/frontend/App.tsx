import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Cliptok"

// TypeScript Interfaces
interface BusinessAccountProfile {
  bio?: string
  followers_count: number
  following_count: number
  website?: string
}

interface BusinessAccountAnalytics {
  total_likes: number
  total_views: number
  engagement_rate: number
}

interface BusinessAccountSettings {
  notifications_enabled: boolean
  ads_enabled: boolean
  language: string
}

interface BusinessAccount {
  business_id: string
  username?: string
  display_name?: string
  profile?: BusinessAccountProfile
  analytics?: BusinessAccountAnalytics
  settings?: BusinessAccountSettings
}

interface ListAccountsResponse {
  code: number
  message: string
  data: {
    accounts: BusinessAccount[]
    total_count: number
    returned_count: number
    has_more: boolean
    pagination: {
      limit: number
      offset: number
      next_offset: number | null
    }
  }
}

interface GetProfileResponse {
  code: number
  message: string
  data: {
    username?: string
    display_name?: string
    profile?: BusinessAccountProfile
    analytics?: BusinessAccountAnalytics
    settings?: BusinessAccountSettings
  }
}

interface PostInfo {
  title: string
  description: string
  tags: string[]
  thumbnail_url: string
  thumbnail_offset: number
  is_ai_generated: boolean
}

interface PublishVideoResponse {
  code: number
  message: string
  request_id: string
  data: {
    publish_id: string
    post_id: string
    share_id: string
    title: string
    description: string
    tags: string[]
    thumbnail_url: string
    thumbnail_offset: number
    is_ai_generated: boolean
    caption: string | null
    is_brand_organic: boolean
    is_branded_content: boolean
    disable_comment: boolean
    disable_duet: boolean
    disable_stitch: boolean
    upload_to_draft: boolean
  }
}

interface PublishStatusResponse {
  code: number
  message: string
  request_id: string
  data: {
    status: 'PUBLISH_COMPLETE' | 'PUBLISH_PENDING' | 'PUBLISH_FAILED' | 'DRAFT'
    post_ids: string[]
  }
}

interface PublishStatusItem {
  publishId: string
  title: string
  status: 'PUBLISH_COMPLETE' | 'PUBLISH_PENDING' | 'PUBLISH_FAILED' | 'DRAFT'
  postIds: string[]
  timestamp: string
  progress?: number
  errorMessage?: string
}

interface VideoPost {
  post_id: string
  business_id: string
  share_id: string
  video_url: string
  title: string
  description: string
  caption?: string | null
  tags: string[]
  thumbnail_url: string
  thumbnail_offset: number
  is_ai_generated: boolean
  is_brand_organic?: boolean | null
  is_branded_content?: boolean | null
  disable_comment?: boolean | null
  disable_duet?: boolean | null
  disable_stitch?: boolean | null
  is_draft?: boolean | null
  published_at?: string | null
  view_count: number
  like_count: number
  comment_count: number
  share_count: number
}

interface DBPublishStatus {
  status: 'PUBLISH_COMPLETE' | 'PUBLISH_PENDING' | 'PUBLISH_FAILED' | 'DRAFT'
  post_ids: string[]
  business_id: string
  created_at?: string | null
  completed_at?: string | null
  message?: string | null
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: any) => void
}

export default function CliptokApp({ onClose, setRefreshHandler }: AppProps) {
  // Navigation state
  const [activeNav, setActiveNav] = useState<'dashboard' | 'analytics' | 'content' | 'inbox'>('content')

  // Account state
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<BusinessAccount | null>(null)
  const [profileData, setProfileData] = useState<GetProfileResponse['data'] | null>(null)
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  // Publish form state
  const [videoUrl, setVideoUrl] = useState('')
  const [videoUrlInput, setVideoUrlInput] = useState('')
  const [filePathInput, setFilePathInput] = useState('')
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [isBrandOrganic, setIsBrandOrganic] = useState(false)
  const [isBrandedContent, setIsBrandedContent] = useState(false)
  const [uploadToDraft, setUploadToDraft] = useState(false)
  const [isAiGenerated, setIsAiGenerated] = useState(false)
  const [allowComments, setAllowComments] = useState(true)
  const [allowDuet, setAllowDuet] = useState(true)
  const [allowStitch, setAllowStitch] = useState(true)

  // Status state
  const [publishStatuses, setPublishStatuses] = useState<PublishStatusItem[]>([])

  // Posts state
  const [posts, setPosts] = useState<VideoPost[]>([])

  // Settings state
  const [showSettings, setShowSettings] = useState(false)

  // Notification/Help panel state
  const [showNotifications, setShowNotifications] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Profile menu state
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  // Content sub-tab state
  const [contentView, setContentView] = useState<'publish' | 'posts'>('posts')

  // UI state
  const [loading, setLoading] = useState(true)
  const [publishLoading, setPublishLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // API hook
  const api = useBackendAPI('cliptok')

  // Refs
  const searchRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Load posts and publish statuses from DB state
  const loadStateData = useCallback(async () => {
    try {
      const response = await fetch('./api/services/cliptok/state')
      if (!response.ok) return
      const json = await response.json()
      const state = json.state || json

      // Load posts
      if (state.posts) {
        const postList: VideoPost[] = Object.values(state.posts)
        postList.sort((a, b) => {
          const dateA = a.published_at ? new Date(a.published_at).getTime() : 0
          const dateB = b.published_at ? new Date(b.published_at).getTime() : 0
          return dateB - dateA
        })
        setPosts(postList)
      }

      // Load publish statuses
      if (state.publish_status) {
        const statusEntries = Object.entries(state.publish_status) as [string, DBPublishStatus][]
        const statusItems: PublishStatusItem[] = statusEntries.map(([publishId, ps]) => {
          // Try to find the post title from posts
          let postTitle = 'Untitled Video'
          if (ps.post_ids && ps.post_ids.length > 0 && state.posts) {
            const post = state.posts[ps.post_ids[0]]
            if (post) postTitle = post.title
          }
          return {
            publishId,
            title: postTitle,
            status: ps.status,
            postIds: ps.post_ids || [],
            timestamp: ps.created_at || new Date().toISOString(),
            progress: ps.status === 'PUBLISH_PENDING' ? 65 : undefined,
            errorMessage: ps.status === 'PUBLISH_FAILED' ? (ps.message || undefined) : undefined
          }
        })
        setPublishStatuses(statusItems)
      }
    } catch (err) {
      console.error('Failed to load state data:', err)
    }
  }, [])

  // Load accounts
  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = {
        fields: ['business_id', 'username', 'display_name', 'profile', 'analytics', 'settings'],
        limit: 50,
        offset: 0
      }
      if (accountSearch.trim()) {
        params.search_query = accountSearch.trim()
      }
      const result = await api.callTool<ListAccountsResponse>(
        'list_business_accounts',
        params
      )
      setAccounts(result.data.accounts)

      // Auto-select first account if none selected
      if (!selectedAccount && result.data.accounts.length > 0) {
        await selectAccount(result.data.accounts[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [selectedAccount, accountSearch])

  // Load profile data
  const loadProfile = async (businessId: string) => {
    try {
      const result = await api.callTool<GetProfileResponse>(
        'get_business_profile_data',
        {
          business_id: businessId,
          fields: ['username', 'display_name', 'profile', 'analytics', 'settings']
        }
      )
      setProfileData(result.data)
    } catch (err) {
      console.error('Failed to load profile:', err)
    }
  }

  // Select an account
  const selectAccount = async (account: BusinessAccount) => {
    setSelectedAccount(account)
    setProfileData(null)
    setShowAccountDropdown(false)
    setAccountSearch('')
    await loadProfile(account.business_id)
  }

  // Handle file path input
  const handleFilePathSubmit = (path: string) => {
    const trimmed = path.trim()
    if (trimmed) {
      const fileName = trimmed.split('/').pop() || trimmed
      setVideoUrl(`https://cdn.cliptok.com/videos/${fileName}`)
    } else {
      setVideoUrl('')
    }
  }

  // Validate form
  const validateForm = (): boolean => {
    if (!selectedAccount) {
      setError('Please select a business account')
      return false
    }

    if (!videoUrl.trim()) {
      setError('Please provide a video (upload a file or enter a URL)')
      return false
    }

    if (!title.trim()) {
      setError('Title is required')
      return false
    }

    if (!description.trim()) {
      setError('Description is required')
      return false
    }

    if (title.length > 100) {
      setError('Title must be 100 characters or less')
      return false
    }

    if (description.length > 2000) {
      setError('Description must be 2000 characters or less')
      return false
    }

    return true
  }

  // Publish video
  const publishVideo = async () => {
    if (!validateForm()) {
      return
    }

    setPublishLoading(true)
    setError(null)

    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)
      const postInfo: PostInfo = {
        title,
        description,
        tags: parsedTags,
        thumbnail_url: videoUrl,
        thumbnail_offset: 0,
        is_ai_generated: isAiGenerated
      }

      const result = await api.callTool<PublishVideoResponse>(
        'publish_business_video',
        {
          business_id: selectedAccount!.business_id,
          video_url: videoUrl,
          post_info: postInfo,
          caption: caption || undefined,
          is_brand_organic: isBrandOrganic,
          is_branded_content: isBrandedContent,
          upload_to_draft: uploadToDraft,
          disable_comment: !allowComments,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch
        }
      )

      // Check status immediately
      await checkPublishStatus(result.data.publish_id, title)

      // Reload posts from DB
      await loadStateData()

      // Clear form
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish video')
    } finally {
      setPublishLoading(false)
    }
  }

  // Check publish status
  const checkPublishStatus = async (publishId: string, videoTitle: string) => {
    if (!selectedAccount) return

    try {
      const result = await api.callTool<PublishStatusResponse>(
        'get_business_publish_status',
        {
          business_id: selectedAccount.business_id,
          publish_id: publishId
        }
      )

      const newStatus: PublishStatusItem = {
        publishId,
        title: videoTitle,
        status: result.data.status,
        postIds: result.data.post_ids,
        timestamp: new Date().toISOString(),
        progress: result.data.status === 'PUBLISH_PENDING' ? 65 : undefined
      }

      setPublishStatuses(prev => {
        const existingIndex = prev.findIndex(s => s.publishId === publishId)
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = newStatus
          return updated
        }
        return [newStatus, ...prev]
      })
    } catch (err) {
      console.error('Failed to check status:', err)
    }
  }

  // Reset form
  const resetForm = () => {
    setVideoUrl('')
    setVideoUrlInput('')
    setFilePathInput('')
    setUploadMode('file')
    setTitle('')
    setDescription('')
    setCaption('')
    setTags('')
    setIsBrandOrganic(false)
    setIsBrandedContent(false)
    setUploadToDraft(false)
    setIsAiGenerated(false)
    setAllowComments(true)
    setAllowDuet(true)
    setAllowStitch(true)
  }

  // Refresh app
  const refreshApp = useCallback(async () => {
    await loadAccounts()
    await loadStateData()
    if (selectedAccount) {
      await loadProfile(selectedAccount.business_id)
    }
  }, [loadAccounts, loadStateData, selectedAccount])

  // Format number
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false)
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Initial load
  useEffect(() => {
    loadAccounts()
    loadStateData()
  }, [])

  // Register refresh handler
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(refreshApp)
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshApp])

  // Get posts for selected account
  const accountPosts = selectedAccount
    ? posts.filter(p => p.business_id === selectedAccount.business_id)
    : posts

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0e0e0e]">
        <div className="w-8 h-8 border-[3px] border-[#CA8A04]/20 border-t-[#CA8A04] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e0e] text-white antialiased">
      {/* Top Navigation */}
      <div className="flex items-center justify-between px-7 py-4 border-b border-white/[0.06] bg-[#0e0e0e]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#CA8A04] rounded-xl flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(202,138,4,0.4)]">
            <svg className="w-5 h-5 text-[#0f0f0f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="8" cy="8" r="3.5" />
              <rect x="12" y="12" width="8" height="8" rx="1.5" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">{APP_NAME}</div>
            <div className="text-[11px] text-gray-500 tracking-wide">Business Suite</div>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-white/[0.03] rounded-full p-1 border border-white/[0.05]">
          <button
            onClick={() => { setActiveNav('dashboard'); setShowNotifications(false); setShowHelp(false) }}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
              activeNav === 'dashboard' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => { setActiveNav('analytics'); setShowNotifications(false); setShowHelp(false) }}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
              activeNav === 'analytics' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => { setActiveNav('content'); setShowNotifications(false); setShowHelp(false) }}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
              activeNav === 'content' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Content
          </button>
          <button
            onClick={() => { setActiveNav('inbox'); setShowNotifications(false); setShowHelp(false) }}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
              activeNav === 'inbox' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Inbox
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Functional notification bell */}
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowHelp(false); setShowProfileMenu(false) }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              showNotifications ? 'bg-[#CA8A04] text-[#0f0f0f] shadow-[0_4px_12px_-2px_rgba(202,138,4,0.5)]' : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white'
            }`}
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          {/* Functional help button */}
          <button
            onClick={() => { setShowHelp(!showHelp); setShowNotifications(false); setShowProfileMenu(false) }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              showHelp ? 'bg-[#CA8A04] text-[#0f0f0f] shadow-[0_4px_12px_-2px_rgba(202,138,4,0.5)]' : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white'
            }`}
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowNotifications(false); setShowHelp(false); setShowProfileMenu(false) }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              showSettings ? 'bg-[#CA8A04] text-[#0f0f0f] shadow-[0_4px_12px_-2px_rgba(202,138,4,0.5)]' : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white'
            }`}
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* Interactive profile icon with account switcher */}
          <div className="relative ml-1" ref={profileMenuRef}>
            <button
              onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); setShowHelp(false); setShowSettings(false) }}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[#166534] to-[#CA8A04] flex items-center justify-center text-white text-sm font-semibold ring-2 ring-transparent hover:ring-[#CA8A04]/40 transition-all shadow-md"
              title={selectedAccount ? (profileData?.display_name || profileData?.username || 'Profile') : 'Profile'}
            >
              {selectedAccount ? (profileData?.display_name || profileData?.username || 'T')[0].toUpperCase() : 'T'}
            </button>
            {showProfileMenu && (
              <div className="absolute right-0 top-12 w-72 bg-[#1a1a1a] border border-white/[0.07] rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] z-50 overflow-hidden">
                {/* Current account info */}
                {selectedAccount && profileData && (
                  <div className="p-4 border-b border-white/[0.06] bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#166534] to-[#CA8A04] flex items-center justify-center text-white font-semibold shadow-md">
                        {(profileData.display_name || profileData.username || 'T')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{profileData.display_name || profileData.username}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span></div>
                        {profileData.username && <div className="text-xs text-gray-500 truncate mt-0.5">@{profileData.username}</div>}
                      </div>
                    </div>
                    {profileData.profile && (
                      <div className="flex gap-4 mt-3 text-xs text-gray-400">
                        <span><span className="text-white font-semibold">{formatNumber(profileData.profile.followers_count)}</span> followers</span>
                        <span><span className="text-white font-semibold">{formatNumber(profileData.profile.following_count)}</span> following</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Account list for switching */}
                <div className="max-h-60 overflow-y-auto py-1">
                  <div className="px-4 pt-2 pb-1 text-[10px] text-gray-500 uppercase tracking-[0.12em] font-semibold">Switch Account</div>
                  {accounts.map((account) => (
                    <button
                      key={account.business_id}
                      onClick={() => { selectAccount(account); setShowProfileMenu(false) }}
                      className={`w-full px-3 py-2 mx-1 flex items-center gap-3 rounded-xl hover:bg-white/[0.05] transition-colors text-left ${
                        selectedAccount?.business_id === account.business_id ? 'bg-white/[0.04]' : ''
                      }`}
                      style={{ width: 'calc(100% - 0.5rem)' }}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#166534] to-[#CA8A04] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-sm">
                        {(account.display_name || account.username || 'T')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{account.display_name || account.username || account.business_id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{account.business_id}]</span></div>
                        {account.username && <div className="text-xs text-gray-500 truncate">@{account.username}</div>}
                      </div>
                      {selectedAccount?.business_id === account.business_id && (
                        <svg className="w-4 h-4 text-[#CA8A04] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/[0.06] p-1.5">
                  <button
                    onClick={() => { setShowProfileMenu(false); setShowSettings(true) }}
                    className="w-full px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors text-left flex items-center gap-2.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Account Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="border-b border-white/[0.06] bg-[#131313] px-7 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold tracking-tight">Notifications</h3>
            <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-white text-xs px-3 py-1 rounded-full hover:bg-white/[0.05] transition-colors">Close</button>
          </div>
          <div className="space-y-2.5">
            {publishStatuses.filter(s => s.status === 'PUBLISH_COMPLETE').length > 0 ? (
              publishStatuses.filter(s => s.status === 'PUBLISH_COMPLETE').slice(0, 5).map((status, i) => (
                <div key={i} className="flex items-center gap-3 p-3.5 bg-white/[0.025] rounded-xl border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="w-9 h-9 bg-green-500/15 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">"{status.title}" published successfully<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{status.publishId}]</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(status.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No notifications yet</p>
              </div>
            )}
            {publishStatuses.filter(s => s.status === 'PUBLISH_FAILED').map((status, i) => (
              <div key={`fail-${i}`} className="flex items-center gap-3 p-3.5 bg-red-500/[0.04] rounded-xl border border-red-500/20">
                <div className="w-9 h-9 bg-red-500/15 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">"{status.title}" failed to publish<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{status.publishId}]</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{status.errorMessage || 'Unknown error'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Panel */}
      {showHelp && (
        <div className="border-b border-white/[0.06] bg-[#131313] px-7 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold tracking-tight">Help Center</h3>
            <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-white text-xs px-3 py-1 rounded-full hover:bg-white/[0.05] transition-colors">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <h4 className="text-sm font-semibold mb-1.5">Publishing Videos</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{`Upload a video file or enter a video URL, fill in the details, and click Publish to post to your ${APP_NAME} account.`}</p>
            </div>
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <h4 className="text-sm font-semibold mb-1.5">Managing Accounts</h4>
              <p className="text-xs text-gray-400 leading-relaxed">Use the account selector to switch between business accounts. Search by name or username.</p>
            </div>
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <h4 className="text-sm font-semibold mb-1.5">Content Settings</h4>
              <p className="text-xs text-gray-400 leading-relaxed">Brand Organic and Branded Content are mutually exclusive. Enable comments, duets, and stitches as needed.</p>
            </div>
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <h4 className="text-sm font-semibold mb-1.5">Analytics</h4>
              <p className="text-xs text-gray-400 leading-relaxed">View engagement metrics, follower counts, and performance data in the Analytics and Dashboard tabs.</p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && profileData?.settings && (
        <div className="border-b border-white/[0.06] bg-[#131313] px-7 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold tracking-tight">Account Settings</h3>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xs px-3 py-1 rounded-full hover:bg-white/[0.05] transition-colors">Close</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04]">
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-1.5">Notifications</div>
              <div className={`text-sm font-semibold flex items-center gap-1.5 ${profileData.settings.notifications_enabled ? 'text-green-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${profileData.settings.notifications_enabled ? 'bg-green-400' : 'bg-red-400'}`} />
                {profileData.settings.notifications_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04]">
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-1.5">Ads</div>
              <div className={`text-sm font-semibold flex items-center gap-1.5 ${profileData.settings.ads_enabled ? 'text-green-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${profileData.settings.ads_enabled ? 'bg-green-400' : 'bg-red-400'}`} />
                {profileData.settings.ads_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className="bg-white/[0.025] rounded-xl p-4 border border-white/[0.04]">
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-1.5">Language</div>
              <div className="text-sm font-semibold">{profileData.settings.language}</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeNav === 'content' && (
          <div className="h-full flex flex-col">
            {/* Content sub-tabs */}
            <div className="flex items-center gap-1 px-6 pt-5 pb-3 border-b border-white/[0.05]">
              <button
                onClick={() => setContentView('posts')}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
                  contentView === 'posts' ? 'bg-[#CA8A04]/15 text-[#CA8A04]' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                My Posts <span className={`ml-1 text-xs ${contentView === 'posts' ? 'text-[#CA8A04]/70' : 'text-gray-500'}`}>{accountPosts.length}</span>
              </button>
              <button
                onClick={() => setContentView('publish')}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
                  contentView === 'publish' ? 'bg-[#CA8A04]/15 text-[#CA8A04]' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Publish New
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* Posts list view */}
              {contentView === 'posts' && (
                <div className="flex-1 overflow-y-auto p-7">
                  <div className="max-w-4xl mx-auto">
                    <div className="mb-7">
                      <h1 className="text-[28px] font-semibold tracking-tight mb-1.5 leading-tight">
                        Video <span className="text-[#CA8A04]">Posts</span>
                      </h1>
                      <p className="text-gray-500 text-sm">
                        {selectedAccount
                          ? `Showing posts for ${selectedAccount.display_name || selectedAccount.username}`
                          : 'Showing all posts'}
                      </p>
                    </div>

                    {/* Account selector for posts */}
                    <div className="mb-6" ref={searchRef}>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Search accounts..."
                            value={accountSearch}
                            onChange={(e) => {
                              setAccountSearch(e.target.value)
                              setShowAccountDropdown(true)
                            }}
                            onFocus={() => setShowAccountDropdown(true)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { loadAccounts(); setShowAccountDropdown(false) } }}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all"
                          />
                          {/* Proper dropdown with click-outside handling */}
                          {showAccountDropdown && accounts.length > 0 && (
                            <div className="absolute z-10 top-full mt-2 w-full bg-[#1a1a1a] border border-white/[0.07] rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] max-h-56 overflow-y-auto p-1">
                              {accounts
                                .filter(a => !accountSearch.trim() || (a.display_name || a.username || '').toLowerCase().includes(accountSearch.toLowerCase()))
                                .map(account => (
                                  <button
                                    key={account.business_id}
                                    onClick={() => selectAccount(account)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/[0.05] transition-colors ${
                                      selectedAccount?.business_id === account.business_id ? 'text-[#CA8A04] bg-[#CA8A04]/[0.08]' : 'text-white'
                                    }`}
                                  >
                                    <div className="font-medium">{account.display_name || account.username || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{account.business_id}]</span></div>
                                    {account.username && <div className="text-xs text-gray-500 mt-0.5">@{account.username}</div>}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {selectedAccount && (
                        <div className="mt-2.5 text-xs text-gray-500">
                          Selected: <span className="text-[#CA8A04] font-medium">{selectedAccount.display_name || selectedAccount.username}</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span>
                        </div>
                      )}
                    </div>

                    {accountPosts.length === 0 ? (
                      <div className="text-center py-20 px-6 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-400 mb-3">No videos posted yet</p>
                        <button
                          onClick={() => setContentView('publish')}
                          className="text-sm font-medium text-[#0f0f0f] bg-[#CA8A04] hover:brightness-110 px-4 py-2 rounded-full transition-all"
                        >
                          Publish your first video
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {accountPosts.map((post) => (
                          <div
                            key={post.post_id}
                            className="group bg-white/[0.025] rounded-2xl p-4 border border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.035] transition-all duration-200 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
                          >
                            <div className="flex gap-4">
                              <div className="relative w-28 h-36 bg-gradient-to-br from-[#1f1f1f] to-[#141414] rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden ring-1 ring-white/[0.04]">
                                <svg className="w-9 h-9 text-gray-600 group-hover:text-[#CA8A04]/70 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-semibold text-sm truncate leading-snug">{post.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{post.post_id}]</span></h3>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {post.is_draft && (
                                      <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-medium rounded-full tracking-wide">Draft</span>
                                    )}
                                    {post.is_brand_organic && (
                                      <span className="px-2 py-0.5 bg-purple-500/15 text-purple-400 text-[10px] font-medium rounded-full tracking-wide">Brand Organic</span>
                                    )}
                                    {post.is_branded_content && (
                                      <span className="px-2 py-0.5 bg-orange-500/15 text-orange-400 text-[10px] font-medium rounded-full tracking-wide">Branded</span>
                                    )}
                                    {post.is_ai_generated && (
                                      <span className="px-2 py-0.5 bg-yellow-600/15 text-yellow-500 text-[10px] font-medium rounded-full tracking-wide">AI</span>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{post.description}</p>
                                {post.caption && <p className="text-xs text-gray-500 mt-1 italic">{post.caption}</p>}
                                {post.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    {post.tags.map((tag, i) => (
                                      <span key={i} className="text-[11px] text-[#CA8A04] bg-[#CA8A04]/10 px-2 py-0.5 rounded-full font-medium">#{tag}</span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-4 mt-3.5 pt-3 border-t border-white/[0.04] text-xs text-gray-400">
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    <span className="font-medium">{formatNumber(post.view_count)}</span>
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-rose-400/80" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                    <span className="font-medium">{formatNumber(post.like_count)}</span>
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                    <span className="font-medium">{formatNumber(post.comment_count)}</span>
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                    <span className="font-medium">{formatNumber(post.share_count)}</span>
                                  </span>
                                  {post.published_at && (
                                    <span className="ml-auto text-gray-500">
                                      {new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Publish form */}
              {contentView === 'publish' && (
                <div className="flex-1 overflow-hidden flex">
                  {/* Left Panel - Publishing Form */}
                  <div className="flex-1 overflow-y-auto p-7">
                    <div className="max-w-2xl">
                      <div className="mb-7">
                        <h1 className="text-[28px] font-semibold tracking-tight mb-1.5 leading-tight">
                          Video <span className="text-[#CA8A04]">Publishing</span>
                        </h1>
                        <p className="text-gray-500 text-sm">{`Manage and publish videos to your ${APP_NAME} Business accounts`}</p>
                      </div>

                      {/* Business Account Selector */}
                      <div className="mb-6" ref={contentView === 'publish' ? searchRef : undefined}>
                        <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Business Account</label>
                        <div className="relative">
                          <select
                            value={selectedAccount?.business_id || ''}
                            onChange={(e) => {
                              const account = accounts.find(a => a.business_id === e.target.value)
                              if (account) selectAccount(account)
                            }}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 pr-10 text-white appearance-none focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all cursor-pointer"
                          >
                            {accounts.map(account => (
                              <option key={account.business_id} value={account.business_id}>
                                {account.display_name || account.username || 'Unknown Account'} [{account.business_id}]
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Error Banner */}
                      {error && (
                        <div className="mb-6 p-4 bg-red-500/[0.06] border border-red-500/25 rounded-2xl flex items-start gap-3">
                          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-red-400 text-sm">{error}</p>
                          </div>
                          <button
                            onClick={() => setError(null)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Publish New Video */}
                      <div className="bg-white/[0.025] border border-white/[0.05] rounded-2xl p-6 mb-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]">
                        <div className="flex items-center gap-2.5 mb-5">
                          <div className="w-8 h-8 rounded-xl bg-[#CA8A04]/15 flex items-center justify-center">
                            <svg className="w-4 h-4 text-[#CA8A04]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold tracking-tight">Publish New Video</h3>
                        </div>

                        {/* Upload mode toggle - file path or URL */}
                        <div className="flex gap-1 mb-5 p-1 bg-white/[0.03] rounded-full border border-white/[0.04] w-fit">
                          <button
                            onClick={() => { setUploadMode('file'); setVideoUrlInput(''); if (!filePathInput) setVideoUrl('') }}
                            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${
                              uploadMode === 'file'
                                ? 'bg-[#CA8A04] text-[#0f0f0f] shadow-[0_2px_8px_-2px_rgba(202,138,4,0.5)]'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            File Path
                          </button>
                          <button
                            onClick={() => { setUploadMode('url'); setFilePathInput(''); if (!videoUrlInput) setVideoUrl('') }}
                            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${
                              uploadMode === 'url'
                                ? 'bg-[#CA8A04] text-[#0f0f0f] shadow-[0_2px_8px_-2px_rgba(202,138,4,0.5)]'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Video URL
                          </button>
                        </div>

                        {uploadMode === 'file' ? (
                          /* In-app file path input instead of native OS file picker */
                          <div className="mb-6">
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Video File Path</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Enter file path, e.g. /videos/my_video.mp4"
                                value={filePathInput}
                                onChange={(e) => {
                                  setFilePathInput(e.target.value)
                                  handleFilePathSubmit(e.target.value)
                                }}
                                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all placeholder-gray-500"
                              />
                              {filePathInput && (
                                <button
                                  onClick={() => { setFilePathInput(''); setVideoUrl('') }}
                                  className="px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/[0.12] hover:bg-white/[0.05] transition-all"
                                  title="Clear"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            {filePathInput && (
                              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[#CA8A04]">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="font-medium">File selected: {filePathInput.split('/').pop() || filePathInput}</span>
                              </div>
                            )}
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">Enter the path to a video file from the playground desktop or another app.</p>
                          </div>
                        ) : (
                          /* Video URL Input */
                          <div className="mb-6">
                            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Video URL</label>
                            <input
                              type="url"
                              placeholder="https://example.com/video.mp4"
                              value={videoUrlInput}
                              onChange={(e) => {
                                setVideoUrlInput(e.target.value)
                                setVideoUrl(e.target.value)
                              }}
                              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all"
                            />
                            <div className="text-xs text-gray-500 mt-1.5">Enter a direct link to the video file</div>
                          </div>
                        )}

                        {/* Title */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Title</label>
                          <input
                            type="text"
                            placeholder="Enter video title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all"
                          />
                          <div className="text-xs text-gray-500 mt-1.5">{title.length}/100 characters</div>
                        </div>

                        {/* Description */}
                        <div className="mb-5">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Description</label>
                          <textarea
                            placeholder="Add a description with hashtags..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={2000}
                            rows={4}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all resize-none leading-relaxed"
                          />
                          <div className="text-xs text-gray-500 mt-1.5">{description.length}/2000 characters</div>
                        </div>

                        {/* Caption */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Caption</label>
                          <input
                            type="text"
                            placeholder="Add a caption..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all"
                          />
                        </div>

                        {/* Tags */}
                        <div className="mb-6">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-2">Tags</label>
                          <input
                            type="text"
                            placeholder="Enter tags separated by commas..."
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#CA8A04]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#CA8A04]/15 transition-all"
                          />
                          <div className="text-xs text-gray-500 mt-1.5">Separate multiple tags with commas</div>
                        </div>

                        {/* Content Flags */}
                        <div className="mb-6">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-3">Content Settings</label>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <span className="text-sm">AI-generated content</span>
                              <button
                                onClick={() => setIsAiGenerated(!isAiGenerated)}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  isAiGenerated ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  isAiGenerated ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                            {/* Mutual exclusion for Brand Organic and Branded Content */}
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <div>
                                <span className="text-sm">Brand organic</span>
                                {isBrandedContent && <span className="text-xs text-yellow-400/80 ml-2">(disabled - Branded Content is on)</span>}
                              </div>
                              <button
                                onClick={() => {
                                  if (!isBrandedContent) {
                                    setIsBrandOrganic(!isBrandOrganic)
                                  }
                                }}
                                disabled={isBrandedContent}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  isBrandOrganic ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                } ${isBrandedContent ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  isBrandOrganic ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <div>
                                <span className="text-sm">Branded content</span>
                                {isBrandOrganic && <span className="text-xs text-yellow-400/80 ml-2">(disabled - Brand Organic is on)</span>}
                              </div>
                              <button
                                onClick={() => {
                                  if (!isBrandOrganic) {
                                    setIsBrandedContent(!isBrandedContent)
                                  }
                                }}
                                disabled={isBrandOrganic}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  isBrandedContent ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                } ${isBrandOrganic ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  isBrandedContent ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <span className="text-sm">Save as draft</span>
                              <button
                                onClick={() => setUploadToDraft(!uploadToDraft)}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  uploadToDraft ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  uploadToDraft ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactions */}
                        <div className="mb-6">
                          <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 mb-3">Interactions</label>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <div className="flex items-center gap-3">
                                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span className="text-sm">Allow comments</span>
                              </div>
                              <button
                                onClick={() => setAllowComments(!allowComments)}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  allowComments ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  allowComments ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <div className="flex items-center gap-3">
                                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                                </svg>
                                <span className="text-sm">Allow Duet</span>
                              </div>
                              <button
                                onClick={() => setAllowDuet(!allowDuet)}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  allowDuet ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  allowDuet ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.035] transition-colors">
                              <div className="flex items-center gap-3">
                                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <span className="text-sm">Allow Stitch</span>
                              </div>
                              <button
                                onClick={() => setAllowStitch(!allowStitch)}
                                className={`w-11 h-6 rounded-full transition-colors ${
                                  allowStitch ? 'bg-[#CA8A04]' : 'bg-white/[0.08]'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                                  allowStitch ? 'translate-x-6' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Publish Button */}
                        <button
                          onClick={publishVideo}
                          disabled={publishLoading || !videoUrl.trim() || !selectedAccount}
                          className="w-full py-3 bg-[#CA8A04] text-[#0f0f0f] font-semibold rounded-full hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(202,138,4,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2"
                        >
                          {publishLoading ? (
                            <>
                              <div className="w-5 h-5 border-2 border-[#0f0f0f]/25 border-t-[#0f0f0f] rounded-full animate-spin" />
                              Publishing...
                            </>
                          ) : (
                            <>
                              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              Publish Video
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Panel - Profile & Status */}
                  <div className="w-96 bg-[#0a0a0a] border-l border-white/[0.05] overflow-y-auto p-6">
                    {/* Profile Card */}
                    {selectedAccount && profileData && (
                      <div className="relative mb-6 bg-gradient-to-br from-[#CA8A04] via-[#a87004] to-[#15803D] rounded-2xl p-6 text-white overflow-hidden shadow-[0_12px_32px_-12px_rgba(202,138,4,0.45)]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white text-lg font-semibold ring-2 ring-white/20">
                            {(profileData.display_name || profileData.username || 'T')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-lg truncate tracking-tight">
                              {profileData.display_name || profileData.username}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span>
                            </div>
                            {profileData.username && (
                              <div className="text-sm opacity-80 truncate">@{profileData.username}</div>
                            )}
                          </div>
                        </div>

                        {profileData.profile?.bio && (
                          <p className="relative text-sm opacity-90 mb-4 line-clamp-2 leading-relaxed">
                            {profileData.profile.bio}
                          </p>
                        )}

                        {(profileData.profile || profileData.analytics) && (
                          <div className="relative grid grid-cols-4 gap-2 pt-1">
                            {profileData.profile && (
                              <>
                                <div className="text-center">
                                  <div className="font-semibold text-lg tracking-tight">{formatNumber(profileData.profile.followers_count)}</div>
                                  <div className="text-[10px] opacity-70 uppercase tracking-wider mt-0.5">Followers</div>
                                </div>
                                <div className="text-center">
                                  <div className="font-semibold text-lg tracking-tight">{formatNumber(profileData.profile.following_count)}</div>
                                  <div className="text-[10px] opacity-70 uppercase tracking-wider mt-0.5">Following</div>
                                </div>
                              </>
                            )}
                            {profileData.analytics && (
                              <>
                                <div className="text-center">
                                  <div className="font-semibold text-lg tracking-tight">{formatNumber(profileData.analytics.total_likes)}</div>
                                  <div className="text-[10px] opacity-70 uppercase tracking-wider mt-0.5">Likes</div>
                                </div>
                                <div className="text-center">
                                  <div className="font-semibold text-lg tracking-tight">{formatNumber(profileData.analytics.total_views)}</div>
                                  <div className="text-[10px] opacity-70 uppercase tracking-wider mt-0.5">Views</div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Publishing Status */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold tracking-tight">Publishing Status</h3>
                        <button
                          onClick={async () => {
                            if (!selectedAccount) return
                            for (const status of publishStatuses) {
                              await checkPublishStatus(status.publishId, status.title)
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white flex items-center justify-center transition-all"
                          title="Refresh"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>

                      {publishStatuses.length === 0 ? (
                        <div className="text-center py-14 px-4 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
                          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-400">No published videos yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {publishStatuses.map((status, index) => (
                            <div
                              key={index}
                              className="bg-white/[0.025] rounded-2xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                  status.status === 'PUBLISH_COMPLETE'
                                    ? 'bg-green-500/15 text-green-400'
                                    : status.status === 'PUBLISH_PENDING'
                                    ? 'bg-yellow-500/15 text-yellow-400'
                                    : status.status === 'PUBLISH_FAILED'
                                    ? 'bg-red-500/15 text-red-400'
                                    : 'bg-blue-500/15 text-blue-400'
                                }`}>
                                  {status.status === 'PUBLISH_COMPLETE' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : status.status === 'PUBLISH_PENDING' ? (
                                    <svg className="w-5 h-5 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  ) : status.status === 'PUBLISH_FAILED' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm mb-0.5 truncate">{status.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{status.publishId}]</span></div>
                                  <div className="text-xs text-gray-500 mb-2">
                                    {new Date(status.timestamp).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>

                                  {status.status === 'PUBLISH_PENDING' && status.progress !== undefined && (
                                    <div className="mb-2">
                                      <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-[#CA8A04] to-[#facc15] transition-all duration-300 rounded-full"
                                          style={{ width: `${status.progress}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  )}

                                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${
                                    status.status === 'PUBLISH_COMPLETE'
                                      ? 'bg-green-500/15 text-green-400'
                                      : status.status === 'PUBLISH_PENDING'
                                      ? 'bg-yellow-500/15 text-yellow-400'
                                      : status.status === 'PUBLISH_FAILED'
                                      ? 'bg-red-500/15 text-red-400'
                                      : 'bg-blue-500/15 text-blue-400'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      status.status === 'PUBLISH_COMPLETE' ? 'bg-green-400'
                                      : status.status === 'PUBLISH_PENDING' ? 'bg-yellow-400 animate-pulse'
                                      : status.status === 'PUBLISH_FAILED' ? 'bg-red-400'
                                      : 'bg-blue-400'
                                    }`} />
                                    {status.status === 'PUBLISH_COMPLETE' && 'Published'}
                                    {status.status === 'PUBLISH_PENDING' && 'Processing'}
                                    {status.status === 'PUBLISH_FAILED' && 'Failed'}
                                    {status.status === 'DRAFT' && 'Draft'}
                                  </div>

                                  {status.errorMessage && (
                                    <p className="text-xs text-red-400 mt-2 leading-relaxed">{status.errorMessage}</p>
                                  )}
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
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeNav === 'analytics' && (
          <div className="h-full overflow-y-auto p-7">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-[28px] font-semibold tracking-tight mb-7 leading-tight">
                Account <span className="text-[#CA8A04]">Analytics</span>
              </h1>

              {!selectedAccount || !profileData ? (
                <div className="text-center py-16 text-gray-500 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
                  <p>Select an account to view analytics</p>
                </div>
              ) : (
                <>
                  {/* Account Overview */}
                  <div className="bg-white/[0.025] border border-white/[0.05] rounded-2xl p-6 mb-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Account Overview</h3>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-[#166534] to-[#CA8A04] rounded-full flex items-center justify-center text-white text-2xl font-semibold shadow-lg ring-2 ring-white/[0.05]">
                        {(profileData.display_name || profileData.username || 'T')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xl font-semibold tracking-tight">{profileData.display_name || profileData.username}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span></div>
                        {profileData.username && <div className="text-gray-500 text-sm mt-0.5">@{profileData.username}</div>}
                        {profileData.profile?.bio && <div className="text-sm text-gray-400 mt-1.5 leading-relaxed">{profileData.profile.bio}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics */}
                  {profileData.profile && (
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                        <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-2">Followers</div>
                        <div className="text-3xl font-semibold text-[#CA8A04] tracking-tight">{formatNumber(profileData.profile.followers_count)}</div>
                      </div>
                      <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                        <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-2">Following</div>
                        <div className="text-3xl font-semibold tracking-tight">{formatNumber(profileData.profile.following_count)}</div>
                      </div>
                    </div>
                  )}

                  {profileData.analytics && (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                          <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-2">Total Likes</div>
                          <div className="text-3xl font-semibold text-[#22C55E] tracking-tight">{formatNumber(profileData.analytics.total_likes)}</div>
                        </div>
                        <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                          <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-2">Total Views</div>
                          <div className="text-3xl font-semibold text-[#CA8A04] tracking-tight">{formatNumber(profileData.analytics.total_views)}</div>
                        </div>
                        <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                          <div className="text-[11px] text-gray-500 uppercase tracking-[0.1em] font-semibold mb-2">Engagement Rate</div>
                          <div className="text-3xl font-semibold text-yellow-400 tracking-tight">{(profileData.analytics.engagement_rate * 100).toFixed(2)}%</div>
                        </div>
                      </div>

                      {/* Engagement Breakdown */}
                      <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] mb-5">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Engagement Breakdown</h3>
                        <div className="space-y-5">
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-400">Likes</span>
                              <span className="font-medium">{formatNumber(profileData.analytics.total_likes)}</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#166534] to-[#22C55E] rounded-full" style={{ width: `${Math.min(100, (profileData.analytics.total_likes / (profileData.analytics.total_views || 1)) * 100)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-400">Views</span>
                              <span className="font-medium">{formatNumber(profileData.analytics.total_views)}</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#a87004] to-[#CA8A04] rounded-full" style={{ width: '100%' }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-400">Engagement Rate</span>
                              <span className="font-medium">{(profileData.analytics.engagement_rate * 100).toFixed(2)}%</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full" style={{ width: `${Math.min(100, profileData.analytics.engagement_rate * 100)}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {profileData.profile?.website && (
                    <div className="bg-white/[0.025] rounded-2xl p-5 border border-white/[0.05] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#CA8A04]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[#CA8A04]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">Website</div>
                        <span className="text-sm text-[#CA8A04] font-medium">{profileData.profile.website}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Dashboard tab with real data */}
        {activeNav === 'dashboard' && (
          <div className="h-full overflow-y-auto p-7">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-[28px] font-semibold tracking-tight mb-7 leading-tight">
                <span className="text-[#CA8A04]">Dashboard</span>
              </h1>

              {!selectedAccount || !profileData ? (
                <div className="text-center py-16 text-gray-500 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
                  <p>Select an account to view the dashboard</p>
                </div>
              ) : (
                <>
                  {/* Quick Stats */}
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    <div className="bg-white/[0.025] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] font-semibold mb-1.5">Total Posts</div>
                      <div className="text-2xl font-semibold text-[#CA8A04] tracking-tight">{accountPosts.length}</div>
                    </div>
                    <div className="bg-white/[0.025] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] font-semibold mb-1.5">Total Views</div>
                      <div className="text-2xl font-semibold tracking-tight">{formatNumber(accountPosts.reduce((sum, p) => sum + p.view_count, 0))}</div>
                    </div>
                    <div className="bg-white/[0.025] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] font-semibold mb-1.5">Total Likes</div>
                      <div className="text-2xl font-semibold text-[#22C55E] tracking-tight">{formatNumber(accountPosts.reduce((sum, p) => sum + p.like_count, 0))}</div>
                    </div>
                    <div className="bg-white/[0.025] rounded-2xl p-5 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                      <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] font-semibold mb-1.5">Total Comments</div>
                      <div className="text-2xl font-semibold text-yellow-400 tracking-tight">{formatNumber(accountPosts.reduce((sum, p) => sum + p.comment_count, 0))}</div>
                    </div>
                  </div>

                  {/* Account Profile Summary */}
                  <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] mb-5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Account Summary</h3>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-[#166534] to-[#CA8A04] rounded-full flex items-center justify-center text-white text-xl font-semibold shadow-lg ring-2 ring-white/[0.05]">
                        {(profileData.display_name || profileData.username || 'T')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-lg font-semibold tracking-tight">{profileData.display_name || profileData.username}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span></div>
                        {profileData.username && <div className="text-sm text-gray-500 mt-0.5">@{profileData.username}</div>}
                      </div>
                      {profileData.profile && (
                        <div className="flex gap-6 text-center">
                          <div>
                            <div className="text-lg font-semibold text-[#CA8A04] tracking-tight">{formatNumber(profileData.profile.followers_count)}</div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Followers</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold tracking-tight">{formatNumber(profileData.profile.following_count)}</div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Following</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Performance Overview */}
                  {profileData.analytics && (
                    <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] mb-5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Performance Overview</h3>
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Account Likes</div>
                          <div className="text-2xl font-semibold text-[#22C55E] tracking-tight">{formatNumber(profileData.analytics.total_likes)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Account Views</div>
                          <div className="text-2xl font-semibold text-[#CA8A04] tracking-tight">{formatNumber(profileData.analytics.total_views)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Engagement</div>
                          <div className="text-2xl font-semibold text-yellow-400 tracking-tight">{(profileData.analytics.engagement_rate * 100).toFixed(2)}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Publishing Activity */}
                  <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05] mb-5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Publishing Activity</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-4 bg-white/[0.025] rounded-xl border border-white/[0.04]">
                        <div className="text-2xl font-semibold text-green-400 tracking-tight">
                          {publishStatuses.filter(s => s.status === 'PUBLISH_COMPLETE').length}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Published</div>
                      </div>
                      <div className="text-center p-4 bg-white/[0.025] rounded-xl border border-white/[0.04]">
                        <div className="text-2xl font-semibold text-yellow-400 tracking-tight">
                          {publishStatuses.filter(s => s.status === 'PUBLISH_PENDING').length}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Pending</div>
                      </div>
                      <div className="text-center p-4 bg-white/[0.025] rounded-xl border border-white/[0.04]">
                        <div className="text-2xl font-semibold text-red-400 tracking-tight">
                          {publishStatuses.filter(s => s.status === 'PUBLISH_FAILED').length}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Failed</div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Posts */}
                  {accountPosts.length > 0 && (
                    <div className="bg-white/[0.025] rounded-2xl p-6 border border-white/[0.05]">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">Recent Posts</h3>
                      <div className="space-y-2">
                        {accountPosts.slice(0, 5).map(post => (
                          <div key={post.post_id} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.035] transition-all">
                            <div className="w-11 h-11 bg-gradient-to-br from-[#1f1f1f] to-[#141414] rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/[0.04]">
                              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{post.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{post.post_id}]</span></div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {formatNumber(post.view_count)} views &middot; {formatNumber(post.like_count)} likes
                              </div>
                            </div>
                            {post.published_at && (
                              <div className="text-xs text-gray-500 flex-shrink-0">
                                {new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Inbox tab with real content */}
        {activeNav === 'inbox' && (
          <div className="h-full overflow-y-auto p-7">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-[28px] font-semibold tracking-tight mb-7 leading-tight">
                <span className="text-[#CA8A04]">Inbox</span>
              </h1>

              {/* Publishing notifications as inbox items */}
              <div className="mb-7">
                <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-[0.12em]">Publishing Notifications</h3>
                {publishStatuses.length === 0 ? (
                  <div className="text-center py-16 px-6 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-400">Your inbox is empty</p>
                    <p className="text-xs text-gray-600 mt-1">Publishing notifications will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {publishStatuses.map((status, i) => (
                      <div key={i} className="bg-white/[0.025] rounded-2xl p-4 border border-white/[0.05] hover:border-white/[0.1] transition-colors flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          status.status === 'PUBLISH_COMPLETE'
                            ? 'bg-green-500/15'
                            : status.status === 'PUBLISH_PENDING'
                            ? 'bg-yellow-500/15'
                            : status.status === 'PUBLISH_FAILED'
                            ? 'bg-red-500/15'
                            : 'bg-blue-500/15'
                        }`}>
                          {status.status === 'PUBLISH_COMPLETE' ? (
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : status.status === 'PUBLISH_PENDING' ? (
                            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : status.status === 'PUBLISH_FAILED' ? (
                            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">
                              {status.status === 'PUBLISH_COMPLETE' && `"${status.title}" was published successfully`}
                              {status.status === 'PUBLISH_PENDING' && `"${status.title}" is being processed`}
                              {status.status === 'PUBLISH_FAILED' && `"${status.title}" failed to publish`}
                              {status.status === 'DRAFT' && `"${status.title}" saved as draft`}
                              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{status.publishId}]</span>
                            </p>
                            <span className="text-xs text-gray-500 flex-shrink-0 mt-0.5">
                              {new Date(status.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          {status.errorMessage && (
                            <p className="text-xs text-red-400 mt-1.5 leading-relaxed">{status.errorMessage}</p>
                          )}
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide mt-2 ${
                            status.status === 'PUBLISH_COMPLETE'
                              ? 'bg-green-500/15 text-green-400'
                              : status.status === 'PUBLISH_PENDING'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : status.status === 'PUBLISH_FAILED'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-blue-500/15 text-blue-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              status.status === 'PUBLISH_COMPLETE' ? 'bg-green-400'
                              : status.status === 'PUBLISH_PENDING' ? 'bg-yellow-400 animate-pulse'
                              : status.status === 'PUBLISH_FAILED' ? 'bg-red-400'
                              : 'bg-blue-400'
                            }`} />
                            {status.status === 'PUBLISH_COMPLETE' && 'Published'}
                            {status.status === 'PUBLISH_PENDING' && 'Processing'}
                            {status.status === 'PUBLISH_FAILED' && 'Failed'}
                            {status.status === 'DRAFT' && 'Draft'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Account activity summary */}
              {selectedAccount && profileData && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-[0.12em]">Account Activity</h3>
                  <div className="bg-white/[0.025] rounded-2xl p-4 border border-white/[0.05] hover:border-white/[0.1] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-gradient-to-br from-[#166534] to-[#CA8A04] rounded-full flex items-center justify-center text-white font-semibold shadow-md ring-2 ring-white/[0.05]">
                        {(profileData.display_name || profileData.username || 'T')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{profileData.display_name || profileData.username}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAccount.business_id}]</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {accountPosts.length} posts &middot; {profileData.profile ? formatNumber(profileData.profile.followers_count) + ' followers' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
