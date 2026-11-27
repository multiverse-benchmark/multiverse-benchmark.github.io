import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const TARGET_STATES = ['STOP', 'PAUSE', 'RESUME'] as const

interface MediaItem {
  id: string
  title: string
  artist?: string
  album?: string
  duration_seconds?: number
  current_position_seconds: number
  media_type: string
  rating?: string
  app_name: string
}

interface MediaPlayer {
  app_name: string
  current_media: MediaItem | null
  playback_state: string
  playlist: MediaItem[]
  current_playlist_index: number
}

interface BackendState {
  media_players: Record<string, MediaPlayer>
  active_media_player: string | null
}

interface NowPlaying {
  title?: string
  app_name?: string
  media_type?: string
  result?: string
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

export default function MediaControlApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('media_control')

  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [playbackState, setPlaybackState] = useState<string>('unknown')
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [queue, setQueue] = useState<MediaItem[]>([])
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0)

  // Available media players and selected player
  const [availablePlayers, setAvailablePlayers] = useState<string[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)

  // Volume (persisted in localStorage)
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('media_control_volume')
    return saved ? parseInt(saved, 10) : 70
  })

  // Shuffle/repeat (persisted in localStorage)
  const [shuffle, setShuffle] = useState<boolean>(() => {
    return localStorage.getItem('media_control_shuffle') === 'true'
  })
  const [repeat, setRepeat] = useState<string>(() => {
    return localStorage.getItem('media_control_repeat') || 'off'
  })

  // Change Playback State panel
  const [targetState, setTargetState] = useState<string>('PAUSE')
  const [appName, setAppName] = useState('')

  // Seek controls
  const [seekOffset, setSeekOffset] = useState(30)
  const [seekPosition, setSeekPosition] = useState(0)

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showStatus = useCallback((type: 'success' | 'error', message: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setStatusMessage({ type, message })
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000)
  }, [])

  // Cache last fetched backend state to avoid re-fetching when switching players
  const lastBackendStateRef = useRef<BackendState | null>(null)
  // Ref to read selectedPlayer inside the memoized fetchState without re-creating it
  const selectedPlayerRef = useRef<string | null>(null)
  selectedPlayerRef.current = selectedPlayer

  // Apply display state from a given player
  const applyPlayerState = useCallback((player: MediaPlayer) => {
    if (player.current_media) {
      setNowPlaying({
        title: player.current_media.title,
        app_name: player.current_media.app_name,
        media_type: player.current_media.media_type,
      })
      setLiked(player.current_media.rating === 'POSITIVE')
      setDisliked(player.current_media.rating === 'NEGATIVE')
    } else {
      setNowPlaying(null)
      setLiked(false)
      setDisliked(false)
    }
    setPlaybackState(player.playback_state?.toLowerCase() || 'unknown')
    setQueue(player.playlist || [])
    setCurrentQueueIndex(player.current_playlist_index || 0)
  }, [])

  // Fetch current state from backend
  const fetchState = useCallback(async () => {
    try {
      const response = await fetch('./api/services/media_control/state')
      if (!response.ok) return
      const json = await response.json()
      const data: BackendState = json.state || json
      lastBackendStateRef.current = data

      // Track available players (avoid unnecessary re-renders with shallow compare)
      const playerNames = Object.keys(data.media_players)
      setAvailablePlayers(prev => {
        if (prev.length === playerNames.length && prev.every((p, i) => p === playerNames[i])) return prev
        return playerNames
      })

      // Determine which player to display
      const currentSelection = selectedPlayerRef.current
      let playerName: string | undefined
      if (currentSelection && data.media_players[currentSelection]) {
        playerName = currentSelection
      } else if (data.active_media_player && data.media_players[data.active_media_player]) {
        playerName = data.active_media_player
      } else if (playerNames.length > 0) {
        playerName = playerNames[0]
      }

      if (playerName) {
        setSelectedPlayer(playerName)
        applyPlayerState(data.media_players[playerName])
      }
    } catch {
      // State fetch is best-effort
    }
  }, [applyPlayerState])

  // Use ref to avoid infinite re-render loop with setRefreshHandler
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler
  })

  useEffect(() => {
    const handler = setRefreshHandlerRef.current
    if (handler) handler(fetchState)
    return () => {
      const h = setRefreshHandlerRef.current
      if (h) h(null)
    }
  }, [fetchState])

  // Load state on mount
  useEffect(() => {
    fetchState()
  }, [fetchState])

  // Volume persistence
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume)
    localStorage.setItem('media_control_volume', String(newVolume))
  }, [])

  // Shuffle persistence
  const handleShuffleToggle = useCallback(() => {
    setShuffle(prev => {
      const next = !prev
      localStorage.setItem('media_control_shuffle', String(next))
      return next
    })
  }, [])

  // Repeat persistence
  const handleRepeatToggle = useCallback(() => {
    setRepeat(prev => {
      const next = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'
      localStorage.setItem('media_control_repeat', next)
      return next
    })
  }, [])

  // callAction calls backend AND refreshes state afterward
  const callAction = async (toolName: string, params: Record<string, unknown> = {}) => {
    setLoading(prev => ({ ...prev, [toolName]: true }))
    try {
      const result = await api.callTool<NowPlaying>(toolName, params)
      await fetchState()
      // Actions operate on the active media player, which may differ
      // from the currently selected/displayed player. Switch to the acted-upon
      // player so all UI elements stay consistent with what actually changed.
      if (result && typeof result === 'object' && result.app_name && result.app_name !== selectedPlayerRef.current) {
        handlePlayerChange(result.app_name)
      }
      const title = (result && typeof result === 'object' && result.title) || toolName
      showStatus('success', `${toolName}: ${title}`)
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : `${toolName} failed`)
    } finally {
      setLoading(prev => ({ ...prev, [toolName]: false }))
    }
  }

  // Switch active media player using cached state (no network round-trip)
  const handlePlayerChange = (playerName: string) => {
    setSelectedPlayer(playerName)
    selectedPlayerRef.current = playerName
    const cached = lastBackendStateRef.current
    if (cached && cached.media_players[playerName]) {
      applyPlayerState(cached.media_players[playerName])
    }
  }

  const handleChangePlaybackState = () => {
    const params: Record<string, unknown> = { target_state: targetState }
    if (appName.trim()) params.app_name = appName.trim()
    callAction('change_playback_state', params)
  }

  const handleLike = async () => {
    await callAction('like')
  }

  const handleDislike = async () => {
    await callAction('dislike')
  }

  const isLoading = (key: string) => loading[key] || false

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Media Control</h1>
        <p className="text-cyan-100 text-sm mt-1">Playback controls and transport</p>
      </div>

      {/* Media Player Selector */}
      {availablePlayers.length > 1 && (
        <div className="px-6 py-2 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
            Media Player:
          </label>
          <select
            value={selectedPlayer || ''}
            onChange={e => handlePlayerChange(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {availablePlayers.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Now Playing Card */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Now Playing</h2>
          {nowPlaying ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold">{nowPlaying.title || 'Unknown'}</p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                {nowPlaying.app_name && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {nowPlaying.app_name}
                  </span>
                )}
                {nowPlaying.media_type && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                    {nowPlaying.media_type}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full ${
                  playbackState === 'playing' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                  playbackState === 'paused' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                  playbackState === 'stopped' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  {playbackState}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-sm">No media currently playing.</p>
          )}
        </div>

        {/* Transport Controls */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Transport</h2>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <ControlButton label="Previous" onClick={() => callAction('previous')} loading={isLoading('previous')} />
            <ControlButton label="Replay" onClick={() => callAction('replay')} loading={isLoading('replay')} />
            <ControlButton
              label={playbackState === 'playing' ? 'Pause' : 'Resume'}
              onClick={() => callAction(playbackState === 'playing' ? 'pause' : 'resume')}
              loading={isLoading('pause') || isLoading('resume')}
              primary
            />
            <ControlButton label="Stop" onClick={() => callAction('stop')} loading={isLoading('stop')} variant="danger" />
            <ControlButton label="Next" onClick={() => callAction('next')} loading={isLoading('next')} />
          </div>
        </div>

        {/* Volume Control */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Volume</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-6">0</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={e => handleVolumeChange(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-600"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 w-6">100</span>
            <span className="text-sm font-medium w-10 text-right">{volume}%</span>
          </div>
        </div>

        {/* Shuffle / Repeat */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Playback Mode</h2>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleShuffleToggle}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                shuffle
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              Shuffle: {shuffle ? 'On' : 'Off'}
            </button>
            <button
              onClick={handleRepeatToggle}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                repeat !== 'off'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              Repeat: {repeat === 'off' ? 'Off' : repeat === 'all' ? 'All' : 'One'}
            </button>
          </div>
        </div>

        {/* Like / Dislike */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Rating</h2>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleLike}
              disabled={isLoading('like')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                liked
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/40'
              } disabled:opacity-50`}
            >
              {isLoading('like') ? '...' : 'Like'}
            </button>
            <button
              onClick={handleDislike}
              disabled={isLoading('dislike')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                disliked
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40'
              } disabled:opacity-50`}
            >
              {isLoading('dislike') ? '...' : 'Dislike'}
            </button>
          </div>
        </div>

        {/* Queue */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Queue {queue.length > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">({queue.length} items)</span>}
          </h2>
          {queue.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {queue.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    idx === currentQueueIndex
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800'
                      : 'bg-gray-50 dark:bg-slate-700/50'
                  }`}
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate ${idx === currentQueueIndex ? 'font-semibold text-cyan-700 dark:text-cyan-300' : ''}`}>
                      {item.title}
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span>
                    </p>
                    {item.artist && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.artist}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {item.media_type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-sm">No items in queue.</p>
          )}
        </div>

        {/* Seek Controls */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Seek</h2>
          <div className="space-y-3">
            {/* Relative Seek */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20">Relative (s):</label>
              <input
                type="number"
                value={seekOffset}
                onChange={e => setSeekOffset(parseInt(e.target.value) || 0)}
                className="w-20 px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={() => callAction('seek_relative', { offset: -Math.abs(seekOffset) })}
                disabled={isLoading('seek_relative')}
                className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                Rewind
              </button>
              <button
                onClick={() => callAction('seek_relative', { offset: Math.abs(seekOffset) })}
                disabled={isLoading('seek_relative')}
                className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                Forward
              </button>
            </div>

            {/* Absolute Seek */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20">Absolute (s):</label>
              <input
                type="number"
                value={seekPosition}
                onChange={e => setSeekPosition(parseInt(e.target.value) || 0)}
                min={0}
                className="w-20 px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={() => callAction('seek_absolute', { position: seekPosition })}
                disabled={isLoading('seek_absolute')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isLoading('seek_absolute') ? '...' : 'Seek To'}
              </button>
            </div>
          </div>
        </div>

        {/* Change Playback State Panel */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Change Playback State</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-24">Target State:</label>
              <select
                value={targetState}
                onChange={e => setTargetState(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {TARGET_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-24">App Name:</label>
              <input
                type="text"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="Optional"
                className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <button
              onClick={handleChangePlaybackState}
              disabled={isLoading('change_playback_state')}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading('change_playback_state') ? 'Changing...' : 'Change Playback State'}
            </button>
          </div>
        </div>
      </div>

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

function ControlButton({ label, onClick, loading, primary, variant }: {
  label: string
  onClick: () => void
  loading: boolean
  primary?: boolean
  variant?: 'danger'
}) {
  let classes = 'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 '
  if (primary) {
    classes += 'bg-cyan-600 hover:bg-cyan-700 text-white min-w-[80px]'
  } else if (variant === 'danger') {
    classes += 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
  } else {
    classes += 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
  }

  return (
    <button onClick={onClick} disabled={loading} className={classes}>
      {loading ? '...' : label}
    </button>
  )
}
