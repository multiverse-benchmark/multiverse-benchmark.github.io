import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI, BACKEND_STATE_CHANGED_EVENT } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Photogram"

// Types
interface User {
  id: string
  name: string
  username: string
}

interface MediaPost {
  id: string
  user_id: string
  image_url: string
  caption: string
  timestamp: string | null
}

interface Comment {
  id: string
  media_id: string
  user_id: string
  message: string
  timestamp: string | null
}

interface DirectMessage {
  id: string
  from: string
  to: string
  text: string
  timestamp: string
}

type ViewType = 'feed' | 'profile' | 'dms'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

// Placeholder image generator using data URI SVGs
function getPlaceholderImage(postId: string, caption: string): string {
  const colors = [
    ['#059669', '#10B981', '#34D399'],
    ['#0F172A', '#1E293B', '#334155'],
    ['#34D399', '#059669', '#0F172A'],
    ['#0EA5E9', '#0F172A', '#059669'],
    ['#1E293B', '#059669', '#34D399'],
  ]
  const hash = postId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const [c1, c2, c3] = colors[hash % colors.length]
  // Slice by code points: a plain .slice can split an emoji's surrogate pair
  // and encodeURIComponent throws URIError on the lone surrogate below.
  const label = Array.from(caption || 'Photo').slice(0, 30).join('').replace(/[<>&"']/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="50%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="290" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif" opacity="0.9">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Image component with fallback
function PostImage({ src, alt, postId, className, onClick }: {
  src: string
  alt: string
  postId: string
  className?: string
  onClick?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const fallback = getPlaceholderImage(postId, alt)

  return (
    <img
      src={failed ? fallback : src}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => { if (!failed) setFailed(true) }}
    />
  )
}

// Toast animation + scoped UI styles (defined once outside component to avoid re-rendering)
const toastStyles = `
@keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes igModalIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes igOverlayIn { from { opacity: 0; } to { opacity: 1; } }
.ig-modal { animation: igModalIn .22s cubic-bezier(.2,.7,.3,1) both; }
.ig-overlay { animation: igOverlayIn .18s ease-out both; }
.ig-elev-1 { box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06); }
.ig-elev-2 { box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04); }
.ig-elev-3 { box-shadow: 0 18px 40px -12px rgba(15, 23, 42, 0.25), 0 6px 14px rgba(15, 23, 42, 0.08); }
.ig-divider { border-color: rgba(15, 23, 42, 0.06); }
.ig-input { transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease; }
.ig-input:focus { box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15); }
.ig-btn-press { transition: background-color .15s ease, color .15s ease, opacity .15s ease, transform .15s ease; }
.ig-btn-press:active { transform: scale(.97); }
.ig-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:9999px; transition: background-color .15s ease, color .15s ease; }
.ig-icon-btn:hover { background-color: rgba(15, 23, 42, 0.05); }
.ig-id-tag { margin-left: 6px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-tertiary, #94a3b8); font-weight: 400; letter-spacing: 0; }
`
if (typeof document !== 'undefined' && !document.getElementById('photogram-toast-styles')) {
  const style = document.createElement('style')
  style.id = 'photogram-toast-styles'
  style.textContent = toastStyles
  document.head.appendChild(style)
}

export default function PhotogramApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('photogram')

  // State
  const [users, setUsers] = useState<Record<string, User>>({})
  const [posts, setPosts] = useState<MediaPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Navigation state
  const [currentView, setCurrentView] = useState<ViewType>('feed')
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Post detail view state
  const [selectedPost, setSelectedPost] = useState<MediaPost | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Create post modal state
  const [showCreatePostModal, setShowCreatePostModal] = useState(false)
  const [newPostImageUrl, setNewPostImageUrl] = useState('')
  const [newPostCaption, setNewPostCaption] = useState('')
  const [creatingPost, setCreatingPost] = useState(false)

  // Delete post state
  const [postToDelete, setPostToDelete] = useState<MediaPost | null>(null)
  const [deletingPost, setDeletingPost] = useState(false)

  // Create user modal state
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserUsername, setNewUserUsername] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)

  // Delete user state
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false)
  const [deletingUser, setDeletingUser] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<(User | MediaPost)[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Like state (client-side tracking)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set())

  // Save/bookmark state (client-side tracking)
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set())

  // User bios (client-side, no API for this)
  const [userBios, setUserBios] = useState<Record<string, string>>({})

  // Profile tab state
  const [profileTab, setProfileTab] = useState<'posts' | 'saved' | 'tagged'>('posts')

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Followers/following modal state
  const [showFollowersModal, setShowFollowersModal] = useState<'followers' | 'following' | null>(null)

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // Edit profile modal state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [editProfileName, setEditProfileName] = useState('')
  const [editProfileUsername, setEditProfileUsername] = useState('')
  const [editProfileBio, setEditProfileBio] = useState('')

  // Caption editing state
  const [editingCaptionPostId, setEditingCaptionPostId] = useState<string | null>(null)
  const [editCaptionText, setEditCaptionText] = useState('')

  // DM state
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([])
  const [selectedDmUser, setSelectedDmUser] = useState<string | null>(null)
  const [newDmText, setNewDmText] = useState('')

  // Story viewing state
  const [viewingStoryUserId, setViewingStoryUserId] = useState<string | null>(null)

  // Comment input ref for focus management
  const commentInputRef = useRef<HTMLInputElement>(null)

  // Ref to store the latest loadData function for stable refresh handler
  const loadDataRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersResult, postsResult] = await Promise.all([
        api.callTool('list_all_users', {}),
        api.callTool('list_all_media_posts', {}),
      ])

      // Build users map
      const usersMap: Record<string, User> = {}
      for (const user of usersResult || []) {
        usersMap[user.id] = user
      }
      setUsers(usersMap)

      // Set current user (first user, or reset if current user was deleted)
      const userIds = Object.keys(usersMap)
      if (userIds.length > 0 && (!currentUserId || !usersMap[currentUserId])) {
        setCurrentUserId(userIds[0])
      }

      // Sort posts by timestamp (newest first)
      const sortedPosts = (postsResult || []).sort((a: MediaPost, b: MediaPost) => {
        if (!a.timestamp) return 1
        if (!b.timestamp) return -1
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
      setPosts(sortedPosts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [api, currentUserId])

  // Load comments for a post
  const loadComments = useCallback(async (mediaId: string) => {
    setCommentsLoading(true)
    try {
      const result = await api.callTool('list_media_comments', { media_id: mediaId })
      const sortedComments = (result || []).sort((a: Comment, b: Comment) => {
        if (!a.timestamp) return -1
        if (!b.timestamp) return 1
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })
      setComments(sortedComments)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }, [api])

  // Open post detail view
  const openPostDetail = useCallback((post: MediaPost) => {
    setSelectedPost(post)
    loadComments(post.id)
  }, [loadComments])

  // Close post detail view
  const closePostDetail = useCallback(() => {
    setSelectedPost(null)
    setComments([])
    setNewComment('')
  }, [])

  // Navigate to profile - re-fetch all data and user details concurrently
  const goToProfile = useCallback(async (userId: string) => {
    setSelectedProfileUserId(userId)
    setCurrentView('profile')
    setProfileTab('posts')
    // Re-fetch all data and user details concurrently to pick up external changes
    const [, userDetailsResult] = await Promise.allSettled([
      loadDataRef.current(),
      api.callTool('get_user_details', { user_id: userId }),
    ])
    if (userDetailsResult.status === 'fulfilled' && userDetailsResult.value) {
      setUsers(prev => ({ ...prev, [userId]: { ...prev[userId], ...userDetailsResult.value as User } }))
    }
  }, [api])

  // Navigate to feed - re-fetch data to pick up external changes
  const goToFeed = useCallback(() => {
    setCurrentView('feed')
    setSelectedProfileUserId(null)
    loadDataRef.current().catch(() => {})
  }, [])

  // Navigate to DMs
  const goToDMs = useCallback(() => {
    setCurrentView('dms')
    setSelectedProfileUserId(null)
  }, [])

  // Add a new comment
  const addComment = useCallback(async () => {
    if (!selectedPost || !newComment.trim() || !currentUserId) return

    setSubmittingComment(true)
    try {
      await api.callTool('add_comment_to_media', {
        media_id: selectedPost.id,
        user_id: currentUserId,
        message: newComment.trim()
      })

      setNewComment('')
      await loadComments(selectedPost.id)
    } catch (err) {
      console.error('Failed to add comment:', err)
      alert('Failed to post comment. Please try again.')
    } finally {
      setSubmittingComment(false)
    }
  }, [api, selectedPost, newComment, currentUserId, loadComments])

  // Create a new post (persists to backend via API)
  const createPost = useCallback(async () => {
    if (!newPostImageUrl.trim() || !currentUserId) return

    setCreatingPost(true)
    try {
      await api.callTool('create_media_post', {
        user_id: currentUserId,
        image_url: newPostImageUrl.trim(),
        caption: newPostCaption.trim()
      })

      // Reset form
      setNewPostImageUrl('')
      setNewPostCaption('')
      setShowCreatePostModal(false)

      // Reload posts from backend to show persisted data
      await loadData()
    } catch (err) {
      console.error('Failed to create post:', err)
      alert('Failed to create post. Please try again.')
    } finally {
      setCreatingPost(false)
    }
  }, [api, currentUserId, newPostImageUrl, newPostCaption, loadData])

  // Delete a post
  const deletePost = useCallback(async () => {
    if (!postToDelete) return

    setDeletingPost(true)
    try {
      await api.callTool('delete_media_post', {
        media_id: postToDelete.id
      })

      // Remove post from state
      setPosts(prevPosts => prevPosts.filter(p => p.id !== postToDelete.id))

      // Close dialog
      setPostToDelete(null)

      // Close post detail if it was open
      if (selectedPost?.id === postToDelete.id) {
        setSelectedPost(null)
      }
    } catch (err) {
      console.error('Failed to delete post:', err)
      alert('Failed to delete post. Please try again.')
    } finally {
      setDeletingPost(false)
    }
  }, [api, postToDelete, selectedPost])

  // Create a new user
  const createUser = useCallback(async () => {
    if (!newUserId.trim() || !newUserName.trim() || !newUserUsername.trim()) return

    setCreatingUser(true)
    try {
      const result = await api.callTool('create_user', {
        user_id: newUserId.trim(),
        name: newUserName.trim(),
        username: newUserUsername.trim()
      })

      // Reset form
      setNewUserId('')
      setNewUserName('')
      setNewUserUsername('')
      setShowCreateUserModal(false)

      // Reload data to show new user
      await loadData()

      // Navigate to new user's profile
      if (result?.id) {
        goToProfile(result.id)
      }
    } catch (err) {
      console.error('Failed to create user:', err)
      alert('Failed to create user. Please try again.')
    } finally {
      setCreatingUser(false)
    }
  }, [api, newUserId, newUserName, newUserUsername, loadData, goToProfile])

  // Delete current user
  const deleteUser = useCallback(async () => {
    const userIdToDelete = selectedProfileUserId || currentUserId
    if (!userIdToDelete) return

    setDeletingUser(true)
    try {
      await api.callTool('delete_user', {
        user_id: userIdToDelete
      })

      // Close dialog
      setShowDeleteUserDialog(false)

      // Reload data and go to feed
      await loadData()
      goToFeed()
    } catch (err) {
      console.error('Failed to delete user:', err)
      alert('Failed to delete user. Please try again.')
    } finally {
      setDeletingUser(false)
    }
  }, [api, selectedProfileUserId, currentUserId, loadData, goToFeed])

  // Toggle like on a post (client-side)
  const toggleLike = useCallback((postId: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }
      return next
    })
  }, [])

  // Show toast notification
  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToastMessage(message)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2000)
  }, [])

  // Toggle save/bookmark on a post (client-side)
  const toggleSave = useCallback((postId: string) => {
    const wasSaved = savedPosts.has(postId)
    setSavedPosts(prev => {
      const next = new Set(prev)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }
      return next
    })
    showToast(wasSaved ? 'Removed from saved' : 'Post saved')
  }, [showToast, savedPosts])

  // Share post handler (visual feedback)
  const handleShare = useCallback((postId: string) => {
    showToast('Link copied to clipboard')
  }, [showToast])

  // Save caption edit
  const saveCaptionEdit = useCallback((postId: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, caption: editCaptionText } : p
    ))
    setEditingCaptionPostId(null)
    setEditCaptionText('')
  }, [editCaptionText])

  // Save profile edits (client-side only, no update API)
  const saveProfile = useCallback(() => {
    if (!editProfileName.trim() || !editProfileUsername.trim() || !currentUserId) return
    setUsers(prev => ({
      ...prev,
      [currentUserId]: {
        ...prev[currentUserId],
        name: editProfileName.trim(),
        username: editProfileUsername.trim(),
      }
    }))
    setUserBios(prev => ({ ...prev, [currentUserId]: editProfileBio.trim() }))
    setShowEditProfileModal(false)
    showToast('Profile updated')
  }, [currentUserId, editProfileName, editProfileUsername, editProfileBio, showToast])

  // Open edit profile modal with user data pre-filled
  const openEditProfileModal = useCallback((userId: string) => {
    const u = users[userId]
    setEditProfileName(u?.name || '')
    setEditProfileUsername(u?.username || '')
    setEditProfileBio(userBios[userId] || '')
    setShowEditProfileModal(true)
  }, [users, userBios])

  // Send DM
  const sendDm = useCallback(() => {
    if (!newDmText.trim() || !currentUserId || !selectedDmUser) return
    const msg: DirectMessage = {
      id: `dm_${Date.now()}`,
      from: currentUserId,
      to: selectedDmUser,
      text: newDmText.trim(),
      timestamp: new Date().toISOString(),
    }
    setDmMessages(prev => [...prev, msg])
    setNewDmText('')
  }, [newDmText, currentUserId, selectedDmUser])

  // Search users and hashtags
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }

    setSearchLoading(true)
    try {
      const searchTerm = query.trim().toLowerCase()

      // Hashtag search - search posts by caption
      if (searchTerm.startsWith('#')) {
        const hashtag = searchTerm
        const matchingPosts = posts.filter(post =>
          post.caption.toLowerCase().includes(hashtag)
        )
        setSearchResults(matchingPosts)
        setShowSearchDropdown(matchingPosts.length > 0)
        setSearchLoading(false)
        return
      }

      // Filter users by username or name (partial match, case-insensitive)
      const results: User[] = Object.values(users).filter(user => {
        const username = user.username.toLowerCase()
        const name = user.name.toLowerCase()
        return username.includes(searchTerm) || name.includes(searchTerm)
      })

      // Also try API lookup by username if no exact match found
      const hasExactMatch = results.some(u => u.username.toLowerCase() === searchTerm)
      if (!hasExactMatch) {
        try {
          const apiResult = await api.callTool('get_user_id_by_username', { username: query.trim() })
          if (apiResult?.user_id) {
            const alreadyInResults = results.some(u => u.id === apiResult.user_id)
            if (!alreadyInResults) {
              const existingUser = users[apiResult.user_id]
              if (existingUser) {
                results.unshift(existingUser)
              } else {
                results.unshift({ id: apiResult.user_id, name: query.trim(), username: query.trim() })
              }
            }
          }
        } catch {
          // API lookup failed, just use local results
        }
      }

      // Limit to 5 results
      setSearchResults(results.slice(0, 5))
      setShowSearchDropdown(results.length > 0)
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
      setShowSearchDropdown(false)
    } finally {
      setSearchLoading(false)
    }
  }, [users, api, posts])

  // Handle search input with debounce
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (value.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(value)
      }, 300)
    } else {
      setSearchResults([])
      setShowSearchDropdown(false)
    }
  }, [searchUsers])

  // Handle search result selection
  const handleSelectSearchResult = useCallback((result: User | MediaPost) => {
    setSearchQuery('')
    setSearchResults([])
    setShowSearchDropdown(false)
    if ('user_id' in result && 'caption' in result) {
      // It's a post (hashtag search result)
      openPostDetail(result as MediaPost)
    } else {
      // It's a user
      goToProfile((result as User).id)
    }
  }, [goToProfile, openPostDetail])

  // Stable refresh handler using ref pattern to avoid re-render loops
  const refreshAppRef = useRef<() => void>(() => {})

  useEffect(() => {
    loadDataRef.current = loadData
    refreshAppRef.current = () => { loadDataRef.current() }
  })

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for backend state changes (e.g., from admin panel tool calls) with debounce
  // Only reload on mutating tools — read-only calls (list_*, get_*) must be ignored
  // to avoid an infinite loop (loadData itself calls read tools which dispatch this event)
  useEffect(() => {
    const readOnlyTools = new Set([
      'list_all_users', 'list_all_media_posts', 'list_media_comments',
      'get_user_details', 'get_user_id_by_username',
    ])
    let debounceTimer: NodeJS.Timeout | null = null
    const handleStateChange = (e: Event) => {
      const toolName = (e as CustomEvent)?.detail?.toolName
      if (toolName && readOnlyTools.has(toolName)) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => { loadDataRef.current() }, 300)
    }
    window.addEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChange)
    return () => {
      window.removeEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChange)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [])

  // Register refresh handler - stable ref avoids "Maximum update depth exceeded"
  useEffect(() => {
    if (setRefreshHandler) {
      const handler = () => { refreshAppRef.current() }
      setRefreshHandler(handler)
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper functions
  const getUserName = (userId: string) => {
    const user = users[userId]
    return user?.name || user?.username || userId
  }

  const getUserUsername = (userId: string) => {
    const user = users[userId]
    return user?.username || userId
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getAvatarColor = (userId: string) => {
    const colors = [
      '#059669', '#10B981', '#34D399', '#0F172A',
      '#1E293B', '#334155', '#0EA5E9', '#0891B2'
    ]
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  const getUserPosts = (userId: string) => {
    return posts.filter(post => post.user_id === userId)
  }

  // Generate stable pseudo-random number from a string (hash-based)
  const getStableNumber = (id: string, min: number, max: number) => {
    const hash = id.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    const normalized = Math.abs(hash) / 2147483647
    return Math.floor(normalized * (max - min + 1)) + min
  }

  // Use comment count from loaded comments + stable base to provide realistic like counts
  const getPostLikes = (postId: string) => {
    const base = getStableNumber(postId + '_likes', 10, 500)
    const liked = likedPosts.has(postId) ? 1 : 0
    return base + liked
  }

  // Compute follower/following from actual post data
  const getUserFollowers = (userId: string) => {
    // Count unique users who commented on this user's posts
    const userPostIds = new Set(posts.filter(p => p.user_id === userId).map(p => p.id))
    // Use stable number as base since we don't have real follower API
    return getStableNumber(userId + '_followers', 50, 500)
  }
  const getUserFollowing = (userId: string) => {
    return getStableNumber(userId + '_following', 20, 200)
  }

  // Format caption with clickable hashtags
  const formatCaption = (caption: string) => {
    const parts = caption.split(/(#\w+)/g)
    return parts.map((part, index) => {
      if (part.startsWith('#')) {
        return (
          <span
            key={index}
            className="text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              handleSearchChange(part)
              searchUsers(part)
            }}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-9 h-9 border-[3px] border-slate-100 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 003.83 21h16.34a2 2 0 001.72-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="text-sm text-slate-700 max-w-sm">{error}</p>
        <button
          className="ig-btn-press px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-semibold hover:bg-emerald-700 ig-elev-1"
          onClick={loadData}
        >
          Try again
        </button>
      </div>
    )
  }

  // Stories section
  const renderStories = () => {
    const userList = Object.values(users)
    if (userList.length === 0) return null

    return (
      <div className="bg-white px-5 py-5" data-testid="stories-section">
        <div className="flex gap-5 overflow-x-auto max-w-lg mx-auto">
          {userList.map((user) => {
            const userPostCount = getUserPosts(user.id).length
            return (
              <button
                key={user.id}
                className="ig-btn-press flex flex-col items-center gap-1.5 flex-shrink-0"
                onClick={() => {
                  if (userPostCount > 0) {
                    setViewingStoryUserId(user.id)
                  }
                }}
                data-testid={`story-${user.username}`}
              >
                <div className={`w-16 h-16 rounded-full p-[2px] ${userPostCount > 0 ? 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-slate-800' : 'bg-slate-200'}`}>
                  <div className="w-full h-full rounded-full bg-white p-[2px]">
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-white text-lg font-semibold tracking-wide"
                      style={{ backgroundColor: getAvatarColor(user.id) }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-slate-700 truncate w-16 text-center tracking-wide">
                  {user.id === currentUserId ? 'Your story' : user.username}<span className="ig-id-tag">[{user.id}]</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Story viewer modal
  const renderStoryViewer = () => {
    if (!viewingStoryUserId) return null
    const storyUser = users[viewingStoryUserId]
    const storyPosts = getUserPosts(viewingStoryUserId)
    const latestPost = storyPosts[0]

    if (!latestPost) return null

    return (
      <div
        className="ig-overlay fixed inset-0 bg-slate-950 z-50 flex items-center justify-center"
        onClick={() => setViewingStoryUserId(null)}
        data-testid="story-viewer"
      >
        <button
          className="absolute top-4 right-4 text-white/90 hover:text-white hover:bg-white/10 rounded-full p-2 transition-colors z-10"
          onClick={() => setViewingStoryUserId(null)}
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Progress bar */}
        <div className="absolute top-3 left-4 right-4 h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full" style={{ width: '100%' }} />
        </div>

        {/* User info */}
        <div className="absolute top-7 left-4 flex items-center gap-3 z-10">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white/80"
            style={{ backgroundColor: getAvatarColor(viewingStoryUserId) }}
          >
            {getUserName(viewingStoryUserId).charAt(0).toUpperCase()}
          </div>
          <span className="text-white font-semibold text-sm">{storyUser?.username || viewingStoryUserId}<span className="ig-id-tag" style={{ color: 'rgba(255,255,255,0.55)' }}>[{viewingStoryUserId}]</span></span>
          <span className="text-white/60 text-xs">{formatTimestamp(latestPost.timestamp)}</span>
        </div>

        <div className="max-w-md w-full h-[82vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <PostImage
            src={latestPost.image_url}
            alt={latestPost.caption || 'Story'}
            postId={latestPost.id}
            className="max-w-full max-h-full object-contain rounded-xl ig-elev-3"
          />
        </div>

        {latestPost.caption && (
          <div className="absolute bottom-8 left-0 right-0 text-center px-8">
            <p className="text-white text-sm bg-slate-900/60 backdrop-blur-md inline-block px-4 py-2.5 rounded-full leading-relaxed">
              {latestPost.caption}
            </p>
          </div>
        )}
      </div>
    )
  }

  // Profile view
  const renderProfileView = () => {
    const userId = selectedProfileUserId || currentUserId
    if (!userId) return null

    const user = users[userId]
    const userPosts = getUserPosts(userId)
    const isOwnProfile = userId === currentUserId

    return (
      <div className="max-w-4xl mx-auto px-6" data-testid="profile-view">
        {/* Profile Header */}
        <div className="flex items-start gap-10 py-10" data-testid="profile-header">
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center text-white text-5xl font-semibold flex-shrink-0 ring-1 ring-slate-200/70 ig-elev-2"
            style={{ backgroundColor: getAvatarColor(userId) }}
          >
            {getUserName(userId).charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 pt-2">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <h2 className="text-2xl font-light text-slate-900 tracking-tight">{getUserUsername(userId)}<span className="ig-id-tag">[{userId}]</span></h2>
              {isOwnProfile ? (
                <button
                  className="ig-btn-press px-4 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-800"
                  onClick={() => openEditProfileModal(userId)}
                  data-testid="edit-profile-button"
                >
                  Edit profile
                </button>
              ) : (
                <button className="ig-btn-press px-6 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold text-white ig-elev-1">
                  Follow
                </button>
              )}
              <button
                onClick={() => setShowDeleteUserDialog(true)}
                className="ig-icon-btn text-rose-500 hover:!bg-rose-50"
                data-testid="delete-user-button"
                title="Delete Account"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                className="ig-icon-btn text-slate-700"
                onClick={() => setShowSettingsModal(true)}
                data-testid="profile-settings-button"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Stats - show actual post count, stable numbers for followers/following */}
            <div className="flex items-center gap-8 mb-6" data-testid="profile-stats">
              <div className="text-slate-800 text-sm" data-testid="profile-posts-count">
                <span className="font-semibold text-slate-900">{userPosts.length}</span> <span className="text-slate-500">posts</span>
              </div>
              <button
                className="text-slate-800 text-sm hover:text-slate-900 transition-colors"
                data-testid="profile-followers-count"
                onClick={() => setShowFollowersModal('followers')}
              >
                <span className="font-semibold text-slate-900">{getUserFollowers(userId)}</span> <span className="text-slate-500">followers</span>
              </button>
              <button
                className="text-slate-800 text-sm hover:text-slate-900 transition-colors"
                data-testid="profile-following-count"
                onClick={() => setShowFollowersModal('following')}
              >
                <span className="font-semibold text-slate-900">{getUserFollowing(userId)}</span> <span className="text-slate-500">following</span>
              </button>
            </div>

            <div className="space-y-1">
              <p className="font-semibold text-slate-900 text-[15px]">{getUserName(userId)}</p>
              <p className="text-slate-600 text-sm leading-relaxed">{userBios[userId] || `Welcome to my ${APP_NAME} profile!`}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 border-t ig-divider pt-2">
          <button
            className={`ig-btn-press flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${profileTab === 'posts' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            onClick={() => setProfileTab('posts')}
            data-testid="profile-tab-posts"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Posts</span>
          </button>
          <button
            className={`ig-btn-press flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${profileTab === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            onClick={() => setProfileTab('saved')}
            data-testid="profile-tab-saved"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span>Saved</span>
          </button>
          <button
            className={`ig-btn-press flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${profileTab === 'tagged' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            onClick={() => setProfileTab('tagged')}
            data-testid="profile-tab-tagged"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Tagged</span>
          </button>
        </div>

        {/* Tab Content */}
        {profileTab === 'posts' ? (
          <>
            {userPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-slate-900 mb-1.5 tracking-tight">No posts yet</h3>
                <p className="text-sm text-slate-500">When you share photos, they will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 py-6">
                {userPosts.map((post) => (
                  <div
                    key={post.id}
                    className="aspect-square bg-slate-100 relative cursor-pointer group overflow-hidden rounded-xl ig-elev-1"
                    onClick={() => openPostDetail(post)}
                  >
                    <PostImage
                      src={post.image_url}
                      alt={post.caption || 'Post'}
                      postId={post.id}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 gap-6">
                      <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                        <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <span>{getPostLikes(post.id)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : profileTab === 'saved' ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500" data-testid="saved-tab-content">
            {(() => {
              const savedPostsList = posts.filter(p => savedPosts.has(p.id))
              if (savedPostsList.length === 0) {
                return (
                  <>
                    <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-medium text-slate-900 mb-1.5 tracking-tight">No saved posts</h3>
                    <p className="text-sm text-slate-500">Save photos and videos that you want to see again.</p>
                  </>
                )
              }
              return (
                <div className="grid grid-cols-3 gap-2 py-6 w-full">
                  {savedPostsList.map((post) => (
                    <div
                      key={post.id}
                      className="aspect-square bg-slate-100 relative cursor-pointer group overflow-hidden rounded-xl ig-elev-1"
                      onClick={() => openPostDetail(post)}
                    >
                      <PostImage
                        src={post.image_url}
                        alt={post.caption || 'Post'}
                        postId={post.id}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 gap-6">
                        <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                          <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                          <span>{getPostLikes(post.id)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500" data-testid="tagged-tab-content">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-slate-900 mb-1.5 tracking-tight">No tagged posts</h3>
            <p className="text-sm text-slate-500">When people tag you in photos, they'll appear here.</p>
          </div>
        )}
      </div>
    )
  }

  // DM view
  const renderDmView = () => {
    const otherUsers = Object.values(users).filter(u => u.id !== currentUserId)
    const conversationMessages = selectedDmUser
      ? dmMessages.filter(m =>
          (m.from === currentUserId && m.to === selectedDmUser) ||
          (m.from === selectedDmUser && m.to === currentUserId)
        )
      : []

    return (
      <div className="max-w-4xl mx-auto h-full flex" data-testid="dm-view">
        {/* Conversations list */}
        <div className="w-80 border-r ig-divider flex flex-col">
          <div className="px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Messages</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {otherUsers.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">No users to message</div>
            ) : (
              otherUsers.map(user => {
                const lastMsg = dmMessages
                  .filter(m => (m.from === currentUserId && m.to === user.id) || (m.from === user.id && m.to === currentUserId))
                  .slice(-1)[0]
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedDmUser(user.id)}
                    className={`ig-btn-press w-full flex items-center gap-3 px-3 py-3 mb-1 rounded-xl text-left transition-colors ${selectedDmUser === user.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                    data-testid={`dm-user-${user.username}`}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                      style={{ backgroundColor: getAvatarColor(user.id) }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{user.username}<span className="ig-id-tag">[{user.id}]</span></p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {lastMsg ? lastMsg.text : 'No messages yet'}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {!selectedDmUser ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900 tracking-tight">Your messages</p>
                <p className="text-sm text-slate-500 mt-1">Select a conversation to start messaging</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-4 border-b ig-divider flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                  style={{ backgroundColor: getAvatarColor(selectedDmUser) }}
                >
                  {getUserName(selectedDmUser).charAt(0).toUpperCase()}
                </div>
                <span className="font-semibold text-slate-900 text-sm">{getUserUsername(selectedDmUser)}<span className="ig-id-tag">[{selectedDmUser}]</span></span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-2.5">
                {conversationMessages.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-10">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  conversationMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.from === currentUserId ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.from === currentUserId
                          ? 'bg-emerald-600 text-white rounded-br-md ig-elev-1'
                          : 'bg-slate-100 text-slate-900 rounded-bl-md'
                      }`}>
                        {msg.text}<span className="ig-id-tag" style={{ color: msg.from === currentUserId ? 'rgba(255,255,255,0.65)' : undefined }}>[{msg.id}]</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input */}
              <div className="px-5 py-4 border-t ig-divider flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Message..."
                  value={newDmText}
                  onChange={(e) => setNewDmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendDm()
                    }
                  }}
                  className="ig-input flex-1 px-4 py-2.5 bg-slate-50 border border-transparent rounded-full text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  data-testid="dm-input"
                />
                <button
                  onClick={sendDm}
                  disabled={!newDmText.trim()}
                  className={`ig-btn-press text-sm font-semibold px-4 py-2.5 rounded-full transition-colors ${newDmText.trim() ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-300 cursor-not-allowed'}`}
                  data-testid="dm-send-button"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Feed view
  const renderFeedView = () => (
    <div>
      {/* Stories section */}
      {renderStories()}

      <div className="max-w-lg mx-auto px-4 py-4">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="w-16 h-16 mb-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xl font-medium text-slate-900 tracking-tight">No posts yet</p>
            <p className="text-sm text-slate-500 mt-1.5">When posts are shared, they'll appear here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => {
              const isLiked = likedPosts.has(post.id)
              return (
                <article key={post.id} className="bg-white rounded-2xl ig-elev-2 overflow-hidden border ig-divider" data-testid="feed-post">
                  {/* Post Header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      className="ig-btn-press flex items-center gap-3 -ml-1 px-1 py-1 rounded-lg hover:bg-slate-50"
                      onClick={() => goToProfile(post.user_id)}
                      data-testid="post-username-link"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-white"
                        style={{ backgroundColor: getAvatarColor(post.user_id) }}
                      >
                        {getUserName(post.user_id).charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-900" data-testid="post-username">{getUserUsername(post.user_id)}<span className="ig-id-tag">[{post.id}]</span></p>
                        <p className="text-[11px] text-slate-400 mt-0.5 tracking-wide">{formatTimestamp(post.timestamp)}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setPostToDelete(post)}
                      className="ig-icon-btn text-rose-500 hover:!bg-rose-50"
                      data-testid="delete-post-button"
                      title="Delete post"
                    >
                      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Post Image - React-based image with fallback */}
                  <div
                    className="aspect-square bg-slate-100 relative cursor-pointer overflow-hidden"
                    onClick={() => openPostDetail(post)}
                    data-testid="post-image-container"
                  >
                    <PostImage
                      src={post.image_url}
                      alt={post.caption || 'Post image'}
                      postId={post.id}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Post Actions - like/unlike toggle */}
                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          className="ig-icon-btn"
                          onClick={() => toggleLike(post.id)}
                          data-testid="like-button"
                          title={isLiked ? 'Unlike' : 'Like'}
                        >
                          {isLiked ? (
                            <svg className="w-6 h-6 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          className="ig-icon-btn"
                          onClick={() => openPostDetail(post)}
                          title="Comment"
                        >
                          <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                        <button
                          className="ig-icon-btn"
                          onClick={() => handleShare(post.id)}
                          data-testid="share-button"
                          title="Share"
                        >
                          <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
                      </div>
                      <button
                        className="ig-icon-btn"
                        onClick={() => toggleSave(post.id)}
                        data-testid="save-button"
                        title={savedPosts.has(post.id) ? 'Unsave' : 'Save'}
                      >
                        {savedPosts.has(post.id) ? (
                          <svg className="w-6 h-6 text-emerald-700" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Likes count */}
                    <p className="text-sm font-semibold text-slate-900 mb-1.5" data-testid="post-likes">
                      {getPostLikes(post.id).toLocaleString()} likes
                    </p>

                    {/* Caption - editable caption */}
                    {post.caption && (
                      <div className="text-sm mb-1.5 text-slate-800 leading-relaxed">
                        {editingCaptionPostId === post.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editCaptionText}
                              onChange={(e) => setEditCaptionText(e.target.value)}
                              className="ig-input flex-1 bg-slate-50 border border-transparent rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCaptionEdit(post.id)
                                if (e.key === 'Escape') setEditingCaptionPostId(null)
                              }}
                              autoFocus
                              data-testid="edit-caption-input"
                            />
                            <button
                              onClick={() => saveCaptionEdit(post.id)}
                              className="text-emerald-700 text-xs font-semibold px-2 py-1 rounded hover:bg-emerald-50"
                              data-testid="save-caption-button"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCaptionPostId(null)}
                              className="text-slate-500 text-xs px-2 py-1 rounded hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <p>
                            <button
                              className="font-semibold hover:underline text-slate-900"
                              onClick={() => goToProfile(post.user_id)}
                            >
                              {getUserUsername(post.user_id)}
                            </button>{' '}
                            <span>{formatCaption(post.caption)}</span>
                            {post.user_id === currentUserId && (
                              <button
                                className="ml-2 text-slate-400 hover:text-slate-600 text-xs"
                                onClick={() => {
                                  setEditingCaptionPostId(post.id)
                                  setEditCaptionText(post.caption)
                                }}
                                data-testid="edit-caption-button"
                              >
                                Edit
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {/* View comments link */}
                    <button
                      className="text-sm text-slate-500 hover:text-slate-800 transition-colors block"
                      onClick={() => openPostDetail(post)}
                      data-testid="view-comments-link"
                    >
                      View all comments
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <header className="h-16 bg-white/90 backdrop-blur-md border-b ig-divider flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-30">
        <button
          onClick={goToFeed}
          className="ig-btn-press text-2xl text-slate-900 hover:text-emerald-700 transition-colors"
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 600,
            letterSpacing: '-0.5px'
          }}
        >
          {APP_NAME}
        </button>

        {/* Search bar - supports hashtag search */}
        <div className="flex-1 max-w-xs mx-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users or #hashtags"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="ig-input w-full bg-slate-100 border border-transparent rounded-full py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
              data-testid="search-input"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

          {/* Search results dropdown */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl ig-elev-3 border ig-divider overflow-hidden z-50" data-testid="search-dropdown">
              {searchResults.map((result, idx) => {
                // Check if it's a post (hashtag result) or user
                if ('caption' in result && 'user_id' in result) {
                  const post = result as MediaPost
                  return (
                    <button
                      key={`post-${post.id}`}
                      onClick={() => handleSelectSearchResult(result)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                      data-testid={`search-result-post-${post.id}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-slate-900 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{post.caption}<span className="ig-id-tag">[{post.id}]</span></div>
                        <div className="text-xs text-slate-500 mt-0.5">by {getUserUsername(post.user_id)}</div>
                      </div>
                    </button>
                  )
                }
                const user = result as User
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectSearchResult(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                    data-testid={`search-result-${user.username}`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                      style={{ backgroundColor: getAvatarColor(user.id) }}
                    >
                      {getUserUsername(user.id).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{user.username}<span className="ig-id-tag">[{user.id}]</span></div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{user.name}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          </div>
        </div>

        {/* Nav icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToFeed}
            className={`ig-icon-btn ${currentView === 'feed' ? '!bg-emerald-50 text-emerald-700' : 'text-slate-700'}`}
            title="Home"
          >
            {currentView === 'feed' ? (
              <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3l9 8h-3v10h-5v-6h-2v6H6V11H3l9-8z" />
              </svg>
            ) : (
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )}
          </button>
          {/* DM button now navigates to DM view */}
          <button
            className={`ig-icon-btn ${currentView === 'dms' ? '!bg-emerald-50 text-emerald-700' : 'text-slate-700'}`}
            onClick={goToDMs}
            data-testid="dm-button"
            title="Messages"
          >
            <svg className="w-[22px] h-[22px]" fill={currentView === 'dms' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreatePostModal(true)}
            className="ig-icon-btn text-slate-700"
            data-testid="create-post-button"
            title="Create post"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreateUserModal(true)}
            className="ig-icon-btn text-slate-700"
            data-testid="create-user-button"
            title="Create new user"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </button>
          <button
            className="ig-icon-btn text-slate-700"
            onClick={() => showToast('No new activity')}
            data-testid="activity-button"
            title="Activity"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
          {currentUserId && (
            <button
              onClick={() => goToProfile(currentUserId)}
              className={`ig-btn-press ml-1 p-[3px] rounded-full transition-all ${currentView === 'profile' && selectedProfileUserId === currentUserId ? 'ring-2 ring-emerald-600' : 'ring-1 ring-slate-200 hover:ring-slate-300'}`}
              title="Profile"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: getAvatarColor(currentUserId) }}
              >
                {getUserName(currentUserId).charAt(0).toUpperCase()}
              </div>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {currentView === 'feed' ? renderFeedView() : currentView === 'dms' ? renderDmView() : renderProfileView()}
      </main>

      {/* Story Viewer */}
      {renderStoryViewer()}

      {/* Post Detail Modal */}
      {selectedPost && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closePostDetail}
          data-testid="post-detail-modal"
        >
          <button
            className="absolute top-4 right-4 text-white/90 hover:text-white hover:bg-white/10 rounded-full p-2 transition-colors z-10"
            onClick={closePostDetail}
            data-testid="modal-close-button"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="ig-modal bg-white rounded-2xl overflow-hidden max-w-5xl w-full h-[78vh] max-h-[820px] flex ig-elev-3"
            onClick={(e) => e.stopPropagation()}
            data-testid="modal-content"
          >
            {/* Left side - Image */}
            <div className="w-[60%] bg-slate-950 flex items-center justify-center flex-shrink-0" data-testid="modal-image-container">
              <PostImage
                src={selectedPost.image_url}
                alt={selectedPost.caption || 'Post image'}
                postId={selectedPost.id}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Right side - Details & Comments */}
            <div className="w-[40%] flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b ig-divider flex-shrink-0">
                <button onClick={() => { closePostDetail(); goToProfile(selectedPost.user_id); }} className="ig-btn-press">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ring-1 ring-slate-200"
                    style={{ backgroundColor: getAvatarColor(selectedPost.user_id) }}
                  >
                    {getUserName(selectedPost.user_id).charAt(0).toUpperCase()}
                  </div>
                </button>
                <button
                  className="text-sm font-semibold text-slate-900 hover:text-emerald-700 transition-colors"
                  onClick={() => { closePostDetail(); goToProfile(selectedPost.user_id); }}
                >
                  {getUserUsername(selectedPost.user_id)}<span className="ig-id-tag">[{selectedPost.id}]</span>
                </button>
                <button
                  className="ig-icon-btn ml-auto text-slate-700"
                  onClick={() => showToast('Post options not available')}
                  title="More"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>
              </div>

              {/* Comments section - ensure comments load */}
              <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="comments-section">
                {/* Caption as first comment */}
                {selectedPost.caption && (
                  <div className="flex gap-3 mb-5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                      style={{ backgroundColor: getAvatarColor(selectedPost.user_id) }}
                    >
                      {getUserName(selectedPost.user_id).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        <span className="font-semibold text-slate-900">{getUserUsername(selectedPost.user_id)}</span><span className="ig-id-tag">[{selectedPost.user_id}]</span>{' '}
                        {formatCaption(selectedPost.caption)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1.5">
                        {formatTimestamp(selectedPost.timestamp)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Comments */}
                {commentsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-slate-100 border-t-emerald-600 rounded-full animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12" data-testid="no-comments-message">
                    <p className="text-lg font-semibold text-slate-900 tracking-tight mb-1">No comments yet</p>
                    <p className="text-sm text-slate-500">Start the conversation.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3 group" data-testid={`comment-${comment.id}`}>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                          style={{ backgroundColor: getAvatarColor(comment.user_id) }}
                        >
                          {getUserName(comment.user_id).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-slate-800 leading-relaxed">
                            <span className="font-semibold text-slate-900">{getUserUsername(comment.user_id)}</span><span className="ig-id-tag">[{comment.id}]</span>{' '}
                            {comment.message}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-xs text-slate-400">
                              {formatTimestamp(comment.timestamp)}
                            </p>
                            <button
                              className="text-xs text-slate-500 font-semibold hover:text-slate-800 transition-colors"
                              onClick={() => showToast('Reply is not supported')}
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all self-start mt-1 text-slate-300"
                          onClick={() => showToast('Liked comment')}
                          title="Like comment"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t ig-divider flex-shrink-0">
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      className="ig-icon-btn"
                      onClick={() => toggleLike(selectedPost.id)}
                      data-testid="modal-like-button"
                      title={likedPosts.has(selectedPost.id) ? 'Unlike' : 'Like'}
                    >
                      {likedPosts.has(selectedPost.id) ? (
                        <svg className="w-6 h-6 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      )}
                    </button>
                    <button
                      className="ig-icon-btn"
                      onClick={() => commentInputRef.current?.focus()}
                      title="Comment"
                    >
                      <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                    <button
                      className="ig-icon-btn"
                      onClick={() => handleShare(selectedPost.id)}
                      data-testid="modal-share-button"
                      title="Share"
                    >
                      <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                  <button
                    className="ig-icon-btn"
                    onClick={() => toggleSave(selectedPost.id)}
                    data-testid="modal-save-button"
                    title={savedPosts.has(selectedPost.id) ? 'Unsave' : 'Save'}
                  >
                    {savedPosts.has(selectedPost.id) ? (
                      <svg className="w-6 h-6 text-emerald-700" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="px-5 pb-3">
                  <p className="text-sm font-semibold text-slate-900">{getPostLikes(selectedPost.id).toLocaleString()} likes</p>
                  <p className="text-[11px] text-slate-400 tracking-wide mt-1">
                    {formatTimestamp(selectedPost.timestamp)}
                  </p>
                </div>

                {/* Add comment input */}
                <div className="flex items-center gap-2 px-3 py-3 border-t ig-divider" data-testid="comment-input-container">
                  <button
                    className="ig-icon-btn text-slate-700"
                    onClick={() => showToast('Emoji picker is not available')}
                    title="Emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        addComment()
                      }
                    }}
                    ref={commentInputRef}
                    className="flex-1 text-sm border-none outline-none bg-transparent text-slate-900 placeholder-slate-400 px-1"
                    disabled={submittingComment}
                    data-testid="comment-input"
                  />
                  <button
                    onClick={addComment}
                    disabled={!newComment.trim() || submittingComment}
                    className={`ig-btn-press text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      newComment.trim() && !submittingComment
                        ? 'text-emerald-700 hover:bg-emerald-50 cursor-pointer'
                        : 'text-slate-300 cursor-not-allowed'
                    }`}
                    data-testid="comment-post-button"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Post Modal */}
      {showCreatePostModal && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreatePostModal(false)}
          data-testid="create-post-dialog"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b ig-divider sticky top-0 bg-white z-10">
              <button
                onClick={() => setShowCreatePostModal(false)}
                className="ig-icon-btn text-slate-500 hover:!bg-slate-100"
                data-testid="create-post-cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Create new post</h2>
              <button
                onClick={createPost}
                disabled={!newPostImageUrl.trim() || creatingPost}
                className={`ig-btn-press text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                  newPostImageUrl.trim() && !creatingPost
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ig-elev-1'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                data-testid="create-post-submit"
              >
                {creatingPost ? 'Sharing...' : 'Share'}
              </button>
            </div>

            <div className="p-5">
              {currentUserId && (
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ backgroundColor: getAvatarColor(currentUserId) }}
                  >
                    {getUserName(currentUserId).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {getUserUsername(currentUserId)}<span className="ig-id-tag">[{currentUserId}]</span>
                  </span>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">
                  Image URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  value={newPostImageUrl}
                  onChange={(e) => setNewPostImageUrl(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  disabled={creatingPost}
                  data-testid="create-post-image-url"
                />
              </div>

              {newPostImageUrl.trim() && (
                <div className="mb-4 rounded-xl overflow-hidden ig-elev-1 bg-slate-100">
                  <PostImage
                    src={newPostImageUrl}
                    alt="Preview"
                    postId="preview"
                    className="w-full h-64 object-cover"
                  />
                </div>
              )}

              <div className="mb-2">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">
                  Caption
                </label>
                <textarea
                  placeholder="Write a caption..."
                  value={newPostCaption}
                  onChange={(e) => setNewPostCaption(e.target.value)}
                  rows={3}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 resize-none leading-relaxed"
                  disabled={creatingPost}
                  data-testid="create-post-caption"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Post Confirmation Dialog */}
      {postToDelete && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !deletingPost && setPostToDelete(null)}
          data-testid="delete-post-dialog"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-sm w-full overflow-hidden ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2 tracking-tight">Delete post?</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Are you sure you want to delete this post? This action cannot be undone.
              </p>
            </div>

            <div className="px-5 pb-5 flex flex-col gap-2">
              <button
                onClick={deletePost}
                disabled={deletingPost}
                className={`ig-btn-press w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  deletingPost
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-rose-500 text-white hover:bg-rose-600 ig-elev-1'
                }`}
                data-testid="confirm-delete-post-button"
              >
                {deletingPost ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setPostToDelete(null)}
                disabled={deletingPost}
                className={`ig-btn-press w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  deletingPost
                    ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
                data-testid="cancel-delete-post-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreateUserModal(false)}
          data-testid="create-user-dialog"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-lg w-full overflow-hidden ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b ig-divider">
              <button
                onClick={() => setShowCreateUserModal(false)}
                className="ig-icon-btn text-slate-500 hover:!bg-slate-100"
                data-testid="create-user-cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Create new user</h2>
              <button
                onClick={createUser}
                disabled={!newUserId.trim() || !newUserName.trim() || !newUserUsername.trim() || creatingUser}
                className={`ig-btn-press text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                  newUserId.trim() && newUserName.trim() && newUserUsername.trim() && !creatingUser
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ig-elev-1'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                data-testid="create-user-submit"
              >
                {creatingUser ? 'Creating...' : 'Create'}
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">
                  User ID
                </label>
                <input
                  type="text"
                  placeholder="user_123"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  disabled={creatingUser}
                  data-testid="create-user-id"
                />
                <p className="text-xs text-slate-500 mt-1.5">Letters, numbers, periods, and underscores only</p>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">
                  Full name
                </label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  disabled={creatingUser}
                  data-testid="create-user-name"
                />
              </div>

              <div className="mb-2">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="johndoe"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  disabled={creatingUser}
                  data-testid="create-user-username"
                />
                <p className="text-xs text-slate-500 mt-1.5">This will be your @username</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Followers/Following Modal */}
      {showFollowersModal && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowFollowersModal(null)}
          data-testid="followers-modal"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-sm w-full max-h-[65vh] overflow-hidden ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b ig-divider">
              <h2 className="text-base font-semibold text-slate-900 capitalize tracking-tight">{showFollowersModal}</h2>
              <button
                onClick={() => setShowFollowersModal(null)}
                className="ig-icon-btn text-slate-500 hover:!bg-slate-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-2">
              {(() => {
                const otherUsersList = Object.values(users).filter(u => u.id !== (selectedProfileUserId || currentUserId))
                if (otherUsersList.length === 0) {
                  return (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No {showFollowersModal} to show
                    </div>
                  )
                }
                const limit = showFollowersModal === 'followers' ? 10 : 8
                return otherUsersList.slice(0, limit).map(user => (
                  <button
                    key={user.id}
                    className="ig-btn-press w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                    onClick={() => { setShowFollowersModal(null); goToProfile(user.id); }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                      style={{ backgroundColor: getAvatarColor(user.id) }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{user.username}<span className="ig-id-tag">[{user.id}]</span></p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{user.name}</p>
                    </div>
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[60] bg-slate-900/95 text-white px-5 py-3 rounded-full text-sm font-medium ig-elev-3 backdrop-blur-md"
          data-testid="toast-notification"
          style={{ animation: 'fadeInUp 0.3s ease-out' }}
        >
          {toastMessage}
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfileModal && currentUserId && (
        <div
          className="ig-overlay absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowEditProfileModal(false)}
          data-testid="edit-profile-modal"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-md w-full overflow-hidden my-auto ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b ig-divider">
              <button
                onClick={() => setShowEditProfileModal(false)}
                className="ig-icon-btn text-slate-500 hover:!bg-slate-100"
                data-testid="edit-profile-cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Edit profile</h2>
              <button
                onClick={saveProfile}
                disabled={!editProfileName.trim() || !editProfileUsername.trim()}
                className={`ig-btn-press text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                  editProfileName.trim() && editProfileUsername.trim()
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ig-elev-1'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                data-testid="edit-profile-submit"
              >
                Done
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4 mb-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-semibold flex-shrink-0 ring-1 ring-slate-200"
                  style={{ backgroundColor: getAvatarColor(currentUserId) }}
                >
                  {editProfileName.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{users[currentUserId]?.username}<span className="ig-id-tag">[{currentUserId}]</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">Edit your profile information</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">Name</label>
                <input
                  type="text"
                  value={editProfileName}
                  onChange={(e) => setEditProfileName(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  data-testid="edit-profile-name"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">Username</label>
                <input
                  type="text"
                  value={editProfileUsername}
                  onChange={(e) => setEditProfileUsername(e.target.value)}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  data-testid="edit-profile-username"
                />
              </div>

              <div className="mb-2">
                <label className="block text-xs font-semibold text-slate-600 mb-2 tracking-wide uppercase">Bio</label>
                <textarea
                  value={editProfileBio}
                  onChange={(e) => setEditProfileBio(e.target.value)}
                  placeholder="Write a bio..."
                  rows={3}
                  className="ig-input w-full px-3.5 py-2.5 bg-slate-50 border border-transparent rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 resize-none leading-relaxed"
                  data-testid="edit-profile-bio"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSettingsModal(false)}
          data-testid="settings-modal"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-sm w-full max-h-[75vh] overflow-hidden ig-elev-3 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b ig-divider">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="ig-icon-btn text-slate-500 hover:!bg-slate-100"
                data-testid="settings-close-button"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto">
              {/* Current Account */}
              {currentUserId && (
                <div className="p-5 border-b ig-divider">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold mb-3 tracking-wider">Current account</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ring-1 ring-slate-200"
                      style={{ backgroundColor: getAvatarColor(currentUserId) }}
                    >
                      {getUserName(currentUserId).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{getUserUsername(currentUserId)}<span className="ig-id-tag">[{currentUserId}]</span></p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{getUserName(currentUserId)}</p>
                    </div>
                    <div className="ml-auto w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Switch Account */}
              {(() => {
                const otherUsers = Object.values(users).filter(u => u.id !== currentUserId)
                if (otherUsers.length === 0) return null
                return (
                <div className="border-b ig-divider px-2 py-3">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold px-3 mb-2 tracking-wider">Switch account</p>
                  <div className="overflow-y-auto max-h-[30vh]">
                    {otherUsers.map(user => (
                      <button
                        key={user.id}
                        onClick={() => {
                          setCurrentUserId(user.id)
                          setShowSettingsModal(false)
                          setCurrentView('feed')
                          setSelectedProfileUserId(null)
                          showToast(`Switched to @${user.username}`)
                        }}
                        className="ig-btn-press w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-left"
                        data-testid={`switch-account-${user.username}`}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                          style={{ backgroundColor: getAvatarColor(user.id) }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{user.username}<span className="ig-id-tag">[{user.id}]</span></p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{user.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                )
              })()}

              {/* Actions */}
              <div className="p-2 space-y-0.5">
                <button
                  onClick={() => {
                    setShowSettingsModal(false)
                    setShowCreateUserModal(true)
                  }}
                  className="ig-btn-press w-full text-left text-sm text-emerald-700 font-semibold py-2.5 px-3 hover:bg-emerald-50 rounded-xl transition-colors"
                  data-testid="settings-add-account"
                >
                  Add account
                </button>
                <button
                  onClick={() => {
                    setShowSettingsModal(false)
                    if (currentUserId) {
                      goToProfile(currentUserId)
                      openEditProfileModal(currentUserId)
                    }
                  }}
                  className="ig-btn-press w-full text-left text-sm text-slate-800 py-2.5 px-3 hover:bg-slate-50 rounded-xl transition-colors"
                  data-testid="settings-edit-profile"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => {
                    setShowSettingsModal(false)
                    loadDataRef.current()
                    showToast('Data refreshed')
                  }}
                  className="ig-btn-press w-full text-left text-sm text-slate-800 py-2.5 px-3 hover:bg-slate-50 rounded-xl transition-colors"
                  data-testid="settings-refresh"
                >
                  Refresh data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Dialog */}
      {showDeleteUserDialog && (
        <div
          className="ig-overlay fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowDeleteUserDialog(false)}
          data-testid="delete-user-dialog"
        >
          <div
            className="ig-modal bg-white rounded-2xl max-w-md w-full overflow-hidden ig-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-7">
              <div className="flex items-center justify-center mb-5">
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-center text-slate-900 mb-2 tracking-tight">
                Delete account?
              </h3>
              <p className="text-sm text-slate-500 text-center mb-3 leading-relaxed">
                This action cannot be undone. Deleting your account will permanently remove:
              </p>
              <ul className="text-sm text-slate-600 mb-6 space-y-1.5 pl-5">
                <li className="list-disc marker:text-slate-300">Your profile and user information</li>
                <li className="list-disc marker:text-slate-300">All your posts and media</li>
                <li className="list-disc marker:text-slate-300">All comments on your posts</li>
                <li className="list-disc marker:text-slate-300">All your comments on other posts</li>
              </ul>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteUserDialog(false)}
                  className="ig-btn-press flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-800 transition-colors"
                  disabled={deletingUser}
                  data-testid="cancel-delete-user-button"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteUser}
                  className="ig-btn-press flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ig-elev-1"
                  disabled={deletingUser}
                  data-testid="confirm-delete-user-button"
                >
                  {deletingUser ? 'Deleting...' : 'Delete account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
