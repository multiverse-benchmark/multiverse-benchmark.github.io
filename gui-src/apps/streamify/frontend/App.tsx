import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI, BACKEND_STATE_CHANGED_EVENT } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Streamify"

// Types
interface StreamifyImage {
  url: string
  height?: number
  width?: number
}

interface Artist {
  id: string
  name: string
  images?: StreamifyImage[]
  genres?: string[]
  followers?: { total: number }
  popularity?: number
}

interface Album {
  id: string
  name: string
  images?: StreamifyImage[]
  artists: { id: string; name: string }[]
  release_date: string
  total_tracks: number
  album_type?: string
}

interface Track {
  id: string
  name: string
  uri?: string
  artists: { id: string; name: string }[]
  album: { id: string; name: string; images?: StreamifyImage[] }
  duration_ms?: number
  track_number?: number
  explicit?: boolean
}

interface Playlist {
  id: string
  name: string
  description?: string
  images?: StreamifyImage[]
  owner: { id: string; display_name?: string }
  tracks?: { total: number }
  public?: boolean
}

interface User {
  id: string
  display_name?: string
  images?: StreamifyImage[]
  followers?: { total: number }
  email?: string
  country?: string
  product?: string
}

interface Category {
  id: string
  name: string
  icons?: StreamifyImage[]
}

interface Show {
  id: string
  name: string
  description?: string
  publisher?: string
  images?: StreamifyImage[]
  total_episodes?: number
  media_type?: string
  explicit?: boolean
}

interface Episode {
  id: string
  name: string
  description?: string
  images?: StreamifyImage[]
  duration_ms?: number
  release_date?: string
  show?: { id: string; name: string; images?: StreamifyImage[] }
  explicit?: boolean
}

interface Audiobook {
  id: string
  name: string
  description?: string
  authors?: { name: string }[]
  narrators?: { name: string }[]
  images?: StreamifyImage[]
  total_chapters?: number
  publisher?: string
  explicit?: boolean
}

type ViewType = 'home' | 'search' | 'library' | 'playlist' | 'album' | 'artist' | 'profile' | 'browse'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

// Helper to extract cover image URL from various API response formats
const extractCoverImageUrl = (coverData: unknown): string | null => {
  if (Array.isArray(coverData) && coverData.length > 0 && coverData[0]?.url) {
    return coverData[0].url
  }
  if (coverData && !Array.isArray(coverData) && (coverData as any)?.url) {
    return (coverData as any).url
  }
  if (Array.isArray((coverData as any)?.result) && (coverData as any).result.length > 0 && (coverData as any).result[0]?.url) {
    return (coverData as any).result[0].url
  }
  return null
}

// Helper to extract boolean follow status from API response
const extractFollowStatus = (data: unknown): boolean => {
  if (Array.isArray(data)) return data[0] || false
  if (Array.isArray((data as any)?.result)) return (data as any).result[0] || false
  return false
}

// Helper to format duration
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Helper to get image URL
const getImageUrl = (images?: StreamifyImage[], size: 'small' | 'medium' | 'large' = 'medium'): string => {
  if (!images || images.length === 0) return ''
  // Filter out images with empty or invalid URLs
  const validImages = images.filter(img => img?.url && img.url.trim() !== '')
  if (validImages.length === 0) return ''
  if (size === 'small') return validImages[validImages.length - 1]?.url || validImages[0]?.url || ''
  if (size === 'large') return validImages[0]?.url || ''
  return validImages[Math.floor(validImages.length / 2)]?.url || validImages[0]?.url || ''
}

