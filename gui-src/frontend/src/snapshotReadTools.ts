/** Read-only projections over authored snapshots. No task/API code is executed. */
import { extraNativeServices, tryExtraSnapshotRead } from './snapshotExtraReadTools'
import { moreNativeServices, tryMoreSnapshotRead } from './snapshotMoreReadTools'
import { streamifyNativeServices, tryStreamifySnapshotRead } from './snapshotStreamifyReadTools'
import { calendarSnapshotDateTime } from './snapshotCalendar'
type RecordValue = Record<string, any>
const own = (value: any, key: string) => value != null && Object.prototype.hasOwnProperty.call(value, key)
const values = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
const records = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => item && typeof item === 'object' ? { id: key, ...item } : item) : []
const text = (value: any) => typeof value === 'string' ? value : JSON.stringify(value ?? '')
const matches = (value: any, query: any) => !query || text(value).toLocaleLowerCase().includes(String(query).toLocaleLowerCase())
const need = (value: any, label: string): any => {
  if (value === undefined || value === null) throw new Error(`${label} is not stored in this snapshot. Open Snapshot data to inspect the available fields.`)
  return value
}
const lookup = (collection: any, id: any, label: string): any => need(collection?.[id] ?? records(collection).find(item => [item?.id, item?.key, item?.name, item?.resourceName, item?.chat_jid].includes(id)), label)
const limit = (items: any[], params: RecordValue, fallback = 1000) => {
  const start = Math.max(0, Number(params.start_at ?? params.startAt ?? params.pageToken ?? params.cursor ?? 0) || 0)
  const size = Math.max(1, Math.min(10000, Number(params.max_results ?? params.maxResults ?? params.pageSize ?? params.limit ?? fallback) || fallback))
  return { items: items.slice(start, start + size), start, size, next: start + size < items.length ? String(start + size) : undefined, total: items.length }
}
const userState = (db: RecordValue, id = 'me') => {
  const users = need(db.users, 'User data')
  return need(users[id] ?? (id === 'me' ? Object.values(users)[0] : undefined), `User ${id}`)
}

export const supportedNativeServices = [
  ...extraNativeServices,
  ...moreNativeServices,
  ...streamifyNativeServices,
  'gridwell_mail', 'gridwell_calendar', 'contacts', 'gridwell_drive', 'gridwell_docs', 'gridwell_sheets',
  'slick', 'zira', 'whatsup', 'generic_reminders', 'notes_and_lists', 'clock',
  // These native apps browse their stored records through the /state endpoint.
  'messages', 'phone', 'notifications', 'device_setting', 'device_actions',
]

function mailQuery(message: any, query: string): boolean {
  const terms = query.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  return terms.every(raw => {
    const negative = raw.startsWith('-')
    const token = negative ? raw.slice(1) : raw
    const colon = token.indexOf(':')
    let matched: boolean
    if (colon < 0) matched = matches([message.subject, message.body, message.sender, message.recipient], token.replace(/^"|"$/g, ''))
    else {
      const key = token.slice(0, colon).toLowerCase(), value = token.slice(colon + 1).replace(/^"|"$/g, '')
      if (key === 'from') matched = matches(message.sender, value)
      else if (key === 'to') matched = matches(message.recipient, value)
      else if (key === 'subject') matched = matches(message.subject, value)
      else if (key === 'label' || key === 'in') matched = (message.labelIds || []).some((label: string) => label.toLowerCase() === value.toLowerCase())
      else if (key === 'is' && ['read', 'unread', 'starred'].includes(value)) matched = value === 'read' ? !message.labelIds?.includes('UNREAD') : message.labelIds?.includes(value.toUpperCase())
      else if (key === 'has' && value === 'attachment') matched = !!message.payload?.parts?.some((part: any) => part.filename || part.body?.attachmentId)
      else if (key === 'after' || key === 'before') { const date = new Date(message.date || Number(message.internalDate)).getTime(); matched = key === 'after' ? date > new Date(value).getTime() : date < new Date(value).getTime() }
      else throw new Error(`Mail search operator ${key}: is not supported by the static snapshot viewer.`)
    }
    return negative ? !matched : !!matched
  })
}

