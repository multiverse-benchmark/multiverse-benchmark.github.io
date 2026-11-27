import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Sapspend"

// Types
interface TripSummary {
  trip_id: string
  trip_name: string
  start_date: string
  end_date: string
  destination_summary: string | null
  status: string
  last_modified_date: string
  created_date: string
  booking_type: string | null
  is_virtual_trip: boolean
  is_canceled: boolean
  is_guest_booking: boolean
}

interface FlightSegment {
  type: string
  start_date: string
  end_date: string
  vendor: string
  vendor_name: string | null
  departure_airport: string
  arrival_airport: string
  flight_number: string
  aircraft_type: string | null
  is_direct: boolean
  availability_data: {
    basic_economy: number
    economy: number
    business: number
  }
  pricing_data: {
    basic_economy: number
    economy: number
    business: number
  }
  operational_status: string
}

interface Passenger {
  name_first: string
  name_last: string
  dob?: string | null
}

interface Segment {
  segment_id: string
  type: string
  status: string
  vendor: string
  vendor_name?: string
  start_date: string
  end_date: string
  total_rate: number
  currency: string
  confirmation_number?: string
  departure_airport?: string
  arrival_airport?: string
  flight_number?: string
  fare_class?: string
  is_direct?: boolean
  baggage?: {
    count: number
    weight_kg: number
    nonfree_count: number
  }
  location?: string
  hotel_name?: string
  pickup_location?: string
  dropoff_location?: string
}

interface Booking {
  booking_id: string
  user_id?: string
  booking_source: string
  record_locator: string
  trip_id?: string
  status: string
  passengers: Passenger[]
  segments: Segment[]
  last_modified: string
  insurance?: string
  payment_history?: Array<{
    payment_id: string
    amount: number
    timestamp: string
    type: string
  }>
}

interface Location {
  id: string
  name: string
  address_line_1: string
  address_line_2?: string
  city: string
  country_subdivision_code?: string
  country_code: string
  postal_code?: string
  latitude?: number
  longitude?: number
  is_active: boolean
}

interface UserDetails {
  id: string
  user_name: string
  given_name: string
  family_name: string
  email: string
  active: boolean
  dob?: string
  membership?: string
  booking_locators: string[]
  payment_methods: Record<string, {
    id: string
    source: string
    brand: string
    last_four: string
    amount?: number
  }>
  certificates: Array<{
    id: string
    certificate_number?: string
    amount?: number
    currency: string
    issued_date?: string
    type: string
  }>
  saved_passengers?: Array<{
    first_name: string
    last_name: string
    dob: string
  }>
}

type TabId = 'trips' | 'flights' | 'bookings' | 'locations' | 'user'

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

const COLORS = {
  primary: '#7F1D1D',
  primaryDark: '#5C1414',
  primarySoft: '#FAF1F1',     // soft wine tint for accent surfaces
  primarySoftBorder: '#F0DCDC',
  green: '#2E844A',
  greenSoft: '#EAF6EE',
  orange: '#B45309',
  orangeSoft: '#FBF0E1',
  red: '#D32F2F',
  redSoft: '#FBEBEB',
  gray: '#57534E',           // warm taupe gray fits the palette
  grayMuted: '#A8A29E',
  lightGray: '#FAF8F5',      // warm sand surface
  border: '#EDE9E2',          // softer warm border
  borderStrong: '#D6D0C4',
  surface: '#FFFFFF',
  ink: '#1C1917',             // primary text (warm near-black)
  inkSoft: '#44403C',
}

// Shared style tokens
const SHADOW_SM = '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.03)'
const SHADOW_MD = '0 2px 6px rgba(28, 25, 23, 0.05), 0 4px 12px rgba(28, 25, 23, 0.04)'
const SHADOW_LG = '0 4px 12px rgba(28, 25, 23, 0.06), 0 12px 32px rgba(28, 25, 23, 0.08)'
const FOCUS_RING = `0 0 0 3px rgba(127, 29, 29, 0.15)`

// Helper function to parse API errors and return user-friendly messages
function getFriendlyErrorMessage(error: unknown, fallbackMessage: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // Map common API errors to user-friendly messages
  if (errorMessage.includes('UserNotFoundError') || errorMessage.includes('User with username')) {
    return 'User not found. Please check the username and try again.'
  }
  if (errorMessage.includes('BookingNotFoundError') || (errorMessage.includes('not found') && errorMessage.includes('booking'))) {
    return 'Booking not found. Please check the reference number and try again.'
  }
  if (errorMessage.includes('TripNotFoundError') || errorMessage.includes('Trip not found')) {
    return 'Trip not found. Please check the trip ID and try again.'
  }
  if (errorMessage.includes('ValidationError') || errorMessage.includes('Invalid parameters')) {
    return 'Invalid input. Please check your entries and try again.'
  }
  if (errorMessage.includes('No flights found') || errorMessage.includes('FlightNotFoundError')) {
    return 'No flights found for the selected route and date.'
  }
  if (errorMessage.includes('Internal Server Error') || errorMessage.includes('500')) {
    return 'Service temporarily unavailable. Please try again later.'
  }
  if (errorMessage.includes('Network Error') || errorMessage.includes('fetch')) {
    return 'Connection error. Please check your internet connection.'
  }
  if (errorMessage.includes('Tool execution failed')) {
    // Extract a cleaner message from tool execution errors
    const match = errorMessage.match(/Error:\s*(.+?)(?:\.|$)/)
    if (match) {
      return match[1].trim()
    }
    return fallbackMessage
  }
  
  // For any other error, return the fallback message
  return fallbackMessage
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const getStatusStyle = (s: string) => {
    const lower = s.toLowerCase()
    if (lower.includes('confirm') || lower === 'active') return { bg: '#EAF6EE', text: '#1F6B36', dot: '#2E844A' }
    if (lower.includes('cancel')) return { bg: '#FBEBEB', text: '#A12121', dot: '#D32F2F' }
    if (lower.includes('pending') || lower.includes('wait')) return { bg: '#FBF0E1', text: '#8A4407', dot: '#B45309' }
    if (lower.includes('complete')) return { bg: '#FAF1F1', text: '#7F1D1D', dot: '#7F1D1D' }
    return { bg: '#F4F1EC', text: '#57534E', dot: '#A8A29E' }
  }

  const style = getStatusStyle(status)

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        letterSpacing: '0.02em',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
      {status}
    </span>
  )
}

// Format date helper
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return dateStr
  }
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency 
  }).format(amount)
}

