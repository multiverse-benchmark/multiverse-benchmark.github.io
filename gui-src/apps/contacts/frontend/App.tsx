import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { requestedSnapshotRecord, reportMissingSnapshotRecord } from '@shared/snapshotNavigation'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface Name {
  givenName?: string
  familyName?: string
}

interface EmailAddress {
  value: string
  type?: string
  primary?: boolean
}

interface PhoneNumber {
  value?: string
  type?: string
  primary?: boolean
}

interface Organization {
  name?: string
  title?: string
  department?: string
  primary?: boolean
}

interface PhoneEndpoint {
  endpoint_type?: string
  endpoint_value?: string
  endpoint_label?: string
}

interface PhoneContact {
  contact_id?: string
  contact_name?: string
  recipient_type?: string
  contact_photo_url?: string
  contact_endpoints?: PhoneEndpoint[]
}

interface WhatsupContact {
  jid?: string
  name_in_address_book?: string
  profile_name?: string
  phone_number?: string
  is_whatsup_user?: boolean
}

interface Contact {
  resourceName: string
  etag: string
  names?: Name[]
  emailAddresses?: EmailAddress[]
  phoneNumbers?: PhoneNumber[]
  organizations?: Organization[]
  isWorkspaceUser?: boolean
  notes?: string
  phone?: PhoneContact
  whatsup?: WhatsupContact
  starred?: boolean
  memberships?: string[]
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

// ============================================================================
// Helper Functions
// ============================================================================

const getDisplayName = (contact: Contact): string => {
  if (contact.names && contact.names.length > 0) {
    const name = contact.names[0]
    const parts = [name.givenName, name.familyName].filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
  }
  if (contact.emailAddresses && contact.emailAddresses.length > 0) {
    return contact.emailAddresses[0].value
  }
  if (contact.phoneNumbers && contact.phoneNumbers.length > 0 && contact.phoneNumbers[0].value) {
    return contact.phoneNumbers[0].value
  }
  return 'Unknown'
}

const getInitials = (contact: Contact): string => {
  if (contact.names && contact.names.length > 0) {
    const name = contact.names[0]
    const first = name.givenName?.[0] || ''
    const last = name.familyName?.[0] || ''
    if (first || last) return (first + last).toUpperCase()
  }
  const displayName = getDisplayName(contact)
  return displayName.substring(0, 2).toUpperCase()
}

const getPrimaryEmail = (contact: Contact): string | null => {
  if (!contact.emailAddresses || contact.emailAddresses.length === 0) return null
  const primary = contact.emailAddresses.find(e => e.primary)
  return primary?.value || contact.emailAddresses[0].value
}

const getPrimaryPhone = (contact: Contact): string | null => {
  if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return null
  const primary = contact.phoneNumbers.find(p => p.primary)
  return primary?.value || contact.phoneNumbers[0].value || null
}

const getAvatarColor = (name: string): string => {
  const colors = [
    '#4285F4', // Google Blue
    '#EA4335', // Google Red
    '#FBBC05', // Google Yellow
    '#34A853', // Google Green
    '#FF6D01', // Orange
    '#46BDC6', // Teal
    '#7B1FA2', // Purple
    '#C2185B', // Pink
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Normalize phone number by stripping whitespace, dashes, parens
const normalizePhone = (p: string) => p.replace(/[-\s()]/g, '')

// Check if a contact can be edited
// Only user's own contacts (people/ prefix, not workspace users) can be edited
const canEditContact = (contact: Contact): boolean => {
  if (contact.resourceName.startsWith('otherContacts/')) return false
  if (contact.isWorkspaceUser) return false
  return true
}

// Check if a contact can be deleted
// Directory contacts (isWorkspaceUser with people/ prefix) cannot be deleted
// Other contacts cannot be deleted either
const canDeleteContact = (contact: Contact): boolean => {
  if (contact.resourceName.startsWith('otherContacts/')) return false
  if (contact.isWorkspaceUser && !contact.resourceName.startsWith('otherContacts/')) {
    return false
  }
  return true
}

// ============================================================================
// Styles - Using CSS variables for dark/light mode support
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  sidebar: {
    width: '320px',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-secondary)',
  } as React.CSSProperties,

  sidebarHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,

  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  } as React.CSSProperties,