// Image component with fallback on error
const ImageWithFallback = ({
  src,
  alt = '',
  className = '',
  fallbackClassName = ''
}: {
  src: string
  alt?: string
  className?: string
  fallbackClassName?: string
}) => {
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return (
      <div className={`flex items-center justify-center text-[#B3B3B3] ${fallbackClassName || className}`}>
        <svg className="w-1/2 h-1/2 max-w-12 max-h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export default function StreamifyApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('streamify')

  // State
  const [currentView, setCurrentView] = useState<ViewType>('home')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [savedAlbums, setSavedAlbums] = useState<Album[]>([])
  const [savedAlbumIds, setSavedAlbumIds] = useState<Set<string>>(new Set())
  const [followedArtists, setFollowedArtists] = useState<Artist[]>([])
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Playlist[]>([])
  const [newReleases, setNewReleases] = useState<Album[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [featuredAlbums, setFeaturedAlbums] = useState<Album[]>([])

  // Detail view states
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([])
  const [playlistTracksError, setPlaylistTracksError] = useState<string | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [albumTracks, setAlbumTracks] = useState<Track[]>([])
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null)
  const [artistTopTracks, setArtistTopTracks] = useState<Track[]>([])
  const [artistAlbums, setArtistAlbums] = useState<Album[]>([])
  const [relatedArtists, setRelatedArtists] = useState<Artist[]>([])

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{
    tracks: Track[]
    albums: Album[]
    artists: Artist[]
    playlists: Playlist[]
    shows: Show[]
    episodes: Episode[]
    audiobooks: Audiobook[]
  }>({ tracks: [], albums: [], artists: [], playlists: [], shows: [], episodes: [], audiobooks: [] })
  const [isSearching, setIsSearching] = useState(false)

  // Modal states
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('')
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null)
  const [showAddToPlaylist, setShowAddToPlaylist] = useState<Track | null>(null)
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState<string | null>(null) // playlist id being added to
  const [addToPlaylistError, setAddToPlaylistError] = useState<string | null>(null)
  const [addToPlaylistSuccess, setAddToPlaylistSuccess] = useState<string | null>(null) // success message
  const [showDeletePlaylist, setShowDeletePlaylist] = useState<Playlist | null>(null)
  const [draggingTrackIndex, setDraggingTrackIndex] = useState<number | null>(null)
  const [newPlaylistCoverImage, setNewPlaylistCoverImage] = useState<string | null>(null)

  // Add tracks to playlist state
  const [showAddTracksSection, setShowAddTracksSection] = useState(false)
  const [addTrackSearch, setAddTrackSearch] = useState('')
  const [addTrackResults, setAddTrackResults] = useState<Track[]>([])
  const [isSearchingAddTrack, setIsSearchingAddTrack] = useState(false)

  // User profile view state
  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [viewingUserPlaylists, setViewingUserPlaylists] = useState<Playlist[]>([])
  const [viewingUserFollowedArtists, setViewingUserFollowedArtists] = useState<Artist[]>([])
  const [isFollowingUser, setIsFollowingUser] = useState(false)
  const [isFollowingPlaylist, setIsFollowingPlaylist] = useState(false)
  const [playlistCoverImage, setPlaylistCoverImage] = useState<string | null>(null)

  const clearViewingUserState = useCallback(() => {
    setViewingUser(null)
    setViewingUserPlaylists([])
    setViewingUserFollowedArtists([])
  }, [])

  // Playback state (local - no backend playback API available)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackContext, setPlaybackContext] = useState<{ tracks: Track[]; index: number } | null>(null)

  // Library tab state
  const [libraryTab, setLibraryTab] = useState<'playlists' | 'albums' | 'artists' | 'podcasts'>('playlists')

  // Podcasts & Audiobooks state for library
  const [libraryShows, setLibraryShows] = useState<Show[]>([])
  const [libraryAudiobooks, setLibraryAudiobooks] = useState<Audiobook[]>([])
  const [libraryMediaLoaded, setLibraryMediaLoaded] = useState(false)


  // Top items for profile
  const [topArtists, setTopArtists] = useState<Artist[]>([])
  const [topTracks, setTopTracks] = useState<Track[]>([])
  const [topTracksError, setTopTracksError] = useState<string | null>(null)

  // Show all new releases toggle
  const [showAllNewReleases, setShowAllNewReleases] = useState(false)

  // Category browsing
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [categoryPlaylists, setCategoryPlaylists] = useState<Playlist[]>([])

  // Recommendations
  const [recommendations, setRecommendations] = useState<Track[]>([])
  const [genreSeeds, setGenreSeeds] = useState<string[]>([])

  const loadInitialDataRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Helper to safely extract value from Promise.allSettled result
  const getSettledValue = <T,>(result: PromiseSettledResult<T>): T | null => {
    return result.status === 'fulfilled' ? result.value : null
  }

  // Load initial data
  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Use Promise.allSettled to handle individual API failures gracefully
      const [userResult, playlistsResult, albumsResult, artistsResult] = await Promise.allSettled([
        api.callTool('get_current_user_profile', {}),
        api.callTool('get_current_users_playlists', { limit: 50 }),
        api.callTool('get_users_saved_albums', { limit: 50 }),
        api.callTool('get_followed_artists', { limit: 50 }),
      ])

      const user = getSettledValue(userResult)
      const playlists = getSettledValue(playlistsResult)
      const albums = getSettledValue(albumsResult)
      const artists = getSettledValue(artistsResult)

      if (user) setCurrentUser(user as User)
      setPlaylists((playlists as any)?.items || [])
      setSavedAlbums((albums as any)?.items?.map((item: any) => item.album) || [])
      setFollowedArtists((artists as any)?.artists?.items || [])

      // Load browse data
      const [featuredResult, releasesResult, categoriesResult] = await Promise.allSettled([
        api.callTool('get_featured_playlists', { limit: 20 }),
        api.callTool('get_new_releases', { limit: 20 }),
        api.callTool('get_categories', { limit: 20 }),
      ])

      setFeaturedPlaylists((getSettledValue(featuredResult) as any)?.playlists?.items || [])
      setNewReleases((getSettledValue(releasesResult) as any)?.albums?.items || [])
      setCategories((getSettledValue(categoriesResult) as any)?.categories?.items || [])

      // Load featured albums (albums that are known to have tracks in the database)
      const featuredAlbumIds = ['4kBp5iVByDSAUc0lb78jCZ', '5V17F52VsJ3ZDIF1iYxe6D']
      try {
        const featuredAlbumsResult = await api.callTool('get_several_albums', {
          album_ids: featuredAlbumIds,
          market: 'US'
        })
        setFeaturedAlbums((featuredAlbumsResult as any)?.albums?.filter(Boolean) || [])
      } catch {
        // Featured albums may fail, ignore
      }

      // Also check saved album status using check_users_saved_albums
      const savedAlbumsList = (albums as any)?.items?.map((item: any) => item.album) || []
      if (savedAlbumsList.length > 0) {
        try {
          const albumIds = savedAlbumsList.map((a: Album) => a.id)
          const checkResult = await api.callTool('check_users_saved_albums', { album_ids: albumIds })
          if (Array.isArray(checkResult)) {
            const newIds = new Set<string>()
            albumIds.forEach((id: string, i: number) => {
              if (checkResult[i]) newIds.add(id)
            })
            setSavedAlbumIds(newIds)
          }
        } catch {
          // check_users_saved_albums may not be available
        }
      }

      // Load top artists and tracks, genre seeds
      const [topArtistsResult, topTracksResult, genreSeedsResult] = await Promise.allSettled([
        api.callTool('get_user_top_artists_and_tracks', { type: 'artists', limit: 20 }),
        api.callTool('get_user_top_artists_and_tracks', { type: 'tracks', limit: 20 }),
        api.callTool('get_available_genre_seeds', {}),
      ])
      const topArtistsData = getSettledValue(topArtistsResult)
      const topTracksData = getSettledValue(topTracksResult)
      const genreSeedsData = getSettledValue(genreSeedsResult)

      setTopArtists((topArtistsData as any)?.items || [])
      if (topTracksResult.status === 'rejected' || topTracksData === null) {
        setTopTracks([])
        setTopTracksError('Top tracks are currently unavailable')
      } else {
        setTopTracks((topTracksData as any)?.items || [])
        setTopTracksError(null)
      }

      // Use get_several_artists for batch fetching followed artists details
      const followedArtistIds = ((artists as any)?.artists?.items || []).slice(0, 20).map((a: any) => a.id)
      if (followedArtistIds.length > 0) {
        try {
          const batchResult = await api.callTool('get_several_artists', { artist_ids: followedArtistIds })
          if ((batchResult as any)?.artists) {
            setFollowedArtists((batchResult as any).artists.filter(Boolean))
          }
        } catch {
          // Batch fetch may fail, keep original data
        }
      }
      setGenreSeeds((genreSeedsData as any)?.genres || [])

      // Load recommendations based on top artists
      const topArtistIds = ((topArtistsData as any)?.items || []).slice(0, 2).map((a: any) => a.id)
      if (topArtistIds.length > 0) {
        try {
          const recsResult = await api.callTool('get_recommendations', {
            seed_artists: topArtistIds,
            limit: 20,
          })
          setRecommendations((recsResult as any)?.tracks || [])
        } catch {
          // Recommendations may fail if no seeds available
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadInitialData().then(() => loadLibraryMedia())
  }, [loadInitialData]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadInitialDataRef.current = loadInitialData
  }, [loadInitialData])

  // Refresh handler for admin panel - use ref to avoid re-render loops
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    const handler = async () => { await loadInitialDataRef.current() }
    setRefreshHandlerRef.current?.(handler)
    return () => { setRefreshHandlerRef.current?.(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for backend state changes (e.g., admin panel tool calls) and auto-refresh
  // Debounce and filter to avoid reloading on the app's own read-only calls
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const mutatingTools = new Set([
      'change_playlist_details', 'create_playlist', 'add_items_to_playlist',
      'remove_playlist_items', 'update_playlist_items', 'add_custom_playlist_cover_image',
      'follow_playlist', 'unfollow_playlist', 'follow_artists_or_users',
      'unfollow_artists_or_users', 'save_albums_for_user', 'remove_albums_for_user',
    ])
    const handler = (e: Event) => {
      const toolName = (e as CustomEvent)?.detail?.toolName
      if (toolName && !mutatingTools.has(toolName)) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadInitialDataRef.current()
        setLibraryMediaLoaded(false)
      }, 1000)
    }
    window.addEventListener(BACKEND_STATE_CHANGED_EVENT, handler)
    return () => {
      window.removeEventListener(BACKEND_STATE_CHANGED_EVENT, handler)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [])

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults({ tracks: [], albums: [], artists: [], playlists: [], shows: [], episodes: [], audiobooks: [] })
      return
    }

    setIsSearching(true)
    try {
      const result = await api.callTool('search_for_item', {
        q: query,
        type: 'track,album,artist,playlist,show,episode,audiobook',
        limit: 20,
      })

      setSearchResults({
        tracks: (result as any)?.tracks?.items || [],
        albums: (result as any)?.albums?.items || [],
        artists: (result as any)?.artists?.items || [],
        playlists: (result as any)?.playlists?.items || [],
        shows: (result as any)?.shows?.items || [],
        episodes: (result as any)?.episodes?.items || [],
        audiobooks: (result as any)?.audiobooks?.items || [],
      })
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentView === 'search') {
        handleSearch(searchQuery)
      }
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, currentView])

  // Load library podcasts & audiobooks via search with multiple queries for broad coverage
  const loadLibraryMedia = useCallback(async () => {
    if (libraryMediaLoaded) return
    try {
      // Search with common characters to maximize coverage (API does substring matching on names)
      const searchQueries = ['a', 'e', 'i', 'o', 't', 's']
      const showIds = new Set<string>()
      const audiobookIds = new Set<string>()
      const allShows: Show[] = []
      const allAudiobooks: Audiobook[] = []

      // Combine show+audiobook in a single call per query to minimize requests
      const results = await Promise.all(
        searchQueries.map(q =>
          api.callTool('search_for_item', { q, type: 'show,audiobook', limit: 50 }).catch(() => null)
        )
      )

      for (const result of results) {
        if (!result) continue
        for (const show of ((result as any)?.shows?.items || [])) {
          if (show?.id && !showIds.has(show.id)) {
            showIds.add(show.id)
            allShows.push(show)
          }
        }
        for (const audiobook of ((result as any)?.audiobooks?.items || [])) {
          if (audiobook?.id && !audiobookIds.has(audiobook.id)) {
            audiobookIds.add(audiobook.id)
            allAudiobooks.push(audiobook)
          }
        }
      }

      setLibraryShows(allShows)
      setLibraryAudiobooks(allAudiobooks)
      setLibraryMediaLoaded(true)
    } catch (err) {
      console.error('Failed to load library media:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryMediaLoaded])

  // Load playlist details
  const openPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist)
    setCurrentView('playlist')
    setPlaylistTracks([])
    setIsFollowingPlaylist(false)
    setPlaylistCoverImage(null)
    setPlaylistTracksError(null)
    try {
      const [tracksResult, followResult, coverResult] = await Promise.allSettled([
        api.callTool('get_playlist_items', { playlist_id: playlist.id, limit: 50, fields: 'items(track(id,name,uri,artists,album,duration_ms,track_number,explicit)),total' }),
        currentUser ? api.callTool('check_user_follows_playlist', { playlist_id: playlist.id, user_ids: [currentUser.id] }) : Promise.resolve(null),
        api.callTool('get_playlist_cover_image', { playlist_id: playlist.id }),
      ])
      const tracksData = getSettledValue(tracksResult)
      if (tracksResult.status === 'rejected' || tracksData === null) {
        setPlaylistTracks([])
        setPlaylistTracksError('Unable to load tracks')
      } else {
        setPlaylistTracks((tracksData as any)?.items?.map((item: any) => item.track).filter(Boolean) || [])
      }
      setIsFollowingPlaylist(extractFollowStatus(getSettledValue(followResult)))
      const coverUrl = extractCoverImageUrl(getSettledValue(coverResult))
      if (coverUrl) setPlaylistCoverImage(coverUrl)
    } catch (err) {
      console.error('Failed to load playlist tracks:', err)
      setPlaylistTracks([])
    }
  }

  // Follow/unfollow playlist
  const toggleFollowPlaylist = async (playlistId: string, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await api.callTool('unfollow_playlist', { playlist_id: playlistId })
      } else {
        await api.callTool('follow_playlist', { playlist_id: playlistId })
      }
      setIsFollowingPlaylist(!isFollowing)
    } catch (err) {
      console.error('Failed to toggle follow playlist:', err)
    }
  }

  // Load album details
  const openAlbum = async (album: Album) => {
    setSelectedAlbum(album)
    setCurrentView('album')
    setAlbumTracks([])
    try {
      // Use allSettled to handle backend validation errors gracefully
      const [albumResult, tracksResult] = await Promise.allSettled([
        api.callTool('get_album', { album_id: album.id, market: 'US' }),
        api.callTool('get_album_tracks', { album_id: album.id, limit: 50, market: 'US' })
      ])

      const fullAlbum = albumResult.status === 'fulfilled' ? albumResult.value : null
      const tracksData = tracksResult.status === 'fulfilled' ? tracksResult.value : null

      console.log('Album API response:', { fullAlbum, tracksData, albumResult, tracksResult })

      // Update with full album data if available
      if (fullAlbum) {
        setSelectedAlbum(fullAlbum as Album)
      }
      // Use tracks from the tracks endpoint for complete listing
      const tracks = (tracksData as any)?.items || (fullAlbum as any)?.tracks?.items || []
      console.log('Setting album tracks:', tracks)
      setAlbumTracks(tracks)
    } catch (err) {
      console.error('Failed to load album details:', err)
      setAlbumTracks([])
    }
  }

  // Load artist details
  const openArtist = async (artist: Artist) => {
    setSelectedArtist(artist)
    setCurrentView('artist')
    try {
      // Fetch full artist details along with top tracks, albums, and related artists
      const [fullArtist, topTracks, albums, related] = await Promise.all([
        api.callTool('get_artist', { artist_id: artist.id }),
        api.callTool('get_artists_top_tracks', { artist_id: artist.id, market: 'US' }),
        api.callTool('get_artists_albums', { artist_id: artist.id, limit: 20 }),
        api.callTool('get_artists_related_artists', { artist_id: artist.id }),
      ])
      // Update with full artist data if available (includes genres, popularity)
      if (fullArtist) {
        setSelectedArtist(fullArtist as Artist)
      }
      setArtistTopTracks((topTracks as any)?.tracks || [])
      setArtistAlbums((albums as any)?.items || [])
      setRelatedArtists((related as any)?.artists || [])
    } catch (err) {
      console.error('Failed to load artist data:', err)
    }
  }

  // Load category playlists
  const openCategory = async (category: Category) => {
    setSelectedCategory(category)
    try {
      const [playlistsResult, categoryDetailResult] = await Promise.allSettled([
        api.callTool('get_category_playlists', { category_id: category.id, limit: 20 }),
        api.callTool('get_category', { category_id: category.id }),
      ])
      setCategoryPlaylists((getSettledValue(playlistsResult) as any)?.playlists?.items || [])
      // Update category with full details if available
      const categoryDetail = getSettledValue(categoryDetailResult)
      if (categoryDetail) {
        setSelectedCategory(categoryDetail as Category)
      }
    } catch (err) {
      console.error('Failed to load category playlists:', err)
      setCategoryPlaylists([])
    }
  }

  // Create playlist
  const createPlaylist = async () => {
    if (!newPlaylistName.trim() || !currentUser) return
    try {
      await api.callTool('create_playlist', {
        user_id: currentUser.id,
        name: newPlaylistName,
        description: newPlaylistDescription,
        public: true,
      })
      setShowCreatePlaylist(false)
      setNewPlaylistName('')
      setNewPlaylistDescription('')
      // Refresh playlists
      const result = await api.callTool('get_current_users_playlists', { limit: 50 })
      setPlaylists((result as any)?.items || [])
    } catch (err) {
      console.error('Failed to create playlist:', err)
    }
  }

  // Update playlist
  const updatePlaylist = async () => {
    if (!editingPlaylist || !newPlaylistName.trim()) return
    try {
      await api.callTool('change_playlist_details', {
        playlist_id: editingPlaylist.id,
        name: newPlaylistName,
        description: newPlaylistDescription,
      })
      // Upload cover image if provided (URL-based)
      if (newPlaylistCoverImage) {
        try {
          await api.callTool('add_custom_playlist_cover_image', {
            playlist_id: editingPlaylist.id,
            image_data: newPlaylistCoverImage,
          })
        } catch (imgErr) {
          console.log('Could not update cover image:', imgErr)
        }
      }
      const playlistIdToRefresh = editingPlaylist.id
      const updatedName = newPlaylistName
      const updatedDescription = newPlaylistDescription
      const updatedCoverImage = newPlaylistCoverImage

      // Optimistically update local state immediately
      setPlaylists((prev: Playlist[]) => prev.map((p: Playlist) =>
        p.id === playlistIdToRefresh
          ? {
              ...p,
              name: updatedName,
              description: updatedDescription,
              ...(updatedCoverImage ? { images: [{ url: updatedCoverImage }] } : {}),
            }
          : p
      ))

      // Update selected playlist if it's the one being edited
      if (selectedPlaylist?.id === playlistIdToRefresh) {
        setSelectedPlaylist((prev: Playlist | null) => prev ? {
          ...prev,
          name: updatedName,
          description: updatedDescription,
          ...(updatedCoverImage ? { images: [{ url: updatedCoverImage }] } : {}),
        } : null)
        if (updatedCoverImage) {
          setPlaylistCoverImage(updatedCoverImage)
        }
      }

      setEditingPlaylist(null)
      setNewPlaylistName('')
      setNewPlaylistDescription('')
      setNewPlaylistCoverImage(null)

      // Also refresh from server in background, preserving local cover image if set
      try {
        const result = await api.callTool('get_current_users_playlists', { limit: 50 })
        const serverPlaylists = (result as any)?.items || []
        if (updatedCoverImage) {
          // Preserve the locally-set cover image URL for the edited playlist
          setPlaylists(serverPlaylists.map((p: Playlist) =>
            p.id === playlistIdToRefresh
              ? { ...p, images: [{ url: updatedCoverImage }] }
              : p
          ))
        } else {
          setPlaylists(serverPlaylists)
        }
        if (selectedPlaylist?.id === playlistIdToRefresh) {
          const playlistResult = await api.callTool('get_playlist', { playlist_id: playlistIdToRefresh, fields: 'id,name,description,images,owner,tracks(total),public,collaborative' })
          setSelectedPlaylist(updatedCoverImage
            ? { ...(playlistResult as Playlist), images: [{ url: updatedCoverImage }] }
            : playlistResult as Playlist
          )
        }
      } catch (refreshErr) {
        console.log('Could not refresh from server:', refreshErr)
      }
    } catch (err) {
      console.error('Failed to update playlist:', err)
    }
  }

  // Delete playlist (unfollow)
  const deletePlaylist = async (playlistId: string) => {
    try {
      console.log('Deleting playlist:', playlistId)
      const result = await api.callTool('unfollow_playlist', { playlist_id: playlistId })
      console.log('Delete result:', result)
      setShowDeletePlaylist(null)

      // Optimistically remove from local state immediately
      setPlaylists(prev => prev.filter(p => p.id !== playlistId))

      // If viewing this playlist, go back to home
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null)
        setCurrentView('home')
      }

      // Also try to refresh from server (in case backend state is different)
      try {
        const playlistsResult = await api.callTool('get_current_users_playlists', { limit: 50 })
        const serverPlaylists = (playlistsResult as any)?.items || []
        // Only update if the deleted playlist is not in the server response
        if (!serverPlaylists.find((p: Playlist) => p.id === playlistId)) {
          setPlaylists(serverPlaylists)
        }
      } catch (refreshErr) {
        console.log('Could not refresh playlists from server:', refreshErr)
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err)
      setShowDeletePlaylist(null)
      alert('Failed to delete playlist. You may not have permission to delete this playlist.')
    }
  }

  // Reorder playlist tracks
  const reorderPlaylistTracks = async (fromIndex: number, toIndex: number) => {
    if (!selectedPlaylist || fromIndex === toIndex) return

    // Optimistically update UI
    const newTracks = [...playlistTracks]
    const [movedTrack] = newTracks.splice(fromIndex, 1)
    newTracks.splice(toIndex, 0, movedTrack)
    setPlaylistTracks(newTracks)

    try {
      // Send the full URI list along with range params for maximum compatibility
      const uris = newTracks.map(t => t.uri || `streamify:track:${t.id}`)
      await api.callTool('update_playlist_items', {
        playlist_id: selectedPlaylist.id,
        uris,
        range_start: fromIndex,
        insert_before: toIndex > fromIndex ? toIndex + 1 : toIndex,
        range_length: 1,
      })
    } catch (err) {
      console.error('Failed to reorder tracks:', err)
      // Revert on error
      const result = await api.callTool('get_playlist_items', { playlist_id: selectedPlaylist.id, limit: 50, fields: 'items(track(id,name,uri,artists,album,duration_ms,track_number,explicit)),total' })
      setPlaylistTracks((result as any)?.items?.map((item: any) => item.track).filter(Boolean) || [])
    }
  }

  // Add track to playlist
  const addTrackToPlaylist = async (playlistId: string, trackUri: string, track?: Track) => {
    setIsAddingToPlaylist(playlistId)
    setAddToPlaylistError(null)
    setAddToPlaylistSuccess(null)

    // Use track's uri if available, otherwise use the constructed one
    const uri = track?.uri || trackUri
    console.log('Adding track to playlist:', { playlistId, uri, trackId: track?.id, trackName: track?.name })

    try {
      const result = await api.callTool('add_items_to_playlist', {
        playlist_id: playlistId,
        uris: [uri],
      })

      console.log('Add track result:', result)

      // Check if API returned an error (various formats)
      if ((result as any)?.error) {
        throw new Error((result as any).error.message || (result as any).error || 'Failed to add track')
      }
      if ((result as any)?.message && !(result as any)?.snapshot_id) {
        throw new Error((result as any).message)
      }

      // Verify we got a snapshot_id back (indicates success)
      if (!(result as any)?.snapshot_id) {
        console.warn('No snapshot_id in response:', result)
      }

      // Find playlist name for success message
      const targetPlaylist = playlists.find((p: Playlist) => p.id === playlistId)
      const successMsg = `Added "${track?.name || 'track'}" to ${targetPlaylist?.name || 'playlist'}`
      console.log('Success:', successMsg)

      // Show success briefly
      setAddToPlaylistSuccess(successMsg)
      setIsAddingToPlaylist(null)

      // Optimistic update - add track to local state immediately
      if (selectedPlaylist?.id === playlistId && track) {
        setPlaylistTracks((prev: Track[]) => [...prev, track])
      }

      // Close modal after showing success
      setTimeout(() => {
        setShowAddToPlaylist(null)
        setAddToPlaylistSuccess(null)
      }, 1000)

      // Always refresh the playlists list to update track counts
      try {
        const playlistsResult = await api.callTool('get_current_users_playlists', { limit: 50 })
        setPlaylists((playlistsResult as any)?.items || [])
      } catch (e) {
        console.log('Could not refresh playlists:', e)
      }

      // Try to refresh playlist tracks from server
      if (selectedPlaylist?.id === playlistId) {
        try {
          const refreshResult = await api.callTool('get_playlist_items', { playlist_id: playlistId, limit: 50, fields: 'items(track(id,name,uri,artists,album,duration_ms,track_number,explicit)),total' })
          const tracks = (refreshResult as any)?.items?.map((item: any) => item.track).filter(Boolean) || []
          console.log('Refreshed playlist tracks:', tracks.length)
          setPlaylistTracks(tracks)
        } catch (refreshErr) {
          console.log('Could not refresh playlist tracks from server:', refreshErr)
        }
      }
    } catch (err: any) {
      console.error('Failed to add track to playlist:', err)
      setAddToPlaylistError(err?.message || 'Failed to add track to playlist')
      setIsAddingToPlaylist(null)
    }
  }

  // Search for tracks to add to playlist (searches by track name, artist name, album name)
  const searchTracksToAdd = useCallback(async (query: string) => {
    if (!query.trim()) {
      setAddTrackResults([])
      return
    }
    setIsSearchingAddTrack(true)
    try {
      const result = await api.callTool('search_for_item', { q: query, type: 'track,artist,album', limit: 20 })
      const trackResults: Track[] = (result as any)?.tracks?.items || []
      const trackIds = new Set(trackResults.map((t: Track) => t.id))

      // Fetch top tracks for matching artists and album tracks in parallel
      const matchingArtists: Artist[] = (result as any)?.artists?.items || []
      const matchingAlbums: Album[] = (result as any)?.albums?.items || []

      const artistFetches = matchingArtists.slice(0, 3).map(artist =>
        api.callTool('get_artists_top_tracks', { artist_id: artist.id, market: 'US' }).catch(() => null)
      )
      const albumFetches = matchingAlbums.slice(0, 3).map(album =>
        api.callTool('get_album_tracks', { album_id: album.id, limit: 20, market: 'US' }).catch(() => null)
      )

      const [artistResults, albumResults] = await Promise.all([
        Promise.all(artistFetches),
        Promise.all(albumFetches)
      ])

      for (const artistTracks of artistResults) {
        for (const track of ((artistTracks as any)?.tracks || [])) {
          if (track?.id && !trackIds.has(track.id)) {
            trackIds.add(track.id)
            trackResults.push(track)
          }
        }
      }

      for (let i = 0; i < albumResults.length; i++) {
        const albumTracks = albumResults[i]
        const album = matchingAlbums[i]
        for (const track of ((albumTracks as any)?.items || [])) {
          if (track?.id && !trackIds.has(track.id)) {
            trackIds.add(track.id)
            trackResults.push({ ...track, album: { id: album.id, name: album.name, images: album.images } })
          }
        }
      }

      setAddTrackResults(trackResults.slice(0, 20))
    } catch (err) {
      console.error('Failed to search tracks:', err)
      setAddTrackResults([])
    } finally {
      setIsSearchingAddTrack(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced add track search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showAddTracksSection) {
        searchTracksToAdd(addTrackSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTrackSearch, showAddTracksSection])

  // Remove track from playlist
  const removeTrackFromPlaylist = async (playlistId: string, trackUri: string) => {
    try {
      await api.callTool('remove_playlist_items', {
        playlist_id: playlistId,
        tracks: [{ uri: trackUri }],
      })
      // Refresh playlist tracks
      const result = await api.callTool('get_playlist_items', { playlist_id: playlistId, limit: 50, fields: 'items(track(id,name,uri,artists,album,duration_ms,track_number,explicit)),total' })
      setPlaylistTracks((result as any)?.items?.map((item: any) => item.track).filter(Boolean) || [])
    } catch (err) {
      console.error('Failed to remove track:', err)
    }
  }

  // Save/unsave album
  const toggleSaveAlbum = async (albumId: string, isSaved: boolean, album?: Album) => {
    try {
      if (isSaved) {
        await api.callTool('remove_albums_for_user', { album_ids: [albumId] })
        // Update local state immediately
        setSavedAlbums(prev => prev.filter(a => a.id !== albumId))
        setSavedAlbumIds(prev => {
          const next = new Set(prev)
          next.delete(albumId)
          return next
        })
      } else {
        await api.callTool('save_albums_for_user', { album_ids: [albumId] })
        // Update local state immediately - use provided album or find it
        const albumToSave = album || selectedAlbum ||
          featuredAlbums.find(a => a.id === albumId) ||
          newReleases.find(a => a.id === albumId) ||
          searchResults.albums.find(a => a.id === albumId)
        if (albumToSave) {
          setSavedAlbums(prev => [...prev.filter(a => a.id !== albumId), albumToSave])
        }
        setSavedAlbumIds(prev => {
          const next = new Set(prev)
          next.add(albumId)
          return next
        })
      }
      // Refresh saved status from server using check_users_saved_albums
      try {
        const result = await api.callTool('get_users_saved_albums', { limit: 50 })
        const albums = (result as any)?.items?.map((item: any) => item.album) || []
        setSavedAlbums(albums)
        // Use check_users_saved_albums to verify saved state
        const allAlbumIds = albums.map((a: Album) => a.id)
        if (allAlbumIds.length > 0) {
          const checkResult = await api.callTool('check_users_saved_albums', { album_ids: allAlbumIds })
          if (Array.isArray(checkResult)) {
            const newIds = new Set<string>()
            allAlbumIds.forEach((id: string, i: number) => {
              if (checkResult[i]) newIds.add(id)
            })
            setSavedAlbumIds(newIds)
          }
        }
      } catch {
        // Refresh failed, but save/unsave already succeeded - keep local state
        console.log('Could not refresh saved albums from server')
      }
    } catch (err) {
      console.error('Failed to toggle save album:', err)
    }
  }

  // Follow/unfollow artist
  const toggleFollowArtist = async (artistId: string, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await api.callTool('unfollow_artists_or_users', { type: 'artist', ids: [artistId] })
      } else {
        await api.callTool('follow_artists_or_users', { type: 'artist', ids: [artistId] })
      }
      // Refresh followed artists
      const result = await api.callTool('get_followed_artists', { limit: 50 })
      setFollowedArtists((result as any)?.artists?.items || [])
    } catch (err) {
      console.error('Failed to toggle follow artist:', err)
    }
  }

  // Check if album is saved
  const isAlbumSaved = (albumId: string): boolean => {
    return savedAlbums.some(a => a.id === albumId) || savedAlbumIds.has(albumId)
  }

  // Check if artist is followed
  const isArtistFollowed = (artistId: string): boolean => {
    return followedArtists.some(a => a.id === artistId)
  }

  // View another user's profile
  const openUserProfile = async (userId: string) => {
    if (userId === currentUser?.id) {
      clearViewingUserState()
      setCurrentView('profile')
      return
    }
    try {
      const [userResult, playlistsResult, followingResult, followedArtistsResult] = await Promise.allSettled([
        api.callTool('get_user_profile', { user_id: userId }),
        api.callTool('get_user_playlists', { user_id: userId, limit: 50 }),
        api.callTool('check_user_follows_artists_or_users', { type: 'user', ids: [userId] }),
        api.callTool('get_followed_artists', { user_id: userId, limit: 50 }),
      ])
      setViewingUser(getSettledValue(userResult) as User)
      setViewingUserPlaylists((getSettledValue(playlistsResult) as any)?.items || [])
      setIsFollowingUser(extractFollowStatus(getSettledValue(followingResult)))
      setViewingUserFollowedArtists((getSettledValue(followedArtistsResult) as any)?.artists?.items || [])
      setCurrentView('profile')
    } catch (err) {
      console.error('Failed to load user profile:', err)
    }
  }

  // Follow/unfollow user
  const toggleFollowUser = async (userId: string, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await api.callTool('unfollow_artists_or_users', { type: 'user', ids: [userId] })
      } else {
        await api.callTool('follow_artists_or_users', { type: 'user', ids: [userId] })
      }
      setIsFollowingUser(!isFollowing)
    } catch (err) {
      console.error('Failed to toggle follow user:', err)
    }
  }

  // Playback controls
  const playTrack = (track: Track, context?: { tracks: Track[]; index: number }) => {
    setCurrentTrack(track)
    setIsPlaying(true)
    if (context) {
      setPlaybackContext(context)
    }
  }

  const togglePlayPause = () => {
    if (!currentTrack) return
    setIsPlaying(!isPlaying)
  }

  const skipNext = () => {
    if (!playbackContext || !currentTrack) return
    const nextIndex = playbackContext.index + 1
    if (nextIndex < playbackContext.tracks.length) {
      const nextTrack = playbackContext.tracks[nextIndex]
      setCurrentTrack(nextTrack)
      setPlaybackContext({ ...playbackContext, index: nextIndex })
      setIsPlaying(true)
    }
  }

  const skipPrevious = () => {
    if (!playbackContext || !currentTrack) return
    const prevIndex = playbackContext.index - 1
    if (prevIndex >= 0) {
      const prevTrack = playbackContext.tracks[prevIndex]
      setCurrentTrack(prevTrack)
      setPlaybackContext({ ...playbackContext, index: prevIndex })
      setIsPlaying(true)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0E0E10]">
        <div className="w-10 h-10 border-[3px] border-[#DB2777]/20 border-t-[#DB2777] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#0E0E10] gap-4">
        <p className="text-red-400 tracking-wide">{error}</p>
        <button
          className="px-5 py-2.5 bg-[#DB2777] hover:bg-[#EC4899] text-white rounded-full font-semibold shadow-lg shadow-[#DB2777]/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#DB2777]/30"
          onClick={loadInitialData}
        >
          Retry
        </button>
      </div>
    )
  }

  // Render sidebar
  const renderSidebar = () => (
    <div className="w-64 bg-[#0A0A0C] flex flex-col h-full">
      {/* Navigation */}
      <div className="px-5 pt-7 pb-4">
        <div className="space-y-1">
          <button
            className={`flex items-center gap-4 w-full text-left px-3 py-2.5 rounded-lg transition-all ${
              currentView === 'home'
                ? 'text-white bg-white/[0.06]'
                : 'text-[#B3B3B3] hover:text-white hover:bg-white/[0.03]'
            }`}
            onClick={() => setCurrentView('home')}
          >
            <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3L4 9v12h5v-7h6v7h5V9z"/>
            </svg>
            <span className="font-semibold tracking-tight">Home</span>
          </button>

          <button
            className={`flex items-center gap-4 w-full text-left px-3 py-2.5 rounded-lg transition-all ${
              currentView === 'search'
                ? 'text-white bg-white/[0.06]'
                : 'text-[#B3B3B3] hover:text-white hover:bg-white/[0.03]'
            }`}
            onClick={() => setCurrentView('search')}
          >
            <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <span className="font-semibold tracking-tight">Search</span>
          </button>
        </div>
      </div>

      {/* Library */}
      <div className="flex-1 bg-[#131316] rounded-2xl mx-3 mb-3 flex flex-col overflow-hidden shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <button
            className={`flex items-center gap-3 transition-colors ${
              currentView === 'library' ? 'text-white' : 'text-[#B3B3B3] hover:text-white'
            }`}
            onClick={() => setCurrentView('library')}
          >
            <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h2v12H4V6zm4 0h2v12H8V6zm4 0h8v2h-8V6zm0 4h8v2h-8v-2zm0 4h8v2h-8v-2z"/>
            </svg>
            <span className="font-semibold tracking-tight">Your Library</span>
          </button>
          <button
            className="w-8 h-8 grid place-items-center text-[#B3B3B3] hover:text-white hover:bg-white/[0.06] rounded-full transition-all"
            onClick={() => setShowCreatePlaylist(true)}
            title="Create playlist"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>

        {/* Playlist list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              className={`w-full p-2 flex items-center gap-3 rounded-lg transition-all ${
                selectedPlaylist?.id === playlist.id && currentView === 'playlist'
                  ? 'bg-white/[0.08]'
                  : 'hover:bg-white/[0.04]'
              }`}
              onClick={() => openPlaylist(playlist)}
            >
              <div className="w-12 h-12 bg-[#1f1f23] rounded-lg flex-shrink-0 overflow-hidden shadow-md shadow-black/30">
                <ImageWithFallback src={getImageUrl(playlist.images, 'small')} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-sm font-medium truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
                <p className="text-[#B3B3B3] text-xs truncate tracking-wide">
                  Playlist · {playlist.owner?.display_name || 'Unknown'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  // Shared: render category playlists section
  const renderCategoryPlaylists = () => {
    if (!selectedCategory || categoryPlaylists.length === 0) return null
    return (
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">{selectedCategory.name}</h2>
          <button
            className="text-sm text-[#B3B3B3] hover:text-white"
            onClick={() => {
              setSelectedCategory(null)
              setCategoryPlaylists([])
            }}
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {categoryPlaylists.map(playlist => (
            <button
              key={playlist.id}
              className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left group"
              onClick={() => openPlaylist(playlist)}
            >
              <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                <ImageWithFallback src={getImageUrl(playlist.images)} className="w-full h-full object-cover" />
              </div>
              <p className="text-white font-semibold truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
              <p className="text-[#B3B3B3] text-sm mt-1 line-clamp-2">{playlist.description || 'Playlist'}</p>
            </button>
          ))}
        </div>
      </section>
    )
  }

  // Render home view
  const renderHomeView = () => (
    <div className="px-8 py-6 space-y-10">
      <h1 className="text-4xl font-bold text-white tracking-tight">Good evening</h1>

      {/* Featured Playlists */}
      {featuredPlaylists.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Featured Playlists</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {featuredPlaylists.slice(0, 10).map(playlist => (
              <button
                key={playlist.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left group"
                onClick={() => openPlaylist(playlist)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                  <ImageWithFallback src={getImageUrl(playlist.images)} className="w-full h-full object-cover" />
                </div>
                <p className="text-white font-semibold truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1 line-clamp-2">{playlist.description || 'Playlist'}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* New Releases */}
      {newReleases.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white tracking-tight">New Releases</h2>
            {newReleases.length > 10 && (
              <button
                className="text-sm text-[#B3B3B3] hover:text-white font-semibold transition-colors"
                onClick={() => setShowAllNewReleases(!showAllNewReleases)}
              >
                {showAllNewReleases ? 'Show Less' : 'Show All'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {(showAllNewReleases ? newReleases : newReleases.slice(0, 10)).map(album => (
              <button
                key={album.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left group"
                onClick={() => openAlbum(album)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                  {getImageUrl(album.images) ? (
                    <img
                      src={getImageUrl(album.images)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-white font-semibold truncate">{album.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{album.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                  {album.artists.map(a => a.name).join(', ')}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Featured Albums (albums with tracks) */}
      {featuredAlbums.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Featured Albums</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {featuredAlbums.map(album => (
              <button
                key={album.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left group"
                onClick={() => openAlbum(album)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                  {getImageUrl(album.images) ? (
                    <img
                      src={getImageUrl(album.images)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-white font-semibold truncate">{album.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{album.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                  {album.artists.map(a => a.name).join(', ')}
                </p>
                <span className="inline-block mt-2 px-2 py-0.5 bg-[#DB2777]/15 rounded-full text-[#EC4899] text-[11px] tracking-wide font-medium">{album.total_tracks} tracks</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Browse Categories */}
      {categories.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Browse Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {categories.slice(0, 10).map(category => (
              <button
                key={category.id}
                className="aspect-square rounded-2xl overflow-hidden relative group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 hover:brightness-110"
                style={{ background: `linear-gradient(135deg, hsl(${category.id.charCodeAt(0) * 10}, 55%, 38%) 0%, hsl(${(category.id.charCodeAt(0) * 10 + 30) % 360}, 50%, 22%) 100%)` }}
                onClick={() => openCategory(category)}
              >
                <p className="absolute top-4 left-4 right-4 text-white font-bold text-xl tracking-tight text-left drop-shadow-md">{category.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{category.id}]</span></p>
                {getImageUrl(category.icons) && (
                  <img
                    src={getImageUrl(category.icons)}
                    alt=""
                    className="absolute bottom-0 right-0 w-24 h-24 transform rotate-25 translate-x-4 translate-y-4"
                  />
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {renderCategoryPlaylists()}

      {/* Recommended For You */}
      {recommendations.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Saved recommendations</h2>
          <p className="text-sm text-gray-400 mb-4">As stored in this task snapshot; no new recommendations are generated.</p>
          <div className="space-y-2">
            {recommendations.slice(0, 10).map((track, index) => (
              <div
                key={track.id}
                className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
              >
                <span className="w-4 text-center text-[#B3B3B3] text-sm">{index + 1}</span>
                <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                  {getImageUrl(track.album?.images, 'small') ? (
                    <img src={getImageUrl(track.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                  <p className="text-[#B3B3B3] text-xs truncate">
                    {track.artists?.map((a: Artist) => a.name).join(', ')}
                  </p>
                </div>
                <button
                  className="p-1 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-white transition-all"
                  onClick={() => setShowAddToPlaylist(track)}
                  title="Add to playlist"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </button>
                <span className="text-[#B3B3B3] text-sm w-12 text-right">
                  {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )

  // Render search view
  const renderSearchView = () => (
    <div className="px-8 py-6 space-y-7">
      {/* Search input */}
      <div className="relative max-w-lg">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#7a7a82]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          type="text"
          placeholder="What do you want to listen to?"
          className="w-full pl-12 pr-4 py-3 bg-[#1c1c20] rounded-full text-white placeholder:text-[#7a7a82] text-sm focus:outline-none focus:ring-2 focus:ring-[#DB2777]/40 focus:bg-[#222226] transition-all"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-[#DB2777]/30 border-t-[#DB2777] rounded-full animate-spin" />
        </div>
      )}

      {!isSearching && searchQuery && (
        <>
          {/* Artists */}
          {searchResults.artists.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Artists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.artists.slice(0, 10).map(artist => (
                  <button
                    key={artist.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                    onClick={() => openArtist(artist)}
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-full overflow-hidden shadow-md shadow-black/30">
                      {getImageUrl(artist.images) ? (
                        <img src={getImageUrl(artist.images)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-white font-semibold truncate">{artist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{artist.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1">Artist</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {searchResults.albums.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Albums</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.albums.slice(0, 10).map(album => (
                  <button
                    key={album.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                    onClick={() => openAlbum(album)}
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      {getImageUrl(album.images) ? (
                        <img src={getImageUrl(album.images)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-white font-semibold truncate">{album.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{album.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                      {album.release_date?.substring(0, 4)} • {album.artists.map(a => a.name).join(', ')}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tracks */}
          {searchResults.tracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Songs</h2>
              <div className="space-y-2">
                {searchResults.tracks.slice(0, 10).map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-4 p-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                  >
                    <span className="w-4 text-[#B3B3B3] text-sm">{index + 1}</span>
                    <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                      {getImageUrl(track.album?.images, 'small') ? (
                        <img src={getImageUrl(track.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                      <p className="text-[#B3B3B3] text-xs truncate">
                        {track.artists.map(a => a.name).join(', ')}
                      </p>
                    </div>
                    <span className="text-[#B3B3B3] text-sm">
                      {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                    </span>
                    <button
                      className="p-2 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-white transition-all"
                      onClick={() => setShowAddToPlaylist(track)}
                      title="Add to playlist"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Playlists */}
          {searchResults.playlists.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Playlists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.playlists.slice(0, 10).map(playlist => (
                  <button
                    key={playlist.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                    onClick={() => openPlaylist(playlist)}
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      <ImageWithFallback src={getImageUrl(playlist.images)} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white font-semibold truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1">By {playlist.owner?.display_name || 'Unknown'}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Podcasts */}
          {searchResults.shows.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Podcasts</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.shows.slice(0, 10).map((show: Show) => (
                  <div
                    key={show.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      <ImageWithFallback
                        src={getImageUrl(show.images)}
                        className="w-full h-full object-cover"
                        fallbackClassName="bg-[#282828]"
                      />
                    </div>
                    <p className="text-white font-semibold truncate">{show.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{show.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1 truncate">{show.publisher || 'Podcast'}</p>
                    {show.total_episodes !== undefined && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-white/[0.06] rounded-full text-[#B3B3B3] text-[11px] tracking-wide font-medium">{show.total_episodes} episodes</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Episodes */}
          {searchResults.episodes.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Episodes</h2>
              <div className="space-y-2">
                {searchResults.episodes.slice(0, 10).map((episode: Episode) => (
                  <div
                    key={episode.id}
                    className="flex items-center gap-4 p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                      <ImageWithFallback
                        src={getImageUrl(episode.images, 'small')}
                        className="w-full h-full object-cover"
                        fallbackClassName="bg-[#282828]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{episode.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{episode.id}]</span></p>
                      <p className="text-[#B3B3B3] text-xs truncate">
                        {episode.show?.name || 'Episode'}
                        {episode.release_date && ` • ${episode.release_date.substring(0, 10)}`}
                      </p>
                    </div>
                    <span className="text-[#B3B3B3] text-sm">
                      {episode.duration_ms ? formatDuration(episode.duration_ms) : '--:--'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audiobooks */}
          {searchResults.audiobooks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Audiobooks</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {searchResults.audiobooks.slice(0, 10).map((audiobook: Audiobook) => (
                  <div
                    key={audiobook.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      <ImageWithFallback
                        src={getImageUrl(audiobook.images)}
                        className="w-full h-full object-cover"
                        fallbackClassName="bg-[#282828]"
                      />
                    </div>
                    <p className="text-white font-semibold truncate">{audiobook.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{audiobook.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                      {audiobook.authors?.map(a => typeof a === 'string' ? a : a.name).join(', ') || audiobook.publisher || 'Audiobook'}
                    </p>
                    {audiobook.total_chapters !== undefined && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-white/[0.06] rounded-full text-[#B3B3B3] text-[11px] tracking-wide font-medium">{audiobook.total_chapters} chapters</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {searchResults.tracks.length === 0 &&
            searchResults.albums.length === 0 &&
            searchResults.artists.length === 0 &&
            searchResults.playlists.length === 0 &&
            searchResults.shows.length === 0 &&
            searchResults.episodes.length === 0 &&
            searchResults.audiobooks.length === 0 && (
              <div className="text-center py-12">
                <p className="text-white text-lg mb-2">No results found for "{searchQuery}"</p>
                <p className="text-[#B3B3B3]">Please make sure your words are spelled correctly, or use fewer or different keywords.</p>
              </div>
            )}
        </>
      )}

      {!searchQuery && (
        <>
          {renderCategoryPlaylists()}

          <div>
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Browse all</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {categories.map(category => (
                <button
                  key={category.id}
                  className="aspect-square rounded-2xl overflow-hidden relative group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 hover:brightness-110"
                  style={{ background: `linear-gradient(135deg, hsl(${category.id.charCodeAt(0) * 10}, 55%, 38%) 0%, hsl(${(category.id.charCodeAt(0) * 10 + 30) % 360}, 50%, 22%) 100%)` }}
                  onClick={() => openCategory(category)}
                >
                  <p className="absolute top-4 left-4 right-4 text-white font-bold text-lg tracking-tight text-left drop-shadow-md">{category.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{category.id}]</span></p>
                  {getImageUrl(category.icons) && (
                    <img
                      src={getImageUrl(category.icons)}
                      alt=""
                      className="absolute bottom-0 right-0 w-24 h-24 transform rotate-25 translate-x-4 translate-y-4"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  // Render library view
  const renderLibraryView = () => (
    <div className="px-8 py-6 space-y-7">
      <h1 className="text-3xl font-bold text-white tracking-tight">Your Library</h1>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          className={`px-4 py-2 rounded-full text-sm font-semibold tracking-tight transition-all ${
            libraryTab === 'playlists'
              ? 'bg-[#DB2777] text-white shadow-md shadow-[#DB2777]/30'
              : 'bg-[#1c1c20] text-[#d8d8dc] hover:bg-[#26262b] hover:text-white'
          }`}
          onClick={() => setLibraryTab('playlists')}
        >
          Playlists
        </button>
        <button
          className={`px-4 py-2 rounded-full text-sm font-semibold tracking-tight transition-all ${
            libraryTab === 'albums'
              ? 'bg-[#DB2777] text-white shadow-md shadow-[#DB2777]/30'
              : 'bg-[#1c1c20] text-[#d8d8dc] hover:bg-[#26262b] hover:text-white'
          }`}
          onClick={() => setLibraryTab('albums')}
        >
          Albums
        </button>
        <button
          className={`px-4 py-2 rounded-full text-sm font-semibold tracking-tight transition-all ${
            libraryTab === 'artists'
              ? 'bg-[#DB2777] text-white shadow-md shadow-[#DB2777]/30'
              : 'bg-[#1c1c20] text-[#d8d8dc] hover:bg-[#26262b] hover:text-white'
          }`}
          onClick={() => setLibraryTab('artists')}
        >
          Artists
        </button>
        <button
          className={`px-4 py-2 rounded-full text-sm font-semibold tracking-tight transition-all ${
            libraryTab === 'podcasts'
              ? 'bg-[#DB2777] text-white shadow-md shadow-[#DB2777]/30'
              : 'bg-[#1c1c20] text-[#d8d8dc] hover:bg-[#26262b] hover:text-white'
          }`}
          onClick={() => {
            setLibraryTab('podcasts')
            loadLibraryMedia()
          }}
        >
          Podcasts & Audiobooks
        </button>
      </div>

      {/* Playlists tab */}
      {libraryTab === 'playlists' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left group relative"
              onClick={() => openPlaylist(playlist)}
            >
              <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                <ImageWithFallback src={getImageUrl(playlist.images)} className="w-full h-full object-cover" />
              </div>
              <p className="text-white font-semibold truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
              <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                {playlist.tracks?.total || 0} songs
              </p>
              {/* Edit button */}
              <button
                className="absolute top-3 right-3 p-2 bg-black/70 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-all text-white hover:scale-105 shadow-lg ring-1 ring-white/10"
                onClick={async (e) => {
                  e.stopPropagation()
                  setEditingPlaylist(playlist)
                  setNewPlaylistName(playlist.name)
                  setNewPlaylistDescription(playlist.description || '')
                  // Fetch cover image for display in edit modal
                  const coverUrl = getImageUrl(playlist.images, 'large')
                  if (coverUrl) {
                    setNewPlaylistCoverImage(coverUrl)
                  } else {
                    try {
                      const coverData = await api.callTool('get_playlist_cover_image', { playlist_id: playlist.id })
                      if (Array.isArray(coverData) && coverData.length > 0 && (coverData as any)[0]?.url) {
                        setNewPlaylistCoverImage((coverData as any)[0].url)
                      } else if (coverData && !Array.isArray(coverData) && (coverData as any)?.url) {
                        setNewPlaylistCoverImage((coverData as any).url)
                      }
                    } catch { /* ignore */ }
                  }
                }}
                title="Edit playlist"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
            </button>
          ))}
        </div>
      )}

      {/* Albums tab */}
      {libraryTab === 'albums' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {savedAlbums.length > 0 ? (
            savedAlbums.map(album => (
              <button
                key={album.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                onClick={() => openAlbum(album)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                  {getImageUrl(album.images) ? (
                    <img src={getImageUrl(album.images)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-white font-semibold truncate">{album.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{album.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                  {album.artists.map(a => a.name).join(', ')}
                </p>
              </button>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center text-center py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center text-[#B3B3B3]">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/></svg>
              </div>
              <p className="text-[#B3B3B3] tracking-wide">No saved albums yet</p>
            </div>
          )}
        </div>
      )}

      {/* Artists tab */}
      {libraryTab === 'artists' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {followedArtists.length > 0 ? (
            followedArtists.map(artist => (
              <button
                key={artist.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                onClick={() => openArtist(artist)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-full overflow-hidden shadow-md shadow-black/30">
                  {getImageUrl(artist.images) ? (
                    <img src={getImageUrl(artist.images)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-white font-semibold truncate">{artist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{artist.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1">Artist</p>
              </button>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center text-center py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center text-[#B3B3B3]">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </div>
              <p className="text-[#B3B3B3] tracking-wide">No followed artists yet</p>
            </div>
          )}
        </div>
      )}

      {/* Podcasts & Audiobooks tab */}
      {libraryTab === 'podcasts' && (
        <div className="space-y-8">
          {/* Shows/Podcasts */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Podcasts</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {libraryShows.length > 0 ? (
                libraryShows.map((show: Show) => (
                  <div
                    key={show.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      <ImageWithFallback
                        src={getImageUrl(show.images)}
                        className="w-full h-full object-cover"
                        fallbackClassName="bg-[#282828]"
                      />
                    </div>
                    <p className="text-white font-semibold truncate">{show.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{show.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1 truncate">{show.publisher || 'Podcast'}</p>
                    {show.total_episodes !== undefined && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-white/[0.06] rounded-full text-[#B3B3B3] text-[11px] tracking-wide font-medium">{show.total_episodes} episodes</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <p className="text-[#B3B3B3]">No podcasts found</p>
                </div>
              )}
            </div>
          </div>

          {/* Audiobooks */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Audiobooks</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {libraryAudiobooks.length > 0 ? (
                libraryAudiobooks.map((audiobook: Audiobook) => (
                  <div
                    key={audiobook.id}
                    className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  >
                    <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                      <ImageWithFallback
                        src={getImageUrl(audiobook.images)}
                        className="w-full h-full object-cover"
                        fallbackClassName="bg-[#282828]"
                      />
                    </div>
                    <p className="text-white font-semibold truncate">{audiobook.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{audiobook.id}]</span></p>
                    <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                      {audiobook.authors?.map(a => typeof a === 'string' ? a : a.name).join(', ') || audiobook.publisher || 'Audiobook'}
                    </p>
                    {audiobook.total_chapters !== undefined && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-white/[0.06] rounded-full text-[#B3B3B3] text-[11px] tracking-wide font-medium">{audiobook.total_chapters} chapters</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <p className="text-[#B3B3B3]">No audiobooks found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Render playlist detail view
  const renderPlaylistView = () => {
    if (!selectedPlaylist) return null

    return (
      <div className="flex flex-col">
        {/* Header */}
        <div className="p-8 pb-6 bg-gradient-to-b from-[#3a2530] via-[#1f1820] to-[#0E0E10] flex items-end gap-6">
          <div className="w-56 h-56 bg-[#1f1f23] rounded-2xl shadow-2xl shadow-black/50 flex-shrink-0 overflow-hidden ring-1 ring-white/5">
            <ImageWithFallback src={playlistCoverImage || getImageUrl(selectedPlaylist.images, 'large')} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-2">Playlist</p>
            <h1 className="text-5xl font-bold text-white mb-4 truncate tracking-tight">{selectedPlaylist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedPlaylist.id}]</span></h1>
            {selectedPlaylist.description && (
              <p className="text-[#B3B3B3] mb-2">{selectedPlaylist.description}</p>
            )}
            <p className="text-white text-sm">
              <button
                className="font-semibold hover:underline"
                onClick={() => selectedPlaylist.owner?.id && openUserProfile(selectedPlaylist.owner.id)}
              >
                {selectedPlaylist.owner?.display_name}
              </button>
              <span className="text-[#B3B3B3]"> • {playlistTracks.length} songs</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-5 flex items-center gap-5">
          <button
            className="w-14 h-14 bg-[#DB2777] rounded-full flex items-center justify-center hover:scale-105 hover:bg-[#EC4899] transition-all shadow-lg shadow-[#DB2777]/40"
            onClick={() => {
              if (playlistTracks.length > 0) {
                playTrack(playlistTracks[0], { tracks: playlistTracks, index: 0 })
              }
            }}
          >
            <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button
            className="p-2 text-[#B3B3B3] hover:text-white transition-colors"
            onClick={() => {
              setEditingPlaylist(selectedPlaylist)
              setNewPlaylistName(selectedPlaylist.name)
              setNewPlaylistDescription(selectedPlaylist.description || '')
              setNewPlaylistCoverImage(playlistCoverImage || getImageUrl(selectedPlaylist.images, 'large') || null)
            }}
            title="Edit playlist"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button
            className="p-2 text-[#B3B3B3] hover:text-red-400 transition-colors"
            onClick={() => setShowDeletePlaylist(selectedPlaylist)}
            title="Delete playlist"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
          <button
            className={`px-5 py-1.5 rounded-full text-sm font-semibold tracking-tight transition-all ${
              isFollowingPlaylist
                ? 'bg-[#DB2777]/15 text-[#EC4899] hover:bg-[#DB2777]/25 ring-1 ring-[#DB2777]/40'
                : 'bg-white/[0.06] text-white hover:bg-white/[0.12] ring-1 ring-white/10'
            }`}
            onClick={() => toggleFollowPlaylist(selectedPlaylist.id, isFollowingPlaylist)}
            title={isFollowingPlaylist ? 'Unfollow playlist' : 'Follow playlist'}
          >
            {isFollowingPlaylist ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Tracks */}
        <div className="px-8">
          {/* Header row */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/5 text-[#7a7a82] text-xs uppercase tracking-wider font-semibold">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Title</span>
            <span className="w-48">Album</span>
            <span className="w-16 text-right">
              <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </span>
          </div>

          {/* Track list */}
          <div className="mt-2">
            {playlistTracksError && (
              <div className="px-4 py-8 text-center text-[#B3B3B3]">
                <p>{playlistTracksError}</p>
              </div>
            )}
            {playlistTracks.map((track, index) => (
              <div
                key={`${track.id}-${index}`}
                className={`flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group ${
                  draggingTrackIndex === index ? 'opacity-50 bg-white/[0.04]' : ''
                }`}
                draggable
                onDragStart={() => setDraggingTrackIndex(index)}
                onDragEnd={() => setDraggingTrackIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingTrackIndex !== null && draggingTrackIndex !== index) {
                    reorderPlaylistTracks(draggingTrackIndex, index)
                  }
                  setDraggingTrackIndex(null)
                }}
              >
                {/* Drag handle */}
                <div className="w-4 cursor-grab opacity-0 group-hover:opacity-100 text-[#B3B3B3]">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </div>
                <span className="w-6 text-center text-[#B3B3B3] text-sm group-hover:hidden">
                  {index + 1}
                </span>
                <button className="w-6 text-center text-white hidden group-hover:block" onClick={() => playTrack(track, { tracks: playlistTracks, index })}>
                  <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
                <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                  {getImageUrl(track.album?.images, 'small') ? (
                    <img src={getImageUrl(track.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                  <p className="text-[#B3B3B3] text-xs truncate">
                    {track.explicit && <span className="inline-flex items-center justify-center w-4 h-4 bg-white/15 text-white/70 text-[9px] font-bold rounded-sm mr-1.5 align-middle">E</span>}
                    {track.artists.map((a, i) => (
                      <span key={a.id}>
                        <button
                          className="hover:underline hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            openArtist(a as Artist)
                          }}
                        >
                          {a.name}
                        </button>
                        {i < track.artists.length - 1 && ', '}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  className="w-48 text-left text-[#B3B3B3] text-sm truncate hover:underline hover:text-white"
                  onClick={() => track.album && openAlbum(track.album as Album)}
                >
                  {track.album?.name}
                </button>
                <div className="w-16 flex items-center justify-end gap-2">
                  <button
                    className="p-1 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-red-400 transition-all"
                    onClick={() => removeTrackFromPlaylist(selectedPlaylist.id, `streamify:track:${track.id}`)}
                    title="Remove from playlist"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                  <span className="text-[#B3B3B3] text-sm">
                    {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add tracks section */}
          <div className="mt-6 border-t border-white/5 pt-6">
            <button
              className="flex items-center gap-2 text-[#B3B3B3] hover:text-white transition-colors mb-4"
              onClick={() => {
                setShowAddTracksSection(!showAddTracksSection)
                if (!showAddTracksSection) {
                  setAddTrackSearch('')
                  setAddTrackResults([])
                }
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              <span className="font-semibold">Add tracks</span>
              <svg className={`w-4 h-4 transition-transform ${showAddTracksSection ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>

            {showAddTracksSection && (
              <div className="space-y-4">
                <div className="relative max-w-md">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B3B3B3]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search for tracks to add..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#1c1c20] rounded-lg text-white placeholder:text-[#7a7a82] text-sm focus:outline-none focus:ring-2 focus:ring-[#DB2777]/40 focus:bg-[#222226] transition-all"
                    value={addTrackSearch}
                    onChange={e => setAddTrackSearch(e.target.value)}
                    autoFocus
                  />
                </div>

                {isSearchingAddTrack && (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-6 h-6 border-2 border-[#DB2777]/30 border-t-[#DB2777] rounded-full animate-spin" />
                  </div>
                )}

                {!isSearchingAddTrack && addTrackResults.length > 0 && (
                  <div className="space-y-1">
                    {addTrackResults.map(track => {
                      const alreadyInPlaylist = playlistTracks.some(t => t.id === track.id)
                      return (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                        >
                          <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                            {track.album?.images?.[0]?.url ? (
                              <img src={track.album.images[0].url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                            <p className="text-[#B3B3B3] text-xs truncate">
                              {track.artists?.map(a => a.name).join(', ')}
                            </p>
                          </div>
                          <button
                            className={`px-4 py-1.5 rounded-full text-sm font-semibold tracking-tight transition-all ${
                              alreadyInPlaylist
                                ? 'bg-white/[0.06] text-[#B3B3B3] ring-1 ring-white/10 cursor-default'
                                : 'bg-[#DB2777] text-white hover:bg-[#EC4899] shadow-md shadow-[#DB2777]/30 hover:shadow-lg hover:-translate-y-0.5'
                            }`}
                            onClick={() => {
                              if (!alreadyInPlaylist) {
                                addTrackToPlaylist(selectedPlaylist.id, `streamify:track:${track.id}`, track)
                              }
                            }}
                            disabled={alreadyInPlaylist}
                          >
                            {alreadyInPlaylist ? 'Added' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {!isSearchingAddTrack && addTrackSearch && addTrackResults.length === 0 && (
                  <p className="text-[#B3B3B3] text-sm">No tracks found</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render album detail view
  const renderAlbumView = () => {
    if (!selectedAlbum) return null
    const saved = isAlbumSaved(selectedAlbum.id)

    return (
      <div className="flex flex-col">
        {/* Header */}
        <div className="p-8 pb-6 bg-gradient-to-b from-[#3a2530] via-[#1f1820] to-[#0E0E10] flex items-end gap-6">
          <div className="w-56 h-56 bg-[#1f1f23] rounded-2xl shadow-2xl shadow-black/50 flex-shrink-0 overflow-hidden ring-1 ring-white/5">
            {getImageUrl(selectedAlbum.images, 'large') ? (
              <img
                src={getImageUrl(selectedAlbum.images, 'large')}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-2">{selectedAlbum.album_type || 'Album'}</p>
            <h1 className="text-5xl font-bold text-white mb-4 truncate tracking-tight">{selectedAlbum.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedAlbum.id}]</span></h1>
            <p className="text-white text-sm">
              {selectedAlbum.artists.map((a, i) => (
                <span key={a.id}>
                  <button
                    className="font-semibold hover:underline"
                    onClick={() => openArtist(a as Artist)}
                  >
                    {a.name}
                  </button>
                  {i < selectedAlbum.artists.length - 1 && ', '}
                </span>
              ))}
              <span className="text-[#B3B3B3]">
                {' '} • {selectedAlbum.release_date?.substring(0, 4)} • {selectedAlbum.total_tracks} songs
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-5 flex items-center gap-5">
          <button
            className="w-14 h-14 bg-[#DB2777] rounded-full flex items-center justify-center hover:scale-105 hover:bg-[#EC4899] transition-all shadow-lg shadow-[#DB2777]/40"
            onClick={() => {
              if (albumTracks.length > 0) {
                playTrack(albumTracks[0], { tracks: albumTracks, index: 0 })
              }
            }}
          >
            <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button
            className={`p-2 transition-colors ${saved ? 'text-[#DB2777]' : 'text-[#B3B3B3] hover:text-white'}`}
            onClick={() => toggleSaveAlbum(selectedAlbum.id, saved, selectedAlbum)}
            title={saved ? 'Remove from library' : 'Save to library'}
          >
            {saved ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
        </div>

        {/* Tracks */}
        <div className="px-8">
          {/* Header row */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/5 text-[#7a7a82] text-xs uppercase tracking-wider font-semibold">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Title</span>
            <span className="w-16 text-right">
              <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </span>
          </div>

          {/* Track list */}
          <div className="mt-2">
            {albumTracks.map((track, index) => (
              <div
                key={track.id}
                className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
              >
                <span className="w-8 text-center text-[#B3B3B3] text-sm group-hover:hidden">
                  {track.track_number || index + 1}
                </span>
                <button className="w-8 text-center text-white hidden group-hover:block" onClick={() => playTrack(track, { tracks: albumTracks, index })}>
                  <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                  <p className="text-[#B3B3B3] text-xs truncate">
                    {track.explicit && <span className="inline-flex items-center justify-center w-4 h-4 bg-white/15 text-white/70 text-[9px] font-bold rounded-sm mr-1.5 align-middle">E</span>}
                    {track.artists?.map((a, i) => (
                      <span key={a.id}>
                        <button
                          className="hover:underline hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            openArtist(a as Artist)
                          }}
                        >
                          {a.name}
                        </button>
                        {i < track.artists.length - 1 && ', '}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="w-16 flex items-center justify-end gap-2">
                  <button
                    className="p-1 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-white transition-all"
                    onClick={() => setShowAddToPlaylist(track)}
                    title="Add to playlist"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                  <span className="text-[#B3B3B3] text-sm">
                    {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                  </span>
                </div>
              </div>
            ))}
            {albumTracks.length === 0 && (
              <div className="px-4 py-8 text-center text-[#B3B3B3]">
                <p>No tracks available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render artist detail view
  const renderArtistView = () => {
    if (!selectedArtist) return null
    const following = isArtistFollowed(selectedArtist.id)

    return (
      <div className="flex flex-col">
        {/* Header */}
        <div
          className="p-8 pb-6 min-h-[360px] flex items-end bg-gradient-to-b from-[#3a2530] via-[#1f1820] to-[#0E0E10]"
          style={{
            backgroundImage: getImageUrl(selectedArtist.images, 'large')
              ? `linear-gradient(to bottom, rgba(14,14,16,0.25) 0%, rgba(14,14,16,0.7) 70%, #0E0E10 100%), url(${getImageUrl(selectedArtist.images, 'large')})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div>
            <p className="text-white/85 text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#3d91f4]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
              </svg>
              Verified Artist
            </p>
            <h1 className="text-7xl font-bold text-white mb-4 tracking-tight">{selectedArtist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedArtist.id}]</span></h1>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {selectedArtist.genres?.slice(0, 4).map((genre: string) => (
                <span key={genre} className="px-3 py-1 bg-white/[0.08] backdrop-blur rounded-full text-xs text-white/80 capitalize tracking-wide font-medium">
                  {genre}
                </span>
              ))}
            </div>
            <p className="text-white text-sm flex items-center gap-3">
              <span>{selectedArtist.followers?.total?.toLocaleString()} followers</span>
              {selectedArtist.popularity !== undefined && (
                <span className="flex items-center gap-1 text-[#B3B3B3]">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                  {selectedArtist.popularity}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-5 flex items-center gap-5">
          <button
            className="w-14 h-14 bg-[#DB2777] rounded-full flex items-center justify-center hover:scale-105 hover:bg-[#EC4899] transition-all shadow-lg shadow-[#DB2777]/40"
            onClick={() => {
              if (artistTopTracks.length > 0) {
                playTrack(artistTopTracks[0], { tracks: artistTopTracks, index: 0 })
              }
            }}
          >
            <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button
            className={`px-5 py-1.5 rounded-full text-sm font-semibold tracking-tight transition-all ${
              following
                ? 'bg-[#DB2777]/15 text-[#EC4899] hover:bg-[#DB2777]/25 ring-1 ring-[#DB2777]/40'
                : 'bg-white/[0.06] text-white hover:bg-white/[0.12] ring-1 ring-white/10'
            }`}
            onClick={() => toggleFollowArtist(selectedArtist.id, following)}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Popular tracks */}
        {artistTopTracks.length > 0 && (
          <section className="px-8 mt-4">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Popular</h2>
            <div>
              {artistTopTracks.slice(0, 5).map((track, index) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="w-4 text-center text-[#B3B3B3] text-sm">{index + 1}</span>
                  <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                    {getImageUrl(track.album?.images, 'small') ? (
                      <img src={getImageUrl(track.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                  </div>
                  <button
                    className="p-1 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-white transition-all"
                    onClick={() => setShowAddToPlaylist(track)}
                    title="Add to playlist"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                  <span className="text-[#B3B3B3] text-sm w-12 text-right">
                    {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Discography */}
        {artistAlbums.length > 0 && (
          <section className="px-8 mt-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Discography</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {artistAlbums.slice(0, 10).map(album => (
                <button
                  key={album.id}
                  className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  onClick={() => openAlbum(album)}
                >
                  <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                    {getImageUrl(album.images) ? (
                      <img src={getImageUrl(album.images)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-white font-semibold truncate">{album.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{album.id}]</span></p>
                  <p className="text-[#B3B3B3] text-sm mt-1 truncate">
                    {album.release_date?.substring(0, 4)} • {album.album_type || 'Album'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Related Artists */}
        {relatedArtists.length > 0 && (
          <section className="px-8 mt-8 pb-6">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Fans also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {relatedArtists.slice(0, 5).map(artist => (
                <button
                  key={artist.id}
                  className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  onClick={() => openArtist(artist)}
                >
                  <div className="aspect-square mb-4 bg-[#1f1f23] rounded-full overflow-hidden shadow-md shadow-black/30">
                    {getImageUrl(artist.images) ? (
                      <img src={getImageUrl(artist.images)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-white font-semibold truncate">{artist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{artist.id}]</span></p>
                  <p className="text-[#B3B3B3] text-sm mt-1">Artist</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // Render profile view
  const renderProfileView = () => {
    // Show viewing user if set, otherwise show current user
    const displayUser = viewingUser || currentUser
    const displayPlaylists = viewingUser ? viewingUserPlaylists : playlists
    const displayFollowedArtists = viewingUser ? viewingUserFollowedArtists : followedArtists
    const isOwnProfile = !viewingUser || viewingUser.id === currentUser?.id

    if (!displayUser) return null

    return (
      <div className="px-8 py-6">
        <div className="flex items-center gap-6 mb-10 bg-gradient-to-b from-[#3a2530] via-[#1f1820] to-transparent -mx-8 px-8 -mt-6 pt-8 pb-6">
          <div className="w-48 h-48 bg-[#1f1f23] rounded-full overflow-hidden flex-shrink-0 shadow-2xl shadow-black/50 ring-1 ring-white/5">
            {getImageUrl(displayUser.images, 'large') ? (
              <img
                src={getImageUrl(displayUser.images, 'large')}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            )}
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-2">Profile</p>
            <h1 className="text-6xl font-bold text-white mb-4 tracking-tight">
              {displayUser.display_name || displayUser.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{displayUser.id}]</span>
            </h1>
            <p className="text-[#B3B3B3]">
              {displayPlaylists.length} Public Playlists
              {displayFollowedArtists.length > 0 && ` • ${displayFollowedArtists.length} Following`}
            </p>
            {/* Follow/Unfollow button for other users */}
            {!isOwnProfile && (
              <button
                className={`mt-4 px-5 py-1.5 rounded-full text-sm font-semibold tracking-tight transition-all ${
                  isFollowingUser
                    ? 'bg-[#DB2777]/15 text-[#EC4899] hover:bg-[#DB2777]/25 ring-1 ring-[#DB2777]/40'
                    : 'bg-white/[0.06] text-white hover:bg-white/[0.12] ring-1 ring-white/10'
                }`}
                onClick={() => toggleFollowUser(displayUser.id, isFollowingUser)}
              >
                {isFollowingUser ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>

        {/* User's playlists */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Public Playlists</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {displayPlaylists.filter(p => p.public !== false).slice(0, 10).map(playlist => (
              <button
                key={playlist.id}
                className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                onClick={() => openPlaylist(playlist)}
              >
                <div className="aspect-square mb-4 bg-[#1f1f23] rounded-xl overflow-hidden shadow-lg shadow-black/40">
                  {getImageUrl(playlist.images) ? (
                    <img src={getImageUrl(playlist.images)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-white font-semibold truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></p>
                <p className="text-[#B3B3B3] text-sm mt-1">
                  {playlist.tracks?.total || 0} songs
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Top Artists - only show on own profile */}
        {isOwnProfile && topArtists.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Top Artists This Month</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {topArtists.slice(0, 5).map((artist: Artist) => (
                <button
                  key={artist.id}
                  className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  onClick={() => openArtist(artist)}
                >
                  <div className="aspect-square mb-4 bg-[#1f1f23] rounded-full overflow-hidden shadow-md shadow-black/30">
                    {getImageUrl(artist.images) ? (
                      <img src={getImageUrl(artist.images)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-white font-semibold truncate">{artist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{artist.id}]</span></p>
                  <p className="text-[#B3B3B3] text-sm mt-1">Artist</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Top Tracks - only show on own profile */}
        {isOwnProfile && topTracksError && (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Top Tracks This Month</h2>
            <p className="text-[#B3B3B3]">{topTracksError}</p>
          </section>
        )}
        {isOwnProfile && !topTracksError && topTracks.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Top Tracks This Month</h2>
            <div className="space-y-2">
              {topTracks.slice(0, 10).map((track: Track, index: number) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="w-4 text-center text-[#B3B3B3] text-sm">{index + 1}</span>
                  <div className="w-10 h-10 bg-[#1f1f23] rounded-md overflow-hidden flex-shrink-0">
                    {getImageUrl(track.album?.images, 'small') ? (
                      <img src={getImageUrl(track.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{track.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{track.id}]</span></p>
                    <p className="text-[#B3B3B3] text-xs truncate">
                      {track.artists?.map((a: Artist) => a.name).join(', ')}
                    </p>
                  </div>
                  <button
                    className="p-1 opacity-0 group-hover:opacity-100 text-[#B3B3B3] hover:text-white transition-all"
                    onClick={() => setShowAddToPlaylist(track)}
                    title="Add to playlist"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                  <span className="text-[#B3B3B3] text-sm w-12 text-right">
                    {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Followed Artists */}
        {displayFollowedArtists.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Following</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayFollowedArtists.slice(0, 10).map((artist: Artist) => (
                <button
                  key={artist.id}
                  className="p-4 bg-[#161618] rounded-xl hover:bg-[#1f1f23] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 text-left"
                  onClick={() => openArtist(artist)}
                >
                  <div className="aspect-square mb-4 bg-[#1f1f23] rounded-full overflow-hidden shadow-md shadow-black/30">
                    <ImageWithFallback src={getImageUrl(artist.images)} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-white font-semibold truncate">{artist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{artist.id}]</span></p>
                  <p className="text-[#B3B3B3] text-sm mt-1">Artist</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Back button for viewing other profiles */}
        {!isOwnProfile && (
          <button
            className="mt-6 text-[#B3B3B3] hover:text-white text-sm"
            onClick={() => {
              clearViewingUserState()
              setCurrentView('home')
            }}
          >
            ← Back to Home
          </button>
        )}
      </div>
    )
  }

  // Render main content based on current view
  const renderMainContent = () => {
    switch (currentView) {
      case 'home':
        return renderHomeView()
      case 'search':
        return renderSearchView()
      case 'library':
        return renderLibraryView()
      case 'playlist':
        return renderPlaylistView()
      case 'album':
        return renderAlbumView()
      case 'artist':
        return renderArtistView()
      case 'profile':
        return renderProfileView()
      default:
        return renderHomeView()
    }
  }

  // Create playlist modal
  const renderCreatePlaylistModal = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c1c20] rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Create playlist</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#B3B3B3] mb-2">Name</label>
            <input
              type="text"
              className="w-full px-3.5 py-2.5 bg-[#27272c] rounded-lg text-white text-sm placeholder:text-[#7a7a82] focus:outline-none focus:ring-2 focus:ring-[#DB2777]/60 focus:bg-[#2c2c33] transition-all"
              placeholder="My Playlist"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-[#B3B3B3] mb-2">Description (optional)</label>
            <textarea
              className="w-full px-3.5 py-2.5 bg-[#27272c] rounded-lg text-white text-sm placeholder:text-[#7a7a82] focus:outline-none focus:ring-2 focus:ring-[#DB2777]/60 focus:bg-[#2c2c33] resize-none transition-all"
              placeholder="Add an optional description"
              rows={3}
              value={newPlaylistDescription}
              onChange={e => setNewPlaylistDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 text-[#B3B3B3] hover:text-white font-semibold tracking-tight transition-colors"
            onClick={() => {
              setShowCreatePlaylist(false)
              setNewPlaylistName('')
              setNewPlaylistDescription('')
            }}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-[#DB2777] hover:bg-[#EC4899] text-white rounded-full font-semibold tracking-tight shadow-md shadow-[#DB2777]/30 hover:shadow-lg hover:shadow-[#DB2777]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            onClick={createPlaylist}
            disabled={!newPlaylistName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )

  // Edit playlist modal
  const renderEditPlaylistModal = () => {
    const currentImage = newPlaylistCoverImage
      || getImageUrl(editingPlaylist?.images, 'large')

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#1c1c20] rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/50 ring-1 ring-white/5">
          <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Edit details</h2>
          <div className="flex gap-4 mb-4">
            {/* Cover image preview */}
            <div>
              <div className="w-40 h-40 bg-[#161618] rounded-xl shadow-lg shadow-black/40 overflow-hidden flex-shrink-0 ring-1 ring-white/5">
                {currentImage ? (
                  <ImageWithFallback src={currentImage} className="w-full h-full object-cover" fallbackClassName="bg-[#181818]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
            {/* Name and description inputs */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm text-[#B3B3B3] mb-1">Name</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-[#27272c] rounded-lg text-white text-sm placeholder:text-[#7a7a82] focus:outline-none focus:ring-2 focus:ring-[#DB2777]/60 focus:bg-[#2c2c33] transition-all"
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-[#B3B3B3] mb-1">Description</label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-[#27272c] rounded-lg text-white text-sm placeholder:text-[#7a7a82] focus:outline-none focus:ring-2 focus:ring-[#DB2777]/60 focus:bg-[#2c2c33] resize-none transition-all"
                  rows={3}
                  value={newPlaylistDescription}
                  onChange={e => setNewPlaylistDescription(e.target.value)}
                  placeholder="Add an optional description"
                />
              </div>
            </div>
          </div>
          {/* Image URL input */}
          <div className="mb-4">
            <label className="block text-sm text-[#B3B3B3] mb-1">Cover Image URL</label>
            <input
              type="text"
              className="w-full px-3.5 py-2.5 bg-[#27272c] rounded-lg text-white text-sm placeholder:text-[#7a7a82] focus:outline-none focus:ring-2 focus:ring-[#DB2777]/60 focus:bg-[#2c2c33] transition-all"
              value={newPlaylistCoverImage || ''}
              onChange={e => setNewPlaylistCoverImage(e.target.value || null)}
              placeholder="Paste an image URL..."
            />
            <p className="mt-1 text-xs text-[#B3B3B3]">
              Paste a URL to set the playlist cover image. Changes are applied locally in the playground.
            </p>
            {newPlaylistCoverImage && (
              <button
                className="mt-1 text-xs text-[#B3B3B3] hover:text-white"
                onClick={() => setNewPlaylistCoverImage(null)}
              >
                Clear image
              </button>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <button
              className="px-4 py-2 text-[#B3B3B3] hover:text-white font-semibold tracking-tight transition-colors"
              onClick={() => {
                setEditingPlaylist(null)
                setNewPlaylistName('')
                setNewPlaylistDescription('')
                setNewPlaylistCoverImage(null)
              }}
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 bg-[#DB2777] hover:bg-[#EC4899] text-white rounded-full font-semibold tracking-tight shadow-md shadow-[#DB2777]/30 hover:shadow-lg hover:shadow-[#DB2777]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              onClick={updatePlaylist}
              disabled={!newPlaylistName.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Add to playlist modal
  const renderAddToPlaylistModal = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c1c20] rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Add to playlist</h2>
        {/* Success message */}
        {addToPlaylistSuccess && (
          <div className="mb-4 px-3.5 py-3 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-lg text-emerald-300 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            {addToPlaylistSuccess}
          </div>
        )}
        {/* Error message */}
        {addToPlaylistError && (
          <div className="mb-4 px-3.5 py-3 bg-red-500/10 ring-1 ring-red-500/30 rounded-lg text-red-300 text-sm">
            {addToPlaylistError}
          </div>
        )}
        <div className="max-h-80 overflow-y-auto space-y-1">
          {/* Create new playlist option */}
          <button
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.05] text-left border-b border-white/5 mb-2 pb-3 disabled:opacity-50 transition-colors"
            disabled={!!isAddingToPlaylist}
            onClick={() => {
              setShowAddToPlaylist(null)
              setAddToPlaylistError(null)
              setShowCreatePlaylist(true)
            }}
          >
            <div className="w-10 h-10 bg-[#DB2777]/15 rounded-md flex items-center justify-center flex-shrink-0 ring-1 ring-[#DB2777]/30">
              <svg className="w-5 h-5 text-[#EC4899]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </div>
            <span className="text-white text-sm font-semibold tracking-tight">Create new playlist</span>
          </button>
          {playlists.filter((playlist: Playlist) => playlist.owner?.id === currentUser?.id).length === 0 ? (
            <p className="text-[#B3B3B3] text-sm text-center py-4">No playlists yet. Create one to add tracks!</p>
          ) : (
            playlists.filter((playlist: Playlist) => playlist.owner?.id === currentUser?.id).map((playlist: Playlist) => (
              <button
                key={playlist.id}
                className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.05] text-left disabled:opacity-50 transition-colors ${
                  isAddingToPlaylist === playlist.id ? 'bg-white/[0.05]' : ''
                }`}
                disabled={!!isAddingToPlaylist}
                onClick={() => {
                  if (showAddToPlaylist) {
                    addTrackToPlaylist(playlist.id, `streamify:track:${showAddToPlaylist.id}`, showAddToPlaylist)
                  }
                }}
              >
                <div className="w-10 h-10 bg-[#181818] rounded overflow-hidden flex-shrink-0 relative">
                  {getImageUrl(playlist.images, 'small') ? (
                    <img src={getImageUrl(playlist.images, 'small')} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                  {isAddingToPlaylist === playlist.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <span className="text-white text-sm truncate">{playlist.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{playlist.id}]</span></span>
                {isAddingToPlaylist === playlist.id && (
                  <span className="text-[#B3B3B3] text-xs ml-auto">Adding...</span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button
            className="px-4 py-2 text-[#B3B3B3] hover:text-white font-semibold tracking-tight transition-colors disabled:opacity-50"
            disabled={!!isAddingToPlaylist}
            onClick={() => {
              setShowAddToPlaylist(null)
              setAddToPlaylistError(null)
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-[#0E0E10]">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {renderSidebar()}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#131316] rounded-2xl m-3 ml-0 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-transparent">
            <div className="flex items-center gap-2">
              <button
                className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 disabled:opacity-40 transition-colors"
                onClick={() => setCurrentView('home')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
              </button>
              <button
                className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 disabled:opacity-40 transition-colors"
                disabled
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                </svg>
              </button>
            </div>
            <button
              className="flex items-center gap-2 bg-black/40 rounded-full p-1 pr-3.5 hover:bg-black/60 transition-colors"
              onClick={() => {
                clearViewingUserState()
                setCurrentView('profile')
              }}
            >
              <div className="w-7 h-7 bg-[#404040] rounded-full overflow-hidden">
                {getImageUrl(currentUser?.images, 'small') ? (
                  <img src={getImageUrl(currentUser?.images, 'small')} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </div>
              <span className="text-white text-sm font-semibold tracking-tight">
                {currentUser?.display_name || 'User'}
              </span>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {renderMainContent()}
          </div>
        </div>
      </div>

      {/* Now Playing Bar */}
      <div className="h-[88px] bg-[#0A0A0C]/95 backdrop-blur-md flex items-center px-6 gap-4">
        <div className="w-64 flex items-center gap-3">
          {currentTrack ? (
            <>
              <div className="w-14 h-14 bg-[#1f1f23] rounded-lg flex-shrink-0 overflow-hidden shadow-md shadow-black/40 ring-1 ring-white/5">
                {getImageUrl(currentTrack.album?.images, 'small') ? (
                  <img src={getImageUrl(currentTrack.album?.images, 'small')} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#B3B3B3]">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate tracking-tight">{currentTrack.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentTrack.id}]</span></p>
                <p className="text-[#B3B3B3] text-xs truncate tracking-wide mt-0.5">
                  {currentTrack.artists?.map(a => a.name).join(', ')}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-[#1f1f23] rounded-lg flex-shrink-0 ring-1 ring-white/5" />
              <div className="min-w-0">
                <p className="text-white/80 text-sm truncate tracking-tight">No track playing</p>
                <p className="text-[#7a7a82] text-xs truncate tracking-wide mt-0.5">Select a track to play</p>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button className="text-[#B3B3B3] hover:text-white transition-colors" onClick={skipPrevious}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-black hover:scale-[1.06] hover:bg-white/95 transition-all shadow-md shadow-black/40"
              onClick={togglePlayPause}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <button className="text-[#B3B3B3] hover:text-white transition-colors" onClick={skipNext}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          </div>
          <div className="w-full max-w-md flex items-center gap-3">
            <span className="text-[#7a7a82] text-[11px] tabular-nums tracking-wide">0:00</span>
            <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden group cursor-pointer">
              <div className="h-full w-0 bg-white/90 rounded-full group-hover:bg-[#DB2777] transition-colors" />
            </div>
            <span className="text-[#7a7a82] text-[11px] tabular-nums tracking-wide">{currentTrack?.duration_ms ? formatDuration(currentTrack.duration_ms) : '0:00'}</span>
          </div>
        </div>
        <div className="w-64 flex items-center justify-end gap-2">
          <button className="text-[#B3B3B3] hover:text-white p-2 transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
          <div className="w-24 h-1 bg-white/[0.08] rounded-full overflow-hidden group cursor-pointer">
            <div className="h-full w-2/3 bg-white/80 rounded-full group-hover:bg-[#DB2777] transition-colors" />
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreatePlaylist && renderCreatePlaylistModal()}
      {editingPlaylist && renderEditPlaylistModal()}
      {showAddToPlaylist && renderAddToPlaylistModal()}
      {showDeletePlaylist && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c1c20] rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/50 ring-1 ring-white/5">
            <h2 className="text-xl font-bold text-white mb-4 tracking-tight">Delete playlist?</h2>
            <p className="text-[#B3B3B3] mb-6">
              This will delete <span className="text-white font-semibold">{showDeletePlaylist.name}</span> from your library.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-[#B3B3B3] hover:text-white font-semibold tracking-tight transition-colors"
                onClick={() => setShowDeletePlaylist(null)}
              >
                Cancel
              </button>
              <button
                className="px-6 py-2 bg-[#DB2777] hover:bg-[#EC4899] text-white rounded-full font-semibold tracking-tight shadow-md shadow-[#DB2777]/30 hover:shadow-lg hover:shadow-[#DB2777]/40 transition-all"
                onClick={() => deletePlaylist(showDeletePlaylist.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
