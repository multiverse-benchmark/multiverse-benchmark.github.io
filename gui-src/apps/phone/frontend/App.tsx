import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { requestedSnapshotRecord, requestedSnapshotView, reportMissingSnapshotRecord, clearSnapshotRecord } from '@shared/snapshotNavigation'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

interface Endpoint {
  endpoint_value: string
  endpoint_type?: string
  endpoint_label?: string
}

interface Recipient {
  contact_id?: string
  contact_name?: string
  contact_endpoints?: Endpoint[]
  contact_photo_url?: string
  recipient_type?: 'CONTACT' | 'BUSINESS' | 'DIRECT' | 'VOICEMAIL'
  address?: string
  distance?: string
  confidence_level?: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface Contact {
  resourceName: string
  names?: Array<{
    givenName?: string
    familyName?: string
  }>
  phoneNumbers?: Array<{
    value: string
    type?: string
  }>
  photos?: Array<{ url: string }>
  phone?: {
    contact_photo_url?: string | null
  }
}

interface Business {
  contact_id: string
  contact_name: string
  recipient_type: 'BUSINESS'
  address?: string
  distance?: string | null
  contact_endpoints: Array<{
    endpoint_type: string
    endpoint_value: string
    endpoint_label?: string
  }>
}

interface SpecialContact {
  contact_id: string
  contact_name: string
  recipient_type: 'VOICEMAIL'
  contact_endpoints: Array<{
    endpoint_type: string
    endpoint_value: string
    endpoint_label?: string
  }>
}

// Helper function to get contact display name
const getContactDisplayName = (contact: Contact): string => {
  if (!contact.names || contact.names.length === 0) {
    return 'Unknown'
  }
  const name = contact.names[0]
  const parts: string[] = []
  if (name.givenName) parts.push(name.givenName)
  if (name.familyName) parts.push(name.familyName)
  return parts.length > 0 ? parts.join(' ') : 'Unknown'
}

// Helper function to get contact photo URL (checks both DB structures)
const getContactPhotoUrl = (contact: Contact): string | undefined => {
  // Check phone.contact_photo_url first (PhoneDefaultDB structure)
  if (contact.phone?.contact_photo_url) {
    return contact.phone.contact_photo_url
  }
  // Fallback to photos array (GridwellPeople API structure)
  if (contact.photos?.[0]?.url) {
    return contact.photos[0].url
  }
  return undefined
}

interface CallHistoryItem {
  call_id: string
  recipient_name?: string
  recipient_photo_url?: string | null
  phone_number?: string
  phone_type?: string
  timestamp?: string | number
  status?: string
}

interface VoicemailMessage {
  call_id: string
  timestamp?: string | number
  phone_number?: string
  recipient_name?: string
  status?: string
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
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

type View = 'dialer' | 'contacts' | 'recent' | 'recipient_choice' | 'voicemail'

export default function PhoneApp({ setRefreshHandler }: AppProps) {
  const [currentView, setCurrentView] = useState<View>(() => requestedSnapshotRecord('phone') || requestedSnapshotView('phone') === 'recent' ? 'recent' : 'dialer')
  const [focusedCallId, setFocusedCallId] = useState(() => requestedSnapshotRecord('phone'))
  const [phoneNumber, setPhoneNumber] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [specialContacts, setSpecialContacts] = useState<SpecialContact[]>([])
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([])
  const [voicemailMessages, setVoicemailMessages] = useState<VoicemailMessage[]>([])
  const [blockedNumbers, setBlockedNumbers] = useState<string[]>([])
  const [recipientChoices, setRecipientChoices] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCall, setActiveCall] = useState<CallHistoryItem | null>(null)
  const [onSpeakerphone, setOnSpeakerphone] = useState(false)
  const [geofenceWarning, setGeofenceWarning] = useState<Recipient | null>(null)
  const loadDataRef = useRef<() => void>(() => {})

  const api = useBackendAPI('phone')

