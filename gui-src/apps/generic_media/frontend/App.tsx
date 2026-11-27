import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const INTENT_TYPES = [
  'ALBUM',
  'ARTIST',
  'GENERIC_MUSIC',
  'GENERIC_PODCAST',
  'GENERIC_MUSIC_NEW',
  'GENERIC_SOMETHING_ELSE',
  'LIKED_SONGS',
  'PERSONAL_PLAYLIST',
  'PODCAST_EPISODE',
  'PODCAST_SHOW',
  'PUBLIC_PLAYLIST',
  'TRACK',
] as const

const FILTERING_TYPES = ['ALBUM', 'PLAYLIST', 'TRACK'] as const

const INTENT_CONTENT_MAP: Record<string, string[]> = {
  TRACK: ['TRACK'], ALBUM: ['ALBUM'], ARTIST: ['ARTIST'],
  PODCAST_EPISODE: ['PODCAST_EPISODE'], PODCAST_SHOW: ['PODCAST_SHOW'],
  PERSONAL_PLAYLIST: ['PLAYLIST'], PUBLIC_PLAYLIST: ['PLAYLIST'],
  LIKED_SONGS: ['TRACK'],
  GENERIC_MUSIC: ['TRACK', 'ALBUM', 'ARTIST', 'PLAYLIST'],
  GENERIC_MUSIC_NEW: ['TRACK', 'ALBUM', 'ARTIST', 'PLAYLIST'],
  GENERIC_PODCAST: ['PODCAST_EPISODE', 'PODCAST_SHOW'],
  GENERIC_SOMETHING_ELSE: ['TRACK', 'ALBUM', 'ARTIST', 'PLAYLIST', 'PODCAST_EPISODE', 'PODCAST_SHOW'],
}

const CONTENT_TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  TRACK: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400', icon: 'M9 18V5l12-2v13M9 18c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm12-2c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z' },
  ALBUM: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400', icon: '' },
  ARTIST: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-600 dark:text-pink-400', icon: '' },
  PLAYLIST: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400', icon: '' },
  PODCAST_EPISODE: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-600 dark:text-orange-400', icon: '' },
  PODCAST_SHOW: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400', icon: '' },
}

function getTypeStyle(contentType: string) {
  return CONTENT_TYPE_COLORS[contentType] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', icon: '' }
}

function ThumbnailIcon({ contentType, size = 'md' }: { contentType: string; size?: 'sm' | 'md' | 'lg' }) {
  const style = getTypeStyle(contentType)
  const sizeClass = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-12 h-12' : 'w-10 h-10'
  const iconSize = size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-6 h-6' : 'w-5 h-5'

  const iconPath = (() => {
    switch (contentType) {
      case 'TRACK': return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      )
      case 'ALBUM': return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
        </svg>
      )
      case 'ARTIST': return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      )
      case 'PLAYLIST': return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      )
      case 'PODCAST_EPISODE':
      case 'PODCAST_SHOW': return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )
      default: return (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      )
    }
  })()

  return (
    <div className={`${sizeClass} rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0 ${style.text}`}>
      {iconPath}
    </div>
  )
}

interface MediaItemMetadata {
  entity_title?: string | null
  container_title?: string | null
  description?: string | null
  artist_name?: string | null
  content_type: string
}

interface MediaItem {
  uri: string
  media_item_metadata: MediaItemMetadata
  provider?: string | null
  action_card_content_passthrough?: string | null
}

interface Playlist {
  id: string
  name: string
  items: MediaItem[]
  createdAt: string
}

interface StatusMessage {
  type: 'success' | 'error'
  message: string
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: { appId: string; title?: string; props?: Record<string, unknown> }) => void
}

type ViewMode = 'search' | 'library' | 'playlists' | 'detail' | 'upload' | 'edit'

const STORAGE_KEY = 'generic_media_library'
const PLAYLISTS_KEY = 'generic_media_playlists'

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage full or unavailable
  }
}