export default function SapspendApp({ setRefreshHandler }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trips')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadDataRef = useRef<() => void>(() => {})
  
  // Trip state
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [selectedTrip, setSelectedTrip] = useState<TripSummary | null>(null)
  const [showTripModal, setShowTripModal] = useState(false)
  
  // Flight search state - default departure_date to a date with available flights in DB
  const [flightSearchParams, setFlightSearchParams] = useState({
    departure_airport: '',
    arrival_airport: '',
    departure_date: '2024-05-20',
    search_type: 'direct' as 'direct' | 'onestop'
  })
  const [flightResults, setFlightResults] = useState<FlightSegment[]>([])
  const [flightSearchLoading, setFlightSearchLoading] = useState(false)
  
  // Booking state
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [bookingLocatorInput, setBookingLocatorInput] = useState('')
  const [showBookingDetails, setShowBookingDetails] = useState(false)
  
  // Location state
  const [locations, setLocations] = useState<Location[]>([])
  const [airports, setAirports] = useState<Record<string, string>>({})
  const [locationFilters, setLocationFilters] = useState({
    name: '',
    city: '',
    country: ''
  })
  
  // User state
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [userNameInput, setUserNameInput] = useState('')

  // Transfer to agent state
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferSummary, setTransferSummary] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [transferSuccess, setTransferSuccess] = useState(false)
  
  const api = useBackendAPI('sapspend')

  // Refresh handler - store setRefreshHandler in a ref to avoid depending on it
  // (it's an inline arrow function from the parent that changes identity on every render)
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    loadDataRef.current = loadData
  })

  useEffect(() => {
    const handler = () => loadDataRef.current()
    setRefreshHandlerRef.current?.(handler)
    return () => {
      setRefreshHandlerRef.current?.(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [tripsResult, airportsResult] = await Promise.all([
        api.callTool('get_trips_summary', { start_date: '2020-01-01', include_canceled_trips: true }),
        api.callTool('list_all_airports', {}).catch(() => null)
      ])
      setTrips(tripsResult?.summaries || [])
      setAirports(airportsResult || {})
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to load data. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // Flight search
  const searchFlights = async () => {
    if (!flightSearchParams.departure_airport || !flightSearchParams.arrival_airport || !flightSearchParams.departure_date) {
      setError('Please fill in all flight search fields')
      return
    }
    
    setFlightSearchLoading(true)
    setError(null)
    try {
      const method = flightSearchParams.search_type === 'direct' 
        ? 'search_direct_flight' 
        : 'search_onestop_flight'
      
      const result = await api.callTool(method, {
        departure_airport: flightSearchParams.departure_airport.toUpperCase(),
        arrival_airport: flightSearchParams.arrival_airport.toUpperCase(),
        departure_date: flightSearchParams.departure_date
      })
      setFlightResults(result || [])
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'No flights found for the selected route and date.'))
      setFlightResults([])
    } finally {
      setFlightSearchLoading(false)
    }
  }

  // Get booking by locator
  const getBookingDetails = async (locator?: string) => {
    const searchLocator = locator || bookingLocatorInput
    if (!searchLocator.trim()) {
      setError('Please enter a booking reference')
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const result = await api.callTool('get_reservation_details', {
        record_locator: searchLocator.trim().toUpperCase()
      })
      setSelectedBooking(result)
      setShowBookingDetails(true)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Booking not found. Please check the reference number.'))
      setSelectedBooking(null)
    } finally {
      setLoading(false)
    }
  }

  // Cancel booking
  const cancelBooking = async (booking: Booking) => {
    if (!window.confirm(`Are you sure you want to cancel booking ${booking.record_locator}?`)) {
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      await api.callTool('cancel_booking', {
        bookingSource: booking.booking_source,
        confirmationNumber: booking.record_locator
      })
      // Refresh booking details
      const updatedBooking = await api.callTool('get_reservation_details', {
        record_locator: booking.record_locator
      })
      setSelectedBooking(updatedBooking)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to cancel booking. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // Load locations
  const loadLocations = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (locationFilters.name) params.name = locationFilters.name
      if (locationFilters.city) params.city = locationFilters.city
      if (locationFilters.country) params.country = locationFilters.country
      
      const result = await api.callTool('list_locations', params)
      setLocations(result?.items || [])
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to load locations. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // Get user details
  const getUserDetails = async () => {
    if (!userNameInput.trim()) {
      setError('Please enter a username')
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const result = await api.callTool('get_user_details', {
        user_name: userNameInput.trim()
      })
      setUserDetails(result)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'User not found. Please check the username.'))
      setUserDetails(null)
    } finally {
      setLoading(false)
    }
  }

  // Send certificate
  const sendCertificate = async (userId: string, certType: string, amount: number) => {
    setLoading(true)
    setError(null)
    try {
      await api.callTool('send_certificate', {
        user_id: userId,
        certificate_type: certType,
        amount: amount,
        currency: 'USD'
      })
      // Refresh user details
      if (userDetails) {
        const result = await api.callTool('get_user_details', {
          user_name: userDetails.user_name
        })
        setUserDetails(result)
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to send certificate. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'trips', label: 'Trips', icon: '✈️' },
    { id: 'flights', label: 'Flight Search', icon: '🔍' },
    { id: 'bookings', label: 'Bookings', icon: '📋' },
    { id: 'locations', label: 'Locations', icon: '📍' },
    { id: 'user', label: 'User', icon: '👤' }
  ]

  return (
    <div className="h-full flex flex-col" style={{
      background: COLORS.lightGray,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: COLORS.ink,
    }}>
      {/* Header - App brand */}
      <div className="px-7 pt-5" style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* App Brand */}
            <div className="flex items-center gap-2.5">
              <div
                className="px-2.5 py-1 rounded-md"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`,
                  boxShadow: '0 1px 2px rgba(127, 29, 29, 0.25)',
                }}
              >
                <span className="text-[11px] font-semibold text-white" style={{ letterSpacing: '0.06em' }}>{APP_NAME.split(' ')[0]}</span>
              </div>
              <span className="text-[20px] font-medium" style={{ color: COLORS.ink, letterSpacing: '-0.015em' }}>{APP_NAME.split(' ').slice(1).join(' ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTransferSummary(''); setTransferSuccess(false); setShowTransferModal(true) }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg transition-all"
              style={{ color: COLORS.orange, background: COLORS.orangeSoft }}
              onMouseOver={e => { e.currentTarget.style.background = COLORS.orange; e.currentTarget.style.color = '#FFFFFF' }}
              onMouseOut={e => { e.currentTarget.style.background = COLORS.orangeSoft; e.currentTarget.style.color = COLORS.orange }}
            >
              <span className="mr-1.5">📞</span>Transfer to Agent
            </button>
            <button
              onClick={loadData}
              className="px-3.5 py-2 text-sm font-medium rounded-lg transition-all"
              style={{ color: COLORS.primary, background: COLORS.primarySoft }}
              onMouseOver={e => { e.currentTarget.style.background = COLORS.primary; e.currentTarget.style.color = '#FFFFFF' }}
              onMouseOut={e => { e.currentTarget.style.background = COLORS.primarySoft; e.currentTarget.style.color = COLORS.primary }}
            >
              <span className="mr-1.5">↻</span>Refresh
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mt-5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative"
              style={{
                color: activeTab === tab.id ? COLORS.primary : COLORS.gray,
                background: 'transparent',
                borderBottom: activeTab === tab.id ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                marginBottom: '-1px',
              }}
              onMouseOver={e => { if (activeTab !== tab.id) e.currentTarget.style.color = COLORS.ink }}
              onMouseOut={e => { if (activeTab !== tab.id) e.currentTarget.style.color = COLORS.gray }}
            >
              <span style={{ fontSize: '15px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-7 mt-5 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: COLORS.redSoft, boxShadow: SHADOW_SM }}>
          <span style={{ color: COLORS.red }}>⚠️</span>
          <span className="text-sm flex-1" style={{ color: '#A12121' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ color: '#A12121' }} className="hover:opacity-70 transition-opacity">✕</button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-7" style={{ background: COLORS.lightGray }}>
        {loading && !flightSearchLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: '#E5E7EB', borderTopColor: COLORS.primary }} />
              <span className="text-sm" style={{ color: COLORS.gray }}>Loading...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Trips Tab */}
            {activeTab === 'trips' && (
              <TripsTab
                trips={trips}
                selectedTrip={selectedTrip}
                onSelectTrip={setSelectedTrip}
                showModal={showTripModal}
                onToggleModal={setShowTripModal}
                api={api}
                onRefresh={loadData}
                userDetails={userDetails}
              />
            )}

            {/* Flights Tab */}
            {activeTab === 'flights' && (
              <FlightsTab
                searchParams={flightSearchParams}
                onSearchParamsChange={setFlightSearchParams}
                results={flightResults}
                loading={flightSearchLoading}
                onSearch={searchFlights}
                airports={airports}
              />
            )}

            {/* Bookings Tab */}
            {activeTab === 'bookings' && (
              <BookingsTab
                locatorInput={bookingLocatorInput}
                onLocatorChange={setBookingLocatorInput}
                selectedBooking={selectedBooking}
                showDetails={showBookingDetails}
                onSearch={getBookingDetails}
                onCancel={cancelBooking}
                onClose={() => setShowBookingDetails(false)}
                api={api}
                onRefresh={() => selectedBooking && getBookingDetails()}
                trips={trips}
              />
            )}

            {/* Locations Tab */}
            {activeTab === 'locations' && (
              <LocationsTab
                locations={locations}
                airports={airports}
                filters={locationFilters}
                onFiltersChange={setLocationFilters}
                onSearch={loadLocations}
                api={api}
              />
            )}

            {/* User Tab */}
            {activeTab === 'user' && (
              <UserTab
                userNameInput={userNameInput}
                onUserNameChange={setUserNameInput}
                userDetails={userDetails}
                onSearch={getUserDetails}
                onSendCertificate={sendCertificate}
              />
            )}
          </>
        )}
      </div>

      {/* Transfer to Agent Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Transfer to Human Agent</h3>
              <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Provide a summary of the issue for the agent</p>
            </div>
            {transferSuccess ? (
              <div className="px-6 pb-6">
                <div className="flex flex-col items-center gap-3 py-4">
                  <span className="text-4xl">✅</span>
                  <p className="text-lg font-medium" style={{ color: COLORS.green }}>Transfer Successful</p>
                  <p className="text-sm text-center" style={{ color: COLORS.gray }}>Your request has been transferred to a human agent. They will assist you shortly.</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setShowTransferModal(false)}
                    className="px-6 py-2 text-white font-medium rounded-lg transition-all hover:opacity-90"
                    style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 pb-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Issue Summary *</label>
                    <textarea
                      value={transferSummary}
                      onChange={e => setTransferSummary(e.target.value)}
                      onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                      className="w-full px-4 py-2.5 rounded-lg focus:outline-none resize-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, minHeight: '120px', background: COLORS.surface }}
                      placeholder="Describe the issue you need help with..."
                    />
                  </div>
                </div>
                <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
                  <button
                    onClick={() => setShowTransferModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ color: COLORS.inkSoft, background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                    onMouseOver={e => { e.currentTarget.style.background = COLORS.lightGray }}
                    onMouseOut={e => { e.currentTarget.style.background = COLORS.surface }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!transferSummary.trim()) return
                      setTransferring(true)
                      try {
                        await api.callTool('transfer_to_human_agents', { summary: transferSummary })
                        setTransferSuccess(true)
                      } catch (err) {
                        alert(getFriendlyErrorMessage(err, 'Failed to transfer. Please try again.'))
                      } finally {
                        setTransferring(false)
                      }
                    }}
                    disabled={!transferSummary.trim() || transferring}
                    className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                    style={{ background: COLORS.orange, boxShadow: '0 1px 2px rgba(180, 83, 9, 0.25)' }}
                  >
                    {transferring ? 'Transferring...' : '📞 Transfer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Trips Tab Component
function TripsTab({
  trips,
  selectedTrip,
  onSelectTrip,
  showModal,
  onToggleModal,
  api,
  onRefresh,
  userDetails
}: {
  trips: TripSummary[]
  selectedTrip: TripSummary | null
  onSelectTrip: (trip: TripSummary | null) => void
  showModal: boolean
  onToggleModal: (show: boolean) => void
  api: ReturnType<typeof useBackendAPI>
  onRefresh: () => void
  userDetails: UserDetails | null
}) {
  const [tripForm, setTripForm] = useState({
    TripName: '',
    StartDateLocal: '',
    EndDateLocal: '',
    Comments: ''
  })
  const [isEditing, setIsEditing] = useState(false)
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [detailsTrip, setDetailsTrip] = useState<TripSummary | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const updateTripStatus = async (tripId: string, newStatus: string) => {
    setUpdatingStatus(true)
    try {
      // Fetch current state, update the trip status, and save back
      const stateRes = await fetch('./api/services/sapspend/state')
      if (!stateRes.ok) throw new Error('Failed to fetch state')
      const stateData = await stateRes.json()
      const inner = stateData.state || stateData

      if (inner.trips && inner.trips[tripId]) {
        inner.trips[tripId].status = newStatus
        inner.trips[tripId].is_canceled = newStatus === 'CANCELED'
        inner.trips[tripId].last_modified_date = new Date().toISOString()

        const putRes = await fetch('./api/services/sapspend/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stateData)
        })
        if (!putRes.ok) throw new Error('Failed to update state')
      }

      onRefresh()
      if (detailsTrip && detailsTrip.trip_id === tripId) {
        setShowDetailsModal(false)
        setDetailsTrip(null)
      }
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to update trip status. Please try again.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const resetForm = () => {
    setTripForm({ TripName: '', StartDateLocal: '', EndDateLocal: '', Comments: '' })
    setIsEditing(false)
    setEditingTrip(null)
  }

  const openEditModal = (trip: TripSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTrip(trip)
    setTripForm({
      TripName: trip.trip_name || '',
      StartDateLocal: trip.start_date || '',
      EndDateLocal: trip.end_date || '',
      Comments: '' // Comments not available in summary
    })
    setIsEditing(true)
    onToggleModal(true)
  }

  const openCreateModal = () => {
    resetForm()
    onToggleModal(true)
  }

  const openDetailsModal = (trip: TripSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setDetailsTrip(trip)
    setShowDetailsModal(true)
  }

  const saveTrip = async () => {
    if (!tripForm.TripName.trim()) return

    setSaving(true)
    try {
      // Default dates to today / today+7 if not provided, since trips with null dates
      // are filtered out by get_trips_summary
      const today = new Date().toISOString().split('T')[0]
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
      const tripInput: Record<string, unknown> = {
        TripName: tripForm.TripName,
        StartDateLocal: tripForm.StartDateLocal || today,
        EndDateLocal: tripForm.EndDateLocal || nextWeek,
        Comments: tripForm.Comments || null,
        IsVirtualTrip: editingTrip?.is_virtual_trip || false,
        IsGuestBooking: editingTrip?.is_guest_booking || false,
        Bookings: []
      }
      
      // If editing, include the ItinLocator to update
      if (isEditing && editingTrip) {
        tripInput.ItinLocator = editingTrip.trip_id
      }
      
      if (!userDetails?.id) {
        alert('Please look up a user in the User tab first to create trips.')
        setSaving(false)
        return
      }
      await api.callTool('create_or_update_trip', {
        user_id: userDetails.id,
        raw_trip_input: tripInput
      })
      onToggleModal(false)
      resetForm()
      onRefresh()
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to save trip. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>Trip Management</h2>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>View and manage your travel itineraries</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 hover:opacity-90"
          style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
        >
          <span className="text-base leading-none">+</span> New Trip
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Trips', value: trips.length, color: COLORS.primary, accent: COLORS.primarySoft },
          { label: 'Confirmed', value: trips.filter(t => t.status === 'CONFIRMED').length, color: COLORS.green, accent: COLORS.greenSoft },
          { label: 'Pending', value: trips.filter(t => t.status === 'PENDING_APPROVAL').length, color: COLORS.orange, accent: COLORS.orangeSoft },
          { label: 'Cancelled', value: trips.filter(t => t.is_canceled).length, color: COLORS.red, accent: COLORS.redSoft }
        ].map(stat => (
          <div key={stat.label} className="p-4 rounded-xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: stat.color }} />
              <div className="text-[11px] font-medium uppercase" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
            <div className="text-3xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Trips Grid */}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.primarySoft }}>
            <span className="text-3xl">✈️</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>No trips found</p>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Create your first trip to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(trip => {
            const selected = selectedTrip?.trip_id === trip.trip_id
            return (
              <div
                key={trip.trip_id}
                onClick={() => onSelectTrip(selected ? null : trip)}
                className="p-5 rounded-xl cursor-pointer transition-all"
                style={{
                  background: COLORS.surface,
                  boxShadow: selected
                    ? `0 0 0 2px ${COLORS.primary}, ${SHADOW_MD}`
                    : SHADOW_SM,
                }}
                onMouseOver={e => { if (!selected) e.currentTarget.style.boxShadow = SHADOW_MD }}
                onMouseOut={e => { if (!selected) e.currentTarget.style.boxShadow = SHADOW_SM }}
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
                      {trip.trip_name}
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{trip.trip_id}]</span>
                    </h3>
                    <p className="text-sm mt-1" style={{ color: COLORS.gray }}>
                      {trip.destination_summary || 'No destination'}
                    </p>
                  </div>
                  <StatusBadge status={trip.status} />
                </div>

                <div className="flex items-center gap-2 text-sm mb-3" style={{ color: COLORS.gray }}>
                  <span>📅</span>
                  <span>{formatDate(trip.start_date)} – {formatDate(trip.end_date)}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] mb-4">
                  {trip.booking_type && (
                    <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: COLORS.lightGray, color: COLORS.gray }}>
                      {trip.booking_type}
                    </span>
                  )}
                  {trip.is_virtual_trip && (
                    <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: '#F4ECF7', color: '#6B2A8C' }}>Virtual</span>
                  )}
                  {trip.is_guest_booking && (
                    <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: '#E6F4F1', color: '#0E6E62' }}>Guest</span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <button
                    onClick={(e) => openDetailsModal(trip, e)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={{ color: COLORS.primary, background: COLORS.primarySoft }}
                    onMouseOver={e => { e.currentTarget.style.background = COLORS.primary; e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseOut={e => { e.currentTarget.style.background = COLORS.primarySoft; e.currentTarget.style.color = COLORS.primary }}
                  >
                    View Details
                  </button>
                  <button
                    onClick={(e) => openEditModal(trip, e)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={{ color: COLORS.orange, background: COLORS.orangeSoft }}
                    onMouseOver={e => { e.currentTarget.style.background = COLORS.orange; e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseOut={e => { e.currentTarget.style.background = COLORS.orangeSoft; e.currentTarget.style.color = COLORS.orange }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
                {isEditing ? 'Edit Trip' : 'Create New Trip'}
              </h3>
              {isEditing && editingTrip && (
                <p className="text-sm mt-1" style={{ color: COLORS.gray }}>ID: {editingTrip.trip_id}</p>
              )}
            </div>
            <div className="px-6 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Trip Name *</label>
                <input
                  type="text"
                  value={tripForm.TripName}
                  onChange={e => setTripForm({ ...tripForm, TripName: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  placeholder="e.g., Business Trip to NYC"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Start Date</label>
                  <input
                    type="date"
                    value={tripForm.StartDateLocal}
                    onChange={e => setTripForm({ ...tripForm, StartDateLocal: e.target.value })}
                    onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>End Date</label>
                  <input
                    type="date"
                    value={tripForm.EndDateLocal}
                    onChange={e => setTripForm({ ...tripForm, EndDateLocal: e.target.value })}
                    onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Comments</label>
                <textarea
                  value={tripForm.Comments}
                  onChange={e => setTripForm({ ...tripForm, Comments: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none resize-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  rows={3}
                  placeholder="Optional notes about this trip..."
                />
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => { onToggleModal(false); resetForm(); }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                Cancel
              </button>
              <button
                onClick={saveTrip}
                disabled={!tripForm.TripName.trim() || saving}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ background: isEditing ? COLORS.orange : COLORS.primary, boxShadow: isEditing ? '0 1px 2px rgba(180, 83, 9, 0.25)' : '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                {saving ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Trip' : 'Create Trip')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {showDetailsModal && detailsTrip && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-lg" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold truncate" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>{detailsTrip.trip_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{detailsTrip.trip_id}]</span></h3>
                  <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Trip ID: {detailsTrip.trip_id}</p>
                </div>
                <StatusBadge status={detailsTrip.status} />
              </div>
            </div>
            <div className="px-6 pb-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Trip Information */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl" style={{ background: COLORS.lightGray }}>
                  <p className="text-[11px] font-medium uppercase mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Start Date</p>
                  <p className="font-medium" style={{ color: COLORS.ink }}>{formatDate(detailsTrip.start_date)}</p>
                </div>
                <div className="p-3.5 rounded-xl" style={{ background: COLORS.lightGray }}>
                  <p className="text-[11px] font-medium uppercase mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>End Date</p>
                  <p className="font-medium" style={{ color: COLORS.ink }}>{formatDate(detailsTrip.end_date)}</p>
                </div>
              </div>

              {/* Destination */}
              <div className="p-3.5 rounded-xl" style={{ background: COLORS.lightGray }}>
                <p className="text-[11px] font-medium uppercase mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Destination</p>
                <p className="font-medium" style={{ color: COLORS.ink }}>{detailsTrip.destination_summary || 'Not specified'}</p>
              </div>

              {/* Booking Type & Flags */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Trip Properties</p>
                <div className="flex flex-wrap gap-1.5">
                  {detailsTrip.booking_type && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: COLORS.primarySoft, color: COLORS.primary }}>
                      {detailsTrip.booking_type}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
                    background: detailsTrip.is_virtual_trip ? '#F4ECF7' : COLORS.lightGray,
                    color: detailsTrip.is_virtual_trip ? '#6B2A8C' : COLORS.gray
                  }}>
                    {detailsTrip.is_virtual_trip ? 'Virtual Trip' : 'Physical Trip'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
                    background: detailsTrip.is_guest_booking ? '#E6F4F1' : COLORS.lightGray,
                    color: detailsTrip.is_guest_booking ? '#0E6E62' : COLORS.gray
                  }}>
                    {detailsTrip.is_guest_booking ? 'Guest Booking' : 'Regular Booking'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
                    background: detailsTrip.is_canceled ? COLORS.redSoft : COLORS.greenSoft,
                    color: detailsTrip.is_canceled ? '#A12121' : '#1F6B36'
                  }}>
                    {detailsTrip.is_canceled ? 'Cancelled' : 'Active'}
                  </span>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl" style={{ background: COLORS.lightGray }}>
                  <p className="text-[11px] font-medium uppercase mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Created</p>
                  <p className="text-sm" style={{ color: COLORS.ink }}>
                    {detailsTrip.created_date ? new Date(detailsTrip.created_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl" style={{ background: COLORS.lightGray }}>
                  <p className="text-[11px] font-medium uppercase mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Last Modified</p>
                  <p className="text-sm" style={{ color: COLORS.ink }}>
                    {detailsTrip.last_modified_date ? new Date(detailsTrip.last_modified_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              {/* Approval Workflow Buttons */}
              {detailsTrip && !detailsTrip.is_canceled && (
                <div className="flex gap-2">
                  {detailsTrip.status === 'CONFIRMED' && (
                    <button
                      onClick={() => updateTripStatus(detailsTrip.trip_id, 'PENDING_APPROVAL')}
                      disabled={updatingStatus}
                      className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                      style={{ background: COLORS.orangeSoft, color: COLORS.orange }}
                      onMouseOver={e => { if (!updatingStatus) { e.currentTarget.style.background = COLORS.orange; e.currentTarget.style.color = '#FFFFFF' } }}
                      onMouseOut={e => { e.currentTarget.style.background = COLORS.orangeSoft; e.currentTarget.style.color = COLORS.orange }}
                    >
                      {updatingStatus ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  )}
                  {detailsTrip.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        onClick={() => updateTripStatus(detailsTrip.trip_id, 'CONFIRMED')}
                        disabled={updatingStatus}
                        className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                        style={{ background: COLORS.greenSoft, color: '#1F6B36' }}
                        onMouseOver={e => { if (!updatingStatus) { e.currentTarget.style.background = COLORS.green; e.currentTarget.style.color = '#FFFFFF' } }}
                        onMouseOut={e => { e.currentTarget.style.background = COLORS.greenSoft; e.currentTarget.style.color = '#1F6B36' }}
                      >
                        {updatingStatus ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => updateTripStatus(detailsTrip.trip_id, 'CANCELED')}
                        disabled={updatingStatus}
                        className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                        style={{ background: COLORS.redSoft, color: '#A12121' }}
                        onMouseOver={e => { if (!updatingStatus) { e.currentTarget.style.background = COLORS.red; e.currentTarget.style.color = '#FFFFFF' } }}
                        onMouseOut={e => { e.currentTarget.style.background = COLORS.redSoft; e.currentTarget.style.color = '#A12121' }}
                      >
                        {updatingStatus ? 'Rejecting...' : 'Reject'}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowDetailsModal(false); setDetailsTrip(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    if (detailsTrip) {
                      const e = { stopPropagation: () => {} } as React.MouseEvent;
                      openEditModal(detailsTrip, e);
                    }
                  }}
                  className="px-5 py-2 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
                  style={{ background: COLORS.orange, boxShadow: '0 1px 2px rgba(180, 83, 9, 0.25)' }}
                >
                  Edit Trip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Popular routes data - using actual available routes from the database
const POPULAR_ROUTES = [
  { from: 'JFK', to: 'SFO', fromCity: 'New York', toCity: 'San Francisco', price: 349 },
  { from: 'LAX', to: 'ORD', fromCity: 'Los Angeles', toCity: 'Chicago', price: 279 },
  { from: 'MIA', to: 'JFK', fromCity: 'Miami', toCity: 'New York', price: 249 },
  { from: 'SEA', to: 'JFK', fromCity: 'Seattle', toCity: 'New York', price: 329 },
  { from: 'ATL', to: 'ORD', fromCity: 'Atlanta', toCity: 'Chicago', price: 199 },
  { from: 'DEN', to: 'LAS', fromCity: 'Denver', toCity: 'Las Vegas', price: 149 },
]

// Type for grouped one-stop flights
interface ConnectedFlightGroup {
  leg1: FlightSegment
  leg2: FlightSegment
  totalPrice: {
    basic_economy: number
    economy: number
    business: number
  }
  connectionAirport: string
}

// Function to group one-stop flights together
function groupConnectingFlights(flights: FlightSegment[], originAirport: string, destAirport: string): ConnectedFlightGroup[] {
  const groups: ConnectedFlightGroup[] = []
  
  // Find pairs where leg1 arrives at the same airport where leg2 departs
  // and leg1 departs from origin, leg2 arrives at destination
  const usedIndices = new Set<number>()
  
  for (let i = 0; i < flights.length; i++) {
    if (usedIndices.has(i)) continue
    const leg1 = flights[i]
    
    // Check if leg1 starts from origin
    if (leg1.departure_airport.toUpperCase() !== originAirport.toUpperCase()) continue
    
    // Find a matching leg2
    for (let j = 0; j < flights.length; j++) {
      if (i === j || usedIndices.has(j)) continue
      const leg2 = flights[j]
      
      // Check if leg2 connects: leg1's arrival = leg2's departure AND leg2 arrives at destination
      if (leg1.arrival_airport === leg2.departure_airport && 
          leg2.arrival_airport.toUpperCase() === destAirport.toUpperCase()) {
        
        usedIndices.add(i)
        usedIndices.add(j)
        
        groups.push({
          leg1,
          leg2,
          totalPrice: {
            basic_economy: leg1.pricing_data.basic_economy + leg2.pricing_data.basic_economy,
            economy: leg1.pricing_data.economy + leg2.pricing_data.economy,
            business: leg1.pricing_data.business + leg2.pricing_data.business
          },
          connectionAirport: leg1.arrival_airport
        })
        break
      }
    }
  }
  
  return groups
}

// Flights Tab Component
function FlightsTab({
  searchParams,
  onSearchParamsChange,
  results,
  loading,
  onSearch,
  airports
}: {
  searchParams: typeof SapspendApp extends React.FC<any> ? never : {
    departure_airport: string
    arrival_airport: string
    departure_date: string
    search_type: 'direct' | 'onestop'
  }
  onSearchParamsChange: (params: any) => void
  results: FlightSegment[]
  loading: boolean
  onSearch: () => void
  airports: Record<string, string>
}) {
  const [hasSearched, setHasSearched] = useState(false)

  // Use a date that has flight availability in the database
  const getAvailableDate = () => {
    // The simulation database has flights available for dates from May 16-30, 2024
    return '2024-05-16'
  }

  const selectRoute = (from: string, to: string) => {
    onSearchParamsChange({
      ...searchParams,
      departure_airport: from,
      arrival_airport: to,
      departure_date: searchParams.departure_date || getAvailableDate()
    })
  }
  
  // Group connecting flights for one-stop searches
  const connectedFlights = searchParams.search_type === 'onestop' 
    ? groupConnectingFlights(results, searchParams.departure_airport, searchParams.arrival_airport)
    : []

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="p-6 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Search Flights</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>From</label>
            <input
              type="text"
              value={searchParams.departure_airport}
              onChange={e => onSearchParamsChange({ ...searchParams, departure_airport: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
              placeholder="JFK"
              maxLength={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>To</label>
            <input
              type="text"
              value={searchParams.arrival_airport}
              onChange={e => onSearchParamsChange({ ...searchParams, arrival_airport: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
              placeholder="LAX"
              maxLength={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Departure Date</label>
            <input
              type="date"
              value={searchParams.departure_date}
              onChange={e => onSearchParamsChange({ ...searchParams, departure_date: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
            />
            <p className="text-xs mt-1" style={{ color: COLORS.gray }}>Available: May 16–30, 2024</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Flight Type</label>
            <select
              value={searchParams.search_type}
              onChange={e => onSearchParamsChange({ ...searchParams, search_type: e.target.value as 'direct' | 'onestop' })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
            >
              <option value="direct">Direct Flights</option>
              <option value="onestop">One-Stop Flights</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => { setHasSearched(true); onSearch() }}
          disabled={loading}
          className="w-full md:w-auto px-7 py-2.5 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90"
          style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Searching...
            </>
          ) : (
            <>🔍 Search Flights</>
          )}
        </button>
      </div>

      {/* Popular Routes */}
      <div className="p-6 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
          <span>🌟</span> Popular Routes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {POPULAR_ROUTES.map((route, idx) => (
            <div
              key={idx}
              onClick={() => selectRoute(route.from, route.to)}
              className="p-4 rounded-xl cursor-pointer transition-all group"
              style={{ background: COLORS.lightGray }}
              onMouseOver={e => { e.currentTarget.style.background = COLORS.primarySoft }}
              onMouseOut={e => { e.currentTarget.style.background = COLORS.lightGray }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-xs" style={{ background: COLORS.primary, letterSpacing: '0.02em' }}>
                    {route.from}
                  </div>
                  <div style={{ color: COLORS.grayMuted }}>→</div>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-xs" style={{ background: COLORS.primaryDark, letterSpacing: '0.02em' }}>
                    {route.to}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase font-medium" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>from</div>
                  <div className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>${route.price}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium" style={{ color: COLORS.inkSoft }}>{route.fromCity}</span>
                <span style={{ color: COLORS.grayMuted }}>→</span>
                <span className="font-medium" style={{ color: COLORS.inkSoft }}>{route.toCity}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Available Airports Reference */}
      {Object.keys(airports).length > 0 && (
        <details className="p-5 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <summary className="text-sm font-medium cursor-pointer flex items-center gap-2" style={{ color: COLORS.inkSoft }}>
            <span>📍</span> Available Airports ({Object.keys(airports).length})
          </summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-auto">
            {Object.entries(airports).map(([name, city]) => (
              <div key={name} className="px-3 py-2 rounded-lg text-xs" style={{ background: COLORS.lightGray }}>
                <span className="font-semibold" style={{ color: COLORS.primary }}>{name}</span>
                <span className="ml-2" style={{ color: COLORS.gray }}>{city}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Search Results - Direct Flights */}
      {searchParams.search_type === 'direct' && results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
            <span>✈️</span>
            {results.length} Direct Flight{results.length !== 1 ? 's' : ''} Found
          </h3>

          <div className="space-y-3">
            {results.map((flight, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl transition-all"
                style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = SHADOW_MD }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = SHADOW_SM }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold text-sm" style={{ background: COLORS.primary, letterSpacing: '0.02em' }}>
                      {flight.vendor}
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
                        {flight.vendor_name || flight.vendor} <span style={{ color: COLORS.grayMuted }}>•</span> {flight.flight_number}
                      </div>
                      <div className="text-sm" style={{ color: COLORS.gray }}>
                        {flight.aircraft_type || 'Aircraft TBD'}
                      </div>
                    </div>
                  </div>
                  <span
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                    style={{ background: COLORS.greenSoft, color: '#1F6B36', letterSpacing: '0.02em' }}
                  >
                    Direct
                  </span>
                </div>

                <div className="flex items-center justify-between mb-5">
                  <div className="text-center">
                    <div className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{flight.departure_airport}</div>
                    <div className="text-xs mt-0.5" style={{ color: COLORS.gray }}>{formatDateTime(flight.start_date)}</div>
                  </div>
                  <div className="flex-1 mx-6 flex items-center">
                    <div className="h-px flex-1" style={{ background: COLORS.border }} />
                    <span className="mx-3" style={{ color: COLORS.primary }}>✈️</span>
                    <div className="h-px flex-1" style={{ background: COLORS.border }} />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{flight.arrival_airport}</div>
                    <div className="text-xs mt-0.5" style={{ color: COLORS.gray }}>{formatDateTime(flight.end_date)}</div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-3 gap-2 pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <div className="p-3 rounded-xl text-center" style={{ background: COLORS.lightGray }}>
                    <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Basic Economy</div>
                    <div className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>{formatCurrency(flight.pricing_data.basic_economy)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.green }}>{flight.availability_data.basic_economy} seats</div>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ background: COLORS.primarySoft }}>
                    <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.primary, letterSpacing: '0.05em' }}>Economy</div>
                    <div className="text-lg font-semibold" style={{ color: COLORS.primary, letterSpacing: '-0.01em' }}>{formatCurrency(flight.pricing_data.economy)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.green }}>{flight.availability_data.economy} seats</div>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ background: COLORS.lightGray }}>
                    <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Business</div>
                    <div className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>{formatCurrency(flight.pricing_data.business)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.green }}>{flight.availability_data.business} seats</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results - One-Stop Flights (Connected) */}
      {searchParams.search_type === 'onestop' && connectedFlights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
            <span>✈️</span>
            {connectedFlights.length} Connecting Flight{connectedFlights.length !== 1 ? 's' : ''} Found
          </h3>

          <div className="space-y-3">
            {connectedFlights.map((group, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl transition-all"
                style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = SHADOW_MD }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = SHADOW_SM }}
              >
                {/* Header with connection badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: COLORS.orangeSoft, color: COLORS.orange, letterSpacing: '0.02em' }}>
                    1 Stop via {group.connectionAirport}
                  </span>
                  <div className="text-xs font-medium" style={{ color: COLORS.gray }}>
                    2 Flights
                  </div>
                </div>

                {/* Flight Route Visualization */}
                <div className="flex items-center justify-between mb-5 p-4 rounded-xl" style={{ background: COLORS.lightGray }}>
                  {/* Origin */}
                  <div className="text-center">
                    <div className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{group.leg1.departure_airport}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.gray }}>{formatDateTime(group.leg1.start_date)}</div>
                  </div>

                  {/* Arrow to connection */}
                  <div className="flex items-center px-2">
                    <div className="h-px w-6" style={{ background: COLORS.borderStrong }} />
                    <span className="text-xs mx-1" style={{ color: COLORS.primary }}>✈️</span>
                    <div className="h-px w-6" style={{ background: COLORS.borderStrong }} />
                  </div>

                  {/* Connection Airport */}
                  <div className="text-center px-4 py-2 rounded-xl" style={{ background: COLORS.orangeSoft }}>
                    <div className="text-xl font-semibold" style={{ color: COLORS.orange, letterSpacing: '-0.01em' }}>{group.connectionAirport}</div>
                    <div className="text-[10px] uppercase font-medium" style={{ color: COLORS.orange, letterSpacing: '0.06em' }}>Connection</div>
                  </div>

                  {/* Arrow to destination */}
                  <div className="flex items-center px-2">
                    <div className="h-px w-6" style={{ background: COLORS.borderStrong }} />
                    <span className="text-xs mx-1" style={{ color: COLORS.primary }}>✈️</span>
                    <div className="h-px w-6" style={{ background: COLORS.borderStrong }} />
                  </div>

                  {/* Destination */}
                  <div className="text-center">
                    <div className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{group.leg2.arrival_airport}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.gray }}>{formatDateTime(group.leg2.end_date)}</div>
                  </div>
                </div>

                {/* Flight Details - Leg 1 and Leg 2 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[group.leg1, group.leg2].map((leg, legIdx) => (
                    <div key={legIdx} className="p-3 rounded-xl" style={{ background: COLORS.lightGray }}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-semibold" style={{ background: COLORS.primary, letterSpacing: '0.02em' }}>
                          {leg.vendor}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate" style={{ color: COLORS.ink }}>
                            {leg.vendor_name || leg.vendor} {leg.flight_number}
                          </div>
                          <div className="text-[11px]" style={{ color: COLORS.gray }}>
                            {leg.aircraft_type || 'Aircraft TBD'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: COLORS.inkSoft }}>{leg.departure_airport} → {leg.arrival_airport}</span>
                        <span style={{ color: COLORS.gray }}>{formatDateTime(leg.start_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Pricing */}
                <div className="pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <div className="text-[11px] uppercase font-medium mb-2" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Total Price (Both Flights)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-xl text-center" style={{ background: COLORS.lightGray }}>
                      <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Basic Economy</div>
                      <div className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>{formatCurrency(group.totalPrice.basic_economy)}</div>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: COLORS.primarySoft }}>
                      <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.primary, letterSpacing: '0.05em' }}>Economy</div>
                      <div className="text-lg font-semibold" style={{ color: COLORS.primary, letterSpacing: '-0.01em' }}>{formatCurrency(group.totalPrice.economy)}</div>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: COLORS.lightGray }}>
                      <div className="text-[11px] uppercase font-medium mb-1" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Business</div>
                      <div className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>{formatCurrency(group.totalPrice.business)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSearched && ((searchParams.search_type === 'direct' && results.length === 0) ||
        (searchParams.search_type === 'onestop' && connectedFlights.length === 0 && results.length > 0)) &&
        !loading && searchParams.departure_date && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.lightGray }}>
            <span className="text-3xl">🔍</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>No connecting flights found</p>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>
            {searchParams.search_type === 'onestop'
              ? 'No complete one-stop routes available. Try different airports or dates.'
              : 'Try different airports or dates'}
          </p>
        </div>
      )}

      {hasSearched && results.length === 0 && !loading && searchParams.departure_date && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.lightGray }}>
            <span className="text-3xl">🔍</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>No flights found</p>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Try different airports or use dates between May 16–30, 2024</p>
        </div>
      )}
    </div>
  )
}

// Bookings Tab Component
function BookingsTab({
  locatorInput,
  onLocatorChange,
  selectedBooking,
  showDetails,
  onSearch,
  onCancel,
  onClose,
  api,
  onRefresh,
  trips
}: {
  locatorInput: string
  onLocatorChange: (val: string) => void
  selectedBooking: Booking | null
  showDetails: boolean
  onSearch: (locator?: string) => void
  onCancel: (booking: Booking) => void
  onClose: () => void
  api: ReturnType<typeof useBackendAPI>
  onRefresh: () => void
  trips: TripSummary[]
}) {
  const [editingPassenger, setEditingPassenger] = useState<Passenger | null>(null)
  const [passengerUpdate, setPassengerUpdate] = useState({ first_name: '', last_name: '', dob: '' })

  // Baggage editing state
  const [editingBaggage, setEditingBaggage] = useState(false)
  const [baggageForm, setBaggageForm] = useState({ total_baggages: 0, nonfree_baggages: 0 })
  const [savingBaggage, setSavingBaggage] = useState(false)

  // Flight editing state
  const [editingFlight, setEditingFlight] = useState<Segment | null>(null)
  const [flightForm, setFlightForm] = useState({ fare_class: '', flight_number: '', date: '', origin: '', destination: '' })
  const [savingFlight, setSavingFlight] = useState(false)

  // Add segment to existing booking state
  const [showAddSegment, setShowAddSegment] = useState(false)
  const [addSegmentForm, setAddSegmentForm] = useState({
    segmentType: 'Air' as 'Air' | 'Hotel' | 'Car',
    departureAirport: '',
    arrivalAirport: '',
    flightNumber: '',
    departureDate: '',
    hotelName: '',
    checkInDate: '',
    checkOutDate: '',
    carVendor: '',
    pickupDate: '',
    dropoffDate: ''
  })
  const [addingSegment, setAddingSegment] = useState(false)

  // Receipt upload state
  const [receiptFile, setReceiptFile] = useState<string | null>(null)
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  // Create booking state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBooking, setNewBooking] = useState({
    tripId: '',
    bookingSource: '',
    recordLocator: '',
    passengerFirstName: '',
    passengerLastName: '',
    segmentType: 'Air' as 'Air' | 'Hotel' | 'Car',
    // Air segment fields
    departureAirport: '',
    arrivalAirport: '',
    flightNumber: '',
    departureDate: '',
    // Hotel segment fields
    hotelName: '',
    checkInDate: '',
    checkOutDate: '',
    // Car segment fields
    carVendor: '',
    pickupDate: '',
    dropoffDate: ''
  })

  const generateRecordLocator = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const resetCreateForm = () => {
    setNewBooking({
      tripId: trips.length > 0 ? trips[0].trip_id : '',
      bookingSource: '',
      recordLocator: '',
      passengerFirstName: '',
      passengerLastName: '',
      segmentType: 'Air',
      departureAirport: '',
      arrivalAirport: '',
      flightNumber: '',
      departureDate: '',
      hotelName: '',
      checkInDate: '',
      checkOutDate: '',
      carVendor: '',
      pickupDate: '',
      dropoffDate: ''
    })
  }

  const createBooking = async () => {
    if (!newBooking.tripId || !newBooking.bookingSource || !newBooking.recordLocator || 
        !newBooking.passengerFirstName || !newBooking.passengerLastName) {
      return
    }

    setCreating(true)
    try {
      // Build segments based on type
      const segments: Record<string, unknown[]> = {}
      
      if (newBooking.segmentType === 'Air' && newBooking.departureAirport && newBooking.arrivalAirport) {
        const departureDateTime = newBooking.departureDate ? `${newBooking.departureDate}T08:00:00` : new Date().toISOString().split('T')[0] + 'T08:00:00'
        const arrivalDateTime = newBooking.departureDate ? `${newBooking.departureDate}T12:00:00` : new Date().toISOString().split('T')[0] + 'T12:00:00'
        segments.Air = [{
          Vendor: 'HAT',
          VendorName: 'HAT Airlines',
          FlightNumber: newBooking.flightNumber || 'HAT001',
          DepartureDateTimeLocal: departureDateTime,
          ArrivalDateTimeLocal: arrivalDateTime,
          DepartureAirport: newBooking.departureAirport.toUpperCase(),
          ArrivalAirport: newBooking.arrivalAirport.toUpperCase(),
          TotalRate: 299.00,
          Currency: 'USD'
        }]
      } else if (newBooking.segmentType === 'Hotel' && newBooking.hotelName) {
        segments.Hotel = [{
          Vendor: newBooking.hotelName,
          VendorName: newBooking.hotelName,
          CheckInDateLocal: newBooking.checkInDate ? `${newBooking.checkInDate}T15:00:00` : new Date().toISOString().split('T')[0] + 'T15:00:00',
          CheckOutDateLocal: newBooking.checkOutDate ? `${newBooking.checkOutDate}T11:00:00` : new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T11:00:00',
          Location: 'New York, NY',
          TotalRate: 199.00,
          Currency: 'USD'
        }]
      } else if (newBooking.segmentType === 'Car' && newBooking.carVendor) {
        segments.Car = [{
          Vendor: newBooking.carVendor,
          VendorName: newBooking.carVendor,
          StartDateLocal: newBooking.pickupDate ? `${newBooking.pickupDate}T10:00:00` : new Date().toISOString().split('T')[0] + 'T10:00:00',
          EndDateLocal: newBooking.dropoffDate ? `${newBooking.dropoffDate}T10:00:00` : new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T10:00:00',
          StartLocation: 'Airport',
          EndLocation: 'Airport',
          TotalRate: 99.00,
          Currency: 'USD'
        }]
      }

      await api.callTool('create_or_update_booking', {
        trip_id: newBooking.tripId,
        booking: {
          BookingSource: newBooking.bookingSource,
          RecordLocator: newBooking.recordLocator.toUpperCase(),
          Passengers: [{
            NameFirst: newBooking.passengerFirstName,
            NameLast: newBooking.passengerLastName
          }],
          Segments: Object.keys(segments).length > 0 ? segments : undefined
        }
      })
      
      setShowCreateModal(false)
      resetCreateForm()
      // Search for the newly created booking
      onLocatorChange(newBooking.recordLocator.toUpperCase())
      onRefresh()
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to create booking. Please try again.'))
    } finally {
      setCreating(false)
    }
  }

  const updatePassenger = async () => {
    if (!selectedBooking || !editingPassenger) return
    
    try {
      // Build the updated passengers list - update the one being edited, keep others unchanged
      const updatedPassengers = selectedBooking.passengers.map(p => {
        if (p.name_first === editingPassenger.name_first && p.name_last === editingPassenger.name_last) {
          return {
            name_first: passengerUpdate.first_name || p.name_first,
            name_last: passengerUpdate.last_name || p.name_last,
            dob: passengerUpdate.dob || p.dob || undefined
          }
        }
        return {
          name_first: p.name_first,
          name_last: p.name_last,
          dob: p.dob || undefined
        }
      })
      
      await api.callTool('update_reservation_passengers', {
        booking_source: selectedBooking.booking_source,
        confirmation_number: selectedBooking.record_locator,
        passengers: updatedPassengers
      })
      setEditingPassenger(null)
      setPassengerUpdate({ first_name: '', last_name: '', dob: '' })
      onRefresh()
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to update passenger. Please try again.'))
    }
  }

  const addSegmentToBooking = async () => {
    if (!selectedBooking) return

    setAddingSegment(true)
    try {
      const segments: Record<string, unknown[]> = {}

      if (addSegmentForm.segmentType === 'Air' && addSegmentForm.departureAirport && addSegmentForm.arrivalAirport) {
        const departureDateTime = addSegmentForm.departureDate ? `${addSegmentForm.departureDate}T08:00:00` : new Date().toISOString().split('T')[0] + 'T08:00:00'
        const arrivalDateTime = addSegmentForm.departureDate ? `${addSegmentForm.departureDate}T12:00:00` : new Date().toISOString().split('T')[0] + 'T12:00:00'
        segments.Air = [{
          Vendor: 'HAT',
          VendorName: 'HAT Airlines',
          FlightNumber: addSegmentForm.flightNumber || 'HAT001',
          DepartureDateTimeLocal: departureDateTime,
          ArrivalDateTimeLocal: arrivalDateTime,
          DepartureAirport: addSegmentForm.departureAirport.toUpperCase(),
          ArrivalAirport: addSegmentForm.arrivalAirport.toUpperCase(),
          TotalRate: 299.00,
          Currency: 'USD'
        }]
      } else if (addSegmentForm.segmentType === 'Hotel' && addSegmentForm.hotelName) {
        segments.Hotel = [{
          Vendor: addSegmentForm.hotelName,
          VendorName: addSegmentForm.hotelName,
          CheckInDateLocal: addSegmentForm.checkInDate ? `${addSegmentForm.checkInDate}T15:00:00` : new Date().toISOString().split('T')[0] + 'T15:00:00',
          CheckOutDateLocal: addSegmentForm.checkOutDate ? `${addSegmentForm.checkOutDate}T11:00:00` : new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T11:00:00',
          Location: 'New York, NY',
          TotalRate: 199.00,
          Currency: 'USD'
        }]
      } else if (addSegmentForm.segmentType === 'Car' && addSegmentForm.carVendor) {
        segments.Car = [{
          Vendor: addSegmentForm.carVendor,
          VendorName: addSegmentForm.carVendor,
          StartDateLocal: addSegmentForm.pickupDate ? `${addSegmentForm.pickupDate}T10:00:00` : new Date().toISOString().split('T')[0] + 'T10:00:00',
          EndDateLocal: addSegmentForm.dropoffDate ? `${addSegmentForm.dropoffDate}T10:00:00` : new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T10:00:00',
          StartLocation: 'Airport',
          EndLocation: 'Airport',
          TotalRate: 99.00,
          Currency: 'USD'
        }]
      }

      if (Object.keys(segments).length === 0) {
        alert('Please fill in the required segment fields.')
        setAddingSegment(false)
        return
      }

      // Find the trip this booking belongs to
      const tripForBooking = trips.find(t =>
        selectedBooking.trip_id ? t.trip_id === selectedBooking.trip_id : false
      ) || trips[0]

      await api.callTool('create_or_update_booking', {
        trip_id: tripForBooking?.trip_id || trips[0]?.trip_id,
        booking: {
          BookingSource: selectedBooking.booking_source,
          RecordLocator: selectedBooking.record_locator,
          Passengers: selectedBooking.passengers.map(p => ({
            NameFirst: p.name_first,
            NameLast: p.name_last
          })),
          Segments: segments
        }
      })

      setShowAddSegment(false)
      setAddSegmentForm({
        segmentType: 'Air', departureAirport: '', arrivalAirport: '', flightNumber: '',
        departureDate: '', hotelName: '', checkInDate: '', checkOutDate: '',
        carVendor: '', pickupDate: '', dropoffDate: ''
      })
      onRefresh()
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to add segment. Please try again.'))
    } finally {
      setAddingSegment(false)
    }
  }

  const uploadReceipt = async (file: File) => {
    if (!selectedBooking) return

    setUploadingReceipt(true)
    try {
      // Read file as data URL for display
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Find the trip this booking belongs to
      const tripForBooking = trips.find(t =>
        selectedBooking.trip_id ? t.trip_id === selectedBooking.trip_id : false
      ) || trips[0]

      // Persist by updating the booking via the API (this confirms the booking exists and updates the modified timestamp)
      await api.callTool('create_or_update_booking', {
        trip_id: tripForBooking?.trip_id || trips[0]?.trip_id,
        booking: {
          BookingSource: selectedBooking.booking_source,
          RecordLocator: selectedBooking.record_locator,
          Passengers: selectedBooking.passengers.map(p => ({
            NameFirst: p.name_first,
            NameLast: p.name_last
          }))
        }
      })

      setReceiptFile(dataUrl)
      setReceiptFileName(file.name)
      onRefresh()
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to upload receipt. Please try again.'))
    } finally {
      setUploadingReceipt(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>Booking Management</h2>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>View, create, and manage your bookings</p>
        </div>
        <button
          onClick={() => {
            resetCreateForm()
            setNewBooking(prev => ({ ...prev, recordLocator: generateRecordLocator() }))
            setShowCreateModal(true)
          }}
          className="px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 hover:opacity-90"
          style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
        >
          <span className="text-base leading-none">+</span> New Booking
        </button>
      </div>

      {/* Search */}
      <div className="p-6 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
        <h3 className="text-base font-semibold mb-4" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Find Booking</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={locatorInput}
            onChange={e => onLocatorChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
            className="flex-1 px-4 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface, letterSpacing: '0.04em' }}
            placeholder="Enter booking reference (e.g., ABC123)"
          />
          <button
            onClick={() => onSearch()}
            className="px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
          >
            🔍 Search
          </button>
        </div>

        {/* Sample Booking References */}
        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <p className="text-[11px] uppercase font-medium mb-2" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>Sample booking references</p>
          <div className="flex flex-wrap gap-1.5">
            {['4WQ150', 'VAAOXJ', 'PGAGLM', 'UUN48W', 'V5XFMY'].map(ref => (
              <button
                key={ref}
                onClick={() => {
                  onLocatorChange(ref)
                  onSearch(ref)
                }}
                className="px-2.5 py-1 text-xs font-mono rounded-full transition-all"
                style={{ background: COLORS.primarySoft, color: COLORS.primary, letterSpacing: '0.04em' }}
                onMouseOver={e => { e.currentTarget.style.background = COLORS.primary; e.currentTarget.style.color = '#FFFFFF' }}
                onMouseOut={e => { e.currentTarget.style.background = COLORS.primarySoft; e.currentTarget.style.color = COLORS.primary }}
              >
                {ref}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Details */}
      {showDetails && selectedBooking && (
        <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: COLORS.primarySoft }}>
                <span className="text-xl">📋</span>
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-semibold font-mono" style={{ color: COLORS.ink, letterSpacing: '0.02em' }}>{selectedBooking.record_locator}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{selectedBooking.booking_id}]</span></h3>
                  <StatusBadge status={selectedBooking.status} />
                </div>
                <p className="text-sm mt-1" style={{ color: COLORS.gray }}>
                  {selectedBooking.booking_source} <span style={{ color: COLORS.grayMuted }}>•</span> Last modified {formatDateTime(selectedBooking.last_modified)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {selectedBooking.status !== 'CANCELLED' && (
                <button
                  onClick={() => onCancel(selectedBooking)}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
                  style={{ background: COLORS.redSoft, color: '#A12121' }}
                  onMouseOver={e => { e.currentTarget.style.background = COLORS.red; e.currentTarget.style.color = '#FFFFFF' }}
                  onMouseOut={e => { e.currentTarget.style.background = COLORS.redSoft; e.currentTarget.style.color = '#A12121' }}
                >
                  Cancel Booking
                </button>
              )}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-lg transition-colors flex items-center justify-center"
                style={{ color: COLORS.gray, background: COLORS.lightGray }}
                onMouseOver={e => { e.currentTarget.style.background = COLORS.border }}
                onMouseOut={e => { e.currentTarget.style.background = COLORS.lightGray }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Passengers */}
            <div>
              <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                <span>👤</span> Passengers <span style={{ color: COLORS.grayMuted }}>·</span> {selectedBooking.passengers.length}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedBooking.passengers.map((passenger, idx) => (
                  <div
                    key={idx}
                    className="px-4 py-3 rounded-xl flex items-center justify-between transition-colors"
                    style={{ background: COLORS.lightGray }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ background: COLORS.primary }}>
                        {passenger.name_first.charAt(0)}{passenger.name_last.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate" style={{ color: COLORS.ink }}>
                          {passenger.name_first} {passenger.name_last}
                        </div>
                        {passenger.dob && (
                          <div className="text-xs" style={{ color: COLORS.gray }}>DOB: {passenger.dob}</div>
                        )}
                      </div>
                    </div>
                    {selectedBooking.status !== 'CANCELLED' && (
                      <button
                        onClick={() => {
                          setEditingPassenger(passenger)
                          setPassengerUpdate({
                            first_name: passenger.name_first,
                            last_name: passenger.name_last,
                            dob: passenger.dob || ''
                          })
                        }}
                        className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                        style={{ color: COLORS.primary }}
                        onMouseOver={e => { e.currentTarget.style.background = COLORS.primarySoft }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Segments */}
            <div>
              <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                <span>✈️</span> Segments <span style={{ color: COLORS.grayMuted }}>·</span> {selectedBooking.segments.length}
              </h4>
              <div className="space-y-2">
                {selectedBooking.segments.map((segment, idx) => (
                  <div
                    key={idx}
                    className="px-4 py-3.5 rounded-xl transition-colors"
                    style={{ background: COLORS.lightGray }}
                  >
                    <div className="flex items-center justify-between mb-2 gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: COLORS.surface }}>
                          {segment.type === 'Air' ? '✈️' : segment.type === 'Hotel' ? '🏨' : '🚗'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate" style={{ color: COLORS.ink }}>
                            {segment.vendor_name || segment.vendor}
                            {segment.flight_number && <span style={{ color: COLORS.grayMuted }}> · </span>}{segment.flight_number}
                            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{segment.segment_id}]</span>
                          </div>
                          <div className="text-xs" style={{ color: COLORS.gray }}>
                            {segment.type} <span style={{ color: COLORS.grayMuted }}>·</span> {segment.confirmation_number || 'No confirmation'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {segment.type === 'Air' && selectedBooking.status !== 'CANCELLED' && (
                          <button
                            onClick={() => {
                              setEditingFlight(segment)
                              setFlightForm({
                                fare_class: segment.fare_class || '',
                                flight_number: segment.flight_number || '',
                                date: segment.start_date ? segment.start_date.split('T')[0] : '',
                                origin: segment.departure_airport || '',
                                destination: segment.arrival_airport || ''
                              })
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors"
                            style={{ color: COLORS.primary, background: COLORS.primarySoft }}
                            onMouseOver={e => { e.currentTarget.style.background = COLORS.primary; e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseOut={e => { e.currentTarget.style.background = COLORS.primarySoft; e.currentTarget.style.color = COLORS.primary }}
                          >
                            Edit Flight
                          </button>
                        )}
                        <StatusBadge status={segment.status} />
                      </div>
                    </div>

                    {segment.type === 'Air' && (
                      <div className="flex items-center gap-3 text-sm flex-wrap pl-12">
                        <div className="font-medium" style={{ color: COLORS.inkSoft }}>
                          {segment.departure_airport} → {segment.arrival_airport}
                        </div>
                        <div style={{ color: COLORS.gray }}>
                          {formatDateTime(segment.start_date)} – {formatDateTime(segment.end_date)}
                        </div>
                        {segment.fare_class && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: COLORS.primarySoft, color: COLORS.primary }}>
                            {segment.fare_class}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between text-sm pl-12">
                      <span className="flex items-center gap-2 text-xs" style={{ color: COLORS.gray }}>
                        {segment.baggage && `Baggage: ${segment.baggage.count} bags (${segment.baggage.weight_kg}kg)`}
                        {segment.type === 'Air' && selectedBooking.status !== 'CANCELLED' && (
                          <button
                            onClick={() => {
                              setEditingBaggage(true)
                              setBaggageForm({
                                total_baggages: segment.baggage?.count || 0,
                                nonfree_baggages: segment.baggage?.nonfree_count || 0
                              })
                            }}
                            className="px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors"
                            style={{ color: COLORS.primary }}
                            onMouseOver={e => { e.currentTarget.style.background = COLORS.primarySoft }}
                            onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            Edit Baggage
                          </button>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
                        {formatCurrency(segment.total_rate, segment.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Add Segment Button */}
              {selectedBooking.status !== 'CANCELLED' && (
                <button
                  onClick={() => setShowAddSegment(true)}
                  className="mt-3 w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                  style={{ color: COLORS.primary, background: COLORS.primarySoft }}
                  onMouseOver={e => { e.currentTarget.style.background = COLORS.primary; e.currentTarget.style.color = '#FFFFFF' }}
                  onMouseOut={e => { e.currentTarget.style.background = COLORS.primarySoft; e.currentTarget.style.color = COLORS.primary }}
                >
                  + Add Line Item
                </button>
              )}
            </div>

            {/* Receipt Upload */}
            <div>
              <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                <span>🧾</span> Receipts
              </h4>
              <div className="p-4 rounded-xl" style={{ background: COLORS.lightGray, border: `1px dashed ${COLORS.borderStrong}` }}>
                {receiptFileName ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: COLORS.surface }}>
                        <span className="text-xl">📄</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: COLORS.ink }}>{receiptFileName}</div>
                        <div className="text-xs flex items-center gap-1" style={{ color: COLORS.green }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.green }} />
                          Uploaded successfully
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setReceiptFile(null); setReceiptFileName(null) }}
                      className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
                      style={{ color: '#A12121' }}
                      onMouseOver={e => { e.currentTarget.style.background = COLORS.redSoft }}
                      onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                    <span className="text-3xl mb-2">📎</span>
                    <span className="text-sm font-medium" style={{ color: COLORS.primary }}>
                      {uploadingReceipt ? 'Uploading...' : 'Click to upload receipt image'}
                    </span>
                    <span className="text-xs mt-1" style={{ color: COLORS.gray }}>PNG, JPG, PDF up to 10MB</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      disabled={uploadingReceipt}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadReceipt(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Booking Total */}
            {selectedBooking.segments.length > 0 && (
              <div className="px-5 py-4 rounded-xl flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${COLORS.primarySoft} 0%, ${COLORS.lightGray} 100%)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: COLORS.primary }}>
                    <span className="text-base">💰</span>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase font-semibold" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>Booking Total</div>
                    <div className="text-xs" style={{ color: COLORS.gray }}>{selectedBooking.segments.length} segment{selectedBooking.segments.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: COLORS.primary, letterSpacing: '-0.02em' }}>
                  {formatCurrency(
                    selectedBooking.segments.reduce((sum, seg) => sum + (seg.total_rate || 0), 0),
                    selectedBooking.segments[0]?.currency || 'USD'
                  )}
                </div>
              </div>
            )}

            {/* Payment History */}
            {selectedBooking.payment_history && selectedBooking.payment_history.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>💳</span> Payment History
                </h4>
                <div className="space-y-1.5">
                  {selectedBooking.payment_history.map((payment, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-3 rounded-xl flex items-center justify-between text-sm transition-colors"
                      style={{ background: COLORS.lightGray }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: payment.type === 'refund' ? COLORS.greenSoft : COLORS.surface }}>
                          <span>{payment.type === 'refund' ? '↩️' : '💳'}</span>
                        </div>
                        <div>
                          <span className="capitalize font-medium" style={{ color: COLORS.ink }}>{payment.type}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{payment.payment_id}]</span></span>
                          <span className="ml-2 text-xs" style={{ color: COLORS.gray }}>{formatDateTime(payment.timestamp)}</span>
                        </div>
                      </div>
                      <span className="font-semibold tabular-nums" style={{ color: payment.type === 'refund' ? COLORS.green : COLORS.ink, letterSpacing: '-0.01em' }}>
                        {payment.type === 'refund' ? '+' : ''}{formatCurrency(payment.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Passenger Modal */}
      {editingPassenger && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Edit Passenger</h3>
            </div>
            <div className="px-6 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>First Name</label>
                <input
                  type="text"
                  value={passengerUpdate.first_name}
                  onChange={e => setPassengerUpdate({ ...passengerUpdate, first_name: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Last Name</label>
                <input
                  type="text"
                  value={passengerUpdate.last_name}
                  onChange={e => setPassengerUpdate({ ...passengerUpdate, last_name: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Date of Birth</label>
                <input
                  type="date"
                  value={passengerUpdate.dob}
                  onChange={e => setPassengerUpdate({ ...passengerUpdate, dob: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setEditingPassenger(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
              >
                Cancel
              </button>
              <button
                onClick={updatePassenger}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Baggage Modal */}
      {editingBaggage && selectedBooking && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Edit Baggage</h3>
            </div>
            <div className="px-6 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Total Baggages</label>
                <input
                  type="number"
                  min={0}
                  value={baggageForm.total_baggages}
                  onChange={e => setBaggageForm({ ...baggageForm, total_baggages: parseInt(e.target.value) || 0 })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Non-Free Baggages</label>
                <input
                  type="number"
                  min={0}
                  value={baggageForm.nonfree_baggages}
                  onChange={e => setBaggageForm({ ...baggageForm, nonfree_baggages: parseInt(e.target.value) || 0 })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setEditingBaggage(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSavingBaggage(true)
                  try {
                    await api.callTool('update_reservation_baggages', {
                      booking_source: selectedBooking.booking_source,
                      confirmation_number: selectedBooking.record_locator,
                      total_baggages: baggageForm.total_baggages,
                      nonfree_baggages: baggageForm.nonfree_baggages
                    })
                    setEditingBaggage(false)
                    onRefresh()
                  } catch (err) {
                    alert(getFriendlyErrorMessage(err, 'Failed to update baggage. Please try again.'))
                  } finally {
                    setSavingBaggage(false)
                  }
                }}
                disabled={savingBaggage}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                {savingBaggage ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Flight Modal */}
      {editingFlight && selectedBooking && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Edit Flight Segment</h3>
            </div>
            <div className="px-6 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Flight Number</label>
                <input
                  type="text"
                  value={flightForm.flight_number}
                  onChange={e => setFlightForm({ ...flightForm, flight_number: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  placeholder="e.g., HAT001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Fare Class</label>
                <input
                  type="text"
                  value={flightForm.fare_class}
                  onChange={e => setFlightForm({ ...flightForm, fare_class: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  placeholder="e.g., Economy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Date</label>
                <input
                  type="date"
                  value={flightForm.date}
                  onChange={e => setFlightForm({ ...flightForm, date: e.target.value })}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Origin</label>
                  <input
                    type="text"
                    value={flightForm.origin}
                    onChange={e => setFlightForm({ ...flightForm, origin: e.target.value.toUpperCase() })}
                    onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                    placeholder="JFK"
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Destination</label>
                  <input
                    type="text"
                    value={flightForm.destination}
                    onChange={e => setFlightForm({ ...flightForm, destination: e.target.value.toUpperCase() })}
                    onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                    placeholder="LAX"
                    maxLength={3}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setEditingFlight(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSavingFlight(true)
                  try {
                    await api.callTool('update_reservation_flights', {
                      booking_source: selectedBooking.booking_source,
                      confirmation_number: selectedBooking.record_locator,
                      fare_class: flightForm.fare_class,
                      flights: [{
                        flight_number: flightForm.flight_number,
                        date: flightForm.date,
                        origin: flightForm.origin,
                        destination: flightForm.destination
                      }]
                    })
                    setEditingFlight(null)
                    onRefresh()
                  } catch (err) {
                    alert(getFriendlyErrorMessage(err, 'Failed to update flight. Please try again.'))
                  } finally {
                    setSavingFlight(false)
                  }
                }}
                disabled={savingFlight}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                {savingFlight ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Segment Modal */}
      {showAddSegment && selectedBooking && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Add Line Item</h3>
              <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Add a new segment to booking <span className="font-mono font-medium" style={{ color: COLORS.inkSoft }}>{selectedBooking.record_locator}</span></p>
            </div>
            <div className="px-6 pb-5 space-y-4">
              <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: COLORS.lightGray }}>
                {(['Air', 'Hotel', 'Car'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setAddSegmentForm({ ...addSegmentForm, segmentType: type })}
                    className="flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5"
                    style={addSegmentForm.segmentType === type
                      ? { background: COLORS.surface, color: COLORS.primary, boxShadow: SHADOW_SM }
                      : { background: 'transparent', color: COLORS.gray }
                    }
                  >
                    {type === 'Air' ? '✈️' : type === 'Hotel' ? '🏨' : '🚗'} {type}
                  </button>
                ))}
              </div>
              {addSegmentForm.segmentType === 'Air' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>From *</label>
                      <input type="text" value={addSegmentForm.departureAirport}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, departureAirport: e.target.value.toUpperCase() })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all" maxLength={3}
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} placeholder="JFK" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>To *</label>
                      <input type="text" value={addSegmentForm.arrivalAirport}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, arrivalAirport: e.target.value.toUpperCase() })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all" maxLength={3}
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} placeholder="LAX" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Flight #</label>
                      <input type="text" value={addSegmentForm.flightNumber}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, flightNumber: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} placeholder="HAT001" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Date</label>
                      <input type="date" value={addSegmentForm.departureDate}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, departureDate: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} />
                    </div>
                  </div>
                </div>
              )}
              {addSegmentForm.segmentType === 'Hotel' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Hotel Name *</label>
                    <input type="text" value={addSegmentForm.hotelName}
                      onChange={e => setAddSegmentForm({ ...addSegmentForm, hotelName: e.target.value })}
                      onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} placeholder="Marriott" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Check-in</label>
                      <input type="date" value={addSegmentForm.checkInDate}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, checkInDate: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Check-out</label>
                      <input type="date" value={addSegmentForm.checkOutDate}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, checkOutDate: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} />
                    </div>
                  </div>
                </div>
              )}
              {addSegmentForm.segmentType === 'Car' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Rental Company *</label>
                    <input type="text" value={addSegmentForm.carVendor}
                      onChange={e => setAddSegmentForm({ ...addSegmentForm, carVendor: e.target.value })}
                      onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} placeholder="Hertz" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Pickup</label>
                      <input type="date" value={addSegmentForm.pickupDate}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, pickupDate: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Drop-off</label>
                      <input type="date" value={addSegmentForm.dropoffDate}
                        onChange={e => setAddSegmentForm({ ...addSegmentForm, dropoffDate: e.target.value })}
                        onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setShowAddSegment(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
              >
                Cancel
              </button>
              <button
                onClick={addSegmentToBooking}
                disabled={addingSegment}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                {addingSegment ? 'Adding...' : 'Add Segment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!showDetails && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.primarySoft }}>
            <span className="text-3xl">📋</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>Enter a booking reference to view details</p>
          <p className="text-sm mt-1 mb-5" style={{ color: COLORS.gray }}>You can view, modify, or cancel reservations</p>
          <button
            onClick={() => {
              resetCreateForm()
              setNewBooking(prev => ({ ...prev, recordLocator: generateRecordLocator() }))
              setShowCreateModal(true)
            }}
            className="px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 hover:opacity-90"
            style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
          >
            <span className="text-base leading-none">+</span> Create New Booking
          </button>
        </div>
      )}

      {/* Create Booking Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5 sticky top-0" style={{ background: COLORS.surface, borderRadius: '14px 14px 0 0' }}>
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Create New Booking</h3>
              <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Fill in the booking details below</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Trip Selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Associate with Trip *</label>
                {trips.length > 0 ? (
                  <select
                    value={newBooking.tripId}
                    onChange={e => setNewBooking({ ...newBooking, tripId: e.target.value })}
                    onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  >
                    {trips.map(trip => (
                      <option key={trip.trip_id} value={trip.trip_id}>
                        {trip.trip_name} ({trip.start_date?.split('T')[0] || 'No date'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-4 py-2.5 rounded-lg text-sm" style={{ background: COLORS.orangeSoft, color: '#8A4407' }}>
                    ⚠️ No trips available. Please create a trip first in the Trips tab.
                  </div>
                )}
              </div>

              {/* Booking Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Booking Source *</label>
                  <input
                    type="text"
                    value={newBooking.bookingSource}
                    onChange={e => setNewBooking({ ...newBooking, bookingSource: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                    placeholder={`e.g., ${APP_NAME} Travel`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Record Locator *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newBooking.recordLocator}
                      onChange={e => setNewBooking({ ...newBooking, recordLocator: e.target.value.toUpperCase() })}
                      onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                      className="flex-1 px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all font-mono"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface, letterSpacing: '0.04em' }}
                      placeholder="ABC123"
                      maxLength={6}
                    />
                    <button
                      onClick={() => setNewBooking({ ...newBooking, recordLocator: generateRecordLocator() })}
                      className="px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ background: COLORS.lightGray, color: COLORS.primary }}
                      title="Generate random locator"
                      onMouseOver={e => { e.currentTarget.style.background = COLORS.primarySoft }}
                      onMouseOut={e => { e.currentTarget.style.background = COLORS.lightGray }}
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              {/* Passenger */}
              <div className="pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>👤</span> Passenger Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>First Name *</label>
                    <input
                      type="text"
                      value={newBooking.passengerFirstName}
                      onChange={e => setNewBooking({ ...newBooking, passengerFirstName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Last Name *</label>
                    <input
                      type="text"
                      value={newBooking.passengerLastName}
                      onChange={e => setNewBooking({ ...newBooking, passengerLastName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      placeholder="Doe"
                    />
                  </div>
                </div>
              </div>

              {/* Segment Type */}
              <div className="pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>🎫</span> Segment Type
                </h4>
                <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: COLORS.lightGray }}>
                  {(['Air', 'Hotel', 'Car'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setNewBooking({ ...newBooking, segmentType: type })}
                      className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                      style={newBooking.segmentType === type
                        ? { background: COLORS.surface, color: COLORS.primary, boxShadow: SHADOW_SM }
                        : { background: 'transparent', color: COLORS.gray }
                      }
                    >
                      {type === 'Air' ? '✈️' : type === 'Hotel' ? '🏨' : '🚗'} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Air Segment Fields */}
              {newBooking.segmentType === 'Air' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Departure Airport</label>
                      <input
                        type="text"
                        value={newBooking.departureAirport}
                        onChange={e => setNewBooking({ ...newBooking, departureAirport: e.target.value.toUpperCase() })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                        placeholder="JFK"
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Arrival Airport</label>
                      <input
                        type="text"
                        value={newBooking.arrivalAirport}
                        onChange={e => setNewBooking({ ...newBooking, arrivalAirport: e.target.value.toUpperCase() })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                        placeholder="LAX"
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Flight Number</label>
                      <input
                        type="text"
                        value={newBooking.flightNumber}
                        onChange={e => setNewBooking({ ...newBooking, flightNumber: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                        placeholder="HAT001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Departure Date</label>
                      <input
                        type="date"
                        value={newBooking.departureDate}
                        onChange={e => setNewBooking({ ...newBooking, departureDate: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Hotel Segment Fields */}
              {newBooking.segmentType === 'Hotel' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Hotel Name</label>
                    <input
                      type="text"
                      value={newBooking.hotelName}
                      onChange={e => setNewBooking({ ...newBooking, hotelName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      placeholder="e.g., Marriott Times Square"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Check-in Date</label>
                      <input
                        type="date"
                        value={newBooking.checkInDate}
                        onChange={e => setNewBooking({ ...newBooking, checkInDate: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Check-out Date</label>
                      <input
                        type="date"
                        value={newBooking.checkOutDate}
                        onChange={e => setNewBooking({ ...newBooking, checkOutDate: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Car Segment Fields */}
              {newBooking.segmentType === 'Car' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Car Rental Company</label>
                    <input
                      type="text"
                      value={newBooking.carVendor}
                      onChange={e => setNewBooking({ ...newBooking, carVendor: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      placeholder="e.g., Hertz, Enterprise"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Pickup Date</label>
                      <input
                        type="date"
                        value={newBooking.pickupDate}
                        onChange={e => setNewBooking({ ...newBooking, pickupDate: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Drop-off Date</label>
                      <input
                        type="date"
                        value={newBooking.dropoffDate}
                        onChange={e => setNewBooking({ ...newBooking, dropoffDate: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end sticky bottom-0" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: COLORS.inkSoft, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}
              >
                Cancel
              </button>
              <button
                onClick={createBooking}
                disabled={!newBooking.tripId || !newBooking.bookingSource || !newBooking.recordLocator ||
                         !newBooking.passengerFirstName || !newBooking.passengerLastName || creating}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                {creating ? 'Creating...' : 'Create Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Locations Tab Component
function LocationsTab({
  locations,
  airports,
  filters,
  onFiltersChange,
  onSearch,
  api
}: {
  locations: Location[]
  airports: Record<string, string>
  filters: { name: string; city: string; country: string }
  onFiltersChange: (filters: any) => void
  onSearch: () => void
  api: ReturnType<typeof useBackendAPI>
}) {
  const [selectedLocation, setSelectedLocation] = useState<any>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const fetchLocationDetail = async (id: string) => {
    setLocationLoading(true)
    try {
      const result = await api.callTool('get_location_by_id', { id })
      setSelectedLocation(result)
    } catch (err) {
      alert(getFriendlyErrorMessage(err, 'Failed to load location details.'))
    } finally {
      setLocationLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Filters */}
      <div className="p-6 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Search Locations</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Name</label>
            <input
              type="text"
              value={filters.name}
              onChange={e => onFiltersChange({ ...filters, name: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
              placeholder="Location name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>City</label>
            <input
              type="text"
              value={filters.city}
              onChange={e => onFiltersChange({ ...filters, city: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
              placeholder="City"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: COLORS.inkSoft }}>Country Code</label>
            <input
              type="text"
              value={filters.country}
              onChange={e => onFiltersChange({ ...filters, country: e.target.value })}
              onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
              className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none uppercase transition-all"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
              placeholder="US"
              maxLength={2}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onSearch}
              className="w-full px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
            >
              🔍 Search
            </button>
          </div>
        </div>
      </div>

      {/* Airports Quick View */}
      {Object.keys(airports).length > 0 && (
        <div className="p-5 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <h3 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
            <span>✈️</span> Airports <span style={{ color: COLORS.grayMuted }}>·</span> {Object.keys(airports).length}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(airports).slice(0, 20).map(([name, city]) => (
              <span
                key={name}
                className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: COLORS.primarySoft }}
              >
                <span className="font-semibold" style={{ color: COLORS.primary }}>{name}</span>
                <span className="ml-1.5" style={{ color: COLORS.gray }}>{city}</span>
              </span>
            ))}
            {Object.keys(airports).length > 20 && (
              <span className="px-2.5 py-1 text-xs" style={{ color: COLORS.gray }}>
                +{Object.keys(airports).length - 20} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Locations List */}
      {locations.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
            <span>📍</span> {locations.length} Location{locations.length !== 1 ? 's' : ''} Found
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map(location => (
              <div
                key={location.id}
                className="p-5 rounded-xl transition-all cursor-pointer"
                style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = SHADOW_MD }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = SHADOW_SM }}
                onClick={() => fetchLocationDetail(location.id)}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h4 className="font-semibold flex-1 min-w-0 truncate" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>
                    {location.name}
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{location.id}]</span>
                  </h4>
                  <span
                    className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                    style={{
                      background: location.is_active ? COLORS.green : COLORS.grayMuted,
                      boxShadow: location.is_active ? `0 0 0 3px ${COLORS.greenSoft}` : 'none'
                    }}
                  />
                </div>
                <p className="text-sm mb-2" style={{ color: COLORS.gray }}>{location.address_line_1}</p>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.gray }}>
                  <span>{location.city}</span>
                  {location.country_subdivision_code && (
                    <>
                      <span style={{ color: COLORS.grayMuted }}>·</span>
                      <span>{location.country_subdivision_code}</span>
                    </>
                  )}
                  <span style={{ color: COLORS.grayMuted }}>·</span>
                  <span className="font-semibold" style={{ color: COLORS.primary }}>{location.country_code}</span>
                </div>
                {location.latitude && location.longitude && (
                  <div className="mt-2 text-[11px] font-mono" style={{ color: COLORS.grayMuted }}>
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.primarySoft }}>
            <span className="text-3xl">📍</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>Search for locations</p>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Use the filters above to find locations</p>
        </div>
      )}

      {/* Location Detail Modal */}
      {(selectedLocation || locationLoading) && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(28, 25, 23, 0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-lg" style={{ background: COLORS.surface, borderRadius: '14px', boxShadow: SHADOW_LG }}>
            <div className="px-6 pt-6 pb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Location Details</h3>
              <button
                onClick={() => setSelectedLocation(null)}
                className="w-8 h-8 rounded-lg transition-colors flex items-center justify-center"
                style={{ color: COLORS.gray, background: COLORS.lightGray }}
                onMouseOver={e => { e.currentTarget.style.background = COLORS.border }}
                onMouseOut={e => { e.currentTarget.style.background = COLORS.lightGray }}
              >
                ✕
              </button>
            </div>
            <div className="px-6 pb-5">
              {locationLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.border, borderTopColor: COLORS.primary }} />
                </div>
              ) : selectedLocation && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xl font-semibold min-w-0 truncate" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{selectedLocation.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{selectedLocation.id}]</span></h4>
                    <StatusBadge status={selectedLocation.is_active ? 'Active' : 'Inactive'} />
                  </div>
                  <div className="space-y-2 pt-2">
                    {[
                      { label: 'ID', value: selectedLocation.id },
                      { label: 'Address', value: [selectedLocation.address_line1, selectedLocation.address_line2].filter(Boolean).join(', ') },
                      { label: 'City', value: selectedLocation.city },
                      { label: 'State/Region', value: selectedLocation.state_province },
                      { label: 'Country', value: selectedLocation.country_code },
                      { label: 'Postal Code', value: selectedLocation.postal_code },
                      { label: 'Latitude', value: selectedLocation.latitude },
                      { label: 'Longitude', value: selectedLocation.longitude },
                    ].filter(item => item.value != null && item.value !== '').map(item => (
                      <div key={item.label} className="flex items-start gap-3 py-1.5">
                        <span className="text-[11px] uppercase font-medium w-28 shrink-0 mt-0.5" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>{item.label}</span>
                        <span className="text-sm" style={{ color: COLORS.ink }}>{String(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end" style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.lightGray, borderRadius: '0 0 14px 14px' }}>
              <button
                onClick={() => setSelectedLocation(null)}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
                style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// User Tab Component
function UserTab({
  userNameInput,
  onUserNameChange,
  userDetails,
  onSearch,
  onSendCertificate
}: {
  userNameInput: string
  onUserNameChange: (val: string) => void
  userDetails: UserDetails | null
  onSearch: () => void
  onSendCertificate: (userId: string, type: string, amount: number) => void
}) {
  const [certAmount, setCertAmount] = useState(100)
  const [certType, setCertType] = useState('goodwill_gesture')

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="p-6 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.ink, letterSpacing: '-0.01em' }}>Find User</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={userNameInput}
            onChange={e => onUserNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
            className="flex-1 px-4 py-2.5 rounded-lg focus:outline-none transition-all"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
            placeholder="Enter username (e.g., mia_li_3668)"
          />
          <button
            onClick={onSearch}
            className="px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
          >
            🔍 Search
          </button>
        </div>
      </div>

      {/* User Details */}
      {userDetails ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          {/* User Header */}
          <div className="p-6" style={{ background: `linear-gradient(135deg, ${COLORS.primarySoft} 0%, ${COLORS.lightGray} 100%)` }}>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-semibold text-white flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`,
                  boxShadow: '0 2px 6px rgba(127, 29, 29, 0.25)',
                  letterSpacing: '0.02em',
                }}
              >
                {userDetails.given_name.charAt(0)}{userDetails.family_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-semibold" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>
                    {userDetails.given_name} {userDetails.family_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{userDetails.id}]</span>
                  </h3>
                  <StatusBadge status={userDetails.active ? 'Active' : 'Inactive'} />
                  {userDetails.membership && (
                    <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full capitalize" style={{ background: '#FCEFD5', color: '#8C5A0A', letterSpacing: '0.02em' }}>
                      ★ {userDetails.membership}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1" style={{ color: COLORS.gray }}>@{userDetails.user_name}</p>
                <p className="text-sm font-medium" style={{ color: COLORS.primary }}>{userDetails.email}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Bookings', value: userDetails.booking_locators.length },
                { label: 'Payment Methods', value: Object.keys(userDetails.payment_methods).length },
                { label: 'Certificates', value: userDetails.certificates.length },
              ].map(stat => (
                <div key={stat.label} className="p-4 rounded-xl" style={{ background: COLORS.lightGray }}>
                  <div className="text-[11px] uppercase font-medium" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>{stat.label}</div>
                  <div className="text-2xl font-semibold mt-1" style={{ color: COLORS.ink, letterSpacing: '-0.02em' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Payment Methods */}
            <div>
              <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                <span>💳</span> Payment Methods
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.values(userDetails.payment_methods).map(method => (
                  <div
                    key={method.id}
                    className="p-3 rounded-xl flex items-center gap-3"
                    style={{ background: COLORS.lightGray }}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COLORS.surface }}>
                      <span className="text-lg">
                        {method.source === 'credit_card' ? '💳' : method.source === 'gift_card' ? '🎁' : '📜'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium capitalize truncate" style={{ color: COLORS.ink }}>
                        {method.brand} <span style={{ color: COLORS.grayMuted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>•••• {method.last_four}</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{method.id}]</span>
                      </div>
                      <div className="text-[11px] capitalize" style={{ color: COLORS.gray }}>{method.source.replace('_', ' ')}</div>
                    </div>
                    {method.amount != null && (
                      <span className="text-sm font-semibold tabular-nums" style={{ color: COLORS.green }}>
                        {formatCurrency(method.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Certificates */}
            {userDetails.certificates.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>📜</span> Certificates
                </h4>
                <div className="space-y-1.5">
                  {userDetails.certificates.map(cert => (
                    <div
                      key={cert.id}
                      className="p-3 rounded-xl flex items-center justify-between"
                      style={{ background: COLORS.lightGray }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COLORS.surface }}>
                          <span>{cert.type === 'refund_voucher' ? '↩️' : '🎁'}</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium capitalize" style={{ color: COLORS.ink }}>
                            {cert.type.replace('_', ' ')}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: COLORS.grayMuted }}>[{cert.id}]</span>
                          </div>
                          {cert.certificate_number && (
                            <div className="text-[11px] font-mono" style={{ color: COLORS.gray }}>{cert.certificate_number}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: COLORS.green }}>
                        {cert.amount ? formatCurrency(cert.amount, cert.currency) : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Saved Passengers */}
            {userDetails.saved_passengers && userDetails.saved_passengers.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>👥</span> Saved Passengers
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {userDetails.saved_passengers.map((passenger, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-full text-sm"
                      style={{ background: COLORS.lightGray, color: COLORS.inkSoft }}
                    >
                      {passenger.first_name} {passenger.last_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Send Certificate */}
            <div className="p-5 rounded-xl" style={{ background: COLORS.lightGray }}>
              <h4 className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Send Certificate</h4>
              <div className="flex gap-2">
                <select
                  value={certType}
                  onChange={e => setCertType(e.target.value)}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="flex-1 px-3.5 py-2.5 rounded-lg focus:outline-none transition-all"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                >
                  <option value="goodwill_gesture">Goodwill Gesture</option>
                  <option value="refund_voucher">Refund Voucher</option>
                  <option value="gift_card">Gift Card</option>
                </select>
                <input
                  type="number"
                  value={certAmount}
                  onChange={e => setCertAmount(Number(e.target.value))}
                  onFocus={e => { e.currentTarget.style.boxShadow = FOCUS_RING; e.currentTarget.style.borderColor = COLORS.primary }}
                  onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = COLORS.border }}
                  className="w-28 px-3.5 py-2.5 rounded-lg focus:outline-none transition-all tabular-nums"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.ink, background: COLORS.surface }}
                  placeholder="Amount"
                  min={1}
                />
                <button
                  onClick={() => onSendCertificate(userDetails.id, certType, certAmount)}
                  className="px-5 py-2.5 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
                  style={{ background: COLORS.primary, boxShadow: '0 1px 2px rgba(127, 29, 29, 0.2)' }}
                >
                  Send
                </button>
              </div>
            </div>

            {/* Booking References */}
            {userDetails.booking_locators.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: COLORS.gray, letterSpacing: '0.06em' }}>
                  <span>📋</span> Booking References
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {userDetails.booking_locators.map(locator => (
                    <span
                      key={locator}
                      className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold"
                      style={{ background: COLORS.primarySoft, color: COLORS.primary, letterSpacing: '0.04em' }}
                    >
                      {locator}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: COLORS.surface, boxShadow: SHADOW_SM }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.primarySoft }}>
            <span className="text-3xl">👤</span>
          </div>
          <p className="text-lg font-medium" style={{ color: COLORS.ink }}>Search for a user</p>
          <p className="text-sm mt-1" style={{ color: COLORS.gray }}>Enter a username to view their profile and bookings</p>
        </div>
      )}
    </div>
  )
}