  contactCount: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 8px',
    borderRadius: '12px',
  } as React.CSSProperties,

  addButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'var(--accent-color)',
    color: '#FFFFFF',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    flexShrink: 0,
    lineHeight: '36px',
    padding: 0,
    paddingBottom: '5px',
  } as React.CSSProperties,

  searchContainer: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-color)',
    position: 'relative',
  } as React.CSSProperties,

  searchInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  searchInput: {
    width: '100%',
    padding: '10px 40px 10px 16px',
    borderRadius: '24px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  clearSearchButton: {
    position: 'absolute',
    right: '12px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'var(--text-secondary)',
    color: '#FFFFFF',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  } as React.CSSProperties,

  contactList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  } as React.CSSProperties,

  contactItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
  } as React.CSSProperties,

  contactItemSelected: {
    backgroundColor: 'var(--bg-tertiary)',
    borderLeftColor: 'var(--accent-color)',
  } as React.CSSProperties,

  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 500,
    marginRight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  contactInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  contactName: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  contactEmail: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  workspaceBadge: {
    fontSize: '10px',
    color: 'var(--accent-color)',
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: '8px',
    flexShrink: 0,
  } as React.CSSProperties,

  orgIndicator: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '4px',
  } as React.CSSProperties,

  orgDescription: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginLeft: '6px',
  } as React.CSSProperties,

  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '12px',
    cursor: 'pointer',
    accentColor: 'var(--accent-color)',
    flexShrink: 0,
  } as React.CSSProperties,

  batchToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    backgroundColor: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border-color)',
  } as React.CSSProperties,

  batchInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  batchCount: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
  } as React.CSSProperties,

  batchActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,

  batchButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  } as React.CSSProperties,

  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
  } as React.CSSProperties,

  tab: {
    flex: 1,
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: 'all 0.2s',
  } as React.CSSProperties,

  tabActive: {
    color: 'var(--accent-color)',
    borderBottomColor: 'var(--accent-color)',
  } as React.CSSProperties,

  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-secondary)',
  } as React.CSSProperties,

  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    padding: '40px',
  } as React.CSSProperties,

  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
    opacity: 0.5,
  } as React.CSSProperties,

  emptyText: {
    fontSize: '16px',
    textAlign: 'center',
  } as React.CSSProperties,

  loadingContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--accent-color)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as React.CSSProperties,

  detailPanel: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
  } as React.CSSProperties,

  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '32px',
  } as React.CSSProperties,

  detailAvatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: '28px',
    fontWeight: 500,
    marginRight: '24px',
  } as React.CSSProperties,

  detailName: {
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  } as React.CSSProperties,

  detailActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  } as React.CSSProperties,

  actionButton: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,

  deleteButton: {
    color: 'var(--danger-color)',
    borderColor: 'var(--danger-color)',
  } as React.CSSProperties,

  detailSection: {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 1px 2px var(--shadow-color)',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  } as React.CSSProperties,

  detailRow: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '8px 0',
  } as React.CSSProperties,

  detailIcon: {
    width: '20px',
    marginRight: '16px',
    color: 'var(--text-secondary)',
    flexShrink: 0,
    textAlign: 'center',
  } as React.CSSProperties,

  detailContent: {
    flex: 1,
  } as React.CSSProperties,

  detailValue: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    marginBottom: '2px',
  } as React.CSSProperties,

  detailLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease-out',
  } as React.CSSProperties,

  modal: {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '480px',
    maxHeight: '92%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 48px var(--shadow-color)',
    animation: 'slideUp 0.2s ease-out',
  } as React.CSSProperties,

  modalHeader: {
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  } as React.CSSProperties,

  modalTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  } as React.CSSProperties,

  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  modalBody: {
    padding: '10px 16px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  } as React.CSSProperties,

  formGroup: {
    marginBottom: '6px',
  } as React.CSSProperties,

  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    marginBottom: '4px',
  } as React.CSSProperties,

  formInput: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-primary)',
  } as React.CSSProperties,

  formInputError: {
    borderColor: 'var(--danger-color)',
  } as React.CSSProperties,

  formError: {
    fontSize: '12px',
    color: 'var(--danger-color)',
    marginTop: '4px',
  } as React.CSSProperties,

  formRow: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,

  formRowItem: {
    flex: 1,
  } as React.CSSProperties,

  modalFooter: {
    padding: '8px 16px',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    flexShrink: 0,
  } as React.CSSProperties,

  cancelButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,

  saveButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--accent-color)',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,

  saveButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
}

