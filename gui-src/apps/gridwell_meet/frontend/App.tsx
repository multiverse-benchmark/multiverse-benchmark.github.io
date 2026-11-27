import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "GridwellMeet";

// ============== Type Definitions ==============

interface Space {
  name: string
  meetingCode: string
  meetingUri: string
  accessType: 'TRUSTED' | 'RESTRICTED' | 'OPEN'
  entryPointAccess: 'ALL' | 'CREATOR_APP_ONLY'
  activeConference?: {
    conferenceId: string
    details?: string
  }
}

interface ConferenceRecord {
  id: string
  start_time: string
  end_time?: string
  name?: string
  meeting_code?: string
}

interface Recording {
  id: string
  parent: string
  start_time: string
  duration?: string
  state?: string
}

interface Transcript {
  id: string
  parent: string
  start_time: string
}

interface TranscriptEntry {
  id: string
  parent: string
  start_time: string
  text: string
}

interface Participant {
  id: string
  conferenceRecordId: string
  join_time: string
  displayName?: string
  email?: string
}

interface ParticipantSession {
  id: string
  participantId: string
  join_time: string
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

type TabType = 'spaces' | 'records' | 'recordings' | 'transcripts'

// Convert a space ID to a human-readable name
// Handles hyphens ("quarterly-retro" → "Quarterly Retro"),
// camelCase ("newHire" → "New Hire"),
// and word-number boundaries ("space6" → "Space 6", "budget-reforecast-q2" → "Budget Reforecast Q2")
function formatSpaceName(name: string): string {
  return name
    // Split on hyphens and underscores
    .split(/[-_]/)
    // Further split each segment on camelCase and long word-number boundaries,
    // but keep short tokens like "q2" together
    .flatMap(segment => {
      if (segment.length <= 3) return [segment]
      return segment
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z]{2,})(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .split(' ')
    })
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Get the best human-readable name for a space
function getSpaceDisplayName(space: Space): string {
  return space.activeConference?.details ?? formatSpaceName(space.name)
}

// ============== Icons ==============
const GmeetIcon = () => (

  <img className="w-8 h-8" src="./icons/gridwell_meet.svg" alt="" />
  
)

const VideoIcon = () => (

  <img className="w-5 h-5" src="./icons/gridwell_meet.svg" alt="" />
  
)

const RecordIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const PlayIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const TranscriptIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
)

// ============== Utility Functions ==============

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

const formatDuration = (startTime: string, endTime?: string) => {
  if (!endTime) return 'In progress'
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const diffMs = end - start
  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 60) return `${diffMins} min`
  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  return `${hours}h ${mins}m`
}

// ============== Main App Component ==============

