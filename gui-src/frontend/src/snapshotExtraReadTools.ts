/** Native display adapters for additional services, over immutable saved data. */
type Row = Record<string, any>
type Result = { handled: true; result: any } | { handled: false }
export const extraNativeServices = ['cliptok', 'generic_media', 'media_control', 'gridwell_slides', 'photogram', 'strope']
const required = (value: any, label: string): any => {
  if (value === undefined || value === null) throw new Error(`${label} is not stored in this snapshot. Inspect Snapshot data for the available fields.`)
  return value
}
const rows = (value: any, field = 'id'): Row[] => Array.isArray(value) ? value : Object.entries(required(value, 'Collection')).map(([key, item]) => ({ [field]: key, ...(item as Row) }))
const find = (value: any, id: any, label: string, field = 'id') => required(rows(value, field).find(row => row[field] === id), label)
const ok = (result: any): Result => ({ handled: true, result })
const contains = (value: any, query: any) => !query || JSON.stringify(value).toLocaleLowerCase().includes(String(query).toLocaleLowerCase())

export function tryExtraSnapshotRead(service: string, tool: string, p: Row, db: Row): Result {
  if (service === 'strope') {
    if (tool === 'retrieve_balance') return ok(required(db.balance, 'Balance'))
    const collections: Record<string, string> = { list_customers: 'customers', list_products: 'products', list_prices: 'prices', list_payment_intents: 'payment_intents', list_invoices: 'invoices', list_subscriptions: 'subscriptions', list_coupons: 'coupons', list_disputes: 'disputes' }
    if (collections[tool]) {
      let values = rows(required(db[collections[tool]], collections[tool]))
      for (const key of ['customer', 'product', 'status', 'active', 'email', 'currency']) if (p[key] !== undefined) values = values.filter(row => row[key] === p[key])
      if (p.starting_after) { const index = values.findIndex(row => row.id === p.starting_after); if (index < 0) throw new Error('Pagination cursor is absent from this snapshot.'); values = values.slice(index + 1) }
      if (p.ending_before) { const index = values.findIndex(row => row.id === p.ending_before); if (index < 0) throw new Error('Pagination cursor is absent from this snapshot.'); values = values.slice(0, index) }
      const size = Math.max(1, Math.min(Number(p.limit) || 100, 10000))
      return ok({ object: 'list', data: values.slice(0, size), has_more: values.length > size })
    }
  }
  if (service === 'cliptok') {
    if (tool === 'list_business_accounts') {
      const values = rows(db.business_accounts, 'business_id').filter(row => contains(row, p.search_query))
      const offset = Math.max(0, Number(p.offset) || 0), size = Math.max(1, Number(p.limit) || 100)
      const accounts = values.slice(offset, offset + size)
      return ok({ code: 0, message: 'Snapshot records', data: { accounts, total_count: values.length, returned_count: accounts.length, has_more: offset + size < values.length, pagination: { limit: size, offset, next_offset: offset + size < values.length ? offset + size : null } } })
    }
    if (tool === 'get_business_profile_data') return ok({ code: 0, message: 'Snapshot record', data: find(db.business_accounts, p.business_id, 'Business account', 'business_id') })
    if (tool === 'get_business_publish_status') {
      const record = required(db.publish_status?.[p.publish_id], 'Publish status')
      if (p.business_id && record.business_id !== p.business_id) throw new Error('This publish status belongs to a different business account.')
      return ok({ code: 0, message: 'Snapshot record', data: record })
    }
  }
  if (service === 'photogram') {
    if (tool === 'list_all_users') return ok(rows(db.users))
    if (tool === 'list_all_media_posts') return ok(rows(db.media))
    if (tool === 'list_media_comments') return ok(rows(db.comments).filter(row => row.media_id === p.media_id))
    if (tool === 'get_user_details') return ok(find(db.users, p.user_id, 'User'))
    if (tool === 'get_user_id_by_username') return ok({ user_id: required(rows(db.users).find(row => row.username === p.username), 'User').id })
  }
  if (service === 'gridwell_slides' && ['get_presentation', 'get_page'].includes(tool)) {
    const files = rows(db.users).flatMap(user => rows(user.files))
    const file = required(files.find(row => (row.presentationId || row.id) === p.presentationId), 'Presentation')
    const presentation = { ...file, presentationId: file.presentationId || file.id, title: file.title || file.name }
    if (tool === 'get_presentation') return ok(presentation)
    const pages = [...(file.slides || []), ...(file.layouts || []), ...(file.masters || []), ...(file.notesMaster ? [file.notesMaster] : [])]
    const page = pages.find(row => row.objectId === p.pageObjectId) || (file.slides || []).map((row: Row) => row.slideProperties?.notesPage).find((row: Row) => row?.objectId === p.pageObjectId)
    return ok(required(page, 'Presentation page'))
  }
  if (service === 'generic_media' && tool === 'search') {
    const types: Record<string, string[]> = { TRACK: ['tracks'], ALBUM: ['albums'], ARTIST: ['artists'], PERSONAL_PLAYLIST: ['playlists'], PUBLIC_PLAYLIST: ['playlists'], LIKED_SONGS: ['tracks'], PODCAST_SHOW: ['podcasts'], PODCAST_EPISODE: ['episodes'], GENERIC_MUSIC: ['tracks', 'albums', 'artists', 'playlists'], GENERIC_MUSIC_NEW: ['tracks', 'albums', 'artists', 'playlists'], GENERIC_PODCAST: ['podcasts', 'episodes'], GENERIC_SOMETHING_ELSE: ['tracks', 'albums', 'artists', 'playlists', 'podcasts', 'episodes'] }
    const buckets = types[p.intent_type] || ['tracks', 'albums', 'artists', 'playlists', 'podcasts', 'episodes']
    const items = buckets.flatMap(key => key === 'episodes' ? rows(db.podcasts).flatMap(show => (show.episodes || []).map((episode: Row) => ({ provider: show.provider, ...episode }))) : rows(db[key]))
      .filter(row => contains(row, p.query) && (!p.filtering_type || row.content_type === p.filtering_type) && (p.intent_type !== 'LIKED_SONGS' || row.is_liked === true) && (p.intent_type !== 'PERSONAL_PLAYLIST' || row.is_personal === true) && (p.intent_type !== 'PUBLIC_PLAYLIST' || row.is_personal === false))
    return ok(items.map(row => ({ uri: `${row.provider}:${String(row.content_type).toLowerCase()}:${row.id}`, provider: row.provider, media_item_metadata: { entity_title: row.title || row.name, artist_name: row.artist_name, content_type: row.content_type, ...(row.description ? { description: row.description } : {}) } })))
  }
  return { handled: false }
}