// Add keyframes for animations
const spinnerKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`

// ============================================================================
// Main Component
// ============================================================================

interface FormEntry {
  value: string
  type: string
}

interface FormData {
  givenName: string
  familyName: string
  emails: FormEntry[]
  phones: FormEntry[]
  organization: string
  jobTitle: string
  notes: string
}

const initialFormData: FormData = {
  givenName: '',
  familyName: '',
  emails: [{ value: '', type: 'home' }],
  phones: [{ value: '', type: 'mobile' }],
  organization: '',
  jobTitle: '',
  notes: '',
}

export default function ContactsApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('contacts')
  const apiRef = useRef(api)
  apiRef.current = api

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Tab state - now includes 'other' for Other Contacts
  const [activeTab, setActiveTab] = useState<'contacts' | 'other' | 'directory'>('contacts')

  // Other Contacts state
  const [otherContacts, setOtherContacts] = useState<Contact[]>([])
  const [loadingOtherContacts, setLoadingOtherContacts] = useState(false)

  // Directory tab state
  const [directoryResults, setDirectoryResults] = useState<Contact[]>([])
  const [directorySearchQuery, setDirectorySearchQuery] = useState('')
  const [searchingDirectory, setSearchingDirectory] = useState(false)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Batch selection state
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [batchDeleteProgress, setBatchDeleteProgress] = useState({ current: 0, total: 0 })

  // Load contacts - use ref to avoid dependency issues
  const loadContacts = useCallback(async (): Promise<Contact[]> => {
    setLoading(true)
    try {
      const result = await apiRef.current.callTool('list_contacts', { max_results: 1000 })
      const loaded = result.contacts || []
      setContacts(loaded)
      return loaded
    } catch (err) {
      console.error('Failed to load contacts:', err)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // Load other contacts (auto-generated from interactions)
  const loadOtherContacts = useCallback(async () => {
    setLoadingOtherContacts(true)
    try {
      const result = await apiRef.current.callTool('get_other_contacts', { max_results: 100 })
      setOtherContacts(result.contacts || [])
    } catch (err) {
      console.error('Failed to load other contacts:', err)
      setOtherContacts([])
    } finally {
      setLoadingOtherContacts(false)
    }
  }, [])

  // Store loadContacts in a ref for the refresh handler
  const loadContactsRef = useRef(loadContacts)
  loadContactsRef.current = loadContacts

  const loadOtherContactsRef = useRef(loadOtherContacts)
  loadOtherContactsRef.current = loadOtherContacts

  // Store setRefreshHandler in a ref to avoid re-render loops
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    const record = requestedSnapshotRecord('contacts')
    loadContacts().then(loaded => {
      if (!record) return
      const selected = loaded.find(contact => contact.resourceName === record)
      if (selected) setSelectedContact(selected)
      else reportMissingSnapshotRecord('contacts', record)
    })
    loadOtherContacts()
  }, [loadContacts, loadOtherContacts])

  // Memoize the refresh handler to avoid infinite re-render loops
  const refreshHandler = useCallback(() => {
    loadContactsRef.current()
    loadOtherContactsRef.current()
  }, [])

  // Register refresh handler - only on mount/unmount
  useEffect(() => {
    if (setRefreshHandlerRef.current) {
      setRefreshHandlerRef.current(refreshHandler)
    }
    return () => {
      if (setRefreshHandlerRef.current) setRefreshHandlerRef.current(null)
    }
  }, [refreshHandler])

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.givenName.trim()) {
      errors.givenName = 'First name is required'
    }

    // Collect all non-empty emails and phones from multi-entry fields
    const allEmails = formData.emails.map(e => e.value.trim()).filter(Boolean)
    const allPhones = formData.phones.map(p => p.value.trim()).filter(Boolean)

    if (allEmails.length === 0 && allPhones.length === 0) {
      errors.emails_0 = 'Either email or phone is required'
      errors.phones_0 = 'Either email or phone is required'
    }

    // Validate email formats
    for (let i = 0; i < formData.emails.length; i++) {
      const val = formData.emails[i].value.trim()
      if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[`emails_${i}`] = 'Invalid email format'
      }
    }

    // Check for duplicate emails within the same contact
    const seenEmails = new Set<string>()
    for (let i = 0; i < formData.emails.length; i++) {
      const val = formData.emails[i].value.trim().toLowerCase()
      if (val) {
        if (seenEmails.has(val)) {
          errors[`emails_${i}`] = 'Duplicate email address'
        }
        seenEmails.add(val)
      }
    }

    // Check for duplicate phones within the same contact
    const seenPhones = new Set<string>()
    for (let i = 0; i < formData.phones.length; i++) {
      const val = normalizePhone(formData.phones[i].value.trim())
      if (val) {
        if (seenPhones.has(val)) {
          errors[`phones_${i}`] = 'Duplicate phone number'
        }
        seenPhones.add(val)
      }
    }

    // Check for duplicate emails across OTHER contacts
    const currentResourceName = editingContact?.resourceName
    for (let i = 0; i < formData.emails.length; i++) {
      const val = formData.emails[i].value.trim().toLowerCase()
      if (val && !errors[`emails_${i}`]) {
        const duplicate = contacts.find(c => {
          if (currentResourceName && c.resourceName === currentResourceName) return false
          return c.emailAddresses?.some(ea => ea.value.toLowerCase() === val)
        })
        if (duplicate) {
          errors[`emails_${i}`] = `Email already used by ${getDisplayName(duplicate)}`
        }
      }
    }

    // Check for duplicate phones across OTHER contacts
    for (let i = 0; i < formData.phones.length; i++) {
      const val = normalizePhone(formData.phones[i].value.trim())
      if (val && !errors[`phones_${i}`]) {
        const duplicate = contacts.find(c => {
          if (currentResourceName && c.resourceName === currentResourceName) return false
          return c.phoneNumbers?.some(pn => pn.value && normalizePhone(pn.value) === val)
        })
        if (duplicate) {
          errors[`phones_${i}`] = `Phone already used by ${getDisplayName(duplicate)}`
        }
      }
    }

    setFormErrors(errors )
    return Object.keys(errors).length === 0
  }

  // Send additional emails/phones to a contact via parallel update calls.
  // When editing, skip entries that already exist unchanged on the contact.
  const sendAdditionalFields = async (
    resName: string,
    emails: string[],
    phones: string[],
    existingEmails?: string[],
    existingPhones?: string[],
  ) => {
    const additionalEmails = emails.slice(1)
    const additionalPhones = phones.slice(1)

    // Filter out entries that already exist unchanged on the contact
    const newEmails = existingEmails
      ? (() => {
          const existing = new Set(existingEmails.map(e => e.toLowerCase()))
          return additionalEmails.filter(e => !existing.has(e.toLowerCase()))
        })()
      : additionalEmails
    const newPhones = existingPhones
      ? (() => {
          const existing = new Set(existingPhones.map(normalizePhone))
          return additionalPhones.filter(p => !existing.has(normalizePhone(p)))
        })()
      : additionalPhones

    const calls = [
      ...newEmails.map(email =>
        apiRef.current.callTool('update_contact', { resource_name: resName, email })
      ),
      ...newPhones.map(phone =>
        apiRef.current.callTool('update_contact', { resource_name: resName, phone })
      ),
    ]
    if (calls.length > 0) await Promise.all(calls)
  }

  // Save contact (create or update)
  const handleSaveContact = async () => {
    if (!validateForm()) return

    setSaving(true)
    try {
      const resourceName = editingContact?.resourceName
      // Collect all non-empty emails and phones
      const allEmails = formData.emails.map(e => e.value.trim()).filter(Boolean)
      const allPhones = formData.phones.map(p => p.value.trim()).filter(Boolean)
      const firstEmail = allEmails[0] || ''
      const firstPhone = allPhones[0] || ''

      if (editMode && editingContact) {
        // Update existing contact - send first email/phone in main call
        const updateParams: Record<string, unknown> = {
          resource_name: editingContact.resourceName,
          given_name: formData.givenName.trim(),
        }
        if (formData.familyName.trim()) updateParams.family_name = formData.familyName.trim()
        if (firstEmail) updateParams.email = firstEmail
        if (firstPhone) updateParams.phone = firstPhone
        if (formData.notes.trim()) updateParams.notes = formData.notes.trim()

        await apiRef.current.callTool('update_contact', updateParams)
        // Pass existing emails/phones so sendAdditionalFields skips unchanged entries
        const existingEmails = (editingContact.emailAddresses || []).map(e => e.value)
        const existingPhones = (editingContact.phoneNumbers || []).map(p => p.value || '')
        await sendAdditionalFields(editingContact.resourceName, allEmails, allPhones, existingEmails, existingPhones)
      } else {
        // Create new contact with first email/phone
        const createParams: Record<string, unknown> = {
          given_name: formData.givenName.trim(),
        }
        if (formData.familyName.trim()) createParams.family_name = formData.familyName.trim()
        if (firstEmail) createParams.email = firstEmail
        if (firstPhone) createParams.phone = firstPhone
        if (formData.notes.trim()) createParams.notes = formData.notes.trim()

        const result = await apiRef.current.callTool('create_contact', createParams)
        const newResourceName = result?.contact?.resourceName
        if (newResourceName) {
          await sendAdditionalFields(newResourceName, allEmails, allPhones)
        }
      }

      // Reset form and close modal
      handleCloseModal()

      // Reload contacts from backend to ensure UI matches backend state
      const [updatedContacts] = await Promise.all([loadContacts(), loadOtherContacts()])

      // If we were editing, refresh the selected contact from the reloaded list
      if (editMode && resourceName) {
        const updated = (updatedContacts || contacts).find(
          (c: Contact) => c.resourceName === resourceName
        )
        setSelectedContact(updated || null)
      }
    } catch (err) {
      console.error('Failed to save contact:', err)
      let errorMessage = 'Something went wrong. Please try again.'
      if (err instanceof Error) {
        // Extract clean error message (remove "Tool execution failed: ErrorType: " prefix)
        const match = err.message.match(/(?:Error|Failed):\s*(.+)$/i)
        errorMessage = match ? match[1] : err.message.replace(/^Tool execution failed:\s*/i, '')
      }
      setFormErrors({ _general: errorMessage } )
    } finally {
      setSaving(false)
    }
  }

  // Handle form input change
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Handle multi-entry email change
  const handleEmailEntryChange = (index: number, value: string) => {
    setFormData(prev => {
      const emails = [...prev.emails]
      emails[index] = { ...emails[index], value }
      return { ...prev, emails }
    })
    const errorKey = `emails_${index}`
    if (formErrors[errorKey]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[errorKey]
        return next
      })
    }
  }

  // Handle multi-entry email type change
  const handleEmailTypeChange = (index: number, type: string) => {
    setFormData(prev => {
      const emails = [...prev.emails]
      emails[index] = { ...emails[index], type }
      return { ...prev, emails }
    })
  }

  // Handle multi-entry phone change
  const handlePhoneEntryChange = (index: number, value: string) => {
    setFormData(prev => {
      const phones = [...prev.phones]
      phones[index] = { ...phones[index], value }
      return { ...prev, phones }
    })
    const errorKey = `phones_${index}`
    if (formErrors[errorKey]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[errorKey]
        return next
      })
    }
  }

  // Handle multi-entry phone type change
  const handlePhoneTypeChange = (index: number, type: string) => {
    setFormData(prev => {
      const phones = [...prev.phones]
      phones[index] = { ...phones[index], type }
      return { ...prev, phones }
    })
  }

  // Add new email entry
  const handleAddEmail = () => {
    setFormData(prev => ({
      ...prev,
      emails: [...prev.emails, { value: '', type: 'home' }],
    }))
  }

  // Remove email entry
  const handleRemoveEmail = (index: number) => {
    setFormData(prev => ({
      ...prev,
      emails: prev.emails.filter((_, i) => i !== index),
    }))
    // Clear all email errors since indices shift
    setFormErrors(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith('emails_')) delete next[key]
      }
      return next
    })
  }

  // Add new phone entry
  const handleAddPhone = () => {
    setFormData(prev => ({
      ...prev,
      phones: [...prev.phones, { value: '', type: 'mobile' }],
    }))
  }

  // Remove phone entry
  const handleRemovePhone = (index: number) => {
    setFormData(prev => ({
      ...prev,
      phones: prev.phones.filter((_, i) => i !== index),
    }))
    // Clear all phone errors since indices shift
    setFormErrors(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith('phones_')) delete next[key]
      }
      return next
    })
  }

  // Close modal and reset form
  const handleCloseModal = () => {
    setShowModal(false)
    setEditMode(false)
    setEditingContact(null)
    setFormData(initialFormData)
    setFormErrors({})
  }

  // Open create modal
  const handleOpenCreateModal = () => {
    setEditMode(false)
    setEditingContact(null)
    setFormData(initialFormData)
    setFormErrors({})
    setShowModal(true)
  }

  // Open edit modal
  const handleOpenEditModal = (contact: Contact) => {
    setEditMode(true)
    setEditingContact(contact)
    const org = contact.organizations?.[0]

    // Populate all email entries
    const emails: FormEntry[] = contact.emailAddresses && contact.emailAddresses.length > 0
      ? contact.emailAddresses.map(ea => ({ value: ea.value, type: ea.type || 'home' }))
      : [{ value: '', type: 'home' }]

    // Populate all phone entries
    const phones: FormEntry[] = contact.phoneNumbers && contact.phoneNumbers.length > 0
      ? contact.phoneNumbers.map(pn => ({ value: pn.value || '', type: pn.type || 'mobile' }))
      : [{ value: '', type: 'mobile' }]

    setFormData({
      givenName: contact.names?.[0]?.givenName || '',
      familyName: contact.names?.[0]?.familyName || '',
      emails,
      phones,
      organization: org?.name || '',
      jobTitle: org?.title || '',
      notes: contact.notes || '',
    })
    setFormErrors({})
    setShowModal(true)
  }

  // Open delete confirmation
  const handleOpenDeleteConfirm = (contact: Contact) => {
    setDeletingContact(contact)
    setShowDeleteConfirm(true)
  }

  // Close delete confirmation
  const handleCloseDeleteConfirm = () => {
    setShowDeleteConfirm(false)
    setDeletingContact(null)
  }

  // Delete contact - calls backend API to persist deletion
  const handleDeleteContact = async () => {
    if (!deletingContact) return

    const contactToDelete = deletingContact
    setDeleting(true)
    try {
      // Call the backend delete API to persist the deletion
      await apiRef.current.callTool('delete_contact', {
        resource_name: contactToDelete.resourceName,
      })

      // Close confirmation and clear selection
      handleCloseDeleteConfirm()
      setSelectedContact(null)
      // Also clear from multi-select set to avoid stale selection
      setSelectedContacts(prev => {
        const newSet = new Set(prev)
        newSet.delete(contactToDelete.resourceName)
        return newSet
      })

      // Reload contacts from backend to ensure UI matches backend state
      await Promise.all([loadContacts(), loadOtherContacts()])
    } catch (err: unknown) {
      console.error('Failed to delete contact:', err)
      // Show error to user
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('directory') || errorMessage.includes('Cannot delete')) {
        alert('This contact cannot be deleted. Directory contacts are managed by your administrator.')
      } else {
        alert(`Failed to delete contact: ${errorMessage}`)
      }
      handleCloseDeleteConfirm()
    } finally {
      setDeleting(false)
    }
  }

  // Toggle contact selection
  const handleToggleSelect = (resourceName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedContacts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(resourceName)) {
        newSet.delete(resourceName)
      } else {
        newSet.add(resourceName)
      }
      return newSet
    })
  }

  // Select all contacts (only deletable contacts)
  const handleSelectAll = () => {
    // Only select contacts that can be deleted (exclude directory contacts)
    const deletableContacts = sortedContacts.filter(c => canDeleteContact(c))

    if (selectedContacts.size === deletableContacts.length && deletableContacts.length > 0) {
      // Deselect all
      setSelectedContacts(new Set())
    } else {
      // Select all deletable contacts
      setSelectedContacts(new Set(deletableContacts.map(c => c.resourceName)))
    }
  }

  // Clear selection
  const handleClearSelection = () => {
    setSelectedContacts(new Set())
  }

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedContacts.size === 0) return

    setBatchDeleting(true)

    // Filter out directory contacts - they cannot be deleted
    const allSelected = Array.from(selectedContacts)
    const contactsToDelete = allSelected.filter(resourceName => {
      const contact = contacts.find(c => c.resourceName === resourceName)
      if (!contact) return false
      // Skip directory contacts (Org users that aren't in otherContacts)
      return canDeleteContact(contact)
    })

    const skippedCount = allSelected.length - contactsToDelete.length

    // If all selected contacts were directory contacts, show message and clear selection
    if (contactsToDelete.length === 0) {
      alert('None of the selected contacts can be deleted. Directory contacts (Org) are managed by your administrator.')
      setShowBatchDeleteConfirm(false)
      setSelectedContacts(new Set())
      setBatchDeleting(false)
      return
    }

    setBatchDeleteProgress({ current: 0, total: contactsToDelete.length })

    let successCount = 0
    const failedContacts: string[] = []
    for (let i = 0; i < contactsToDelete.length; i++) {
      try {
        await apiRef.current.callTool('delete_contact', {
          resource_name: contactsToDelete[i],
        })
        successCount++
      } catch (err) {
        console.error(`Failed to delete contact ${contactsToDelete[i]}:`, err)
        // Track failed contacts for user feedback
        const contact = contacts.find(c => c.resourceName === contactsToDelete[i])
        failedContacts.push(contact ? getDisplayName(contact) : contactsToDelete[i])
      }
      setBatchDeleteProgress({ current: i + 1, total: contactsToDelete.length })
    }

    // Close confirmation and clear selection
    setShowBatchDeleteConfirm(false)
    setSelectedContacts(new Set())
    setSelectedContact(null)
    setBatchDeleting(false)

    // Reload contacts
    await Promise.all([loadContacts(), loadOtherContacts()])

    // Show summary to user
    if (failedContacts.length > 0 || skippedCount > 0) {
      let message = `Deleted ${successCount} of ${contactsToDelete.length} contacts.`
      if (skippedCount > 0) {
        message += `\n${skippedCount} directory contact(s) were skipped (cannot be deleted).`
      }
      if (failedContacts.length > 0) {
        message += `\n\nFailed to delete:\n${failedContacts.join('\n')}`
      }
      alert(message)
    }
  }

  // Search contacts using API
  const searchContacts = async (query: string) => {
    if (!query.trim()) {
      // If no query, load all contacts
      await loadContacts()
      return
    }

    setSearching(true)
    try {
      // Use list_contacts with name_filter for search (correct parameter name)
      const result = await apiRef.current.callTool('list_contacts', {
        name_filter: query.trim(),
        max_results: 50,
      })
      setContacts(result.contacts || [])
    } catch (err) {
      console.error('Failed to search contacts:', err)
    } finally {
      setSearching(false)
    }
  }

  // Handle search input with debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(value)
    }, 300)
  }

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('')
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    loadContacts()
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showBatchDeleteConfirm && !batchDeleting) {
          setShowBatchDeleteConfirm(false)
        } else if (showDeleteConfirm && !deleting) {
          handleCloseDeleteConfirm()
        } else if (showModal && !saving) {
          handleCloseModal()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showModal, showDeleteConfirm, showBatchDeleteConfirm, saving, deleting, batchDeleting])

  // Search directory using search_directory and list_workspace_users APIs
  const searchDirectory = async (query: string) => {
    if (!query.trim()) {
      setDirectoryResults([])
      return
    }

    setSearchingDirectory(true)
    try {
      // Call both search_directory and list_workspace_users in parallel for comprehensive results
      const [directoryResult, workspaceResult] = await Promise.all([
        apiRef.current.callTool('search_directory', {
          query: query.trim(),
          max_results: 50,
        }).catch(() => null),
        apiRef.current.callTool('list_workspace_users', {
          query: query.trim(),
          max_results: 50,
        }).catch(() => null),
      ])

      // Merge results, deduplicating by resourceName
      const seen = new Set<string>()
      const merged: Contact[] = []
      const addResults = (users: any[]) => {
        for (const user of users) {
          const key = user.resourceName || user.resource_name || JSON.stringify(user)
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(user)
          }
        }
      }
      if (directoryResult?.users) addResults(directoryResult.users)
      else if (Array.isArray(directoryResult)) addResults(directoryResult)
      if (workspaceResult?.users) addResults(workspaceResult.users)
      setDirectoryResults(merged)
    } catch (err) {
      console.error('Failed to search directory:', err)
      setDirectoryResults([])
    } finally {
      setSearchingDirectory(false)
    }
  }

  // Handle directory search input
  const handleDirectorySearchChange = (value: string) => {
    setDirectorySearchQuery(value)

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      searchDirectory(value)
    }, 300)
  }

  // Sort contacts alphabetically (memoized to avoid re-sorting on every render)
  const sortedContacts = useMemo(() =>
    [...contacts].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [contacts]
  )

  // Sort other contacts alphabetically
  const sortedOtherContacts = useMemo(() =>
    [...otherContacts].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [otherContacts]
  )

  // Sort directory results alphabetically
  const sortedDirectoryResults = useMemo(() =>
    [...directoryResults].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [directoryResults]
  )

  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div style={styles.container}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.titleContainer}>
              <h1 style={styles.title}>Contacts</h1>
              {!loading && !searching && activeTab === 'contacts' && (
                <span style={styles.contactCount}>{sortedContacts.length}</span>
              )}
            </div>
            {activeTab === 'contacts' && (
              <button
                style={styles.addButton}
                onClick={handleOpenCreateModal}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                title="Add contact"
              >
                +
              </button>
            )}
          </div>

          {/* Tabs */}
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'contacts' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('contacts')}
            >
              My Contacts
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'other' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('other')}
            >
              Other Contacts
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'directory' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('directory')}
            >
              Directory
            </button>
          </div>

          {/* Search - show different search based on tab */}
          <div style={styles.searchContainer}>
            <div style={styles.searchInputWrapper}>
              {activeTab === 'contacts' ? (
                <>
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    style={styles.searchInput}
                  />
                  {searchQuery && (
                    <button
                      style={styles.clearSearchButton}
                      onClick={handleClearSearch}
                      title="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </>
              ) : activeTab === 'other' ? (
                <div style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  People you&apos;ve interacted with ({sortedOtherContacts.length})
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search company directory..."
                    value={directorySearchQuery}
                    onChange={e => handleDirectorySearchChange(e.target.value)}
                    style={styles.searchInput}
                  />
                  {directorySearchQuery && (
                    <button
                      style={styles.clearSearchButton}
                      onClick={() => {
                        setDirectorySearchQuery('')
                        setDirectoryResults([])
                      }}
                      title="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Batch Selection Toolbar - only show for contacts tab */}
          {activeTab === 'contacts' && selectedContacts.size > 0 && (
            <div style={styles.batchToolbar}>
              <div style={styles.batchInfo}>
                <input
                  type="checkbox"
                  checked={(() => {
                    const deletableContacts = sortedContacts.filter(c => canDeleteContact(c))
                    return selectedContacts.size === deletableContacts.length && deletableContacts.length > 0
                  })()}
                  onChange={handleSelectAll}
                  style={styles.checkbox}
                  title="Select all"
                />
                <span style={styles.batchCount}>
                  {selectedContacts.size} selected
                </span>
              </div>
              <div style={styles.batchActions}>
                <button
                  style={{ ...styles.batchButton, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  onClick={handleClearSelection}
                >
                  Cancel
                </button>
                <button
                  style={{ ...styles.batchButton, backgroundColor: 'var(--danger-color)', color: '#FFFFFF' }}
                  onClick={() => setShowBatchDeleteConfirm(true)}
                >
                  Delete ({selectedContacts.size})
                </button>
              </div>
            </div>
          )}

          <div style={styles.contactList}>
            {activeTab === 'contacts' ? (
              // Contacts Tab
              loading || searching ? (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner} />
                </div>
              ) : sortedContacts.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>&#128101;</div>
                  <div style={styles.emptyText}>
                    {searchQuery ? 'No contacts found' : 'No contacts yet'}
                  </div>
                </div>
              ) : (
                sortedContacts.map(contact => {
                  const isViewing = selectedContact?.resourceName === contact.resourceName
                  const isChecked = selectedContacts.has(contact.resourceName)
                  const displayName = getDisplayName(contact)
                  const isDeletable = canDeleteContact(contact)
                  return (
                    <div
                      key={contact.resourceName}
                      data-testid="contact-item"
                      style={{
                        ...styles.contactItem,
                        ...(isViewing ? styles.contactItemSelected : {}),
                        ...(isChecked ? { backgroundColor: 'var(--bg-tertiary)' } : {}),
                      }}
                      onClick={() => setSelectedContact(contact)}
                      onMouseEnter={e => {
                        if (!isViewing && !isChecked) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                      }}
                      onMouseLeave={e => {
                        if (!isViewing && !isChecked) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      {isDeletable ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={e => handleToggleSelect(contact.resourceName, e)}
                          onChange={() => {}}
                          style={styles.checkbox}
                        />
                      ) : (
                        // Spacer to maintain alignment for directory contacts
                        <div style={{ width: '20px', marginRight: '12px' }} />
                      )}
                      {contact.phone?.contact_photo_url ? (
                        <img
                          src={contact.phone.contact_photo_url}
                          alt={displayName}
                          style={{
                            ...styles.avatar,
                            objectFit: 'cover' as const,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            ...styles.avatar,
                            backgroundColor: getAvatarColor(displayName),
                          }}
                        >
                          {getInitials(contact)}
                        </div>
                      )}
                      <div style={styles.contactInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={styles.contactName}>{displayName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.resourceName}]</span></div>
                          {contact.starred && (
                            <span style={{ color: '#FBBC05', fontSize: '12px', flexShrink: 0 }}>&#9733;</span>
                          )}
                        </div>
                        <div style={styles.contactEmail}>
                          {getPrimaryEmail(contact) || getPrimaryPhone(contact) || ''}
                        </div>
                      </div>
                      {contact.isWorkspaceUser && (
                        <span style={styles.workspaceBadge}>Org</span>
                      )}
                    </div>
                  )
                })
              )
            ) : activeTab === 'other' ? (
              // Other Contacts Tab
              loadingOtherContacts ? (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner} />
                </div>
              ) : sortedOtherContacts.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>&#128101;</div>
                  <div style={styles.emptyText}>
                    No other contacts yet
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    People you interact with will appear here
                  </div>
                </div>
              ) : (
                sortedOtherContacts.map(contact => {
                  const isViewing = selectedContact?.resourceName === contact.resourceName
                  const displayName = getDisplayName(contact)
                  return (
                    <div
                      key={contact.resourceName}
                      data-testid="other-contact-item"
                      style={{
                        ...styles.contactItem,
                        ...(isViewing ? styles.contactItemSelected : {}),
                      }}
                      onClick={() => {
                        setSelectedContact(contact)
                        setSelectedContacts(new Set()) // Clear multi-select when switching views
                      }}
                      onMouseEnter={e => {
                        if (!isViewing) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                      }}
                      onMouseLeave={e => {
                        if (!isViewing) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div
                        style={{
                          ...styles.avatar,
                          backgroundColor: getAvatarColor(displayName),
                          marginLeft: '30px',
                        }}
                      >
                        {getInitials(contact)}
                      </div>
                      <div style={styles.contactInfo}>
                        <div style={styles.contactName}>{displayName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.resourceName}]</span></div>
                        <div style={styles.contactEmail}>
                          {getPrimaryEmail(contact) || getPrimaryPhone(contact) || ''}
                        </div>
                      </div>
                    </div>
                  )
                })
              )
            ) : (
              // Directory Tab
              searchingDirectory ? (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner} />
                </div>
              ) : !directorySearchQuery ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>&#127970;</div>
                  <div style={styles.emptyText}>
                    Search for people in your organization
                  </div>
                </div>
              ) : sortedDirectoryResults.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>&#128101;</div>
                  <div style={styles.emptyText}>
                    No results found in directory
                  </div>
                </div>
              ) : (
                sortedDirectoryResults.map(contact => {
                  const isViewing = selectedContact?.resourceName === contact.resourceName
                  const displayName = getDisplayName(contact)
                  return (
                    <div
                      key={contact.resourceName}
                      data-testid="directory-item"
                      style={{
                        ...styles.contactItem,
                        ...(isViewing ? styles.contactItemSelected : {}),
                      }}
                      onClick={() => {
                        setSelectedContact(contact)
                        setSelectedContacts(new Set()) // Clear multi-select when switching views
                      }}
                      onMouseEnter={e => {
                        if (!isViewing) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                      }}
                      onMouseLeave={e => {
                        if (!isViewing) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div
                        style={{
                          ...styles.avatar,
                          backgroundColor: getAvatarColor(displayName),
                          marginLeft: '30px',
                        }}
                      >
                        {getInitials(contact)}
                      </div>
                      <div style={styles.contactInfo}>
                        <div style={styles.contactName}>{displayName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.resourceName}]</span></div>
                        <div style={styles.contactEmail}>
                          {getPrimaryEmail(contact) || getPrimaryPhone(contact) || ''}
                        </div>
                      </div>
                      <span style={styles.workspaceBadge}>Org</span>
                    </div>
                  )
                })
              )
            )}
          </div>
        </div>

        {/* Main Content */}
        <div style={styles.mainContent}>
          {!selectedContact ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>&#128100;</div>
              <div style={styles.emptyText}>Select a contact to view details</div>
            </div>
          ) : (
            <div style={styles.detailPanel} data-snapshot-record={selectedContact.resourceName}>
              <div style={styles.detailHeader}>
                {selectedContact.phone?.contact_photo_url ? (
                  <img
                    src={selectedContact.phone.contact_photo_url}
                    alt={getDisplayName(selectedContact)}
                    style={{
                      ...styles.detailAvatar,
                      objectFit: 'cover' as const,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      ...styles.detailAvatar,
                      backgroundColor: getAvatarColor(getDisplayName(selectedContact)),
                    }}
                  >
                    {getInitials(selectedContact)}
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={styles.detailName}>
                      {getDisplayName(selectedContact)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedContact.resourceName}]</span>
                    </h2>
                    {selectedContact.starred && (
                      <span style={{ color: '#FBBC05', fontSize: '20px' }} title="Favorite">&#9733;</span>
                    )}
                  </div>
                  {selectedContact.isWorkspaceUser && (
                    <div style={styles.orgIndicator}>
                      <span style={{ ...styles.workspaceBadge, marginLeft: 0 }}>Org</span>
                      <span style={styles.orgDescription}>From your organization's directory</span>
                    </div>
                  )}
                  <div style={styles.detailActions}>
                    {canEditContact(selectedContact) && (
                      <button
                        style={styles.actionButton}
                        onClick={() => handleOpenEditModal(selectedContact)}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                      >
                        Edit
                      </button>
                    )}
                    {canDeleteContact(selectedContact) && (
                      <button
                        style={{ ...styles.actionButton, ...styles.deleteButton }}
                        onClick={() => handleOpenDeleteConfirm(selectedContact)}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 59, 48, 0.1)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Email Section */}
              {selectedContact.emailAddresses && selectedContact.emailAddresses.length > 0 && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Email</div>
                  {selectedContact.emailAddresses.map((email, idx) => (
                    <div key={idx} style={styles.detailRow}>
                      <div style={styles.detailIcon}>&#9993;</div>
                      <div style={styles.detailContent}>
                        <div style={styles.detailValue}>{email.value}</div>
                        <div style={styles.detailLabel}>
                          {email.type || 'Email'}{email.primary && ' • Primary'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Phone Section */}
              {selectedContact.phoneNumbers && selectedContact.phoneNumbers.length > 0 && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Phone</div>
                  {selectedContact.phoneNumbers.map((phone, idx) => (
                    <div key={idx} style={styles.detailRow}>
                      <div style={styles.detailIcon}>&#128222;</div>
                      <div style={styles.detailContent}>
                        <div style={styles.detailValue}>{phone.value}</div>
                        <div style={styles.detailLabel}>
                          {phone.type || 'Phone'}{phone.primary && ' • Primary'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Organization Section */}
              {selectedContact.organizations && selectedContact.organizations.length > 0 && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Work</div>
                  {selectedContact.organizations.map((org, idx) => (
                    <div key={idx} style={styles.detailRow}>
                      <div style={styles.detailIcon}>&#127970;</div>
                      <div style={styles.detailContent}>
                        {org.title && <div style={styles.detailValue}>{org.title}</div>}
                        {org.name && (
                          <div style={styles.detailLabel}>
                            {org.name}{org.department && ` • ${org.department}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Whatsup Section */}
              {selectedContact.whatsup && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Whatsup</div>
                  <div style={styles.detailRow}>
                    <div style={styles.detailIcon}>&#128172;</div>
                    <div style={styles.detailContent}>
                      {selectedContact.whatsup.profile_name && (
                        <div style={styles.detailValue}>{selectedContact.whatsup.profile_name}{selectedContact.whatsup.jid && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedContact.whatsup.jid}]</span>}</div>
                      )}
                      {selectedContact.whatsup.phone_number && (
                        <div style={styles.detailLabel}>{selectedContact.whatsup.phone_number}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Phone Contact Section */}
              {selectedContact.phone && selectedContact.phone.contact_id && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Phone Contact</div>
                  <div style={styles.detailRow}>
                    <div style={styles.detailIcon}>&#128241;</div>
                    <div style={styles.detailContent}>
                      <div style={styles.detailValue}>
                        {selectedContact.phone.contact_name || 'Phone Contact'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedContact.phone.contact_id}]</span>
                      </div>
                      {selectedContact.phone.recipient_type && (
                        <div style={styles.detailLabel}>{selectedContact.phone.recipient_type}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Groups & Labels Section */}
              {(() => {
                const labels: string[] = []
                if (selectedContact.memberships && selectedContact.memberships.length > 0) {
                  labels.push(...selectedContact.memberships)
                }
                if (selectedContact.isWorkspaceUser) labels.push('Workspace Directory')
                if (selectedContact.whatsup) labels.push('Whatsup')
                if (selectedContact.phone) labels.push('Phone Contact')
                if (selectedContact.resourceName.startsWith('otherContacts/')) labels.push('Other Contacts')
                return labels.length > 0 ? (
                  <div style={styles.detailSection}>
                    <div style={styles.sectionTitle}>Labels</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {labels.map((label, idx) => (
                        <span key={idx} style={{
                          fontSize: '12px',
                          color: 'var(--accent-color)',
                          backgroundColor: 'var(--bg-tertiary)',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: 500,
                        }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              {/* Notes Section */}
              {selectedContact.notes && (
                <div style={styles.detailSection}>
                  <div style={styles.sectionTitle}>Notes</div>
                  <div style={styles.detailRow}>
                    <div style={styles.detailIcon}>&#128221;</div>
                    <div style={styles.detailContent}>
                      <div style={styles.detailValue}>{selectedContact.notes}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Create/Edit Contact Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editMode ? 'Edit Contact' : 'Create Contact'}</h2>
              <button
                style={styles.closeButton}
                onClick={handleCloseModal}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                &times;
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, ...styles.formRowItem }}>
                  <label style={styles.formLabel}>First Name *</label>
                  <input
                    type="text"
                    style={{
                      ...styles.formInput,
                      ...(formErrors.givenName ? styles.formInputError : {}),
                    }}
                    value={formData.givenName}
                    onChange={e => handleInputChange('givenName', e.target.value)}
                    placeholder="John"
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                    onBlur={e => e.currentTarget.style.borderColor = formErrors.givenName ? 'var(--danger-color)' : 'var(--border-color)'}
                  />
                  {formErrors.givenName && (
                    <div style={styles.formError}>{formErrors.givenName}</div>
                  )}
                </div>

                <div style={{ ...styles.formGroup, ...styles.formRowItem }}>
                  <label style={styles.formLabel}>Last Name</label>
                  <input
                    type="text"
                    style={styles.formInput}
                    value={formData.familyName}
                    onChange={e => handleInputChange('familyName', e.target.value)}
                    placeholder="Doe"
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ ...styles.formLabel, marginBottom: 0 }}>Email</label>
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                  >
                    + Add
                  </button>
                </div>
                {formData.emails.map((entry, idx) => {
                  const errorKey = `emails_${idx}`
                  const error = formErrors[errorKey]
                  return (
                    <div key={idx} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          value={entry.type}
                          onChange={e => handleEmailTypeChange(idx, e.target.value)}
                          style={{ ...styles.formInput, width: '90px', flex: 'none', padding: '6px 4px' }}
                        >
                          <option value="home">Home</option>
                          <option value="work">Work</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          type="email"
                          style={{
                            ...styles.formInput,
                            ...(error ? styles.formInputError : {}),
                            flex: 1,
                          }}
                          value={entry.value}
                          onChange={e => handleEmailEntryChange(idx, e.target.value)}
                          placeholder="john.doe@example.com"
                          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                          onBlur={e => e.currentTarget.style.borderColor = error ? 'var(--danger-color)' : 'var(--border-color)'}
                        />
                        {formData.emails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '16px', padding: '4px', flexShrink: 0 }}
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {error && <div style={styles.formError}>{error}</div>}
                    </div>
                  )
                })}
              </div>

              <div style={styles.formGroup}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ ...styles.formLabel, marginBottom: 0 }}>Phone</label>
                  <button
                    type="button"
                    onClick={handleAddPhone}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                  >
                    + Add
                  </button>
                </div>
                {formData.phones.map((entry, idx) => {
                  const errorKey = `phones_${idx}`
                  const error = formErrors[errorKey]
                  return (
                    <div key={idx} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          value={entry.type}
                          onChange={e => handlePhoneTypeChange(idx, e.target.value)}
                          style={{ ...styles.formInput, width: '90px', flex: 'none', padding: '6px 4px' }}
                        >
                          <option value="mobile">Mobile</option>
                          <option value="home">Home</option>
                          <option value="work">Work</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          type="tel"
                          style={{
                            ...styles.formInput,
                            ...(error ? styles.formInputError : {}),
                            flex: 1,
                          }}
                          value={entry.value}
                          onChange={e => handlePhoneEntryChange(idx, e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                          onBlur={e => e.currentTarget.style.borderColor = error ? 'var(--danger-color)' : 'var(--border-color)'}
                        />
                        {formData.phones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhone(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '16px', padding: '4px', flexShrink: 0 }}
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {error && <div style={styles.formError}>{error}</div>}
                    </div>
                  )
                })}
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, ...styles.formRowItem }}>
                  <label style={styles.formLabel}>Organization</label>
                  <input
                    type="text"
                    style={styles.formInput}
                    value={formData.organization}
                    onChange={e => handleInputChange('organization', e.target.value)}
                    placeholder="Company name"
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>

                <div style={{ ...styles.formGroup, ...styles.formRowItem }}>
                  <label style={styles.formLabel}>Job Title</label>
                  <input
                    type="text"
                    style={styles.formInput}
                    value={formData.jobTitle}
                    onChange={e => handleInputChange('jobTitle', e.target.value)}
                    placeholder="Job title"
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Notes</label>
                <textarea
                  style={{
                    ...styles.formInput,
                    minHeight: '40px',
                    resize: 'vertical' as const,
                  }}
                  value={formData.notes}
                  onChange={e => handleInputChange('notes', e.target.value)}
                  placeholder="Add notes about this contact"
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>

              {formErrors._general && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(255, 59, 48, 0.1)',
                  borderRadius: '8px',
                  color: 'var(--danger-color)',
                  fontSize: '14px',
                }}>
                  {formErrors._general}
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.cancelButton}
                onClick={handleCloseModal}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.saveButton,
                  ...(saving ? styles.saveButtonDisabled : {}),
                }}
                onClick={handleSaveContact}
                disabled={saving}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.opacity = '1' }}
              >
                {saving ? (editMode ? 'Saving...' : 'Creating...') : (editMode ? 'Save' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingContact && (
        <div style={styles.modalOverlay} onClick={handleCloseDeleteConfirm}>
          <div style={{ ...styles.modal, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Delete Contact</h2>
              <button
                style={styles.closeButton}
                onClick={handleCloseDeleteConfirm}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                &times;
              </button>
            </div>

            <div style={styles.modalBody}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Are you sure you want to delete <strong>{getDisplayName(deletingContact)}</strong><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{deletingContact.resourceName}]</span>?
                This action cannot be undone.
              </p>
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.cancelButton}
                onClick={handleCloseDeleteConfirm}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.saveButton,
                  backgroundColor: 'var(--danger-color)',
                  opacity: deleting ? 0.5 : 1,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
                onClick={handleDeleteContact}
                disabled={deleting}
                onMouseEnter={e => { if (!deleting) e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={e => { if (!deleting) e.currentTarget.style.opacity = '1' }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div style={styles.modalOverlay} onClick={() => !batchDeleting && setShowBatchDeleteConfirm(false)}>
          <div style={{ ...styles.modal, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Delete Contacts</h2>
              {!batchDeleting && (
                <button
                  style={styles.closeButton}
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  &times;
                </button>
              )}
            </div>

            <div style={styles.modalBody}>
              {batchDeleting ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={styles.spinner} />
                  <p style={{ margin: '16px 0 0', color: 'var(--text-secondary)' }}>
                    Deleting {batchDeleteProgress.current} of {batchDeleteProgress.total} contacts...
                  </p>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Are you sure you want to delete <strong>{selectedContacts.size} contacts</strong>?
                  This action cannot be undone.
                </p>
              )}
            </div>

            {!batchDeleting && (
              <div style={styles.modalFooter}>
                <button
                  style={styles.cancelButton}
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                >
                  Cancel
                </button>
                <button
                  style={{ ...styles.saveButton, backgroundColor: 'var(--danger-color)' }}
                  onClick={handleBatchDelete}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Delete All
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  )
}