  // Stable callback for refreshing the app
  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  // Register refresh handler without causing infinite re-renders.
  // Use a ref to avoid depending on setRefreshHandler (which is a new function each render).
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler
  })

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

  // Helper to persist blocked numbers to the backend state
  const persistBlockedNumbers = useCallback(async (numbers: string[]) => {
    try {
      const stateResponse = await fetch('./api/services/phone/state')
      if (!stateResponse.ok) return
      const stateData = await stateResponse.json()
      const currentState = stateData?.state
      if (!currentState) return

      const updatedState = {
        ...currentState,
        users: {
          ...(currentState.users || {}),
          blocked_numbers: numbers,
        },
      }
      await fetch('./api/services/phone/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: updatedState }),
      })
    } catch {
      // silently fail - blocking is best-effort
    }
  }, [])

  // Define loadData with useCallback to prevent unnecessary re-renders
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Check response.ok before parsing to avoid silent failures
      const response = await fetch('./api/services/phone/state')
      if (!response.ok) {
        throw new Error(`Failed to load state: ${response.status}`)
      }
      const stateResponse = await response.json()
      const state = stateResponse?.state || {}

      // Load contacts
      const contactsData = state.contacts || {}
      const contactList = Object.values(contactsData) as Contact[]
      setContacts(contactList)

      // Load businesses
      const businessesData = state.businesses || {}
      const businessList = Object.values(businessesData) as Business[]
      setBusinesses(businessList)

      // Load special contacts (voicemail)
      const specialContactsData = state.special_contacts || {}
      const specialContactsList = Object.values(specialContactsData) as SpecialContact[]
      setSpecialContacts(specialContactsList)

      // Load call history with proper field mapping
      const historyData = state.call_history || {}
      const historyList = Object.values(historyData) as CallHistoryItem[]
      const sortedHistory = historyList.sort((a, b) => {
        const aTime = typeof a.timestamp === 'number' ? a.timestamp : parseFloat(String(a.timestamp || '0'))
        const bTime = typeof b.timestamp === 'number' ? b.timestamp : parseFloat(String(b.timestamp || '0'))
        return bTime - aTime
      })
      setCallHistory(sortedHistory)
      const requestedCall = requestedSnapshotRecord('phone')
      if (requestedCall && !sortedHistory.some(call => call.call_id === requestedCall)) {
        reportMissingSnapshotRecord('phone', requestedCall)
        setFocusedCallId(null)
      }

      // Extract voicemail messages from call history (calls to *86)
      const voicemails = sortedHistory.filter(call => call.phone_number === '*86')
      setVoicemailMessages(voicemails)

      // Load blocked numbers from backend state
      const users = state.users || {}
      const savedBlockedNumbers = users.blocked_numbers
      if (Array.isArray(savedBlockedNumbers)) {
        setBlockedNumbers(savedBlockedNumbers)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Keep the ref up to date
  useEffect(() => {
    loadDataRef.current = loadData
  })

  // Load initial data
  useEffect(() => {
    loadData()
  }, [loadData])

  const handleNumberPadClick = (digit: string) => {
    setPhoneNumber(prev => prev + digit)
  }

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1))
  }

  // Parse backend validation errors into user-friendly messages
  const parseError = (err: unknown): string => {
    const message = err instanceof Error ? err.message : 'Failed to make call'

    // Handle geofencing policy errors
    if (message.includes('GeofencingPolicyError') || message.includes('geofenc')) {
      return 'This business is too far away. Please confirm before calling.'
    }

    // Extract phone number validation errors
    if (message.includes('Invalid phone number format')) {
      return 'Invalid phone number. Must be 7-15 digits.'
    }

    if (message.includes('ValidationError')) {
      // Try to extract the actual error message
      const match = message.match(/Value error, (.+?)(?:\s*\[|$)/)
      if (match) return match[1]
    }

    // Handle JSON parse errors (backend returning non-JSON)
    if (message.includes('JSON') || message.includes('Unexpected token')) {
      return 'Backend error occurred. Please try again.'
    }

    return message
  }

  // Validate phone number format (7-15 digits) - prevents console errors from backend validation
  const isValidPhoneNumber = (number: string): boolean => {
    // Allow special voicemail numbers
    if (number === '*86') return true

    const digitsOnly = number.replace(/\D/g, '')
    return digitsOnly.length >= 7 && digitsOnly.length <= 15
  }

  // Get contact info from contacts by phone number
  // Normalizes numbers by stripping non-digits, then compares with and without
  // leading country code '1' to handle E.164 format mismatches (e.g. +12125550111 vs 2125550111)
  const getContactInfoFromNumber = useCallback((phoneNum: string): { name?: string; type?: string; photoUrl?: string } | undefined => {
    const normalizeNumber = (num: string) => num.replace(/\D/g, '')
    const normalizedSearch = normalizeNumber(phoneNum)

    const numbersMatch = (a: string, b: string): boolean => {
      if (a === b) return true
      // Handle US/CA numbers: 10-digit vs 11-digit with leading '1'
      if (a.length === 11 && a.startsWith('1') && a.slice(1) === b) return true
      if (b.length === 11 && b.startsWith('1') && b.slice(1) === a) return true
      return false
    }

    for (const contact of contacts) {
      for (const phone of contact.phoneNumbers || []) {
        if (numbersMatch(normalizeNumber(phone.value), normalizedSearch)) {
          return {
            name: getContactDisplayName(contact),
            type: phone.type,
            photoUrl: getContactPhotoUrl(contact),
          }
        }
      }
    }
    return undefined
  }, [contacts])

  // Block/unblock number with backend persistence
  const handleBlockNumber = useCallback(async (number: string) => {
    const updated = blockedNumbers.includes(number)
      ? blockedNumbers.filter(n => n !== number)
      : [...blockedNumbers, number]
    setBlockedNumbers(updated)
    await persistBlockedNumbers(updated)
  }, [blockedNumbers, persistBlockedNumbers])

  const handleCall = async (recipient?: Recipient, directNumber?: string, recipientName?: string, phoneType?: string) => {
    setError(null)
    try {
      let result
      const number = directNumber || phoneNumber

      if (recipient) {
        // Call with recipient object
        const endpointPhone = recipient.contact_endpoints?.[0]?.endpoint_value

        // Frontend validation to prevent console errors
        if (endpointPhone && endpointPhone !== '*86' && !isValidPhoneNumber(endpointPhone)) {
          setError('Invalid phone number. Must be 7-15 digits.')
          return
        }

        // Prepare call - preview step before dialing
        const hasValidEndpoint = recipient.contact_endpoints?.some(ep => ep.endpoint_value)
        if (hasValidEndpoint) {
          await api.callTool('prepare_call', {
            recipients: [recipient]
          }).catch(() => {/* proceed even if prepare fails */})
        }

        // Always call the backend API to persist the call
        result = await api.callTool('make_call', {
          recipient,
          on_speakerphone: onSpeakerphone
        })
      } else {
        // Direct call with phone number
        if (!number) {
          setError('Please enter a phone number')
          return
        }

        // Frontend validation to prevent console errors
        if (!isValidPhoneNumber(number)) {
          setError('Invalid phone number. Must be 7-15 digits.')
          return
        }

        // Look up contact info if dialing directly (e.g., typing the number manually)
        const contactInfo = getContactInfoFromNumber(number)
        // Always provide a recipient_name - backend requires it to be a string (not null/undefined)
        const resolvedName = recipientName || contactInfo?.name || 'Unknown'

        // Persist call to backend via API
        result = await api.callTool('make_call', {
          recipient_phone_number: number,
          recipient_name: resolvedName,
          recipient_photo_url: contactInfo?.photoUrl || undefined,
          on_speakerphone: onSpeakerphone
        })
      }

      // Handle response
      if (result?.status === 'success') {
        // Determine phone type - use passed value, or look up from contacts, or get from recipient
        const callPhoneNumber = recipient?.contact_endpoints?.[0]?.endpoint_value || number
        const contactInfo = getContactInfoFromNumber(callPhoneNumber)
        const resolvedPhoneType = phoneType ||
          contactInfo?.type ||
          recipient?.contact_endpoints?.[0]?.endpoint_label

        // Use contact info to resolve name for direct dialing
        const resolvedRecipientName = recipient?.contact_name || recipientName || contactInfo?.name

        setActiveCall({
          call_id: result.call_id,
          recipient_name: resolvedRecipientName,
          phone_number: callPhoneNumber,
          phone_type: resolvedPhoneType,
          status: 'active'
        })
        setPhoneNumber('')
        setCurrentView('dialer')
        // Reload data from backend after successful call to ensure persistence
        await loadData()
      }
    } catch (err) {
      const errorMessage = parseError(err)

      // Check if this is a geofencing error
      if (errorMessage.includes('too far away') || errorMessage.includes('geofenc')) {
        // Show confirmation modal for distant business
        if (recipient && recipient.recipient_type === 'BUSINESS') {
          setGeofenceWarning(recipient)
        } else {
          setError(errorMessage)
        }
      } else {
        setError(errorMessage)
      }
    }
  }

  const handleContactSearch = async () => {
    if (!searchQuery.trim()) return

    setError(null)
    try {
      // Search contacts by name
      const matchingContacts = contacts.filter(contact => {
        const name = getContactDisplayName(contact)
        return name.toLowerCase().includes(searchQuery.toLowerCase())
      })

      if (matchingContacts.length === 0) {
        // Show not found
        await api.callTool('show_call_recipient_not_found_or_specified', {
          contact_name: searchQuery
        })
        setError(`Contact "${searchQuery}" not found`)
      } else if (matchingContacts.length === 1 && matchingContacts[0].phoneNumbers?.length === 1) {
        // Single contact with single number - call directly
        const contact = matchingContacts[0]
        const recipient: Recipient = {
          contact_id: contact.resourceName,
          contact_name: getContactDisplayName(contact),
          contact_endpoints: [{
            endpoint_value: contact.phoneNumbers[0].value,
            endpoint_type: 'PHONE_NUMBER',
            endpoint_label: contact.phoneNumbers[0].type
          }],
          contact_photo_url: contact.photos?.[0]?.url,
          recipient_type: 'CONTACT',
          confidence_level: 'HIGH'
        }
        await handleCall(recipient)
      } else {
        // Multiple matches or contact with multiple numbers - show choices
        const recipients: Recipient[] = []
        matchingContacts.forEach(contact => {
          contact.phoneNumbers?.forEach(phone => {
            recipients.push({
              contact_id: contact.resourceName,
              contact_name: getContactDisplayName(contact),
              contact_endpoints: [{
                endpoint_value: phone.value,
                endpoint_type: 'PHONE_NUMBER',
                endpoint_label: phone.type
              }],
              contact_photo_url: contact.photos?.[0]?.url,
              recipient_type: 'CONTACT',
              confidence_level: 'HIGH'
            })
          })
        })

        // Call show_call_recipient_choices to display disambiguation picker
        await api.callTool('show_call_recipient_choices', {
          recipients
        }).catch(() => {/* proceed even if API call fails */})

        setRecipientChoices(recipients)
        setCurrentView('recipient_choice')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search contacts')
    }
  }

  const filteredContacts = contacts.filter(contact => {
    const name = getContactDisplayName(contact)
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Header with tabs */}
      <div className="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1">
          <button
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              currentView === 'dialer'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setCurrentView('dialer')}
          >
            📞 Dialer
          </button>
          <button
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              currentView === 'contacts'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setCurrentView('contacts')}
          >
            👤 Contacts
          </button>
          <button
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              currentView === 'recent'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setCurrentView('recent')}
          >
            🕐 Recent
          </button>
          <button
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              currentView === 'voicemail'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setCurrentView('voicemail')}
          >
            📧 Voicemail
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Active call banner */}
      {activeCall && (
        <div className="mx-4 mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {activeCall.recipient_name || 'Unknown'}
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{activeCall.call_id}]</span>
                {activeCall.phone_type && (
                  <span className="text-[var(--text-secondary)] font-normal ml-1">
                    ({activeCall.phone_type})
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {activeCall.phone_number}
              </div>
              <div className="text-xs text-green-500 flex items-center gap-1 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Call in progress
              </div>
            </div>
            <button
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
              onClick={() => setActiveCall(null)}
            >
              End Call
            </button>
          </div>
        </div>
      )}


      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {currentView === 'dialer' && (
              <DialerView
                phoneNumber={phoneNumber}
                onNumberPadClick={handleNumberPadClick}
                onBackspace={handleBackspace}
                onCall={() => handleCall()}
                onSpeakerphone={onSpeakerphone}
                setOnSpeakerphone={setOnSpeakerphone}
                onPhoneNumberChange={setPhoneNumber}
              />
            )}
            {currentView === 'contacts' && (
              <ContactsView
                contacts={filteredContacts}
                businesses={businesses}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onCall={handleCall}
                onSearch={handleContactSearch}
              />
            )}
            {currentView === 'recent' && (
              <>
              {focusedCallId && <div className="flex items-center justify-between mb-3 text-sm text-[var(--text-secondary)]"><span>Linked call</span><button className="text-[var(--accent-color)] underline" onClick={() => { setFocusedCallId(null); clearSnapshotRecord('phone') }}>Show all calls</button></div>}
              <RecentCallsView
                callHistory={focusedCallId ? callHistory.filter(call => call.call_id === focusedCallId) : callHistory}
                contacts={contacts}
                blockedNumbers={blockedNumbers}
                onBlockToggle={handleBlockNumber}
                onCall={handleCall}
              />
              </>
            )}
            {currentView === 'recipient_choice' && (
              <RecipientChoiceView
                recipients={recipientChoices}
                onSelect={(recipient) => {
                  handleCall(recipient)
                  setCurrentView('dialer')
                }}
                onCancel={() => setCurrentView('dialer')}
              />
            )}
            {currentView === 'voicemail' && (
              <VoicemailView
                specialContacts={specialContacts}
                voicemailMessages={voicemailMessages}
                contacts={contacts}
                onCall={handleCall}
              />
            )}
          </>
        )}
      </div>

      {/* Geofencing warning modal */}
      {geofenceWarning && (
        <GeofenceWarningModal
          business={geofenceWarning}
          onClose={() => setGeofenceWarning(null)}
          onCallAnyway={async () => {
            const recipient = geofenceWarning
            setGeofenceWarning(null)
            // Show recipient choices then proceed with the call
            await api.callTool('show_call_recipient_choices', {
              recipients: [recipient]
            }).catch(() => {})
            await api.callTool('make_call', {
              recipient,
              on_speakerphone: onSpeakerphone
            }).then(async (result) => {
              if (result) {
                setActiveCall({
                  call_id: (result as Record<string, string>).call_id || 'unknown',
                  recipient_name: recipient.contact_name,
                  phone_number: recipient.contact_endpoints?.[0]?.endpoint_value || '',
                  phone_type: recipient.contact_endpoints?.[0]?.endpoint_label,
                  status: 'active'
                })
                setPhoneNumber('')
                setCurrentView('dialer')
                await loadData()
              }
            }).catch(err => {
              setError(err instanceof Error ? err.message : String(err))
            })
          }}
        />
      )}
    </div>
  )
}

