/** Streamify native UI projections from stored snapshot collections only. */
type Data = Record<string, any>
export const streamifyNativeServices = ['streamify']
const values = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
const need = (value: any, label: string): any => {
  if (value === undefined || value === null) throw new Error(`${label} is not stored in this snapshot. Use Snapshot data to inspect the available fields.`)
  return value
}
const lookup = (db: Data, collection: string, id: string) => need(need(db[collection], collection)[id], `${collection}/${id}`)

export function tryStreamifySnapshotRead(service: string, tool: string, p: Data, db: Data): { handled: boolean; result?: any } {
  if (service !== 'streamify') return { handled: false }
  const user = p.user_id || db.current_user?.id
  const page = (rows: any[]) => {
    const offset = Math.max(0, Number(p.offset) || 0), limit = Math.max(1, Math.min(1000, Number(p.limit) || 50))
    return { items: rows.slice(offset, offset + limit), total: rows.length, offset, limit }
  }
  const resolve = (rows: any, collection: string) => values(rows).map(item => typeof item === 'string' ? lookup(db, collection, item.split(':').at(-1)!) : item)
  const userRows = (key: string) => values(need(db[key], key)[need(user, 'Current user')] || [])
  let result: any
  if (tool === 'get_current_user_profile' || tool === 'get_user_profile') result = lookup(db, 'users', need(user, 'Current user'))
  else if (tool === 'get_current_users_playlists' || tool === 'get_user_playlists') result = page(resolve(userRows('user_playlists'), 'playlists'))
  else if (tool === 'get_users_saved_albums') result = page(userRows('saved_albums').map(item => item.album ? item : { album: typeof item === 'string' ? lookup(db, 'albums', item) : item }))
  else if (tool === 'check_users_saved_albums') { const saved = userRows('saved_albums'); result = (p.album_ids || []).map((id: string) => saved.some(item => (typeof item === 'string' ? item : item.album?.id || item.id) === id)) }
  else if (tool === 'get_followed_artists') result = { artists: page(resolve(userRows('followed_artists'), 'artists')) }
  else if (tool === 'get_featured_playlists') result = { playlists: page(resolve(need(db.featured_playlists, 'Featured playlists'), 'playlists')) }
  else if (tool === 'get_new_releases') result = { albums: page(resolve(need(db.new_releases, 'New releases'), 'albums')) }
  else if (tool === 'get_categories') result = { categories: page(values(need(db.categories, 'Categories'))) }
  else if (tool === 'get_category') result = lookup(db, 'categories', p.category_id)
  else if (tool === 'get_category_playlists') result = { playlists: page(resolve(need(db.category_playlists, 'Category playlists')[p.category_id] || [], 'playlists')) }
  else if (tool === 'get_available_genre_seeds') result = { genres: need(db.genres, 'Genre seeds') }
  else if (tool === 'get_user_top_artists_and_tracks') {
    const type = p.type === 'artists' ? 'artists' : 'tracks'
    const stored = need(db[`top_${type}`], `Top ${type}`)[need(user, 'Current user')]
    const range = p.time_range || 'medium_term'
    const selected = stored === undefined ? [] : Array.isArray(stored) ? stored : stored.items || stored[type] || need(stored[range], `Top ${type}/${range}`)[type]
    result = page(resolve(need(selected, `Top ${type}/${range}`), type))
  }
  else if (tool === 'get_recommendations') result = { tracks: page(resolve(need(need(db.recommendations, 'Saved recommendations')[need(user, 'Current user')], 'Saved recommendations for current user'), 'tracks')).items, snapshot_notice: 'Saved recommendations in this task snapshot; not generated from requested seeds.' }
  else if (tool === 'get_several_artists') result = { artists: (p.artist_ids || []).map((id: string) => lookup(db, 'artists', id)) }
  else if (tool === 'get_several_albums') result = { albums: (p.album_ids || []).map((id: string) => lookup(db, 'albums', id)) }
  else if (tool === 'get_artist') result = lookup(db, 'artists', p.artist_id)
  else if (tool === 'get_album') result = lookup(db, 'albums', p.album_id)
  else if (tool === 'get_playlist') result = lookup(db, 'playlists', p.playlist_id)
  else if (tool === 'get_playlist_items') result = page(values(need(need(db.playlist_tracks, 'Playlist tracks')[p.playlist_id], `Tracks for ${p.playlist_id}`)).map(item => item.track ? item : { track: typeof item === 'string' ? lookup(db, 'tracks', item.split(':').at(-1)!) : item }))
  else if (tool === 'get_album_tracks') result = page(values(need(db.tracks, 'Tracks')).filter(track => track.album?.id === p.album_id))
  else if (tool === 'get_artists_albums') result = page(values(need(db.albums, 'Albums')).filter(album => album.artists?.some((artist: any) => artist.id === p.artist_id)))
  else if (tool === 'get_artists_top_tracks') result = { tracks: resolve(need(need(db.artist_top_tracks, 'Artist top tracks')[p.artist_id], 'Artist top tracks'), 'tracks') }
  else if (tool === 'get_artists_related_artists') result = { artists: resolve(need(db.related_artists, 'Related artists')[p.artist_id] || [], 'artists') }
  else if (tool === 'get_playlist_cover_image') result = db.playlist_cover_images?.[p.playlist_id] || db.playlist_images?.[p.playlist_id] || lookup(db, 'playlists', p.playlist_id).images || []
  else if (tool === 'check_user_follows_playlist') { const followers = need(db.playlist_followers, 'Playlist followers')[p.playlist_id] || []; result = (p.user_ids || []).map((id: string) => values(followers).includes(id)) }
  else if (tool === 'check_user_follows_artists_or_users') { const followed = userRows(p.type === 'artist' ? 'followed_artists' : 'followed_users'); result = (p.ids || []).map((id: string) => followed.some(item => (typeof item === 'string' ? item : item.id) === id)) }
  else if (tool === 'search_for_item') {
    result = {}
    for (const type of String(p.type || 'track').split(',')) {
      const collection = `${type.trim()}s`
      const rows = values(need(db[collection], collection))
      const query = String(p.q || '').toLowerCase()
      result[collection] = page(rows.filter(item => !query || JSON.stringify([item.name, item.description, item.artists, item.publisher, item.authors]).toLowerCase().includes(query)))
    }
  } else return { handled: false }
  return { handled: true, result }
}