function dbStateToMediaItems(state: Record<string, unknown>): { items: MediaItem[]; dbPlaylists: Playlist[] } {
  const items: MediaItem[] = []
  const albumMap = new Map<string, string>()
  const trackMap = new Map<string, MediaItem>()
  const tracks = (state.tracks || []) as Array<Record<string, unknown>>
  const albums = (state.albums || []) as Array<Record<string, unknown>>
  const artists = (state.artists || []) as Array<Record<string, unknown>>
  const playlists = (state.playlists || []) as Array<Record<string, unknown>>
  const podcasts = (state.podcasts || []) as Array<Record<string, unknown>>

  for (const a of albums) {
    albumMap.set(a.id as string, a.title as string)
  }

  for (const t of tracks) {
    const albumId = t.album_id as string | undefined
    const item: MediaItem = {
      uri: `${t.provider}:track:${t.id}`,
      media_item_metadata: {
        entity_title: t.title as string,
        artist_name: t.artist_name as string,
        content_type: 'TRACK',
        container_title: albumId ? (albumMap.get(albumId) ?? null) : null,
      },
      provider: t.provider as string,
    }
    items.push(item)
    trackMap.set(t.id as string, item)
  }

  for (const a of albums) {
    items.push({
      uri: `${a.provider}:album:${a.id}`,
      media_item_metadata: {
        entity_title: a.title as string,
        artist_name: a.artist_name as string,
        content_type: 'ALBUM',
      },
      provider: a.provider as string,
    })
  }

  for (const a of artists) {
    items.push({
      uri: `${a.provider}:artist:${a.id}`,
      media_item_metadata: {
        entity_title: a.name as string,
        content_type: 'ARTIST',
      },
      provider: a.provider as string,
    })
  }

  for (const s of podcasts) {
    items.push({
      uri: `${s.provider}:podcast_show:${s.id}`,
      media_item_metadata: {
        entity_title: s.title as string,
        content_type: 'PODCAST_SHOW',
      },
      provider: s.provider as string,
    })
    for (const ep of (s.episodes || []) as Array<Record<string, unknown>>) {
      const epProvider = (ep.provider || s.provider) as string
      items.push({
        uri: `${epProvider}:podcast_episode:${ep.id}`,
        media_item_metadata: {
          entity_title: ep.title as string,
          content_type: 'PODCAST_EPISODE',
          container_title: s.title as string,
        },
        provider: epProvider,
      })
    }
  }

  const dbPlaylists: Playlist[] = playlists.map(pl => ({
    id: pl.id as string,
    name: pl.name as string,
    items: ((pl.track_ids || []) as string[])
      .map(tid => trackMap.get(tid))
      .filter((item): item is MediaItem => item != null),
    createdAt: new Date().toISOString(),
  }))

  return { items, dbPlaylists }
}