export default function GridwellMeetApp({ setRefreshHandler }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabType>('spaces')
  const [spaces, setSpaces] = useState<Record<string, Space>>({})
  const [conferenceRecords, setConferenceRecords] = useState<ConferenceRecord[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<ConferenceRecord | null>(null)
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [allParticipants, setAllParticipants] = useState<Record<string, Participant[]>>({})
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null)
  const [participantSessions, setParticipantSessions] = useState<ParticipantSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showParticipantsModal, setShowParticipantsModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailData, setDetailData] = useState<any | null>(null)
  const [detailTitle, setDetailTitle] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const loadDataRef = useRef<() => void>(() => {})
  const setRefreshHandlerRef = useRef(setRefreshHandler)

  const api = useBackendAPI('gridwell_meet')

  // Keep ref in sync with latest prop without triggering effects
  setRefreshHandlerRef.current = setRefreshHandler

  // Stable callback for refreshing the app
  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  // Register refresh handler - only run once on mount
  useEffect(() => {
    const handler = setRefreshHandlerRef.current
    if (handler) {
      handler(refreshApp)
    }
    return () => {
      const cleanup = setRefreshHandlerRef.current
      if (cleanup) cleanup(null)
    }
  }, [refreshApp])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      // Load spaces from state (no list_meeting_spaces API available)
      const stateResponse = await fetch('./api/services/gridwell_meet/state')
      const stateData = await stateResponse.json()
      const state = stateData?.state || {}
      const spacesData = state.spaces || {}
      const spacesWithNames: Record<string, Space> = {}
      Object.entries(spacesData).forEach(([name, spaceData]: [string, unknown]) => {
        spacesWithNames[name] = {
          name,
          ...(spaceData as Omit<Space, 'name'>)
        }
      })
      setSpaces(spacesWithNames)

      // Load conference records via API
      try {
        const recordsResult = await api.callTool<{ conferenceRecords?: ConferenceRecord[] }>('list_conference_records', {})
        const recordsList = recordsResult?.conferenceRecords || []
        recordsList.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        setConferenceRecords(recordsList)

        // Load recordings, transcripts, and participants in parallel per record
        const [allRecordings, allTranscripts, participantsByRecord] = await Promise.all([
          // Recordings
          Promise.all(recordsList.map(async (record) => {
            try {
              const recordId = record.id || record.name || ''
              const recResult = await api.callTool<{ recordings?: Recording[] }>('list_conference_recordings', {
                parent: `conferenceRecords/${recordId}`,
                parent_conference_record: recordId
              })
              return recResult?.recordings || []
            } catch {
              return []
            }
          })).then(results => {
            const flat = results.flat()
            flat.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
            return flat
          }),
          // Transcripts
          Promise.all(recordsList.map(async (record) => {
            try {
              const transRecordId = record.id || record.name || ''
              const transResult = await api.callTool<{ transcripts?: Transcript[] }>('list_conference_transcript', {
                parent: transRecordId
              })
              return transResult?.transcripts || []
            } catch {
              return []
            }
          })).then(results => {
            const flat = results.flat()
            flat.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
            return flat
          }),
          // Participants
          Promise.all(recordsList.map(async (record) => {
            try {
              const recordId = record.id || record.name || ''
              const partResult = await api.callTool<{ participants?: Participant[] }>('list_conference_participants', {
                parent: recordId
              })
              return { id: recordId, participants: partResult?.participants || [] }
            } catch {
              return { id: record.id || record.name || '', participants: [] as Participant[] }
            }
          })).then(results => {
            const byRecord: Record<string, Participant[]> = {}
            for (const { id, participants } of results) {
              if (participants.length > 0) byRecord[id] = participants
            }
            return byRecord
          })
        ])
        setRecordings(allRecordings)
        setTranscripts(allTranscripts)
        setAllParticipants(participantsByRecord)
      } catch {
        // Fallback to state data if API calls fail
        const recordsData = state.conferenceRecords || {}
        const recordsList = Object.values(recordsData) as ConferenceRecord[]
        recordsList.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        setConferenceRecords(recordsList)

        const recordingsData = state.recordings || {}
        const recordingsList = Object.values(recordingsData) as Recording[]
        recordingsList.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        setRecordings(recordingsList)

        const transcriptsData = state.transcripts || {}
        const transcriptsList = Object.values(transcriptsData) as Transcript[]
        transcriptsList.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        setTranscripts(transcriptsList)
      }

      // Auto-select first space if none selected
      if (!selectedSpaceId && Object.keys(spacesWithNames).length > 0) {
        setSelectedSpaceId(Object.keys(spacesWithNames)[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const loadParticipants = async (conferenceId: string) => {
    try {
      const result = await api.callTool('list_conference_participants', {
        parent: conferenceId
      })
      setParticipants(result?.participants || [])
      setShowParticipantsModal(true)
    } catch (err) {
      console.error('Failed to load participants:', err)
      setParticipants([])
      setShowParticipantsModal(true)
    }
  }

  const loadParticipantSessions = async (participantId: string) => {
    try {
      const result = await api.callTool('list_participant_sessions', {
        parent: participantId
      })
      setParticipantSessions(result?.participantSessions || [])
    } catch (err) {
      console.error('Failed to load participant sessions:', err)
      setParticipantSessions([])
    }
  }

  const loadTranscriptEntries = async (transcriptId: string) => {
    try {
      const result = await api.callTool('list_transcript_entries', {
        parent: transcriptId
      })
      setTranscriptEntries(result?.entries || [])
    } catch (err) {
      console.error('Failed to load transcript entries:', err)
      setTranscriptEntries([])
    }
  }

  // Detail fetching functions using individual get APIs
  const fetchDetail = async (toolName: string, params: Record<string, unknown>, title: string) => {
    setLoadingDetail(true)
    setShowDetailModal(true)
    setDetailData(null)
    setDetailTitle(title)
    try {
      const result = await api.callTool(toolName, params)
      setDetailData(result)
    } catch (err) {
      setDetailData({ error: err instanceof Error ? err.message : `Failed to fetch ${title}` })
    } finally {
      setLoadingDetail(false)
    }
  }

  const getConferenceRecordDetail = (recordId: string) => {
    fetchDetail('get_conference_record', { name: recordId }, 'Conference Record Details')
  }

  const getConferenceRecordingDetail = (recordingId: string) => {
    fetchDetail('get_conference_recording', { name: recordingId }, 'Recording Details')
  }

  const getConferenceTranscriptDetail = (transcriptId: string) => {
    fetchDetail('get_conference_transcript', { name: transcriptId }, 'Transcript Details')
  }

  const getTranscriptEntryDetail = (entryId: string) => {
    fetchDetail('get_transcript_entry', { name: entryId }, 'Transcript Entry Details')
  }

  const getParticipantDetail = (participantId: string) => {
    fetchDetail('get_conference_participant', { name: participantId }, 'Participant Details')
  }

  const getParticipantSessionDetail = (sessionId: string) => {
    fetchDetail('get_participant_session', { name: sessionId }, 'Participant Session Details')
  }

  const deleteSpace = async (spaceName: string) => {
    if (!confirm(`Are you sure you want to delete this meeting space?`)) return

    try {
      // No delete_meeting_space API available - use state endpoint to remove
      const response = await fetch('./api/services/gridwell_meet/state')
      const data = await response.json()
      const currentState = data.state

      const updatedSpaces = { ...currentState.spaces }
      delete updatedSpaces[spaceName]

      await fetch('./api/services/gridwell_meet/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: { ...currentState, spaces: updatedSpaces }
        })
      })

      if (selectedSpaceId === spaceName) {
        setSelectedSpaceId(null)
      }
      await loadData(false)
    } catch (err) {
      alert('Failed to delete space: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Start a conference in a space
  const startConference = async (spaceName: string, meetingTitle?: string) => {
    try {
      const conferenceId = `conf-${Date.now()}`
      await api.callTool('update_meeting_space', {
        name: spaceName,
        update_mask: {
          activeConference: {
            conferenceId,
            details: meetingTitle || formatSpaceName(spaceName)
          }
        }
      })
      await loadData(false)
    } catch (err) {
      console.error('Failed to start conference:', err)
      alert('Failed to start conference: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // End conference - uses end_active_conference_in_space API
  const endConference = async (spaceName: string) => {
    try {
      const space = spaces[spaceName]
      if (!space?.activeConference) return

      // End the active conference via API (this handles conference record creation server-side)
      await api.callTool('end_active_conference_in_space', { name: spaceName })

      await loadData(false)
    } catch (err) {
      console.error('Failed to end conference:', err)
    }
  }

  const selectedSpace = selectedSpaceId ? spaces[selectedSpaceId] : null

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#202124]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#14B8A6]/30 border-t-[#14B8A6] rounded-full animate-spin" />
          <span className="text-[#9aa0a6] text-sm">Loading {APP_NAME}...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#202124] gap-4">
        <p className="text-red-400">{error}</p>
        <button
          className="px-4 py-2 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors font-medium"
          onClick={loadData}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#202124] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c4043]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8  rounded flex items-center justify-center">
            <GmeetIcon />
          </div>
          <span className="text-lg font-medium">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors font-medium text-sm"
            onClick={() => setShowCreateModal(true)}
          >
            <PlusIcon />
            New meeting
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#3c4043]">
        {[
          { id: 'spaces' as TabType, label: 'Meeting Spaces', icon: <VideoIcon /> },
          { id: 'records' as TabType, label: 'Conference Records', icon: <RecordIcon /> },
          { id: 'recordings' as TabType, label: 'Recordings', icon: <PlayIcon /> },
          { id: 'transcripts' as TabType, label: 'Transcripts', icon: <TranscriptIcon /> },
        ].map(tab => (
          <button
            key={tab.id}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#14B8A6] border-b-2 border-[#14B8A6]'
                : 'text-[#9aa0a6] hover:text-white hover:bg-[#3c4043]/50'
            }`}
            onClick={() => {
              setActiveTab(tab.id)
              setSelectedRecord(null)
              setSelectedRecording(null)
              setSelectedTranscript(null)
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {activeTab === 'spaces' && (
          <SpacesView
            spaces={spaces}
            selectedSpaceId={selectedSpaceId}
            selectedSpace={selectedSpace}
            onSelectSpace={setSelectedSpaceId}
            onDeleteSpace={deleteSpace}
            onStartConference={startConference}
            onEndConference={endConference}
            onEditSpace={() => setShowEditModal(true)}
            onViewParticipants={(conferenceId) => loadParticipants(conferenceId)}
            api={api}
          />
        )}

        {activeTab === 'records' && (
          <ConferenceRecordsView
            records={conferenceRecords}
            selectedRecord={selectedRecord}
            onSelectRecord={setSelectedRecord}
            onViewParticipants={(recordId) => loadParticipants(recordId)}
            onViewRecordDetail={getConferenceRecordDetail}
            allParticipants={allParticipants}
            recordings={recordings}
            transcripts={transcripts}
            api={api}
          />
        )}

        {activeTab === 'recordings' && (
          <RecordingsView
            recordings={recordings}
            conferenceRecords={conferenceRecords}
            selectedRecording={selectedRecording}
            onSelectRecording={setSelectedRecording}
            onViewRecordingDetail={getConferenceRecordingDetail}
            api={api}
          />
        )}

        {activeTab === 'transcripts' && (
          <TranscriptsView
            transcripts={transcripts}
            conferenceRecords={conferenceRecords}
            selectedTranscript={selectedTranscript}
            transcriptEntries={transcriptEntries}
            onSelectTranscript={(t) => {
              setSelectedTranscript(t)
              if (t) loadTranscriptEntries(t.id)
            }}
            onViewTranscriptDetail={getConferenceTranscriptDetail}
            onViewEntryDetail={getTranscriptEntryDetail}
            api={api}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateSpaceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadData(false)
          }}
          api={api}
        />
      )}

      {showEditModal && selectedSpace && (
        <EditSpaceModal
          space={selectedSpace}
          onClose={() => setShowEditModal(false)}
          onUpdated={() => {
            setShowEditModal(false)
            loadData(false)
          }}
          api={api}
        />
      )}

      {showParticipantsModal && (
        <ParticipantsModal
          participants={participants}
          selectedParticipant={selectedParticipant}
          participantSessions={participantSessions}
          onClose={() => {
            setShowParticipantsModal(false)
            setSelectedParticipant(null)
            setParticipantSessions([])
          }}
          onSelectParticipant={(p) => {
            setSelectedParticipant(p)
            if (p) loadParticipantSessions(p.id)
          }}
          onViewParticipantDetail={getParticipantDetail}
          onViewSessionDetail={getParticipantSessionDetail}
        />
      )}

      {/* Generic Detail Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" onClick={() => setShowDetailModal(false)}>
          <div className="bg-[#292a2d] rounded-2xl p-6 w-full max-w-lg border border-[#3c4043] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">{detailTitle}</h2>
              <button className="text-[#9aa0a6] hover:text-white" onClick={() => setShowDetailModal(false)}>
                <CloseIcon />
              </button>
            </div>
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-[#14B8A6]/30 border-t-[#14B8A6] rounded-full animate-spin" />
              </div>
            ) : detailData?.error ? (
              <p className="text-red-400 text-sm">{detailData.error}</p>
            ) : detailData ? (
              <div className="space-y-3">
                {Object.entries(detailData).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-[#9aa0a6]">{key}</label>
                    {typeof value === 'object' && value !== null ? (
                      <pre className="text-sm text-white bg-[#3c4043] p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-white">{String(value ?? '')}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#9aa0a6]">No data available</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============== Spaces View ==============

function SpacesView({
  spaces,
  selectedSpaceId,
  selectedSpace,
  onSelectSpace,
  onDeleteSpace,
  onStartConference,
  onEndConference,
  onEditSpace,
  onViewParticipants,
  api
}: {
  spaces: Record<string, Space>
  selectedSpaceId: string | null
  selectedSpace: Space | null
  onSelectSpace: (id: string | null) => void
  onDeleteSpace: (name: string) => void
  onStartConference: (name: string, title?: string) => void
  onEndConference: (name: string) => void
  onEditSpace: () => void
  onViewParticipants: (conferenceId: string) => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const [apiDetails, setApiDetails] = useState<Record<string, unknown> | null>(null)
  const [loadingApiDetails, setLoadingApiDetails] = useState(false)

  const fetchSpaceDetails = async (spaceName: string) => {
    setLoadingApiDetails(true)
    setApiDetails(null)
    try {
      const result = await api.callTool<Record<string, unknown>>('get_meeting_space_details', { name: spaceName })
      setApiDetails(result)
    } catch (err) {
      setApiDetails({ error: err instanceof Error ? err.message : 'Failed to fetch space details' })
    } finally {
      setLoadingApiDetails(false)
    }
  }

  return (
    <>
      {/* Sidebar */}
      <div className="w-72 border-r border-[#3c4043] flex flex-col bg-[#292a2d]">
        <div className="p-4">
          <h2 className="text-sm font-medium text-[#9aa0a6] uppercase tracking-wide">Your Spaces</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {Object.keys(spaces).length === 0 ? (
            <div className="p-4 text-center text-[#9aa0a6] text-sm">
              No meeting spaces yet
            </div>
          ) : (
            Object.values(spaces).map(space => (
              <button
                key={space.name}
                className={`w-full p-3 text-left hover:bg-[#3c4043]/50 transition-colors ${
                  selectedSpaceId === space.name ? 'bg-[#3c4043]' : ''
                }`}
                onClick={() => onSelectSpace(space.name)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    space.activeConference ? 'bg-green-600' : 'bg-[#3c4043]'
                  }`}>
                    <VideoIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {getSpaceDisplayName(space)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{space.name}]</span>
                    </div>
                    <div className="text-xs text-[#9aa0a6] mt-0.5">
                      {space.meetingCode}
                    </div>
                  </div>
                  {space.activeConference && (
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSpace ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9aa0a6]">
            <div className="w-24 h-24 rounded-full bg-[#3c4043] flex items-center justify-center mb-4">
              <GmeetIcon />
            </div>
            <p className="text-lg">Select a meeting space to view details</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              {/* Space header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-medium">{getSpaceDisplayName(selectedSpace)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedSpace.name}]</span></h1>
                  <p className="text-[#9aa0a6] mt-1">{selectedSpace.meetingCode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-full transition-colors text-sm"
                    onClick={onEditSpace}
                  >
                    Edit
                  </button>
                  <button
                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-full transition-colors text-sm"
                    onClick={() => onDeleteSpace(selectedSpace.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Meeting link card */}
              <div className="bg-[#3c4043] rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-[#9aa0a6] mb-1">Meeting link</div>
                    <div className="text-[#14B8A6]">{selectedSpace.meetingUri}</div>
                  </div>
                  <button
                    className="px-4 py-2 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors text-sm font-medium"
                    onClick={() => navigator.clipboard.writeText(selectedSpace.meetingUri)}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Start Meeting - shown when no active conference */}
              {!selectedSpace.activeConference && (
                <div className="bg-[#0D9488]/10 border border-[#0D9488]/30 rounded-xl p-4 mb-4">
                  <div className="text-center">
                    <p className="text-[#9aa0a6] mb-4">No active meeting in this space</p>
                    <button
                      className="px-6 py-3 bg-[#0D9488] hover:bg-[#0F766E] rounded-full transition-colors font-medium flex items-center justify-center gap-2 mx-auto"
                      onClick={() => onStartConference(selectedSpace.name, getSpaceDisplayName(selectedSpace))}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Start Meeting
                    </button>
                  </div>
                </div>
              )}

              {/* Active conference */}
              {selectedSpace.activeConference && (
                <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                      <span className="font-medium text-green-400">Active Conference</span>
                    </div>
                    <button
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full transition-colors text-sm font-medium"
                      onClick={() => onEndConference(selectedSpace.name)}
                    >
                      End Meeting
                    </button>
                  </div>
                  <div className="text-sm text-[#9aa0a6] mb-3">
                    Conference ID: {selectedSpace.activeConference.conferenceId}
                  </div>
                  <button
                    className="w-full px-4 py-2 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-full transition-colors text-sm flex items-center justify-center gap-2"
                    onClick={() => onViewParticipants(selectedSpace.activeConference!.conferenceId)}
                  >
                    <UsersIcon />
                    View Participants
                  </button>
                </div>
              )}

              {/* Settings */}
              <div className="bg-[#3c4043] rounded-xl p-4">
                <h3 className="font-medium mb-4">Settings</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[#9aa0a6]">Access Type</span>
                    <span className="px-3 py-1 bg-[#4a4b4e] rounded-full text-sm">
                      {selectedSpace.accessType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[#9aa0a6]">Entry Point Access</span>
                    <span className="px-3 py-1 bg-[#4a4b4e] rounded-full text-sm">
                      {selectedSpace.entryPointAccess}
                    </span>
                  </div>
                </div>
              </div>

              {/* View Details via API */}
              <div className="mt-4">
                <button
                  className="w-full px-4 py-3 bg-[#0D9488] hover:bg-[#0F766E] rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  onClick={() => fetchSpaceDetails(selectedSpace.name)}
                  disabled={loadingApiDetails}
                >
                  {loadingApiDetails ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading...
                    </>
                  ) : (
                    'View Details (API)'
                  )}
                </button>
                {apiDetails && (
                  <div className="mt-3 bg-[#3c4043] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-sm text-[#14B8A6]">API Response</h3>
                      <button
                        className="text-xs text-[#9aa0a6] hover:text-white"
                        onClick={() => setApiDetails(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                    <pre className="text-xs text-[#9aa0a6] overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(apiDetails, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ============== Conference Records View ==============

function ConferenceRecordsView({
  records,
  selectedRecord,
  onSelectRecord,
  onViewParticipants,
  onViewRecordDetail,
  allParticipants,
  recordings,
  transcripts,
  api
}: {
  records: ConferenceRecord[]
  selectedRecord: ConferenceRecord | null
  onSelectRecord: (record: ConferenceRecord | null) => void
  onViewParticipants: (recordId: string) => void
  onViewRecordDetail: (recordId: string) => void
  allParticipants: Record<string, Participant[]>
  recordings: Recording[]
  transcripts: Transcript[]
  api: ReturnType<typeof useBackendAPI>
}) {
  if (selectedRecord) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <button
            className="flex items-center gap-2 text-[#14B8A6] hover:text-[#99F6E4] mb-6"
            onClick={() => onSelectRecord(null)}
          >
            <BackIcon />
            Back to records
          </button>

          <h1 className="text-2xl font-medium mb-2">
            {selectedRecord.name || `Conference ${selectedRecord.id}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedRecord.id}]</span>
          </h1>
          <p className="text-[#9aa0a6] mb-6">
            {formatDateTime(selectedRecord.start_time)}
          </p>

          <div className="space-y-4">
            <div className="bg-[#3c4043] rounded-xl p-4">
              <h3 className="font-medium mb-4">Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Conference ID</span>
                  <span>{selectedRecord.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Start Time</span>
                  <span>{formatDateTime(selectedRecord.start_time)}</span>
                </div>
                {selectedRecord.end_time && (
                  <div className="flex justify-between">
                    <span className="text-[#9aa0a6]">End Time</span>
                    <span>{formatDateTime(selectedRecord.end_time)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Duration</span>
                  <span>{formatDuration(selectedRecord.start_time, selectedRecord.end_time)}</span>
                </div>
                {selectedRecord.meeting_code && (
                  <div className="flex justify-between">
                    <span className="text-[#9aa0a6]">Meeting Code</span>
                    <span>{selectedRecord.meeting_code}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Participants section */}
            {allParticipants[selectedRecord.id] && allParticipants[selectedRecord.id].length > 0 && (
              <div className="bg-[#3c4043] rounded-xl p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <UsersIcon />
                  Participants ({allParticipants[selectedRecord.id].length})
                </h3>
                <div className="space-y-2">
                  {allParticipants[selectedRecord.id].map(participant => (
                    <div key={participant.id} className="flex items-center gap-3 p-2 bg-[#4a4b4e] rounded-lg">
                      <div className="w-8 h-8 bg-[#14B8A6] rounded-full flex items-center justify-center text-[#202124] text-sm font-medium">
                        {participant.displayName?.charAt(0) || participant.email?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{participant.displayName || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{participant.id}]</span></div>
                        {participant.email && <div className="text-xs text-[#9aa0a6] truncate">{participant.email}</div>}
                      </div>
                      <div className="text-xs text-[#9aa0a6]">{formatTime(participant.join_time)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recordings section */}
            {recordings.filter(r => r.parent === selectedRecord.id).length > 0 && (
              <div className="bg-[#3c4043] rounded-xl p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <PlayIcon />
                  Recordings ({recordings.filter(r => r.parent === selectedRecord.id).length})
                </h3>
                <div className="space-y-2">
                  {recordings.filter(r => r.parent === selectedRecord.id).map(recording => (
                    <div key={recording.id} className="flex items-center gap-3 p-2 bg-[#4a4b4e] rounded-lg">
                      <div className="w-8 h-8 bg-red-600/20 rounded-full flex items-center justify-center text-red-400">
                        <PlayIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Recording {recording.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{recording.id}]</span></div>
                        <div className="text-xs text-[#9aa0a6]">
                          {formatDateTime(recording.start_time)}
                          {recording.duration && ` • ${recording.duration}`}
                        </div>
                      </div>
                      {recording.state && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          recording.state === 'completed' ? 'bg-green-600/20 text-green-400' :
                          'bg-yellow-600/20 text-yellow-400'
                        }`}>
                          {recording.state}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcripts section */}
            {transcripts.filter(t => t.parent === selectedRecord.id).length > 0 && (
              <div className="bg-[#3c4043] rounded-xl p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <TranscriptIcon />
                  Transcripts ({transcripts.filter(t => t.parent === selectedRecord.id).length})
                </h3>
                <div className="space-y-2">
                  {transcripts.filter(t => t.parent === selectedRecord.id).map(transcript => (
                    <div key={transcript.id} className="flex items-center gap-3 p-2 bg-[#4a4b4e] rounded-lg">
                      <div className="w-8 h-8 bg-teal-600/20 rounded-full flex items-center justify-center text-teal-400">
                        <TranscriptIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Transcript {transcript.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{transcript.id}]</span></div>
                        <div className="text-xs text-[#9aa0a6]">{formatDateTime(transcript.start_time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="w-full px-4 py-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors flex items-center justify-center gap-2"
              onClick={() => onViewParticipants(selectedRecord.id)}
            >
              <UsersIcon />
              View Participants
            </button>
            <button
              className="w-full px-4 py-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              onClick={() => onViewRecordDetail(selectedRecord.id)}
            >
              View Full Details (API)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-medium mb-6">Conference Records</h1>

        {records.length === 0 ? (
          <div className="text-center py-12 text-[#9aa0a6]">
            <RecordIcon />
            <p className="mt-4">No conference records yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(record => (
              <button
                key={record.id}
                className="w-full p-4 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors text-left flex items-center gap-4"
                onClick={() => onSelectRecord(record)}
              >
                <div className="w-12 h-12 rounded-full bg-[#4a4b4e] flex items-center justify-center">
                  <RecordIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {record.name || `Conference ${record.id}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{record.id}]</span>
                  </div>
                  <div className="text-sm text-[#9aa0a6] mt-1">
                    {formatDateTime(record.start_time)} • {formatDuration(record.start_time, record.end_time)}
                  </div>
                </div>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============== Recordings View ==============

function RecordingsView({
  recordings,
  conferenceRecords,
  selectedRecording,
  onSelectRecording,
  onViewRecordingDetail,
  api
}: {
  recordings: Recording[]
  conferenceRecords: ConferenceRecord[]
  selectedRecording: Recording | null
  onSelectRecording: (recording: Recording | null) => void
  onViewRecordingDetail: (recordingId: string) => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const getConferenceRecord = (parentId: string) => {
    return conferenceRecords.find(r => r.id === parentId)
  }

  if (selectedRecording) {
    const parentRecord = getConferenceRecord(selectedRecording.parent)

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <button
            className="flex items-center gap-2 text-[#14B8A6] hover:text-[#99F6E4] mb-6"
            onClick={() => onSelectRecording(null)}
          >
            <BackIcon />
            Back to recordings
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-red-600/20 flex items-center justify-center">
              <PlayIcon />
            </div>
            <div>
              <h1 className="text-2xl font-medium">Recording {selectedRecording.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedRecording.id}]</span></h1>
              <p className="text-[#9aa0a6]">{formatDateTime(selectedRecording.start_time)}</p>
            </div>
          </div>

          <div className="bg-[#3c4043] rounded-xl p-4">
            <h3 className="font-medium mb-4">Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[#9aa0a6]">Recording ID</span>
                <span>{selectedRecording.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9aa0a6]">Conference</span>
                <span>{parentRecord?.name || selectedRecording.parent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9aa0a6]">Start Time</span>
                <span>{formatDateTime(selectedRecording.start_time)}</span>
              </div>
              {selectedRecording.duration && (
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Duration</span>
                  <span>{selectedRecording.duration}</span>
                </div>
              )}
              {selectedRecording.state && (
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">State</span>
                  <span className={`px-2 py-0.5 rounded-full text-sm ${
                    selectedRecording.state === 'completed' ? 'bg-green-600/20 text-green-400' :
                    'bg-yellow-600/20 text-yellow-400'
                  }`}>
                    {selectedRecording.state}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Recording link */}
          <div className="bg-[#3c4043] rounded-xl p-4 mt-4">
            <h3 className="font-medium mb-3">Recording Link</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[#14B8A6] text-sm truncate">
                  https://drive.gridwell.com/meet-recordings/{selectedRecording.id}
                </div>
              </div>
              <button
                className="px-3 py-1.5 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors text-xs font-medium"
                onClick={() => navigator.clipboard.writeText(`https://drive.gridwell.com/meet-recordings/${selectedRecording.id}`)}
              >
                Copy
              </button>
            </div>
            {parentRecord?.meeting_code && (
              <div className="mt-2 text-xs text-[#9aa0a6]">
                Meeting: {parentRecord.meeting_code}
              </div>
            )}
          </div>

          <button
            className="w-full mt-4 px-4 py-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
            onClick={() => onViewRecordingDetail(selectedRecording.id)}
          >
            View Full Details (API)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-medium mb-6">Recordings</h1>

        {recordings.length === 0 ? (
          <div className="text-center py-12 text-[#9aa0a6]">
            <PlayIcon />
            <p className="mt-4">No recordings yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recordings.map(recording => {
              const parentRecord = getConferenceRecord(recording.parent)
              return (
                <button
                  key={recording.id}
                  className="w-full p-4 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors text-left flex items-center gap-4"
                  onClick={() => onSelectRecording(recording)}
                >
                  <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center text-red-400">
                    <PlayIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {parentRecord?.name || `Recording from ${recording.parent}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{recording.id}]</span>
                    </div>
                    <div className="text-sm text-[#9aa0a6] mt-1">
                      {formatDateTime(recording.start_time)}
                      {recording.duration && ` • ${recording.duration}`}
                    </div>
                    <div className="text-xs text-[#14B8A6] mt-0.5 truncate">
                      https://drive.gridwell.com/meet-recordings/{recording.id}
                    </div>
                  </div>
                  {recording.state && (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      recording.state === 'completed' ? 'bg-green-600/20 text-green-400' :
                      'bg-yellow-600/20 text-yellow-400'
                    }`}>
                      {recording.state}
                    </span>
                  )}
                  <ChevronRightIcon />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============== Transcripts View ==============

function TranscriptsView({
  transcripts,
  conferenceRecords,
  selectedTranscript,
  transcriptEntries,
  onSelectTranscript,
  onViewTranscriptDetail,
  onViewEntryDetail,
  api
}: {
  transcripts: Transcript[]
  conferenceRecords: ConferenceRecord[]
  selectedTranscript: Transcript | null
  transcriptEntries: TranscriptEntry[]
  onSelectTranscript: (transcript: Transcript | null) => void
  onViewTranscriptDetail: (transcriptId: string) => void
  onViewEntryDetail: (entryId: string) => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const getConferenceRecord = (parentId: string) => {
    return conferenceRecords.find(r => r.id === parentId)
  }

  if (selectedTranscript) {
    const parentRecord = getConferenceRecord(selectedTranscript.parent)

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <button
            className="flex items-center gap-2 text-[#14B8A6] hover:text-[#99F6E4] mb-6"
            onClick={() => onSelectTranscript(null)}
          >
            <BackIcon />
            Back to transcripts
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-teal-600/20 flex items-center justify-center">
              <TranscriptIcon />
            </div>
            <div>
              <h1 className="text-2xl font-medium">
                {parentRecord?.name || `Transcript ${selectedTranscript.id}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedTranscript.id}]</span>
              </h1>
              <p className="text-[#9aa0a6]">{formatDateTime(selectedTranscript.start_time)}</p>
            </div>
          </div>

          {/* Transcript info */}
          <div className="bg-[#3c4043] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Info</h3>
              <button
                className="px-3 py-1 bg-[#4a4b4e] hover:bg-[#5a5b5e] rounded-full text-xs transition-colors"
                onClick={() => onViewTranscriptDetail(selectedTranscript.id)}
              >
                View Details (API)
              </button>
            </div>
            <div className="text-sm text-[#9aa0a6]">
              <span>Conference: {parentRecord?.name || selectedTranscript.parent}</span>
            </div>
          </div>

          {/* Transcript entries */}
          <div className="bg-[#3c4043] rounded-xl p-4">
            <h3 className="font-medium mb-4">Transcript</h3>
            {transcriptEntries.length === 0 ? (
              <p className="text-[#9aa0a6] text-center py-8">No transcript entries</p>
            ) : (
              <div className="space-y-4">
                {transcriptEntries.map(entry => (
                  <div key={entry.id} className="border-l-2 border-[#14B8A6] pl-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#9aa0a6] mb-1">
                        {formatTime(entry.start_time)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{entry.id}]</span>
                      </div>
                      <button
                        className="text-xs text-[#14B8A6] hover:text-[#99F6E4]"
                        onClick={() => onViewEntryDetail(entry.id)}
                      >
                        Details
                      </button>
                    </div>
                    <p className="text-sm">{entry.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-medium mb-6">Transcripts</h1>

        {transcripts.length === 0 ? (
          <div className="text-center py-12 text-[#9aa0a6]">
            <TranscriptIcon />
            <p className="mt-4">No transcripts yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transcripts.map(transcript => {
              const parentRecord = getConferenceRecord(transcript.parent)
              return (
                <button
                  key={transcript.id}
                  className="w-full p-4 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-xl transition-colors text-left flex items-center gap-4"
                  onClick={() => onSelectTranscript(transcript)}
                >
                  <div className="w-12 h-12 rounded-full bg-teal-600/20 flex items-center justify-center text-teal-400">
                    <TranscriptIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {parentRecord?.name || `Transcript from ${transcript.parent}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{transcript.id}]</span>
                    </div>
                    <div className="text-sm text-[#9aa0a6] mt-1">
                      {formatDateTime(transcript.start_time)}
                    </div>
                  </div>
                  <ChevronRightIcon />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============== Modals ==============

function CreateSpaceModal({ onClose, onCreated, api }: {
  onClose: () => void
  onCreated: () => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const [spaceName, setSpaceName] = useState('')
  const [accessType, setAccessType] = useState<'TRUSTED' | 'RESTRICTED' | 'OPEN'>('TRUSTED')
  const [entryPointAccess, setEntryPointAccess] = useState<'ALL' | 'CREATOR_APP_ONLY'>('ALL')
  const [creating, setCreating] = useState(false)

  const generateMeetingCode = () => {
    const randomSegment = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz'
      return Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    }
    return `${randomSegment()}-${randomSegment()}-${randomSegment()}`
  }

  const handleCreate = async () => {
    const trimmedName = spaceName.trim()
    if (!trimmedName) return
    setCreating(true)
    try {
      const meetingCode = generateMeetingCode()
      const spaceId = trimmedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      await api.callTool('create_meeting_space', {
        space_name: spaceId,
        space_content: {
          meetingCode,
          meetingUri: `https://meet.gridwell.com/${meetingCode}`,
          accessType,
          entryPointAccess,
        }
      })
      onCreated()
    } catch (err) {
      alert('Failed to create space: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#292a2d] rounded-2xl p-6 w-full max-w-md border border-[#3c4043]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium">Create New Meeting</h2>
          <button className="text-[#9aa0a6] hover:text-white" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Meeting name</label>
            <input
              type="text"
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent text-white placeholder-[#9aa0a6]"
              placeholder="Team standup"
            />
          </div>

          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Access type</label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as typeof accessType)}
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent text-white"
            >
              <option value="TRUSTED">Trusted - Organization members only</option>
              <option value="RESTRICTED">Restricted - Invited users only</option>
              <option value="OPEN">Open - Anyone with link</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Entry point access</label>
            <select
              value={entryPointAccess}
              onChange={(e) => setEntryPointAccess(e.target.value as typeof entryPointAccess)}
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent text-white"
            >
              <option value="ALL">All entry points</option>
              <option value="CREATOR_APP_ONLY">Creator app only</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 text-[#14B8A6] hover:bg-[#3c4043] rounded-full transition-colors"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors font-medium disabled:opacity-50"
            onClick={handleCreate}
            disabled={creating || !spaceName.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditSpaceModal({ space, onClose, onUpdated, api }: {
  space: Space
  onClose: () => void
  onUpdated: () => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const [accessType, setAccessType] = useState<'TRUSTED' | 'RESTRICTED' | 'OPEN'>(space.accessType)
  const [entryPointAccess, setEntryPointAccess] = useState<'ALL' | 'CREATOR_APP_ONLY'>(space.entryPointAccess)
  const [updating, setUpdating] = useState(false)

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      await api.callTool('update_meeting_space', {
        name: space.name,
        update_mask: { accessType, entryPointAccess }
      })
      onUpdated()
    } catch (err) {
      alert('Failed to update space: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#292a2d] rounded-2xl p-6 w-full max-w-md border border-[#3c4043]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium">Edit Meeting Settings</h2>
          <button className="text-[#9aa0a6] hover:text-white" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Meeting code</label>
            <input
              type="text"
              value={space.meetingCode}
              readOnly
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg text-[#9aa0a6]"
            />
          </div>

          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Access type</label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as typeof accessType)}
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent text-white"
            >
              <option value="TRUSTED">Trusted - Organization members only</option>
              <option value="RESTRICTED">Restricted - Invited users only</option>
              <option value="OPEN">Open - Anyone with link</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-[#9aa0a6] mb-2">Entry point access</label>
            <select
              value={entryPointAccess}
              onChange={(e) => setEntryPointAccess(e.target.value as typeof entryPointAccess)}
              className="w-full px-4 py-3 bg-[#3c4043] border border-[#4a4b4e] rounded-lg focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent text-white"
            >
              <option value="ALL">All entry points</option>
              <option value="CREATOR_APP_ONLY">Creator app only</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 text-[#14B8A6] hover:bg-[#3c4043] rounded-full transition-colors"
            onClick={onClose}
            disabled={updating}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-[#14B8A6] hover:bg-[#99F6E4] text-[#202124] rounded-full transition-colors font-medium disabled:opacity-50"
            onClick={handleUpdate}
            disabled={updating}
          >
            {updating ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ParticipantsModal({
  participants,
  selectedParticipant,
  participantSessions,
  onClose,
  onSelectParticipant,
  onViewParticipantDetail,
  onViewSessionDetail
}: {
  participants: Participant[]
  selectedParticipant: Participant | null
  participantSessions: ParticipantSession[]
  onClose: () => void
  onSelectParticipant: (participant: Participant | null) => void
  onViewParticipantDetail: (participantId: string) => void
  onViewSessionDetail: (sessionId: string) => void
}) {
  if (selectedParticipant) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[#292a2d] rounded-2xl p-6 w-full max-w-md border border-[#3c4043] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <button
            className="flex items-center gap-2 text-[#14B8A6] hover:text-[#99F6E4] mb-4"
            onClick={() => onSelectParticipant(null)}
          >
            <BackIcon />
            Back to participants
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-[#14B8A6] rounded-full flex items-center justify-center text-[#202124] text-xl font-medium">
              {selectedParticipant.displayName?.charAt(0) || selectedParticipant.email?.charAt(0) || '?'}
            </div>
            <div>
              <h2 className="text-lg font-medium">{selectedParticipant.displayName || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedParticipant.id}]</span></h2>
              {selectedParticipant.email && (
                <p className="text-sm text-[#9aa0a6]">{selectedParticipant.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Sessions</h3>
            <button
              className="px-3 py-1 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-full text-xs transition-colors"
              onClick={() => onViewParticipantDetail(selectedParticipant.id)}
            >
              Participant Details (API)
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {participantSessions.length === 0 ? (
              <p className="text-[#9aa0a6] text-center py-8">No sessions recorded</p>
            ) : (
              <div className="space-y-2">
                {participantSessions.map(session => (
                  <div key={session.id} className="p-3 bg-[#3c4043] rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">Session {session.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{session.id}]</span></div>
                      <button
                        className="text-xs text-[#14B8A6] hover:text-[#99F6E4]"
                        onClick={() => onViewSessionDetail(session.id)}
                      >
                        Details
                      </button>
                    </div>
                    <div className="text-xs text-[#9aa0a6] mt-1">
                      Joined: {formatDateTime(session.join_time)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="mt-4 w-full px-4 py-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-full transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#292a2d] rounded-2xl p-6 w-full max-w-md border border-[#3c4043] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium">Participants</h2>
          <button className="text-[#9aa0a6] hover:text-white" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {participants.length === 0 ? (
            <div className="text-center py-12 text-[#9aa0a6]">
              <UsersIcon />
              <p className="mt-4">No participants</p>
            </div>
          ) : (
            <div className="space-y-2">
              {participants.map(participant => (
                <button
                  key={participant.id}
                  className="w-full p-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-lg transition-colors flex items-center gap-3 text-left"
                  onClick={() => onSelectParticipant(participant)}
                >
                  <div className="w-10 h-10 bg-[#14B8A6] rounded-full flex items-center justify-center text-[#202124] font-medium">
                    {participant.displayName?.charAt(0) || participant.email?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {participant.displayName || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{participant.id}]</span>
                    </div>
                    {participant.email && (
                      <div className="text-xs text-[#9aa0a6] truncate">{participant.email}</div>
                    )}
                    <div className="text-xs text-[#9aa0a6]">
                      Joined: {formatTime(participant.join_time)}
                    </div>
                  </div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="mt-4 w-full px-4 py-3 bg-[#3c4043] hover:bg-[#4a4b4e] rounded-full transition-colors"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
