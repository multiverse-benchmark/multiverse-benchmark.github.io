/** Additional native app read projections. Missing source data stays unavailable. */
type AnyMap = Record<string, any>
type Result = { handled: true; result: any } | { handled: false }
const done = (result: any): Result => ({ handled: true, result })
const need = (value: any, name: string): any => {
  if (value === undefined || value === null) throw new Error(`${name} is not stored in this snapshot. Use Snapshot data to inspect the available records.`)
  return value
}
const rows = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
const query = (value: any, search: any) => !String(search || '').trim() || JSON.stringify(value).toLowerCase().includes(String(search).trim().toLowerCase())
const find = (value: any, id: any, name: string): any => need(value?.[id] ?? rows(value).find(item => [item?.id, item?.name, item?.key, item?.spaceKey, item?.number, item?.sha, item?.login, item?.trip_id, item?.externalEventId].some(key => key != null && String(key) === String(id))), name)
const sameParent = (value: any, parent: any) => String(value || '').replace(/^conferenceRecords\//, '') === String(parent || '').replace(/^conferenceRecords\//, '')
const children = (collection: any, parent: string) => rows(collection).filter(item => item.name?.startsWith(`${parent}/`))

export const moreNativeServices = ['githut', 'githut_actions', 'gridwell_chat', 'gridwell_meet', 'linkedup', 'hubscape', 'salespower', 'sapspend', 'shopster', 'zenhelp', 'docfluence']

export function tryMoreSnapshotRead(service: string, tool: string, p: AnyMap, db: AnyMap): Result {
  if (service === 'githut') {
    const repositories = () => rows(need(db.Repositories, 'Repositories'))
    const repo = () => need(repositories().find(item => item.full_name === `${p.owner}/${p.repo}`), 'Repository')
    const belongs = (item: any) => item.repo_full_name === `${p.owner}/${p.repo}` || item.repository_id === repo().id || item.base?.repo?.full_name === `${p.owner}/${p.repo}`
    if (tool === 'get_authenticated_user') return done(need(db.CurrentUser, 'Authenticated profile'))
    if (tool === 'search_repositories') { const items = repositories().filter(item => query([item.name, item.full_name, item.description], p.query)); return done({ items, total_count: items.length }) }
    if (tool === 'search_users') { const items = rows(need(db.Users, 'Users')).filter(item => query(item, p.query)); return done({ items, total_count: items.length }) }
    if (tool === 'list_repository_issues' || tool === 'list_repository_pull_requests') {
      const items = rows(need(db[tool === 'list_repository_issues' ? 'Issues' : 'PullRequests'], 'Repository issues')).filter(item => belongs(item) && (!p.state || p.state === 'all' || item.state === p.state))
      return done(items)
    }
    if (tool === 'get_issue_content') return done(need(rows(need(db.Issues, 'Issues')).find(item => belongs(item) && String(item.number) === String(p.issue_number)), 'Issue'))
    if (tool === 'get_issue_comments') return done(rows(need(db.IssueComments, 'Issue comments')).filter(item => belongs(item) && (item.issue_number === p.issue_number || item.issue_url?.endsWith(`/issues/${p.issue_number}`))))
    if (tool === 'get_pull_request_details') return done(need(rows(need(db.PullRequests, 'Pull requests')).find(item => belongs(item) && String(item.number) === String(p.pull_number)), 'Pull request'))
    if (tool === 'list_repository_branches') return done(rows(need(db.Branches, 'Branches')).filter(belongs))
    if (tool === 'list_repository_commits') return done(rows(need(db.Commits, 'Commits')).filter(belongs))
    if (tool === 'get_repository_commit_details') return done(need(rows(need(db.Commits, 'Commits')).find(item => belongs(item) && item.sha === (p.ref || p.sha)), 'Commit'))
    if (tool === 'get_repository_file_contents') {
      const repository = repo(), ref = p.ref || repository.default_branch
      const branch = rows(db.Branches).find(item => item.repository_id === repository.id && item.name === ref)
      const sha = branch?.commit?.sha || db.RepositoryDefaultCommits?.[String(repository.id)] || ref
      const path = p.path || '/'
      return done(need(db.FileContents?.[`${repository.id}:${sha}:${path}`] ?? db.FileContents?.[`${repository.id}:${sha}:${path.replace(/^\//, '')}`], 'Repository file content'))
    }
    if (tool === 'search_issues_and_pull_requests') { const items = [...rows(need(db.Issues, 'Issues')), ...rows(need(db.PullRequests, 'Pull requests'))].filter(item => query([item.title, item.body], p.query)); return done({ items, total_count: items.length }) }
  }

  if (service === 'githut_actions') {
    const repository = () => find(need(db.repositories, 'Action repositories'), `${p.owner}/${p.repo}`, 'Repository')
    const workflow = () => find(repository().workflows, p.workflow_id, 'Workflow')
    const run = () => find(repository().workflow_runs, p.run_id, 'Workflow run')
    if (tool === 'list_workflows') { const workflows = rows(need(repository().workflows, 'Workflows')); return done({ workflows, total_count: workflows.length }) }
    if (tool === 'get_workflow') return done(workflow())
    if (tool === 'get_workflow_usage') return done(need(workflow().usage, 'Recorded workflow usage'))
    if (tool === 'list_workflow_runs') { const workflow_runs = rows(need(repository().workflow_runs, 'Workflow runs')).filter(item => (!p.workflow_id || String(item.workflow_id) === String(p.workflow_id)) && (!p.status || item.status === p.status || item.conclusion === p.status) && (!p.branch || item.head_branch === p.branch) && (!p.event || item.event === p.event)); return done({ workflow_runs, total_count: workflow_runs.length }) }
    if (tool === 'get_workflow_run') return done(run())
    if (tool === 'get_workflow_run_jobs') { const jobs = rows(need(run().jobs, 'Workflow jobs')); return done({ jobs, total_count: jobs.length }) }
  }

  if (service === 'gridwell_chat') {
    if (tool === 'list_spaces' || tool === 'search_spaces') return done({ spaces: rows(need(db.Space, 'Chat spaces')).filter(item => query([item.displayName, item.name], p.query)) })
    if (tool === 'get_space_details') return done(find(db.Space, p.name, 'Chat space'))
    if (tool === 'list_messages') return done({ messages: rows(need(db.Message, 'Chat messages')).filter(item => item.space?.name === p.parent || item.name?.startsWith(`${p.parent}/messages/`)) })
    if (tool === 'get_message') return done(find(db.Message, p.name, 'Chat message'))
    if (tool === 'list_space_members') return done({ memberships: children(need(db.Membership, 'Space members'), p.parent) })
    if (tool === 'get_space_member') return done(find(db.Membership, p.name, 'Space member'))
    if (tool === 'list_message_reactions') return done({ reactions: children(need(db.Reaction, 'Message reactions'), p.parent) })
    if (tool === 'get_message_attachment') return done(find(db.Attachment, p.name, 'Chat attachment'))
    if (tool === 'get_space_event') return done(find(db.SpaceEvent, p.name, 'Space event'))
    if (tool === 'get_thread_read_state_for_user') return done(find(db.ThreadReadState, p.name, 'Thread read state'))
  }

  if (service === 'gridwell_meet') {
    const lists: AnyMap = { list_conference_records: ['conferenceRecords', 'conferenceRecords'], list_conference_recordings: ['recordings', 'recordings'], list_conference_transcript: ['transcripts', 'transcripts'], list_conference_participants: ['participants', 'participants'], list_participant_sessions: ['participantSessions', 'participantSessions'], list_transcript_entries: ['entries', 'entries'] }
    if (lists[tool]) {
      const [key, output] = lists[tool]
      let items = rows(need(db[key], key))
      const parent = p.parent_conference_record || p.parent
      if (parent) items = items.filter(item => sameParent(item.parent || item.conferenceRecordId || item.participantId, parent))
      return done({ [output]: items })
    }
    const singles: AnyMap = { get_meeting_space_details: 'spaces', get_conference_record: 'conferenceRecords', get_conference_recording: 'recordings', get_conference_transcript: 'transcripts', get_conference_participant: 'participants', get_participant_session: 'participantSessions', get_transcript_entry: 'entries' }
    if (singles[tool]) { const collection = need(db[singles[tool]], singles[tool]); return done(collection[p.name] || collection[String(p.name).split('/').at(-1)] || find(collection, p.name, singles[tool])) }
  }

  if (service === 'linkedup') {
    if (tool === 'get_my_profile') return done({ data: find(db.people, db.current_person_id, 'Current profile') })
    if (tool === 'get_post_by_id') return done({ data: find(db.posts, p.post_id || p.id, 'Post') })
    if (tool === 'get_organization_acls_by_role_assignee') return done({ data: rows(need(db.organizationAcls, 'Organization roles')).filter(item => !p.role_assignee || item.roleAssignee === p.role_assignee) })
    if (tool === 'get_organizations_by_vanity_name') return done({ data: rows(need(db.organizations, 'Organizations')).filter(item => item.vanityName === (p.vanity_name || p.vanityName)) })
  }

  if (service === 'hubscape') {
    const detail: AnyMap = { get_campaign_by_id: ['campaigns', 'campaign_id'], get_template_by_id: ['templates', 'template_id'], get_form_by_id: ['forms', 'formId'], get_marketing_email_by_id: ['marketing_emails', 'email_id'], get_marketing_event_by_id: ['marketing_events', 'external_event_id'] }
    if (detail[tool]) { const [key, parameter] = detail[tool]; return done(find(db[key], p[parameter] || p.externalEventId || p.id, key)) }
    const lists: AnyMap = { get_templates: 'templates', get_forms: 'forms', get_campaigns: 'campaigns', get_marketing_events: 'marketing_events', get_form_global_event_subscriptions: 'subscriptions', get_form_global_event_subscription_definitions: 'subscription_definitions' }
    if (lists[tool]) { const results = rows(need(db[lists[tool]], lists[tool])); return done(['get_templates', 'get_form_global_event_subscriptions', 'get_form_global_event_subscription_definitions'].includes(tool) ? results : { results }) }
    if (tool === 'get_marketing_event_attendees') return done({ results: rows(need(find(db.marketing_events, p.external_event_id || p.externalEventId || p.id, 'Marketing event').attendees, 'Event attendees')) })
  }

  if (service === 'salespower') {
    const plural: AnyMap = { query_accounts: 'Account', query_contacts: 'Contact', query_events: 'Event', query_leads: 'Lead', query_opportunities: 'Opportunity', query_tasks: 'Task' }
    if (plural[tool]) {
      let results = rows(need(db[plural[tool]], plural[tool]))
      for (const [key, value] of Object.entries(p.criteria || {})) {
        if (value != null && typeof value === 'object') throw new Error('This structured CRM filter is not supported by the static viewer.')
        results = results.filter(item => String(item[key] ?? '') === String(value))
      }
      return done({ results })
    }
    if (tool === 'retrieve_task_details') return done(find(db.Task, p.task_id || p.id, 'Task'))
    if (tool === 'retrieve_event_details') return done(find(db.Event, p.event_id || p.id, 'Event'))
    if (tool === 'search_tasks' || tool === 'search_events') return done({ results: rows(need(db[tool === 'search_tasks' ? 'Task' : 'Event'], 'CRM records')).filter(item => query(item, p.query || p.search_term)) })
  }

  if (service === 'sapspend') {
    if (tool === 'get_trips_summary') return done({ summaries: rows(need(db.trips, 'Trips')).filter(item => (!p.start_date || item.start_date >= p.start_date) && (p.include_canceled_trips || !['CANCELED', 'CANCELLED'].includes(item.status))) })
    if (tool === 'get_reservation_details') return done(find(db.bookings, p.booking_id || p.reservation_id || db.booking_by_locator?.[p.record_locator], 'Reservation'))
    if (tool === 'get_user_details') return done(p.user_name ? need(rows(db.users).find(user => [user.user_name, user.email, user.external_id, user.id, user.display_name].includes(p.user_name)), 'Traveler') : find(db.users, p.user_id || p.id || db.user_by_external_id?.[p.external_id], 'Traveler'))
    if (tool === 'list_locations') return done({ locations: rows(need(db.locations, 'Locations')).filter(item => query(item, p.query)) })
    if (tool === 'get_location_by_id') return done(find(db.locations, p.location_id || p.id, 'Location'))
    // The live airport catalog is not part of a task snapshot. The app treats
    // this optional picker lookup separately from its stored trips.
    if (tool === 'list_all_airports') return done(need(db.airports, 'Airport catalog'))
  }

  if (service === 'shopster') {
    const plural: AnyMap = { list_customers: 'customers', list_products: 'products', list_orders: 'orders', list_draft_orders: 'draft_orders', search_customers: 'customers', search_products: 'products' }
    if (plural[tool]) {
      const key = plural[tool]
      let items = rows(need(db[key], key)).filter(item => query(item, p.query || p.title))
      if (p.status && p.status !== 'any') items = items.filter(item => key === 'orders' ? (p.status === 'closed' ? !!item.closed_at : p.status === 'cancelled' ? !!item.cancelled_at : !item.closed_at && !item.cancelled_at) : item.status === p.status)
      return done({ [key]: items })
    }
    const single: AnyMap = { get_customer_by_id: ['customers', 'customer_id'], get_product_by_id: ['products', 'product_id'], get_order_by_id: ['orders', 'order_id'], get_draft_order_by_id: ['draft_orders', 'draft_order_id'] }
    if (single[tool]) { const [key, parameter] = single[tool]; return done(find(db[key], p[parameter] || p.id, key)) }
    if (tool === 'get_customer_orders') return done(rows(need(db.orders, 'Orders')).filter(item => String(item.customer?.id) === String(p.customer_id)))
    if (tool === 'list_addresses') return done(rows(need(find(db.customers, p.customer_id, 'Customer').addresses, 'Customer addresses')))
    if (tool === 'get_address') return done(find(find(db.customers, p.customer_id, 'Customer').addresses, p.address_id, 'Customer address'))
  }

  if (service === 'zenhelp') {
    const lists: AnyMap = { list_tickets: 'tickets', list_users: 'users', list_organizations: 'organizations' }
    if (lists[tool]) return done(rows(need(db[lists[tool]], lists[tool])))
    const single: AnyMap = { get_ticket_details: ['tickets', 'ticket_id'], get_user_details: ['users', 'user_id'], get_organization_details: ['organizations', 'organization_id'], show_attachment: ['attachments', 'attachment_id'], show_audit: ['ticket_audits', 'audit_id'] }
    if (single[tool]) { const [key, parameter] = single[tool]; return done(find(db[key], p[parameter] || p.id, key)) }
    if (tool === 'list_ticket_comments') return done({ comments: rows(need(db.comments, 'Ticket comments')).filter(item => String(item.ticket_id) === String(p.ticket_id)) })
    if (tool === 'list_audits_for_ticket') return done({ audits: rows(need(db.ticket_audits, 'Ticket audits')).filter(item => String(item.ticket_id) === String(p.ticket_id)) })
    if (tool === 'search') {
      const search = String(p.query || '')
      const type = search.match(/(?:^|\s)type:(ticket|user|organization)(?:\s|$)/)?.[1]
      const term = search.replace(/(?:^|\s)type:(ticket|user|organization)(?=\s|$)/g, '').trim()
      if (/(?:^|\s)\w+:/.test(term)) throw new Error('This support search operator is not supported by the static snapshot viewer.')
      const keys = type ? [type === 'ticket' ? 'tickets' : type === 'user' ? 'users' : 'organizations'] : ['tickets', 'users', 'organizations']
      const results = keys.flatMap(key => rows(need(db[key], key)).filter(item => query(item, term)).map(item => ({ ...item, result_type: key.slice(0, -1) })))
      return done({ results, count: results.length })
    }
  }

  if (service === 'docfluence') {
    const contents = () => rows(need(db.contents, 'Content'))
    const content = () => find(db.contents, p.id || p.content_id, 'Content')
    const descendants = (kind?: string, direct = false) => contents().filter(item => (!kind || item.type === kind) && (direct ? String(item.ancestors?.at(-1)?.id) === String(p.id) : item.ancestors?.some((ancestor: any) => String(ancestor.id) === String(p.id))))
    if (tool === 'get_spaces') return done(rows(need(db.spaces, 'Spaces')))
    if (tool === 'get_space_details') return done(find(db.spaces, p.spaceKey || p.space_key, 'Space'))
    if (['get_space_content', 'get_space_content_by_type', 'get_content_list'].includes(tool)) return done(contents().filter(item => (!(p.spaceKey || p.space_key) || item.spaceKey === (p.spaceKey || p.space_key)) && (!p.type || item.type === p.type) && (!p.title || item.title === p.title)))
    if (tool === 'get_content_details') return done(content())
    if (tool === 'search_content' || tool === 'search_content_cql') {
      if (p.cql) throw new Error('CQL evaluation is not available in the static snapshot. Browse spaces or use text search.')
      return done(contents().filter(item => query([item.title, item.body], p.query || p.text)))
    }
    if (tool === 'get_content_comments') { const results = descendants('comment', true); return done({ comment: { results, size: results.length } }) }
    if (tool === 'get_content_attachments') return done(descendants('attachment', true))
    if (tool === 'get_content_children_by_type' || tool === 'get_content_descendants_by_type') return done(descendants(p.type, tool === 'get_content_children_by_type'))
    if (tool === 'get_content_children' || tool === 'get_content_descendants') return done(Object.fromEntries(['page', 'comment', 'attachment', 'blogpost'].map(type => { const results = descendants(type, tool === 'get_content_children'); return [type, { results, size: results.length }] })))
    if (tool === 'get_content_labels') return done(rows(need(db.content_labels?.[p.id], 'Content labels')).map(label => typeof label === 'string' ? { name: label } : label))
    if (tool === 'get_content_history') return done(need(content().history || db.history?.[p.id], 'Content history'))
    if (tool === 'get_long_tasks') return done({ results: rows(need(db.long_tasks, 'Long tasks')) })
    if (tool === 'get_long_task_details') return done(find(db.long_tasks, p.id, 'Long task'))
    if (tool === 'get_content_restrictions_by_operation') return done(need(db.content_restrictions?.[p.id], 'Content restrictions'))
  }
  return { handled: false }
}