export default function GenericMediaApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('generic_media')

  const [query, setQuery] = useState('')
  const [intentType, setIntentType] = useState<string>('GENERIC_MUSIC')
  const [filteringType, setFilteringType] = useState<string>('')
  const [searchResults, setSearchResults] = useState<MediaItem[]>([])
  const [library, setLibrary] = useState<MediaItem[]>(() => loadFromStorage(STORAGE_KEY, []))
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadFromStorage(PLAYLISTS_KEY, []))
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('search')
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null)
  const [nowPlaying, setNowPlaying] = useState<MediaItem | null>(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [showAddToPlaylist, setShowAddToPlaylist] = useState<MediaItem | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    entity_title: '',
    artist_name: '',
    content_type: 'TRACK',
    container_title: '',
    description: '',
    provider: '',
  })

  // Edit form state
  const [editForm, setEditForm] = useState({
    entity_title: '',
    artist_name: '',
    content_type: '',
    container_title: '',
    description: '',
  })

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshHandlerSetRef = useRef(false)

  const showStatus = useCallback((type: 'success' | 'error', message: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setStatusMessage({ type, message })
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000)
  }, [])

  const loadFromBackend = useCallback(async () => {
    try {
      const response = await fetch('./api/services/generic_media/state')
      if (!response.ok) return
      const data = await response.json()
      const state = (data.state || data) as Record<string, unknown>
      const { items, dbPlaylists } = dbStateToMediaItems(state)
      setLibrary(prev => {
        const localUploads = prev.filter(item => item.uri.startsWith('local:'))
        return [...items, ...localUploads]
      })
      setPlaylists(prev => {
        const dbIds = new Set(dbPlaylists.map(p => p.id))
        const userPlaylists = prev.filter(p => !dbIds.has(p.id))
        return [...dbPlaylists, ...userPlaylists]
      })
    } catch {
      // Backend unavailable, keep localStorage data
    }
  }, [])

  useEffect(() => {
    loadFromBackend()
  }, [loadFromBackend])

  // Use ref to prevent infinite re-render loop
  const refreshApp = useCallback(() => {
    setSearchResults([])
    setQuery('')
    setViewMode('search')
    setSelectedItem(null)
    setNowPlaying(null)
    loadFromBackend()
  }, [loadFromBackend])

  useEffect(() => {
    if (setRefreshHandler && !refreshHandlerSetRef.current) {
      refreshHandlerSetRef.current = true
      setRefreshHandler(refreshApp)
    }
    return () => {
      if (setRefreshHandler) {
        refreshHandlerSetRef.current = false
        setRefreshHandler(null)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist library and playlists to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEY, library)
  }, [library])

  useEffect(() => {
    saveToStorage(PLAYLISTS_KEY, playlists)
  }, [playlists])

  const formatBackendError = (message: string): string => {
    if (/API.?key/i.test(message) || /GOOGLE_AI/i.test(message) || /authentication/i.test(message)) {
      return 'Backend API key is not configured. Please set up the required API key and try again.'
    }
    if (/ECONNREFUSED|fetch failed|network/i.test(message)) {
      return 'Unable to reach the backend service. Please check that the server is running.'
    }
    return message
  }

  const buildParams = () => {
    const params: Record<string, unknown> = {
      query,
      intent_type: intentType,
    }
    if (filteringType) {
      params.filtering_type = filteringType
    }
    return params
  }

  // Search functionality with API, falls back to local search
  const handleSearch = async () => {
    if (!query.trim()) {
      showStatus('error', 'Please enter a search query')
      return
    }
    setLoading(prev => ({ ...prev, search: true }))
    try {
      const result = await api.callTool('search', buildParams())
      const items = Array.isArray(result) ? result as MediaItem[] : []
      setSearchResults(items)
      setViewMode('search')
      showStatus('success', `Found ${items.length} result${items.length !== 1 ? 's' : ''}`)
    } catch {
      // Fall back to local search when backend fails (e.g., missing API key)
      const lower = query.toLowerCase()
      const allowedTypes = INTENT_CONTENT_MAP[intentType]
      const localResults = library.filter(item => {
        const meta = item.media_item_metadata
        const ct = meta?.content_type || ''
        if (allowedTypes && !allowedTypes.includes(ct)) return false
        if (filteringType && ct !== filteringType) return false
        return (
          (meta?.entity_title || '').toLowerCase().includes(lower) ||
          (meta?.artist_name || '').toLowerCase().includes(lower) ||
          (meta?.content_type || '').toLowerCase().includes(lower) ||
          (meta?.container_title || '').toLowerCase().includes(lower) ||
          (item.provider || '').toLowerCase().includes(lower)
        )
      })
      setSearchResults(localResults)
      setViewMode('search')
      showStatus('success', `Found ${localResults.length} result${localResults.length !== 1 ? 's' : ''}`)
    } finally {
      setLoading(prev => ({ ...prev, search: false }))
    }
  }

  // Play media with visual feedback
  const handlePlay = async (item?: MediaItem) => {
    if (!query.trim() && !item) {
      showStatus('error', 'Please enter a search query or select an item to play')
      return
    }
    const key = item ? `play_${item.uri}` : 'play'
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      const params = item
        ? { query: item.media_item_metadata?.entity_title || item.uri, intent_type: intentType }
        : buildParams()
      const result = await api.callTool('play', params)
      const items = Array.isArray(result) ? result as MediaItem[] : []
      if (!item && items.length > 0) {
        setSearchResults(items)
      }
      const playingItem = item || items[0]
      if (playingItem) {
        setNowPlaying(playingItem)
      }
      const title = playingItem?.media_item_metadata?.entity_title || 'media'
      showStatus('success', `Now playing: ${title}`)
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Play failed'
      showStatus('error', formatBackendError(raw))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  // Upload media - persist to localStorage
  const handleUpload = () => {
    if (!uploadForm.entity_title.trim()) {
      showStatus('error', 'Please enter a title')
      return
    }
    const newItem: MediaItem = {
      uri: `local:${uploadForm.content_type.toLowerCase()}:${Date.now()}`,
      media_item_metadata: {
        entity_title: uploadForm.entity_title,
        artist_name: uploadForm.artist_name || null,
        content_type: uploadForm.content_type,
        container_title: uploadForm.container_title || null,
        description: uploadForm.description || null,
      },
      provider: uploadForm.provider || 'local',
    }
    setLibrary(prev => [newItem, ...prev])
    setUploadForm({ entity_title: '', artist_name: '', content_type: 'TRACK', container_title: '', description: '', provider: '' })
    setViewMode('library')
    showStatus('success', `Added "${newItem.media_item_metadata.entity_title}" to library`)
  }

  // Delete media - persist to localStorage
  const handleDelete = (item: MediaItem) => {
    setLibrary(prev => prev.filter(i => i.uri !== item.uri))
    // Also remove from playlists
    setPlaylists(prev =>
      prev.map(p => ({
        ...p,
        items: p.items.filter(i => i.uri !== item.uri),
      }))
    )
    if (selectedItem?.uri === item.uri) setSelectedItem(null)
    if (nowPlaying?.uri === item.uri) setNowPlaying(null)
    showStatus('success', `Deleted "${item.media_item_metadata?.entity_title || 'item'}"`)
  }

  // Edit media metadata - persist to localStorage
  const handleSaveEdit = () => {
    if (!editingItem) return
    const updated: MediaItem = {
      ...editingItem,
      media_item_metadata: {
        ...editingItem.media_item_metadata,
        entity_title: editForm.entity_title || editingItem.media_item_metadata.entity_title,
        artist_name: editForm.artist_name || null,
        content_type: editForm.content_type || editingItem.media_item_metadata.content_type,
        container_title: editForm.container_title || null,
        description: editForm.description || null,
      },
    }
    setLibrary(prev => prev.map(i => i.uri === updated.uri ? updated : i))
    setPlaylists(prev =>
      prev.map(p => ({
        ...p,
        items: p.items.map(i => i.uri === updated.uri ? updated : i),
      }))
    )
    if (selectedItem?.uri === updated.uri) setSelectedItem(updated)
    if (nowPlaying?.uri === updated.uri) setNowPlaying(updated)
    setEditingItem(null)
    setViewMode('library')
    showStatus('success', `Updated "${updated.media_item_metadata.entity_title}"`)
  }

  // Create playlist
  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) {
      showStatus('error', 'Please enter a playlist name')
      return
    }
    const newPlaylist: Playlist = {
      id: `playlist_${Date.now()}`,
      name: newPlaylistName.trim(),
      items: [],
      createdAt: new Date().toISOString(),
    }
    setPlaylists(prev => [...prev, newPlaylist])
    setNewPlaylistName('')
    showStatus('success', `Created playlist "${newPlaylist.name}"`)
  }

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists(prev => prev.filter(p => p.id !== playlistId))
    showStatus('success', 'Playlist deleted')
  }

  const handleAddToPlaylist = (playlistId: string, item: MediaItem) => {
    setPlaylists(prev =>
      prev.map(p => {
        if (p.id !== playlistId) return p
        if (p.items.some(i => i.uri === item.uri)) return p
        return { ...p, items: [...p.items, item] }
      })
    )
    setShowAddToPlaylist(null)
    showStatus('success', 'Added to playlist')
  }

  const handleRemoveFromPlaylist = (playlistId: string, itemUri: string) => {
    setPlaylists(prev =>
      prev.map(p => p.id === playlistId ? { ...p, items: p.items.filter(i => i.uri !== itemUri) } : p)
    )
  }

  const handleAddToLibrary = (item: MediaItem) => {
    if (library.some(i => i.uri === item.uri)) {
      showStatus('error', 'Item already in library')
      return
    }
    setLibrary(prev => [item, ...prev])
    showStatus('success', `Added "${item.media_item_metadata?.entity_title}" to library`)
  }

  const startEditing = (item: MediaItem) => {
    setEditingItem(item)
    setEditForm({
      entity_title: item.media_item_metadata?.entity_title || '',
      artist_name: item.media_item_metadata?.artist_name || '',
      content_type: item.media_item_metadata?.content_type || 'TRACK',
      container_title: item.media_item_metadata?.container_title || '',
      description: item.media_item_metadata?.description || '',
    })
    setViewMode('edit')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // Filter library items by search
  const filteredLibrary = useMemo(() => {
    if (!searchFilter.trim()) return library
    const lower = searchFilter.toLowerCase()
    return library.filter(item => {
      const meta = item.media_item_metadata
      return (
        (meta?.entity_title || '').toLowerCase().includes(lower) ||
        (meta?.artist_name || '').toLowerCase().includes(lower) ||
        (meta?.content_type || '').toLowerCase().includes(lower) ||
        (meta?.container_title || '').toLowerCase().includes(lower) ||
        (item.provider || '').toLowerCase().includes(lower)
      )
    })
  }, [library, searchFilter])

  // Metadata display component
  const MetadataPanel = ({ item }: { item: MediaItem }) => {
    const meta = item.media_item_metadata || {} as MediaItemMetadata
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <ThumbnailIcon contentType={meta.content_type} size="lg" />
          <div>
            <h3 className="text-lg font-semibold">{meta.entity_title || 'Unknown Title'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.uri}]</span></h3>
            {meta.artist_name && <p className="text-sm text-gray-500 dark:text-gray-400">{meta.artist_name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 block">Content Type</span>
            <span className="font-medium">{meta.content_type || 'Unknown'}</span>
          </div>
          {meta.container_title && (
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 block">Album / Container</span>
              <span className="font-medium">{meta.container_title}</span>
            </div>
          )}
          {item.provider && (
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 block">Provider</span>
              <span className="font-medium">{item.provider}</span>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 block">URI</span>
            <span className="font-medium text-xs break-all">{item.uri}</span>
          </div>
          {meta.description && (
            <div className="col-span-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 block">Description</span>
              <span className="font-medium">{meta.description}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Category/tag badge component
  const CategoryBadge = ({ contentType }: { contentType: string }) => {
    const style = getTypeStyle(contentType)
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {contentType.replace(/_/g, ' ')}
      </span>
    )
  }

  // Render a media item row inline helper (not a component to avoid remounting)
  const renderMediaItemRow = (item: MediaItem, showActions = true, playlistId?: string) => {
    const meta = item.media_item_metadata || {} as MediaItemMetadata
    const playKey = `play_${item.uri}`
    const isPlaying = nowPlaying?.uri === item.uri
    const isInLibrary = library.some(i => i.uri === item.uri)

    return (
      <div
        key={item.uri}
        className={`flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border transition-colors cursor-pointer ${
          isPlaying
            ? 'border-pink-400 dark:border-pink-500 ring-1 ring-pink-300 dark:ring-pink-600'
            : 'border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600'
        }`}
        onClick={() => { setSelectedItem(item); setViewMode('detail') }}
      >
        {/* Thumbnail */}
        <ThumbnailIcon contentType={meta.content_type} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {isPlaying && <span className="text-pink-500 mr-1">&#9654;</span>}
            {meta.entity_title || 'Unknown Title'}
            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.uri}]</span>
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {meta.artist_name && <span className="text-xs text-gray-500 dark:text-gray-400">{meta.artist_name}</span>}
            {/* Category badge */}
            {meta.content_type && <CategoryBadge contentType={meta.content_type} />}
          </div>
          {meta.container_title && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{meta.container_title}</p>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {/* Play button */}
            <button
              onClick={() => handlePlay(item)}
              disabled={loading[playKey]}
              className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-md text-xs font-medium transition-colors"
              title="Play"
            >
              {loading[playKey] ? '...' : isPlaying ? 'Playing' : 'Play'}
            </button>
            {!isInLibrary && (
              <button
                onClick={() => handleAddToLibrary(item)}
                className="px-2 py-1.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium transition-colors"
                title="Add to library"
              >
                + Lib
              </button>
            )}
            <button
              onClick={() => setShowAddToPlaylist(item)}
              className="px-2 py-1.5 bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-800/60 text-green-700 dark:text-green-300 rounded-md text-xs font-medium transition-colors"
              title="Add to playlist"
            >
              + List
            </button>
            {playlistId && (
              <button
                onClick={() => handleRemoveFromPlaylist(playlistId, item.uri)}
                className="px-2 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-700 dark:text-red-300 rounded-md text-xs font-medium transition-colors"
                title="Remove from playlist"
              >
                Remove
              </button>
            )}
            {isInLibrary && !playlistId && (
              <>
                <button
                  onClick={() => startEditing(item)}
                  className="px-2 py-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium transition-colors"
                  title="Edit"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="px-2 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-700 dark:text-red-300 rounded-md text-xs font-medium transition-colors"
                  title="Delete"
                >
                  Del
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Media Library</h1>
        <p className="text-purple-100 text-sm mt-1">Search, play, and manage your media</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2">
        {([
          ['search', 'Search'],
          ['library', 'Library'],
          ['playlists', 'Playlists'],
          ['upload', 'Upload'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              viewMode === mode
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
            {mode === 'library' && library.length > 0 && (
              <span className="ml-1 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 rounded-full">
                {library.length}
              </span>
            )}
            {mode === 'playlists' && playlists.length > 0 && (
              <span className="ml-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 rounded-full">
                {playlists.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Controls - shown on search tab */}
      {viewMode === 'search' && (
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for music, podcasts, albums..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={loading.search}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading.search ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={() => handlePlay()}
              disabled={loading.play}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading.play ? 'Playing...' : 'Play'}
            </button>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Intent Type:</label>
              <select
                value={intentType}
                onChange={e => setIntentType(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {INTENT_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Filter:</label>
              <select
                value={filteringType}
                onChange={e => setFilteringType(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">None</option>
                {FILTERING_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Search Results */}
        {viewMode === 'search' && (
          searchResults.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 mt-12">
              <p className="text-lg">No results yet</p>
              <p className="text-sm mt-1">Enter a query and click Search or Play</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
              {searchResults.map((item) =>
                renderMediaItemRow(item)
              )}
            </div>
          )
        )}

        {/* Library View */}
        {viewMode === 'library' && (
          <div>
            {/* Library search filter */}
            <div className="mb-3">
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Filter library..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {filteredLibrary.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-gray-500 mt-12">
                <p className="text-lg">{library.length === 0 ? 'Library is empty' : 'No matches'}</p>
                <p className="text-sm mt-1">
                  {library.length === 0
                    ? 'Search for media and add items, or upload new media'
                    : 'Try a different search term'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLibrary.map((item) =>
                  renderMediaItemRow(item)
                )}
              </div>
            )}
          </div>
        )}

        {/* Playlists View */}
        {viewMode === 'playlists' && (
          <div className="space-y-4">
            {/* Create Playlist */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
                placeholder="New playlist name..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleCreatePlaylist}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Create
              </button>
            </div>

            {playlists.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-gray-500 mt-8">
                <p className="text-lg">No playlists yet</p>
                <p className="text-sm mt-1">Create a playlist above, then add items from search results or library</p>
              </div>
            ) : (
              playlists.map(playlist => (
                <div key={playlist.id} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                    <div>
                      <h3 className="font-medium text-sm">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{playlist.items.length} item{playlist.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePlaylist(playlist.id)}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  {playlist.items.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No items in this playlist</p>
                  ) : (
                    <div className="p-2 space-y-1">
                      {playlist.items.map((item) =>
                        renderMediaItemRow(item, true, playlist.id)
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Upload View */}
        {viewMode === 'upload' && (
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-lg font-semibold">Upload / Add Media</h2>
            <div className="space-y-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={uploadForm.entity_title}
                  onChange={e => setUploadForm(f => ({ ...f, entity_title: e.target.value }))}
                  placeholder="Song title, album name..."
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Artist</label>
                <input
                  type="text"
                  value={uploadForm.artist_name}
                  onChange={e => setUploadForm(f => ({ ...f, artist_name: e.target.value }))}
                  placeholder="Artist name"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Content Type</label>
                <select
                  value={uploadForm.content_type}
                  onChange={e => setUploadForm(f => ({ ...f, content_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="TRACK">Track</option>
                  <option value="ALBUM">Album</option>
                  <option value="ARTIST">Artist</option>
                  <option value="PLAYLIST">Playlist</option>
                  <option value="PODCAST_EPISODE">Podcast Episode</option>
                  <option value="PODCAST_SHOW">Podcast Show</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Album / Container</label>
                <input
                  type="text"
                  value={uploadForm.container_title}
                  onChange={e => setUploadForm(f => ({ ...f, container_title: e.target.value }))}
                  placeholder="Album or show name"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
                <input
                  type="text"
                  value={uploadForm.provider}
                  onChange={e => setUploadForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder="e.g. streamify, applemusic"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button
                onClick={handleUpload}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add to Library
              </button>
            </div>
          </div>
        )}

        {/* Detail View with metadata */}
        {viewMode === 'detail' && selectedItem && (
          <div className="max-w-lg mx-auto space-y-4">
            <button
              onClick={() => setViewMode('search')}
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
            >
              &larr; Back
            </button>
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <MetadataPanel item={selectedItem} />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handlePlay(selectedItem)}
                  disabled={loading[`play_${selectedItem.uri}`]}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading[`play_${selectedItem.uri}`] ? 'Playing...' : nowPlaying?.uri === selectedItem.uri ? 'Now Playing' : 'Play'}
                </button>
                {!library.some(i => i.uri === selectedItem.uri) && (
                  <button
                    onClick={() => handleAddToLibrary(selectedItem)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Add to Library
                  </button>
                )}
                {library.some(i => i.uri === selectedItem.uri) && (
                  <>
                    <button
                      onClick={() => startEditing(selectedItem)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { handleDelete(selectedItem); setViewMode('library') }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit View */}
        {viewMode === 'edit' && editingItem && (
          <div className="max-w-lg mx-auto space-y-4">
            <button
              onClick={() => setViewMode('library')}
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
            >
              &larr; Back to Library
            </button>
            <h2 className="text-lg font-semibold">Edit Media<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{editingItem.uri}]</span></h2>
            <div className="space-y-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.entity_title}
                  onChange={e => setEditForm(f => ({ ...f, entity_title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Artist</label>
                <input
                  type="text"
                  value={editForm.artist_name}
                  onChange={e => setEditForm(f => ({ ...f, artist_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Content Type</label>
                <select
                  value={editForm.content_type}
                  onChange={e => setEditForm(f => ({ ...f, content_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="TRACK">Track</option>
                  <option value="ALBUM">Album</option>
                  <option value="ARTIST">Artist</option>
                  <option value="PLAYLIST">Playlist</option>
                  <option value="PODCAST_EPISODE">Podcast Episode</option>
                  <option value="PODCAST_SHOW">Podcast Show</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Album / Container</label>
                <input
                  type="text"
                  value={editForm.container_title}
                  onChange={e => setEditForm(f => ({ ...f, container_title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => { setEditingItem(null); setViewMode('library') }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Now Playing Bar */}
      {nowPlaying && (
        <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <ThumbnailIcon contentType={nowPlaying.media_item_metadata?.content_type || 'TRACK'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {nowPlaying.media_item_metadata?.entity_title || 'Unknown'}
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{nowPlaying.uri}]</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {nowPlaying.media_item_metadata?.artist_name || 'Unknown Artist'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-1 h-3 bg-pink-500 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                <span className="w-1 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                <span className="w-1 h-5 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0.45s' }} />
              </div>
              <span className="text-xs text-pink-500 font-medium">Now Playing</span>
              <button
                onClick={() => setNowPlaying(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                title="Stop"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {showAddToPlaylist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddToPlaylist(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-4 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Add to Playlist</h3>
            {playlists.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No playlists yet. Create one in the Playlists tab.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {playlists.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleAddToPlaylist(p.id, showAddToPlaylist)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-sm"
                  >
                    <span className="font-medium">{p.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{p.id}]</span></span>
                    <span className="text-gray-400 dark:text-gray-500 ml-2">({p.items.length} items)</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddToPlaylist(null)}
              className="mt-3 w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Toast */}
      {statusMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-white text-sm z-50 max-w-sm transition-all ${
          statusMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {statusMessage.message}
        </div>
      )}
    </div>
  )
}