function driveQuery(file: any, query: string): boolean {
  if (!query) return true
  const clauses = query.split(/\s+and\s+/i)
  return clauses.every(clause => {
    let match: RegExpMatchArray | null
    const value = clause.trim().replace(/^\(|\)$/g, '')
    if ((match = value.match(/^(trashed|starred)\s*=\s*(true|false)$/i))) return !!file[match[1]] === (match[2].toLowerCase() === 'true')
    if ((match = value.match(/^(name|mimeType|fullText)\s+(contains|=|!=)\s+'((?:\\'|[^'])*)'$/i))) {
      const actual = match[1] === 'fullText' ? text(file) : String(file[match[1]] || '')
      const expected = match[3].replace(/\\'/g, "'")
      return match[2] === 'contains' ? actual.toLowerCase().includes(expected.toLowerCase()) : match[2] === '=' ? actual === expected : actual !== expected
    }
    if ((match = value.match(/^'([^']+)'\s+in\s+(parents|owners|writers|readers)$/i))) {
      const items = file[match[2]] || []
      if (match[1] === 'root' && match[2] === 'parents') return !items.length || items.includes('root')
      if (match[1] === 'me' && match[2] === 'owners') return items.some((owner: any) => owner.me === true || owner.isAuthenticatedUser === true) || file.ownedByMe === true
      return items.some((item: any) => item === match![1] || item.emailAddress === match![1])
    }
    if (value === 'sharedWithMe') return !!file.shared || (file.permissions || []).some((permission: any) => permission.role !== 'owner')
    throw new Error(`This Drive search expression is not supported by the snapshot viewer: ${value}`)
  })
}

function a1(range: string) {
  const separator = range.lastIndexOf('!')
  const title = (separator < 0 ? range : range.slice(0, separator)).replace(/^'|'$/g, '').replace(/''/g, "'")
  const cell = separator < 0 ? 'A1:ZZ10000' : range.slice(separator + 1)
  const match = cell.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/i)
  if (!match) throw new Error(`Unsupported spreadsheet range: ${range}`)
  const col = (s: string) => [...s.toUpperCase()].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1
  return { title, c0: match[1] ? col(match[1]) : 0, r0: match[2] ? Number(match[2]) - 1 : 0,
    c1: match[3] ? col(match[3]) : match[0].includes(':') ? 701 : match[1] ? col(match[1]) : 701,
    r1: match[4] ? Number(match[4]) - 1 : match[0].includes(':') ? 9999 : match[2] ? Number(match[2]) - 1 : 9999 }
}

function sheetValues(file: any, range: string, dimension?: string) {
  const content = file.spreadsheet || file
  const stored = need(content.data, 'Spreadsheet cell data')
  const target = a1(range)
  const grid: any[][] = []
  for (const [key, rows] of Object.entries(stored)) {
    const source = a1(key)
    if (source.title !== target.title || !Array.isArray(rows)) continue
    rows.forEach((row: any[], r: number) => row.forEach((value, c) => {
      const y = source.r0 + r, x = source.c0 + c
      if (y >= target.r0 && y <= target.r1 && x >= target.c0 && x <= target.c1) {
        const outRow = y - target.r0, outCol = x - target.c0
        while (grid.length <= outRow) grid.push([])
        while (grid[outRow].length <= outCol) grid[outRow].push('')
        grid[outRow][outCol] = value
      }
    }))
  }
  if (dimension === 'COLUMNS') return Array.from({ length: Math.max(0, ...grid.map(row => row.length)) }, (_, c) => grid.map(row => row[c] ?? ''))
  return grid
}

function read(service: string, tool: string, p: RecordValue, databases: RecordValue): any {
  const db = need(databases[service], service)
  if (service === 'device_setting') {
    const settings = () => need(db.device_settings?.settings, 'Device settings')
    if (tool === 'get') return need(own(settings(), p.setting_type) ? settings()[p.setting_type] : undefined, `Device setting ${p.setting_type}`)
    if (tool === 'get_installed_apps') return { apps: Object.keys(need(db.installed_apps?.apps, 'Installed application settings')) }
    if (tool === 'get_app_notification_status') {
      const app = need(db.installed_apps?.apps?.[p.app_name], `Application settings for ${p.app_name}`)
      return { notifications: need(app.notifications?.value, `Notification setting for ${p.app_name}`) }
    }
    if (tool === 'list_all_available_wifi') return { available_networks: need(settings().WIFI?.available_networks, 'Stored Wi-Fi networks') }
    if (tool === 'get_device_insights') {
      const insight = need(db.device_insights?.insights?.[p.device_state_type], `Device insight ${p.device_state_type}`)
      return { action_card_content_passthrough: JSON.stringify({ insights: Object.entries(insight).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`) }) }
    }
  }
  if (service === 'device_actions' && tool === 'get_installed_apps') return { apps: need(db.phone_state?.installed_apps, 'Installed applications') }
  if (service === 'gridwell_mail') {
    const user = userState(db, p.userId || 'me')
    const messages = () => records(need(user.messages, 'Mail messages'))
    if (tool === 'get_user_profile') return { ...need(user.profile, 'Mail profile'), messagesTotal: messages().length, threadsTotal: values(user.threads).length }
    if (tool === 'check_user_exists') return { exists: !!(db.users?.[p.userId] || p.userId === 'me') }
    if (tool === 'list_labels') return { labels: records(need(user.labels, 'Mail labels')) }
    if (tool === 'list_messages') {
      const filtered = messages().filter(message => (!p.labelIds?.length || p.labelIds.every((label: string) => message.labelIds?.includes(label))) && (p.include_spam_trash || !message.labelIds?.some((label: string) => ['SPAM', 'TRASH'].includes(label))) && (!p.q || mailQuery(message, p.q)))
        .sort((a, b) => Number(b.internalDate || new Date(b.date).getTime()) - Number(a.internalDate || new Date(a.date).getTime()))
      const page = limit(filtered, p)
      return { messages: page.items, nextPageToken: page.next, resultSizeEstimate: page.total }
    }
    if (tool === 'get_message') return lookup(user.messages, p.id, 'Message')
    if (tool === 'get_thread') {
      const thread = lookup(user.threads, p.id, 'Mail thread')
      const items = (thread.messageIds ? thread.messageIds.map((id: string) => user.messages?.[id]).filter(Boolean) : messages().filter(message => message.threadId === p.id)).sort((a: any, b: any) => Number(a.internalDate || 0) - Number(b.internalDate || 0))
      return { ...thread, messages: items }
    }
    if (tool === 'list_drafts') return { drafts: records(need(user.drafts, 'Mail drafts')) }
    if (tool === 'get_draft') return lookup(user.drafts, p.id, 'Mail draft')
    if (tool === 'get_message_attachment') return lookup(db.attachments, p.id || p.attachmentId, 'Attachment')
    if (tool === 'list_history_records') return { history: values(need(user.history, 'Mail history')) }
    const settingKeys: RecordValue = { get_vacation_settings: 'vacation', get_auto_forwarding_settings: 'autoForwarding', get_imap_settings: 'imap', get_pop_settings: 'pop', get_language_settings: 'language' }
    if (settingKeys[tool]) return need(user.settings?.[settingKeys[tool]], 'Mail settings')
    if (tool === 'list_send_as_aliases') return { sendAs: records(need(user.settings?.sendAs, 'Send-as aliases')) }
  }

  if (service === 'gridwell_calendar') {
    const primary = records(db.calendars).find(calendar => calendar.primary)?.id || records(db.calendar_list).find(calendar => calendar.primary)?.id
    const calendarId = p.calendarId === 'primary' ? primary || 'primary' : p.calendarId
    const events = () => Object.entries(need(db.events, 'Calendar events')).map(([key, value]: [string, any]) => {
      const event = { ...value,
        calendarId: value.calendarId || value.calendar_id || (value.id && key.endsWith(`:${value.id}`) ? key.slice(0, -String(value.id).length - 1) : undefined) }
      for (const field of ['start', 'end', 'originalStartTime']) {
        if (own(event, field)) event[field] = calendarSnapshotDateTime(event[field])
      }
      return event
    })
    if (tool === 'list_calendar_list_entries') return { items: records(need(db.calendar_list, 'Calendar list')).filter(calendar => p.showHidden || !calendar.hidden) }
    if (tool === 'get_calendar_and_event_colors') return need(db.colors, 'Calendar colors')
    if (tool === 'get_calendar_list_entry') return lookup(db.calendar_list, calendarId, 'Calendar list entry')
    if (tool === 'get_calendar_metadata') return lookup(db.calendars, calendarId, 'Calendar')
    if (tool === 'list_events' || tool === 'list_event_instances') {
      let items = events().filter(event => event.calendarId === calendarId)
      if (tool === 'list_event_instances') items = items.filter(event => event.recurringEventId === p.eventId)
      items = items.filter(event => (!p.q || matches(event, p.q)) && (p.showDeleted || event.status !== 'cancelled') && (event.recurrence?.length || (!p.timeMin || new Date(event.end?.dateTime || event.end?.date).getTime() >= new Date(p.timeMin).getTime()) && (!p.timeMax || new Date(event.start?.dateTime || event.start?.date).getTime() < new Date(p.timeMax).getTime())))
      return { items: items.sort((a, b) => Date.parse(a.start?.dateTime || a.start?.date) - Date.parse(b.start?.dateTime || b.start?.date)) }
    }
    if (tool === 'get_event') return need(events().find(event => event.id === p.eventId && (!calendarId || event.calendarId === calendarId)), 'Calendar event')
    if (tool === 'list_access_control_rules') return { items: records(need(db.acl_rules, 'Calendar access rules')).filter(rule => rule.calendarId === calendarId) }
    if (tool === 'get_access_control_rule') return lookup(db.acl_rules, p.ruleId, 'Calendar access rule')
  }

  if (service === 'contacts') {
    const keys: RecordValue = { list_contacts: 'myContacts', get_other_contacts: 'otherContacts', search_directory: 'directory', list_workspace_users: 'directory' }
    if (keys[tool]) {
      let contacts = records(need(db[keys[tool]], 'Contacts')).filter(contact => matches(contact, p.query || p.search_query || p.search_string))
      if (tool === 'list_workspace_users') contacts = contacts.filter(contact => contact.isWorkspaceUser)
      const page = limit(contacts, p)
      return { contacts: page.items, people: page.items, users: page.items, nextPageToken: page.next, totalItems: page.total }
    }
  }

  if (['gridwell_drive', 'gridwell_docs', 'gridwell_sheets'].includes(service)) {
    // These services store the shared Drive file system. Prefer the requested
    // service snapshot, with other stored copies used only when a file is absent.
    const candidateStates = [db, ...['gridwell_drive', 'gridwell_docs', 'gridwell_sheets', 'gridwell_slides'].filter(key => key !== service).map(key => databases[key]).filter(Boolean)]
    const users = candidateStates.map(state => userState(state, p.userId || 'me'))
    const user = users[0]
    const fileId = p.fileId || p.documentId || p.spreadsheet_id || p.spreadsheetId
    const file = () => need(users.map(current => current.files?.[fileId]).find(Boolean), `File ${fileId}`)
    if (tool === 'list_user_files') {
      const allFiles = records(need(user.files, 'Drive files')).filter(item => driveQuery(item, p.q || ''))
      const page = limit(allFiles, p)
      return { files: page.items, nextPageToken: page.next }
    }
    if (['get_file_metadata_or_content', 'get_document', 'get_spreadsheet'].includes(tool)) return file()
    if (tool === 'get_file_content') return need(file().content, 'File content')
    if (tool === 'get_drive_account_info') return need(user.about, 'Drive account information')
    if (tool === 'list_user_shared_drives') return { drives: records(need(user.drives || user.team_drives, 'Shared drives')) }
    if (tool === 'list_permissions') return { permissions: records(need(file().permissions, 'File permissions')) }
    if (tool === 'get_permission') return lookup(file().permissions, p.permissionId, 'File permission')
    if (tool === 'list_file_revisions') return { revisions: records(need(file().revisions, 'File revisions')) }
    if (tool === 'list_file_labels') return { labels: records(need(file().labelInfo?.labels ?? user.labels, 'File labels')) }
    if (tool === 'list_comments') return { comments: records(need(user.comments, 'File comments')).filter(comment => comment.fileId === fileId || comment.file_id === fileId) }
    if (tool === 'get_file_comment') return lookup(user.comments, p.commentId, 'File comment')
    if (tool === 'list_comment_replies') return { replies: records(need(user.replies, 'Comment replies')).filter(reply => reply.commentId === p.commentId || reply.comment_id === p.commentId) }
    if (tool === 'list_installed_apps') return { items: records(need(user.apps, 'Installed Drive applications')) }
    if (tool === 'get_app_details') return lookup(user.apps, p.appId, 'Drive application')
    if (tool === 'get_spreadsheet_values') return { range: p.range, majorDimension: p.majorDimension || 'ROWS', values: sheetValues(file(), p.range, p.majorDimension) }
    if (tool === 'batch_get_spreadsheet_values') return { spreadsheetId: fileId, valueRanges: (p.ranges || []).map((range: string) => ({ range, majorDimension: p.majorDimension || 'ROWS', values: sheetValues(file(), range, p.majorDimension) })) }
  }

  if (service === 'generic_reminders' && ['get_reminders', 'show_matching_reminders'].includes(tool)) {
    // The actual ID lookup includes completed and deleted records; retrieval
    // filters only apply to a query, not to explicitly requested reminder IDs.
    if (tool === 'show_matching_reminders' && p.reminder_ids?.length) {
      return { reminders: p.reminder_ids.map((id: string) => lookup(db.reminders, id, 'Reminder')) }
    }
    let reminders = records(need(db.reminders, 'Reminders')).filter(reminder => (p.include_completed || !reminder.completed) && (p.include_deleted || !reminder.deleted) && matches(reminder, p.query))
    if (p.reminder_ids?.length) reminders = reminders.filter(reminder => p.reminder_ids.includes(reminder.id))
    if (p.from_date) reminders = reminders.filter(reminder => reminder.start_date >= p.from_date)
    if (p.to_date) reminders = reminders.filter(reminder => reminder.start_date <= p.to_date)
    if (p.is_recurring != null) reminders = reminders.filter(reminder => !!reminder.is_recurring === p.is_recurring)
    return { reminders }
  }
  if (service === 'notes_and_lists' && ['show_all', 'get_notes_and_lists', 'search_notes_and_lists', 'show_notes_and_lists'].includes(tool)) {
    const filter = (item: any) => (!p.item_ids?.length || p.item_ids.includes(item.id)) && matches(item, p.query)
    if (tool === 'show_all') return { notes: need(db.notes, 'Notes'), lists: need(db.lists, 'Lists') }
    return { notes: records(need(db.notes, 'Notes')).filter(filter), lists: records(need(db.lists, 'Lists')).filter(filter) }
  }
  if (service === 'clock') {
    if (tool === 'show_matching_alarms') return { alarms: records(need(db.alarms, 'Alarms')).filter(item => !p.alarm_ids?.length || p.alarm_ids.includes(item.alarm_id)) }
    if (tool === 'show_matching_timers') return { timers: records(need(db.timers, 'Timers')).filter(item => !p.timer_ids?.length || p.timer_ids.includes(item.timer_id)) }
    if (tool === 'show_stopwatch') return need(db.stopwatch, 'Stopwatch')
  }

  if (service === 'whatsup') {
    const chats = () => records(need(db.chats, 'Chats'))
    const chat = () => lookup(db.chats, p.chat_jid || p.jid, 'Chat')
    if (tool === 'list_chats') return { chats: chats().filter(item => matches(item.name || item, p.query)).sort((a, b) => String(b.last_active_timestamp || '').localeCompare(String(a.last_active_timestamp || ''))).map(item => ({ ...item, last_message: values(item.messages).at(-1) })) }
    if (tool === 'get_chat') return chat()
    if (tool === 'list_messages') return { results: values(need(chat().messages, 'Chat messages')).filter(message => matches(message, p.query)).slice(-(p.limit || 1000)) }
    if (tool === 'get_last_interaction') return { last_interaction_time: chat().last_active_timestamp || values(chat().messages).at(-1)?.timestamp }
    if (tool === 'search_contacts') return records(need(db.contacts, 'Chat contacts')).filter(contact => matches(contact, p.query))
    if (tool === 'get_contact_chats') return { chats: chats().filter(item => item.chat_jid === p.jid || item.group_metadata?.participants?.some((member: any) => member.jid === p.jid)) }
    if (tool === 'get_direct_chat_by_contact') return need(chats().find(item => !item.is_group && item.chat_jid === (p.contact_jid || p.jid)), 'Direct chat')
  }

  if (service === 'slick') {
    const channel = () => lookup(db.channels, p.channel || p.channel_id, 'Slick channel')
    if (tool === 'get_current_user_id') return { user_id: need(db.current_user?.user_id || db.current_user?.id, 'Current Slick user') }
    if (['list_channels', 'list_user_conversations'].includes(tool)) {
      const types = String(p.types || 'public_channel,private_channel,im,mpim').split(',')
      const channels = records(need(db.channels, 'Slick channels')).filter(item => (!p.exclude_archived || !item.is_archived) && types.includes(item.is_im ? 'im' : item.is_mpim ? 'mpim' : item.is_private ? 'private_channel' : 'public_channel'))
      const page = limit(channels, p)
      return { ok: true, channels: page.items, response_metadata: { next_cursor: page.next || '' } }
    }
    if (tool === 'get_conversation_history' || tool === 'get_conversation_replies') {
      let messages = records(need(channel().messages, 'Slick messages'))
      if (tool === 'get_conversation_replies') messages = messages.filter(item => item.ts === p.ts || item.thread_ts === p.ts)
      messages = messages.filter(item => (!p.oldest || Number(item.ts) >= Number(p.oldest)) && (!p.latest || Number(item.ts) <= Number(p.latest))).sort((a, b) => Number(b.ts) - Number(a.ts))
      const page = limit(messages, p)
      return { ok: true, messages: page.items, has_more: !!page.next, response_metadata: { next_cursor: page.next || '' } }
    }
    if (tool === 'get_conversation_members') return { ok: true, members: need(channel().conversations?.members || channel().members, 'Channel members') }
    if (tool === 'list_users') return { ok: true, members: records(need(db.users, 'Slick users')) }
    if (tool === 'get_user_info') return { ok: true, user: lookup(db.users, p.user || p.user_id, 'Slick user') }
    if (tool === 'get_user_presence') return { ok: true, presence: need(lookup(db.users, p.user || p.user_id, 'Slick user').presence, 'User presence') }
    if (tool === 'lookup_user_by_email') return { ok: true, user: need(records(db.users).find(user => user.profile?.email === p.email), 'Slick user') }
    if (tool === 'get_user_identity') return { ok: true, user: lookup(db.users, db.current_user?.user_id || db.current_user?.id, 'Current Slick user') }
    if (tool === 'list_files') return { ok: true, files: records(need(db.files, 'Slick files')).filter(file => !p.channel || file.channels?.includes(p.channel)) }
    if (tool === 'get_file_info') return { ok: true, file: lookup(db.files, p.file || p.file_id, 'Slick file') }
    if (tool === 'list_reminders') return { ok: true, reminders: records(need(db.reminders, 'Slick reminders')) }
    if (tool === 'get_reminder_info') return { ok: true, reminder: lookup(db.reminders, p.reminder, 'Slick reminder') }
    if (tool === 'list_user_groups') return { ok: true, usergroups: records(need(db.usergroups, 'Slick user groups')) }
    if (tool === 'list_scheduled_messages') return { ok: true, scheduled_messages: records(need(db.scheduled_messages, 'Scheduled messages')) }
    if (['search_messages', 'search_files', 'search_all_content'].includes(tool)) {
      const messages = records(need(db.channels, 'Slick channels')).flatMap(current => records(need(current.messages, 'Channel messages')).map(message => ({ ...message, channel: { id: current.id, name: current.name } }))).filter(message => matches(message, p.query))
      const files = records(need(db.files, 'Slick files')).filter(file => matches(file, p.query))
      return { ok: true, messages: { matches: messages, total: messages.length }, files: { matches: files, total: files.length } }
    }
  }

  if (service === 'zira') {
    const names: RecordValue = { get_all_projects: ['projects', 'projects'], get_all_dashboards: ['dashboards', 'dashboards'], get_all_filters: ['filters', 'filters'], get_all_workflows: ['workflows', 'workflows'], get_all_priorities: ['priorities', 'priorities'], get_all_issue_types: ['issue_types', 'issueTypes'], get_all_statuses: ['statuses', 'statuses'], get_all_resolutions: ['resolutions', 'resolutions'], get_all_roles: ['roles', 'roles'], get_all_issue_link_types: ['issue_link_types', 'issueLinkTypes'], get_all_project_categories: ['project_categories', 'projectCategories'], get_all_status_categories: ['status_categories', 'statusCategories'], get_all_security_levels: ['security_levels', 'securityLevels'], get_all_webhooks: ['webhooks', 'webhooks'], get_all_permission_schemes: ['permission_schemes', 'permissionSchemes'], get_application_roles: ['application_roles', 'roles'] }
    if (names[tool]) { const [key, resultKey] = names[tool]; return { [resultKey]: tool === 'get_all_projects' ? need(db[key], key) : records(need(db[key], key)) } }
    const normalizedIssue = (issue: any) => {
      const f = issue.fields || {}
      const reference = (key: string, value: any) => typeof value === 'string' ? db[key]?.[value] || { id: value, name: value, key: value } : value
      return { ...issue, id: issue.id || issue.key, fields: { ...f, project: reference('projects', f.project), status: reference('statuses', f.status), priority: reference('priorities', f.priority), issuetype: reference('issue_types', f.issuetype), assignee: f.assignee ? { ...db.users?.[f.assignee.name], ...f.assignee } : null } }
    }
    if (tool === 'search_issues_jql' || tool === 'search_issues_for_picker') {
      let issues = records(need(db.issues, 'Issues')).map(normalizedIssue)
      const jql = String(p.jql || p.currentJQL || '').replace(/ORDER BY.+$/i, '').trim()
      if (jql) for (const clause of jql.split(/\s+AND\s+/i)) {
        const match = clause.trim().match(/^(project|status|priority|assignee|issuetype|key)\s*(!=|=)\s*"?([^"\s]+)"?$/i)
        if (!match) throw new Error('This JQL expression is not supported in the static snapshot viewer. Browse a project or inspect Snapshot data.')
        issues = issues.filter(issue => { const actual = match[1] === 'key' ? issue.key : issue.fields[match[1]]; const equal = typeof actual === 'object' ? [actual?.id, actual?.key, actual?.name].includes(match[3]) : actual === match[3]; return match[2] === '=' ? equal : !equal })
      }
      if (p.query) issues = issues.filter(issue => matches([issue.key, issue.fields.summary, issue.fields.description], p.query))
      const page = limit(issues, p, 50)
      return { issues: page.items, total: page.total, startAt: page.start, maxResults: page.size }
    }
    if (tool === 'get_issue_by_id') return normalizedIssue(lookup(db.issues, p.issue_id, 'Issue'))
    if (tool === 'find_users') return records(need(db.users, 'Zira users')).filter(user => matches(user, p.search_string))
    if (tool === 'get_user_by_username_or_account_id') return lookup(db.users, p.username || p.account_id, 'Zira user')
    if (tool === 'get_project_components_by_key') return { components: records(need(db.components, 'Project components')).filter(item => item.project === p.project_key) }
    if (tool === 'get_group_by_name') return lookup(db.groups, p.group_name, 'Group')
    const single: RecordValue = { get_project_by_key: ['projects', 'project_key'], get_dashboard_by_id: ['dashboards', 'dash_id'], get_filter_by_id: ['filters', 'filter_id'], get_component_by_id: ['components', 'comp_id'], get_version_by_id: ['versions', 'ver_id'], get_issue_type_by_id: ['issue_types', 'issue_type_id'], get_status_by_id: ['statuses', 'status_id'], get_priority_by_id: ['priorities', 'priority_id'], get_resolution_by_id: ['resolutions', 'resolution_id'], get_role_by_id: ['roles', 'role_id'], get_attachment_metadata: ['attachments', 'attachment_id'] }
    if (single[tool]) { const [key, parameter] = single[tool]; return lookup(db[key], p[parameter] || p.id, key) }
    const direct: RecordValue = { get_server_info: 'server_info', get_application_properties: 'application_properties', get_current_user_permissions: 'my_permissions', get_current_user_preferences: 'my_preferences', get_all_permissions: 'permissions', get_reindex_status: 'reindex_info' }
    if (direct[tool]) return need(db[direct[tool]], direct[tool])
    if (tool === 'list_issue_attachments') { const issue = lookup(db.issues, p.issue_id || p.issue_key, 'Issue'); return { attachments: records(db.attachments).filter(item => (issue.fields?.attachmentIds || []).map(String).includes(String(item.id))) } }
  }
  const extra = tryExtraSnapshotRead(service, tool, p, db)
  if (extra.handled) return extra.result
  const more = tryMoreSnapshotRead(service, tool, p, db)
  if (more.handled) return more.result
  const streamify = tryStreamifySnapshotRead(service, tool, p, db)
  if (streamify.handled) return streamify.result
  throw new Error(`${service}.${tool} is not available in this static snapshot. You can browse stored records; actions that change data require a running MultiVerse environment.`)
}

export function readSnapshotTool(service: string, tool: string, params: RecordValue, databases: RecordValue): any {
  // Native apps may sort or enrich their response. Return a detached copy so
  // those display operations cannot mutate the selected authored snapshot.
  return structuredClone(read(service, tool, params || {}, databases))
}