function DialerView({
  phoneNumber,
  onNumberPadClick,
  onBackspace,
  onCall,
  onSpeakerphone,
  setOnSpeakerphone,
  onPhoneNumberChange,
}: {
  phoneNumber: string
  onNumberPadClick: (digit: string) => void
  onBackspace: () => void
  onCall: () => void
  onSpeakerphone: boolean
  setOnSpeakerphone: (value: boolean) => void
  onPhoneNumberChange: (value: string) => void
}) {
  const numberPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#', '+'],
  ]

  return (
    <div className="flex flex-col items-center h-full gap-1 overflow-y-auto py-1">
      {/* Phone number display */}
      <div className="w-full max-w-sm px-2">
        <div className="h-10 flex items-center justify-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => {
              const filtered = e.target.value.replace(/[^0-9+*#]/g, '')
              onPhoneNumberChange(filtered)
            }}
            placeholder="Enter phone number"
            className="w-full px-4 text-xl font-light text-center bg-transparent text-[var(--text-primary)] focus:outline-none placeholder-[var(--text-tertiary)]"
          />
        </div>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-4 gap-1.5 max-w-sm">
        {numberPad.map((row, rowIndex) => {
          // First 3 rows have 3 digits - add empty 4th cell for alignment
          if (row.length === 3) {
            return (
              <React.Fragment key={rowIndex}>
                {row.map((digit) => (
                  <button
                    key={`${rowIndex}-${digit}`}
                    className="w-10 h-10 flex items-center justify-center text-base font-light bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full border border-[var(--border-color)] transition-colors text-[var(--text-primary)]"
                    onClick={() => onNumberPadClick(digit)}
                  >
                    {digit}
                  </button>
                ))}
                <div key={`${rowIndex}-spacer`} />
              </React.Fragment>
            )
          }
          // Last row has 4 items: *, 0, #, +
          return row.map((digit) => (
            <button
              key={`${rowIndex}-${digit}`}
              className="w-10 h-10 flex items-center justify-center text-base font-light bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full border border-[var(--border-color)] transition-colors text-[var(--text-primary)]"
              onClick={() => onNumberPadClick(digit)}
            >
              {digit}
            </button>
          ))
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pb-1">
        <button
          className="w-10 h-10 flex items-center justify-center bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-full transition-colors"
          onClick={onBackspace}
        >
          <span className="text-lg">⌫</span>
        </button>
        <button
          className="w-12 h-12 flex items-center justify-center bg-green-500 hover:bg-green-600 rounded-full transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onCall}
          disabled={!phoneNumber}
        >
          <span className="text-2xl text-white">📞</span>
        </button>
        <button
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
            onSpeakerphone
              ? 'bg-blue-500 hover:bg-blue-600'
              : 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)]'
          }`}
          onClick={() => setOnSpeakerphone(!onSpeakerphone)}
        >
          <span className="text-lg">{onSpeakerphone ? '🔊' : '🔈'}</span>
        </button>
      </div>
    </div>
  )
}

function GeofenceWarningModal({
  business,
  onClose,
  onCallAnyway,
}: {
  business: Recipient
  onClose: () => void
  onCallAnyway: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-primary)] rounded-lg shadow-2xl p-6 max-w-md w-full border-2 border-yellow-500"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl">⚠️</span>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-yellow-500 mb-2">
              Geofencing Policy Alert
            </h3>
            <p className="text-[var(--text-primary)] mb-3">
              <strong>{business.contact_name}</strong><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{business.contact_id}]</span> is located beyond the allowed calling distance.
            </p>
            {business.address && (
              <div className="text-sm text-[var(--text-secondary)] mb-2">
                <span className="font-semibold">📍 Address:</span> {business.address}
              </div>
            )}
            {business.distance && (
              <div className="text-sm text-[var(--text-secondary)] mb-3">
                <span className="font-semibold">📏 Distance:</span> {business.distance}
              </div>
            )}
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              This business exceeds the maximum calling distance ({business.distance}).
              Calls to distant businesses are restricted by company policy.
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Please contact this business using alternative methods or visit their location.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            className="px-6 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg font-medium transition-colors border border-[var(--border-color)]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            onClick={onCallAnyway}
          >
            Call Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

function ContactsView({
  contacts,
  businesses,
  searchQuery,
  setSearchQuery,
  onCall,
  onSearch,
}: {
  contacts: Contact[]
  businesses: Business[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  onCall: (recipient: Recipient) => void
  onSearch: () => void
}) {
  // Filter businesses by search query
  const filteredBusinesses = businesses.filter(business => {
    return business.contact_name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const hasResults = contacts.length > 0 || filteredBusinesses.length > 0

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Search contacts and businesses..."
          className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)]"
        />
        <button
          className="px-4 py-2 bg-[var(--accent-color)] hover:brightness-110 text-white rounded-lg transition-all font-medium"
          onClick={onSearch}
        >
          Search
        </button>
      </div>

      {/* Contacts and businesses list */}
      {!hasResults ? (
        <div className="flex flex-col items-center justify-center h-64 text-[var(--text-secondary)]">
          <span className="text-5xl mb-3">👤</span>
          <p className="text-lg">
            {searchQuery ? 'No contacts or businesses found' : 'No contacts available'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Regular contacts */}
          {contacts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide px-1">
                Personal Contacts
              </h3>
              {contacts.map((contact) => {
                const name = getContactDisplayName(contact)
                const photoUrl = getContactPhotoUrl(contact)

                return (
                  <div
                    key={contact.resourceName}
                    className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={name}
                            className="w-12 h-12 rounded-full object-cover"
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              e.currentTarget.style.display = 'none'
                              e.currentTarget.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 rounded-full bg-[var(--accent-color)] flex items-center justify-center text-white font-bold text-lg ${photoUrl ? 'hidden' : ''}`}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">{name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.resourceName}]</span></div>
                          <div className="text-sm text-[var(--text-secondary)]">
                            {contact.phoneNumbers?.length || 0} number{contact.phoneNumbers?.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {contact.phoneNumbers?.map((phone, idx) => (
                          <button
                            key={idx}
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                            onClick={() => {
                              const recipient: Recipient = {
                                contact_id: contact.resourceName,
                                contact_name: name,
                                contact_endpoints: [{
                                  endpoint_value: phone.value,
                                  endpoint_type: 'PHONE_NUMBER',
                                  endpoint_label: phone.type
                                }],
                                contact_photo_url: photoUrl,
                                recipient_type: 'CONTACT',
                                confidence_level: 'HIGH'
                              }
                              onCall(recipient)
                            }}
                          >
                            📞 {phone.type || 'Call'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Business contacts */}
          {filteredBusinesses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide px-1">
                Businesses
              </h3>
              {filteredBusinesses.map((business) => {
                // Normalize distance to miles for consistency
                const normalizeDistance = (dist: string | undefined): string | null => {
                  if (!dist) return null
                  const distLower = dist.toLowerCase()
                  const match = distLower.match(/(\d+(?:\.\d+)?)\s*(mile|km|kilometer)/i)
                  if (!match) return dist

                  const value = parseFloat(match[1])
                  const unit = match[2]

                  if (unit.startsWith('km') || unit.startsWith('kilometer')) {
                    // Convert km to miles (1 km = 0.621371 miles)
                    const miles = (value * 0.621371).toFixed(1)
                    return `${miles} miles`
                  }
                  return `${value} miles`
                }

                const displayDistance = normalizeDistance(business.distance)

                return (
                  <div
                    key={business.contact_id}
                    className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-blue-500/50 hover:shadow-md transition-all"
                  >
                    <div className="p-4 flex items-start gap-4">
                      {/* Business Icon - Professional SVG */}
                      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>

                      {/* Business Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="font-semibold text-[var(--text-primary)] truncate">
                            {business.contact_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{business.contact_id}]</span>
                          </h3>
                          <span className="px-2 py-0.5 bg-blue-500/15 text-blue-500 text-[10px] font-semibold rounded uppercase tracking-wider flex-shrink-0">
                            Business
                          </span>
                        </div>

                        {business.address && (
                          <div className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)] mb-1">
                            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            <span className="flex-1 leading-relaxed">{business.address}</span>
                          </div>
                        )}

                        {displayDistance && (
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{displayDistance}</span>
                          </div>
                        )}
                      </div>

                      {/* Call Button */}
                      <div className="flex flex-col gap-2">
                        {business.contact_endpoints.map((endpoint, idx) => (
                          <button
                            key={idx}
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                            onClick={() => {
                              const recipient: Recipient = {
                                contact_id: business.contact_id,
                                contact_name: business.contact_name,
                                contact_endpoints: [{
                                  endpoint_value: endpoint.endpoint_value,
                                  endpoint_type: endpoint.endpoint_type,
                                  endpoint_label: endpoint.endpoint_label
                                }],
                                recipient_type: 'BUSINESS',
                                address: business.address,
                                distance: business.distance || undefined,
                                confidence_level: 'HIGH'
                              }
                              onCall(recipient)
                            }}
                          >
                            📞 {endpoint.endpoint_label || 'Call'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecentCallsView({
  callHistory,
  contacts,
  blockedNumbers,
  onBlockToggle,
  onCall,
}: {
  callHistory: CallHistoryItem[]
  contacts: Contact[]
  blockedNumbers: string[]
  onBlockToggle: (number: string) => void
  onCall: (recipient?: Recipient, directNumber?: string, recipientName?: string, phoneType?: string) => void
}) {
  // Look up contact info (name, type, photo) by phone number
  const getContactInfo = (phoneNumber?: string): { name?: string; type?: string; photoUrl?: string } | undefined => {
    if (!phoneNumber) return undefined

    const normalizeNumber = (num: string) => num.replace(/\D/g, '')
    const normalizedSearch = normalizeNumber(phoneNumber)

    const numbersMatch = (a: string, b: string): boolean => {
      if (a === b) return true
      if (a.length === 11 && a.startsWith('1') && a.slice(1) === b) return true
      if (b.length === 11 && b.startsWith('1') && b.slice(1) === a) return true
      return false
    }

    for (const contact of contacts) {
      for (const phone of contact.phoneNumbers || []) {
        if (numbersMatch(normalizeNumber(phone.value), normalizedSearch)) {
          return {
            name: getContactDisplayName(contact),
            type: phone.type || undefined,
            photoUrl: getContactPhotoUrl(contact),
          }
        }
      }
    }
    return undefined
  }

  // Format timestamp - backend uses seconds (Python time.time()), JS needs milliseconds
  const formatTimestamp = (timestamp?: string | number): string => {
    if (!timestamp) return ''
    // Convert to number if string
    const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp
    // If timestamp is in seconds (< year 2100 in ms), multiply by 1000
    const msTimestamp = ts < 4102444800000 ? ts * 1000 : ts
    const date = new Date(msTimestamp)
    return date.toLocaleString()
  }

  if (callHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
        <span className="text-5xl mb-3">🕐</span>
        <p className="text-lg">No recent calls</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {callHistory.map((call) => {
        // Resolve contact info from phone number
        const contactInfo = getContactInfo(call.phone_number)
        const displayName = call.recipient_name || contactInfo?.name || 'Unknown'
        const phoneType = contactInfo?.type
        const photoUrl = call.recipient_photo_url || contactInfo?.photoUrl
        const isBlocked = call.phone_number ? blockedNumbers.includes(call.phone_number) : false

        return (
          <div
            key={call.call_id}
            data-snapshot-record={call.call_id}
            className={`p-4 bg-[var(--bg-secondary)] rounded-lg border transition-colors ${
              isBlocked
                ? 'border-red-500/30 opacity-70'
                : 'border-[var(--border-color)] hover:border-[var(--accent-color)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Contact photo or initial */}
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div className={`w-10 h-10 rounded-full bg-[var(--accent-color)] flex items-center justify-center text-white font-bold flex-shrink-0 ${photoUrl ? 'hidden' : ''}`}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  {/* Name and type */}
                  <div className="font-medium text-[var(--text-primary)]">
                    {displayName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{call.call_id}]</span>
                    {phoneType && (
                      <span className="text-[var(--text-secondary)] font-normal ml-1">
                        ({phoneType})
                      </span>
                    )}
                    {isBlocked && (
                      <span className="text-red-500 font-normal ml-1 text-xs">
                        (blocked)
                      </span>
                    )}
                  </div>
                  {/* Phone number */}
                  <div className="text-sm text-[var(--text-secondary)]">
                    {call.phone_number || 'No number'}
                  </div>
                  {/* Date and time */}
                  {call.timestamp && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      {formatTimestamp(call.timestamp)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {/* Block/unblock button */}
                {call.phone_number && (
                  <button
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isBlocked
                        ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
                    }`}
                    onClick={() => onBlockToggle(call.phone_number!)}
                    title={isBlocked ? 'Unblock number' : 'Block number'}
                  >
                    {isBlocked ? 'Unblock' : 'Block'}
                  </button>
                )}
                <button
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => onCall(undefined, call.phone_number, displayName, phoneType || undefined)}
                  disabled={isBlocked}
                >
                  📞 Call
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RecipientChoiceView({
  recipients,
  onSelect,
  onCancel,
}: {
  recipients: Recipient[]
  onSelect: (recipient: Recipient) => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          Select a recipient
        </h2>
        <button
          className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg text-sm font-medium transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        {recipients.map((recipient, idx) => {
          const endpoint = recipient.contact_endpoints?.[0]
          return (
            <button
              key={idx}
              className="w-full p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors text-left"
              onClick={() => onSelect(recipient)}
            >
              <div className="flex items-center gap-3">
                {recipient.contact_photo_url ? (
                  <img
                    src={recipient.contact_photo_url}
                    alt={recipient.contact_name}
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div className={`w-12 h-12 rounded-full bg-[var(--accent-color)] flex items-center justify-center text-white font-bold text-lg ${recipient.contact_photo_url ? 'hidden' : ''}`}>
                  {(recipient.contact_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-primary)]">
                    {recipient.contact_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{recipient.contact_id}]</span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {endpoint?.endpoint_value}
                    {endpoint?.endpoint_label && ` (${endpoint.endpoint_label})`}
                  </div>
                  {recipient.address && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      {recipient.address}
                      {recipient.distance && ` • ${recipient.distance}`}
                    </div>
                  )}
                </div>
                <div className="text-2xl">📞</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// VoicemailView now shows voicemail messages from call history
function VoicemailView({
  specialContacts,
  voicemailMessages,
  contacts,
  onCall,
}: {
  specialContacts: SpecialContact[]
  voicemailMessages: VoicemailMessage[]
  contacts: Contact[]
  onCall: (recipient: Recipient) => void
}) {
  // Find voicemail contact
  const voicemailContact = specialContacts.find(c => c.recipient_type === 'VOICEMAIL')

  // Format timestamp
  const formatTimestamp = (timestamp?: string | number): string => {
    if (!timestamp) return ''
    const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp
    const msTimestamp = ts < 4102444800000 ? ts * 1000 : ts
    const date = new Date(msTimestamp)
    return date.toLocaleString()
  }

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <span className="text-5xl mb-3 block">📧</span>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Voicemail{voicemailContact && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{voicemailContact.contact_id}]</span>}</h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Access your voicemail messages
        </p>

        {voicemailContact ? (
          <button
            className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-lg font-medium transition-colors shadow-lg"
            onClick={() => {
              const recipient: Recipient = {
                contact_id: voicemailContact.contact_id,
                contact_name: voicemailContact.contact_name,
                contact_endpoints: voicemailContact.contact_endpoints.map(ep => ({
                  endpoint_value: ep.endpoint_value,
                  endpoint_type: ep.endpoint_type,
                  endpoint_label: ep.endpoint_label
                })),
                recipient_type: 'VOICEMAIL',
                confidence_level: 'HIGH'
              }
              onCall(recipient)
            }}
          >
            📞 Call Voicemail (*86)
          </button>
        ) : (
          <div className="text-[var(--text-secondary)]">
            Voicemail service not available
          </div>
        )}
      </div>

      {/* Show voicemail message history */}
      {voicemailMessages.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide px-1">
            Voicemail History
          </h3>
          {voicemailMessages.map((msg) => (
            <div
              key={msg.call_id}
              className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    Voicemail Access<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.call_id}]</span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">*86</div>
                  {msg.timestamp && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      {formatTimestamp(msg.timestamp)}
                    </div>
                  )}
                </div>
                <div className="text-sm text-[var(--text-tertiary)]">
                  {msg.status || 'completed'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
        <h3 className="font-semibold text-[var(--text-primary)] mb-2">How to use voicemail:</h3>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1">
          <li>• Tap the button above to access your voicemail</li>
          <li>• Follow the voice prompts to listen to messages</li>
          <li>• You can also dial *86 from the keypad</li>
        </ul>
      </div>

      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div className="text-sm text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Tip:</strong> You can access voicemail anytime by dialing *86 from the Dialer tab.
          </div>
        </div>
      </div>
    </div>
  )
}
