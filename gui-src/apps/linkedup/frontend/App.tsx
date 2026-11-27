import { useState, useEffect, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { DismissableBanner } from './components/DismissableBanner'
import { PostCard } from './components/PostCard'
import { UpdatePostForm } from './components/UpdatePostForm'
import { getAvatarColor } from './avatarColor'

const APP_NAME = "Linkedup"
const APP_DOMAIN = `${APP_NAME.toLowerCase()}.com`

interface LocalizedName {
  localized: Record<string, string>
  preferredLocale: {
    country: string
    language: string
  }
}

interface Profile {
  id: string
  localizedFirstName: string
  localizedLastName: string
  vanityName: string
  firstName?: LocalizedName
  lastName?: LocalizedName
}

interface Post {
  id: string
  author: string
  commentary: string
  visibility: string
  lifecycleState?: string
  createdAt?: number
  created?: { time: number }
}

interface Organization {
  id: number
  vanityName: string
  name?: LocalizedName
  primaryOrganizationType?: 'COMPANY' | 'SCHOOL'
}

interface OrganizationAcl {
  aclId: string
  roleAssignee: string
  role: string
  organization: string
  state: string
}

function getOrgDisplayName(org: Organization): string {
  if (org.name?.localized) {
    const locales = Object.keys(org.name.localized)
    if (locales.length > 0) {
      const preferredKey = `${org.name.preferredLocale?.language}_${org.name.preferredLocale?.country}`
      if (org.name.localized[preferredKey]) {
        return org.name.localized[preferredKey]
      }
      return org.name.localized[locales[0]]
    }
  }
  return org.vanityName
}

type View = 'feed' | 'profile' | 'organization' | 'createOrganization' | 'organizations' | 'network' | 'jobs' | 'messaging' | 'notifications'

interface AppProps {
  onClose: () => void
  setAdminHandler?: (handler: (() => void) | null) => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

export default function LinkedupApp({ setRefreshHandler }: AppProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<View>('feed')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null)
  const [organizationAcls, setOrganizationAcls] = useState<OrganizationAcl[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [globalSuccessMessage, setGlobalSuccessMessage] = useState<string | null>(null)

  // Author name resolution: maps author URN -> display name
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  // All organizations from state, for local search
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([])
  // All people from state, keyed by person id
  const [allPeople, setAllPeople] = useState<Record<string, Profile>>({})
  // null means viewing the logged-in user's profile
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null)

  // Inline post creation state
  const [newPostContent, setNewPostContent] = useState('')
  const [creatingPost, setCreatingPost] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  // Normalize post data from backend: fix ID format, map createdAt to created.time
  const normalizePost = useCallback((post: any): Post => {
    const normalized = { ...post }
    // Normalize ID to URN format if raw DB ID
    if (normalized.id && !String(normalized.id).startsWith('urn:li:ugcPost:')) {
      normalized.id = `urn:li:ugcPost:${normalized.id}`
    }
    // Map createdAt to created.time for PostCard compatibility
    if (normalized.createdAt && !normalized.created) {
      normalized.created = { time: normalized.createdAt }
    }
    // Ensure lifecycleState is present - default to PUBLISHED for visible posts
    if (!normalized.lifecycleState) {
      normalized.lifecycleState = 'PUBLISHED'
    }
    return normalized as Post
  }, [])

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch full database state to get all people, organizations, and posts
      const stateRes = await fetch('./api/services/linkedup/state')
      if (!stateRes.ok) throw new Error(`Failed to fetch state: ${stateRes.status}`)
      const stateWrapper = await stateRes.json()
      const state = stateWrapper.state || stateWrapper

      // Extract authenticated user profile from state
      if (state.current_person_id && state.people?.[state.current_person_id]) {
        setProfile(state.people[state.current_person_id])
      } else {
        // Fallback to API if state doesn't have current person
        const profileResult = await api.callTool('get_my_profile', {})
        if (profileResult?.data) {
          setProfile(profileResult.data)
        }
      }

      // Build author name lookup map and collect organizations in a single pass
      const nameMap: Record<string, string> = {}
      if (state.people) {
        const peopleMap: Record<string, Profile> = {}
        Object.values(state.people).forEach((person: any) => {
          nameMap[`urn:li:person:${person.id}`] = `${person.localizedFirstName} ${person.localizedLastName}`
          peopleMap[String(person.id)] = person as Profile
        })
        setAllPeople(peopleMap)
      }
      const orgs: Organization[] = state.organizations ? Object.values(state.organizations) : []
      for (const org of orgs) {
        nameMap[`urn:li:organization:${org.id}`] = getOrgDisplayName(org)
      }
      setAuthorNames(nameMap)
      setAllOrganizations(orgs)

      // Load ALL posts from state
      if (state.posts) {
        const allPosts = Object.values(state.posts)
          .map((post: any) => normalizePost(post))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setPosts(allPosts)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Register refresh handler
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(loadInitialData)
    }
    return () => {
      if (setRefreshHandler) {
        setRefreshHandler(null)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInitialData])

  const [searchedPosts, setSearchedPosts] = useState<Post[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  const [searchedAuthorName, setSearchedAuthorName] = useState<string | null>(null)

  const searchPosts = async () => {
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    setSearchError(null)
    setHasSearched(true)
    const query = searchQuery.trim()
    setLastSearchedQuery(query)
    setSearchedAuthorName(null)

    try {
      let results: Post[] = []

      // Search by post URN
      if (query.startsWith('urn:li:ugcPost:')) {
        results = posts.filter(p => p.id === query)
        if (results.length === 0) {
          // Try fetching from API in case post was created after initial load
          try {
            const postResult = await api.callTool('get_post_by_id', { post_id: query })
            if (postResult?.data) {
              results = [normalizePost(postResult.data)]
            }
          } catch { /* not found */ }
        }
      } else {
        // Search by author URN or ID
        if (query.startsWith('urn:li:')) {
          results = posts.filter(p => p.author === query)
        } else {
          // Bare ID: try both person and organization in a single pass
          const personUrn = `urn:li:person:${query}`
          const orgUrn = `urn:li:organization:${query}`
          const personResults: Post[] = []
          const orgResults: Post[] = []
          for (const p of posts) {
            if (p.author === personUrn) personResults.push(p)
            else if (p.author === orgUrn) orgResults.push(p)
          }
          results = [...personResults, ...orgResults]
        }
      }

      if (results.length > 0) {
        setSearchedPosts(results)
        setSearchedAuthorName(authorNames[results[0].author] || null)
      } else {
        setSearchedPosts([])
        setSearchError('No posts found for this ID or author')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchedPosts([])
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    if (searchError) setSearchError(null)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchPosts()
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchedPosts([])
    setHasSearched(false)
    setSearchError(null)
    setLastSearchedQuery('')
    setSearchedAuthorName(null)
  }

  // Inline post creation
  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !profile) return

    setCreatingPost(true)
    try {
      const result = await api.callTool('create_post', {
        post_data: {
          author: `urn:li:person:${profile.id}`,
          commentary: newPostContent.trim(),
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: []
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false
        }
      })

      if (result) {
        const newPost = normalizePost(result.data || result)
        setPosts([newPost, ...posts])
        setNewPostContent('')
        setGlobalSuccessMessage('Post created successfully')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setCreatingPost(false)
    }
  }

  // Handle post edit
  const handleUpdatePost = async (post: Post, newCommentary: string) => {
    try {
      // Extract raw numeric ID from URN format for API compatibility
      const rawId = post.id.startsWith('urn:li:ugcPost:') ? post.id.replace('urn:li:ugcPost:', '') : post.id
      const result = await api.callTool('update_post', {
        post_id: rawId,
        post_data: {
          commentary: newCommentary.trim(),
          lifecycleState: 'PUBLISHED'
        }
      })

      if (result?.data) {
        const updatedPost = normalizePost(result.data)
        setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
        setEditingPost(null)
        setGlobalSuccessMessage('Post updated successfully')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to update post')
    }
  }

  // Handle post delete
  const handleDeletePost = async (post: Post) => {
    setDeletingPostId(post.id)
    try {
      await api.callTool('delete_post_by_id', {
        post_id: post.id
      })
      setPosts(posts.filter(p => p.id !== post.id))
      setGlobalSuccessMessage('Post deleted successfully')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to delete post')
    } finally {
      setDeletingPostId(null)
    }
  }

  const handleAuthorClick = async (authorUrn: string) => {
    const orgPrefix = 'urn:li:organization:'
    const personPrefix = 'urn:li:person:'
    if (authorUrn.startsWith(orgPrefix)) {
      const orgId = Number(authorUrn.slice(orgPrefix.length))
      const org = allOrganizations.find(o => o.id === orgId)
      if (!org) return
      let acls: OrganizationAcl[] = []
      if (profile?.id) {
        try {
          const aclResult = await api.callTool('get_organization_acls_by_role_assignee', {
            query_field: 'roleAssignee',
            role_assignee: `urn:li:person:${profile.id}`,
          })
          acls = (aclResult?.data || []).filter(
            (acl: OrganizationAcl) => acl.organization === authorUrn
          )
        } catch { acls = [] }
      }
      setSelectedOrganization(org)
      setOrganizationAcls(acls)
      setCurrentView('organization')
    } else if (authorUrn.startsWith(personPrefix)) {
      const personId = authorUrn.slice(personPrefix.length)
      setViewedProfileId(personId === profile?.id ? null : personId)
      setCurrentView('profile')
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#fbfaf7]">
        <div className="w-8 h-8 border-4 border-[#B91C1C]/20 border-t-[#B91C1C] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#fbfaf7] gap-4">
        <p className="text-red-600">{error}</p>
        <button
          className="px-5 py-2 bg-[#B91C1C] hover:bg-[#7F1D1D] text-white rounded-full transition-all font-medium shadow-sm hover:shadow"
          onClick={loadInitialData}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full bg-[#fbfaf7] overflow-auto">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.06)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[#B91C1C] font-bold text-2xl cursor-pointer tracking-tight transition-opacity hover:opacity-80" onClick={() => { setCurrentView('feed'); clearSearch(); }}>{APP_NAME.charAt(0).toLowerCase()}{APP_NAME.charAt(APP_NAME.length - 1).toLowerCase()}</span>
            <div className="relative">
              <input
                type="text"
                placeholder="Search posts by author ID or URN"
                className="bg-stone-100/70 text-gray-900 rounded-lg px-4 py-2.5 pl-10 pr-10 w-80 text-sm transition-all focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/40 focus:shadow-sm placeholder:text-gray-400"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              {searchLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[#B91C1C]/30 border-t-[#B91C1C] rounded-full animate-spin" />
                </span>
              )}
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <NavItem icon="home" label="Home" active={currentView === 'feed'} onClick={() => { setCurrentView('feed'); setViewedProfileId(null); clearSearch(); }} />
            <NavItem icon="organizations" label="Organizations" active={currentView === 'organizations' || currentView === 'organization'} onClick={() => setCurrentView('organizations')} />
            <NavItem icon="network" label="My Network" active={currentView === 'network'} onClick={() => { setCurrentView('network'); clearSearch(); }} />
            <NavItem icon="jobs" label="Jobs" active={currentView === 'jobs'} onClick={() => { setCurrentView('jobs'); clearSearch(); }} />
            <NavItem icon="messaging" label="Messaging" active={currentView === 'messaging'} onClick={() => { setCurrentView('messaging'); clearSearch(); }} />
            <NavItem icon="notifications" label="Notifications" active={currentView === 'notifications'} onClick={() => { setCurrentView('notifications'); clearSearch(); }} />
            <NavItem icon="me" label="Me" active={currentView === 'profile' && (!viewedProfileId || viewedProfileId === profile?.id)} onClick={() => { setViewedProfileId(null); setCurrentView('profile') }} avatar={profile?.localizedFirstName?.charAt(0)} avatarSeed={profile?.id ? `urn:li:person:${profile.id}` : undefined} />
          </nav>
        </div>
      </header>

      {/* Search Error Banner */}
      {searchError && (
        <DismissableBanner
          message={searchError}
          type="error"
          onDismiss={() => setSearchError(null)}
          autoDismissMs={5000}
        />
      )}

      {/* Global Success Banner */}
      {globalSuccessMessage && (
        <DismissableBanner
          message={globalSuccessMessage}
          type="success"
          onDismiss={() => setGlobalSuccessMessage(null)}
          autoDismissMs={5000}
        />
      )}

      {/* Main Content */}
      {currentView === 'feed' && (
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-12 gap-6">
            {/* Left Sidebar - Profile Card */}
            <aside className="col-span-3">
              <div
                className="bg-white rounded-2xl overflow-hidden cursor-pointer shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.06)] transition-all duration-200"
                onClick={() => { setViewedProfileId(null); setCurrentView('profile') }}
              >
                <div className="h-16 bg-gradient-to-br from-[#B91C1C] via-[#9F1A1A] to-[#7F1D1D]" />
                <div className="px-5 pb-5 -mt-9">
                  <div
                    className="w-[72px] h-[72px] rounded-full ring-4 ring-white flex items-center justify-center text-white text-2xl font-semibold shadow-md"
                    style={{ backgroundColor: getAvatarColor(profile?.id ? `urn:li:person:${profile.id}` : undefined) }}
                  >
                    {profile?.localizedFirstName?.charAt(0) || '?'}
                  </div>
                  <h2 className="mt-3 font-semibold text-gray-900 leading-tight">
                    {profile?.localizedFirstName} {profile?.localizedLastName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{profile?.id}]</span>
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">@{profile?.vanityName}</p>
                </div>
              </div>
            </aside>

            {/* Main Feed */}
            <section className="col-span-6">
              {/* Inline Create Post Box */}
              <div className="bg-white rounded-2xl p-5 mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
                <div className="flex gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: getAvatarColor(profile?.id ? `urn:li:person:${profile.id}` : undefined) }}
                  >
                    {profile?.localizedFirstName?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={newPostContent}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      placeholder="What do you want to talk about?"
                      className="w-full bg-stone-50/70 border border-stone-200/70 rounded-xl px-4 py-3 text-gray-900 resize-none transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20 min-h-[88px] placeholder:text-gray-400"
                      rows={3}
                    />
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={handleCreatePost}
                        disabled={creatingPost || !newPostContent.trim()}
                        className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                      >
                        {creatingPost ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editing Post Form */}
              {editingPost && (
                <div className="mb-4">
                  <UpdatePostForm
                    post={editingPost}
                    onUpdated={(updatedPost) => {
                      setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
                      setEditingPost(null)
                      setGlobalSuccessMessage('Post updated successfully')
                    }}
                    onCancel={() => setEditingPost(null)}
                  />
                </div>
              )}

              {/* Search Results or Posts */}
              {hasSearched ? (
                <div>
                  <div className="bg-white rounded-2xl p-5 mb-4 flex items-center justify-between shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
                    <div>
                      <h3 className="font-semibold text-gray-900">Search Results</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {searchedPosts.length > 0
                          ? `Found ${searchedPosts.length} post${searchedPosts.length === 1 ? '' : 's'} for “${lastSearchedQuery}”`
                          : `No posts found for “${lastSearchedQuery}”`
                        }
                      </p>
                    </div>
                    <button
                      onClick={clearSearch}
                      className="px-3.5 py-1.5 text-sm text-gray-600 bg-stone-100 hover:bg-stone-200 rounded-full font-medium transition-colors"
                    >
                      Clear search
                    </button>
                  </div>
                  {searchedPosts.length > 0 ? (
                    <div className="space-y-4">
                      {searchedPosts.map(post => (
                        <PostCard
                          key={post.id}
                          post={post}
                          authorName={authorNames[post.author] || searchedAuthorName || undefined}
                          showAuthor={true}
                          onAuthorClick={handleAuthorClick}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl p-10 text-center text-gray-500 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
                      <p className="text-gray-700 font-medium">No posts found</p>
                      <p className="text-sm mt-1">Try a different author ID or URN</p>
                    </div>
                  )}
                </div>
              ) : posts.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-gray-500 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
                  <p className="text-gray-700 font-medium">No posts yet</p>
                  <p className="text-sm mt-1">Share something with your network</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map(post => {
                    const isOwnPost = profile && post.author === `urn:li:person:${profile.id}`
                    return (
                      <PostCard
                        key={post.id}
                        post={post}
                        authorName={authorNames[post.author] || (isOwnPost ? `${profile.localizedFirstName} ${profile.localizedLastName}` : undefined)}
                        showAuthor={true}
                        onEdit={isOwnPost ? setEditingPost : undefined}
                        onDelete={isOwnPost ? handleDeletePost : undefined}
                        onAuthorClick={handleAuthorClick}
                        isDeleting={deletingPostId === post.id}
                      />
                    )
                  })}
                </div>
              )}
            </section>

            {/* Right Sidebar */}
            <aside className="col-span-3">
              <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
                <h3 className="font-semibold text-gray-900 mb-3 text-[15px]">{`${APP_NAME} News`}</h3>
                <ul className="space-y-3 text-sm">
                  <li className="text-gray-700 hover:text-[#B91C1C] cursor-pointer transition-colors leading-snug">
                    Top story placeholder
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </main>
      )}
      {currentView === 'profile' && (() => {
        const isOwnProfile = !viewedProfileId || viewedProfileId === profile?.id
        const shownProfile = isOwnProfile ? profile : (allPeople[viewedProfileId!] ?? null)
        const shownPosts = shownProfile
          ? posts.filter(p => p.author === `urn:li:person:${shownProfile.id}`)
          : []
        return (
          <ProfileView
            profile={shownProfile}
            posts={shownPosts}
            isOwn={isOwnProfile}
            onBack={() => { setViewedProfileId(null); setCurrentView('feed') }}
            onAuthorClick={handleAuthorClick}
            onProfileUpdated={(updatedProfile) => setProfile(updatedProfile)}
            onProfileDeleted={() => {
              setProfile(null)
              setPosts([])
              setCurrentView('feed')
            }}
            onProfileCreated={(newProfile) => setProfile(newProfile)}
            onPostUpdated={(updatedPost) => setPosts(
              posts.map(p => p.id === updatedPost.id ? updatedPost : p)
            )}
            onPostDeleted={(postId) => setPosts(
              posts.filter(p => p.id !== postId)
            )}
          />
        )
      })()}
      {currentView === 'organization' && (
        <OrganizationView
          organization={selectedOrganization}
          acls={organizationAcls}
          onBack={() => setCurrentView('organizations')}
          onAclCreated={(acl) => setOrganizationAcls([...organizationAcls, acl])}
          onAclUpdated={(updatedAcl) => setOrganizationAcls(
            organizationAcls.map(acl => acl.aclId === updatedAcl.aclId ? updatedAcl : acl)
          )}
          onAclDeleted={(aclId) => setOrganizationAcls(
            organizationAcls.filter(acl => acl.aclId !== aclId)
          )}
          onOrganizationUpdated={(updatedOrg) => {
            setSelectedOrganization(updatedOrg)
            setAllOrganizations(prev => prev.map(o => o.id === updatedOrg.id ? updatedOrg : o))
            setAuthorNames(prev => ({ ...prev, [`urn:li:organization:${updatedOrg.id}`]: getOrgDisplayName(updatedOrg) }))
          }}
          onOrganizationDeleted={() => {
            const orgId = selectedOrganization?.id
            setSelectedOrganization(null)
            setOrganizationAcls([])
            setCurrentView('organizations')
            if (orgId != null) {
              setAllOrganizations(prev => prev.filter(o => o.id !== orgId))
              setAuthorNames(prev => {
                const next = { ...prev }
                delete next[`urn:li:organization:${orgId}`]
                return next
              })
            }
          }}
          personId={profile?.id || null}
        />
      )}
      {currentView === 'createOrganization' && (
        <main className="max-w-4xl mx-auto px-4 py-6">
          <CreateOrganizationForm
            onCreated={(org) => {
              setSelectedOrganization(org)
              setOrganizationAcls([])
              setAllOrganizations(prev => [...prev, org])
              setAuthorNames(prev => ({ ...prev, [`urn:li:organization:${org.id}`]: getOrgDisplayName(org) }))
              setCurrentView('organization')
              setGlobalSuccessMessage('Organization created successfully')
            }}
            onCancel={() => setCurrentView('organizations')}
          />
        </main>
      )}
      {currentView === 'organizations' && (
        <InlineOrganizationsPage
          personId={profile?.id || null}
          allOrganizations={allOrganizations}
          onSelectOrganization={(org, acls) => {
            setSelectedOrganization(org)
            setOrganizationAcls(acls)
            setCurrentView('organization')
          }}
          onCreateOrganization={() => setCurrentView('createOrganization')}
        />
      )}
      {(currentView === 'network' || currentView === 'jobs' || currentView === 'messaging' || currentView === 'notifications') && (
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl p-12 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#B91C1C]/8 flex items-center justify-center" style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}>
              <svg className="w-8 h-8 text-[#B91C1C]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                {currentView === 'network' && <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />}
                {currentView === 'jobs' && <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />}
                {currentView === 'messaging' && <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
                {currentView === 'notifications' && <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />}
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">
              {currentView === 'network' ? 'My Network' : currentView === 'jobs' ? 'Jobs' : currentView === 'messaging' ? 'Messaging' : 'Notifications'}
            </h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              {currentView === 'network' ? 'Manage your professional connections' : currentView === 'jobs' ? 'Find your next opportunity' : currentView === 'messaging' ? 'Start a conversation' : 'Stay updated with your network'}
            </p>
            <button
              onClick={() => setCurrentView('feed')}
              className="mt-6 px-5 py-2 text-[#B91C1C] bg-[#B91C1C]/5 hover:bg-[#B91C1C] hover:text-white rounded-full font-semibold text-sm transition-all"
            >
              Back to Feed
            </button>
          </div>
        </main>
      )}
    </div>
  )
}

function NavItem({ icon, label, active = false, onClick, avatar, avatarSeed }: { icon: string; label: string; active?: boolean; onClick?: () => void; avatar?: string; avatarSeed?: string }) {
  const iconPaths: Record<string, JSX.Element> = {
    home: <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
    network: <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />,
    jobs: <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
    organizations: <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
    messaging: <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
    notifications: <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  }

  // For "Me" nav item, show avatar instead of icon
  if (icon === 'me') {
    return (
      <button
        className={`relative flex flex-col items-center gap-1 px-2 py-1.5 transition-colors ${active ? 'text-[#B91C1C]' : 'text-gray-500 hover:text-gray-800'}`}
        onClick={onClick}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${active ? 'text-white shadow-sm' : 'bg-stone-200 text-gray-600'}`}
          style={active ? { backgroundColor: getAvatarColor(avatarSeed) } : undefined}
        >
          {avatar || '?'}
        </div>
        <span className="text-[11px] tracking-wide">{label}</span>
        {active && <span className="absolute -bottom-[10px] left-2 right-2 h-[2px] rounded-full bg-[#B91C1C]" />}
      </button>
    )
  }

  return (
    <button
      className={`relative flex flex-col items-center gap-1 px-2 py-1.5 transition-colors ${active ? 'text-[#B91C1C]' : 'text-gray-500 hover:text-gray-800'}`}
      onClick={onClick}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} viewBox="0 0 24 24">
        {iconPaths[icon]}
      </svg>
      <span className="text-[11px] tracking-wide">{label}</span>
      {active && <span className="absolute -bottom-[10px] left-2 right-2 h-[2px] rounded-full bg-[#B91C1C]" />}
    </button>
  )
}

function InlineOrganizationsPage({ personId, allOrganizations, onSelectOrganization, onCreateOrganization }: {
  personId: string | null
  allOrganizations: Organization[]
  onSelectOrganization: (org: Organization, acls: OrganizationAcl[]) => void
  onCreateOrganization: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Organization[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const api = useBackendAPI('linkedup')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setError(null)
    setSearched(true)
    const query = searchQuery.trim().toLowerCase()

    // Search through all organizations by name, vanity name, and ID
    const results = allOrganizations.filter(org => {
      // Match vanity name
      if (org.vanityName.toLowerCase().includes(query)) return true
      // Match display name
      const displayName = getOrgDisplayName(org).toLowerCase()
      if (displayName.includes(query)) return true
      // Match by ID
      if (String(org.id) === query) return true
      return false
    })

    if (results.length > 0) {
      setSearchResults(results)
    } else {
      setSearchResults([])
      setError('No organization found matching that search')
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearched(false)
    setError(null)
  }

  const handleSelectOrganization = async (org: Organization) => {
    let acls: OrganizationAcl[] = []

    if (personId) {
      try {
        const personUrn = `urn:li:person:${personId}`
        const aclResult = await api.callTool('get_organization_acls_by_role_assignee', {
          query_field: 'roleAssignee',
          role_assignee: personUrn,
        })
        const orgUrn = `urn:li:organization:${org.id}`
        acls = (aclResult?.data || []).filter(
          (acl: OrganizationAcl) => acl.organization === orgUrn
        )
      } catch {
        acls = []
      }
    }

    onSelectOrganization(org, acls)
  }

  // Show all organizations when not searching
  const displayOrgs = searched ? searchResults : allOrganizations

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl p-6 mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Organizations</h2>
          <button
            onClick={onCreateOrganization}
            className="px-4 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" />
            </svg>
            New Organization
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or vanity name…"
              className="w-full bg-stone-100/70 text-gray-900 rounded-lg px-4 py-2.5 pl-10 text-sm transition-all focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/40 focus:shadow-sm placeholder:text-gray-400"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>
          <button
            type="submit"
            disabled={!searchQuery.trim()}
            className="px-5 py-2.5 bg-[#B91C1C] text-white rounded-lg text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
          >
            Search
          </button>
          {searched && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-4 py-2.5 text-gray-700 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
          autoDismissMs={5000}
        />
      )}

      <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h3 className="text-base font-semibold text-gray-900 mb-4 tracking-tight">
          {searched
            ? searchResults.length > 0
              ? `Found ${searchResults.length} organization${searchResults.length === 1 ? '' : 's'}`
              : 'No results'
            : `All Organizations (${allOrganizations.length})`
          }
        </h3>

        {displayOrgs.length > 0 ? (
          <div className="space-y-2.5">
            {displayOrgs.map(org => (
              <div
                key={org.id}
                onClick={() => handleSelectOrganization(org)}
                className="rounded-xl p-4 hover:bg-stone-50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xl font-semibold shadow-sm"
                    style={{ backgroundColor: getAvatarColor(`urn:li:organization:${org.id}`) }}
                  >
                    {getOrgDisplayName(org).charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{getOrgDisplayName(org)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{org.id}]</span></h4>
                    <p className="text-sm text-gray-500 truncate">{`${APP_DOMAIN}/company/${org.vanityName}`}</p>
                    {org.primaryOrganizationType && (
                      <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-gray-700 tracking-wide">
                        {org.primaryOrganizationType === 'COMPANY' ? 'Company' : 'School'}
                      </span>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-[#B91C1C] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-6">
            {searched ? 'No organizations found. Try a different search term or create a new organization.' : 'No organizations yet. Create one to get started.'}
          </p>
        )}
      </div>
    </main>
  )
}

function ProfileView({ profile, posts, isOwn, onBack, onAuthorClick, onProfileUpdated, onProfileDeleted, onProfileCreated, onPostUpdated, onPostDeleted }: {
  profile: Profile | null
  posts: Post[]
  isOwn: boolean
  onBack: () => void
  onAuthorClick?: (authorUrn: string) => void
  onProfileUpdated: (profile: Profile) => void
  onProfileDeleted: () => void
  onProfileCreated: (profile: Profile) => void
  onPostUpdated: (post: Post) => void
  onPostDeleted: (postId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleDeletePost = async (post: Post) => {
    setDeletingPostId(post.id)
    setPostError(null)
    setSuccessMessage(null)

    try {
      await api.callTool('delete_post_by_id', {
        post_id: post.id
      })
      onPostDeleted(post.id)
      setSuccessMessage('Post deleted successfully')
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to delete post')
    } finally {
      setDeletingPostId(null)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await api.callTool('delete_my_profile', {})
      onProfileDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete profile')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (!profile) {
    if (!isOwn) {
      return (
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl p-10 text-center text-gray-500 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
            <p className="text-gray-700 font-medium">Profile not found</p>
            <div className="mt-5">
              <button
                onClick={onBack}
                className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </main>
      )
    }
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        {isCreating ? (
          <CreateProfileForm
            onCreated={(newProfile) => {
              setIsCreating(false)
              onProfileCreated(newProfile)
              setSuccessMessage('Profile created successfully')
            }}
            onCancel={() => setIsCreating(false)}
          />
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-500 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
            <p className="text-gray-700 font-medium">No profile data available</p>
            <p className="text-sm mt-1.5">Create your profile to get started</p>
            <div className="mt-6 flex gap-2 justify-center">
              <button
                onClick={() => setIsCreating(true)}
                className="px-5 py-2 bg-[#B91C1C] hover:bg-[#7F1D1D] text-white rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow"
              >
                Create Profile
              </button>
              <button
                onClick={onBack}
                className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </main>
    )
  }

  if (isEditing) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <UpdateProfileForm
          profile={profile}
          onUpdated={(updatedProfile) => {
            setIsEditing(false)
            onProfileUpdated(updatedProfile)
            setSuccessMessage('Profile updated successfully')
          }}
          onCancel={() => setIsEditing(false)}
        />
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Success Banner */}
      {successMessage && (
        <DismissableBanner
          message={successMessage}
          type="success"
          onDismiss={() => setSuccessMessage(null)}
          autoDismissMs={5000}
        />
      )}

      {/* Error Banners */}
      {deleteError && (
        <DismissableBanner
          message={deleteError}
          type="error"
          onDismiss={() => setDeleteError(null)}
        />
      )}

      {postError && (
        <DismissableBanner
          message={postError}
          type="error"
          onDismiss={() => setPostError(null)}
        />
      )}

      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl overflow-hidden mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        {/* Cover Photo */}
        <div className="h-36 bg-gradient-to-br from-[#B91C1C] via-[#9F1A1A] to-[#7F1D1D]" />

        {/* Profile Info */}
        <div className="px-7 pb-6">
          <div className="flex justify-between items-start">
            <div className="-mt-16">
              <div
                className="w-32 h-32 rounded-full ring-4 ring-white flex items-center justify-center text-white text-5xl font-semibold shadow-lg"
                style={{ backgroundColor: getAvatarColor(`urn:li:person:${profile.id}`) }}
              >
                {profile.localizedFirstName?.charAt(0) || '?'}
              </div>
            </div>
            {isOwn && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-1.5 bg-[#B91C1C]/8 text-[#B91C1C] rounded-full text-sm font-semibold hover:bg-[#B91C1C] hover:text-white transition-all"
                  style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}
                >
                  Edit Profile
                </button>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-1.5 bg-red-50 text-red-600 rounded-full text-sm font-semibold hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-1.5 bg-stone-100 text-gray-700 rounded-full text-sm font-medium hover:bg-stone-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {profile.localizedFirstName} {profile.localizedLastName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{profile.id}]</span>
            </h1>
            <p className="text-gray-500 mt-1">{`${APP_DOMAIN}/in/${profile.vanityName}`}</p>
          </div>
        </div>
      </div>

      {/* Activity / Posts Section */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Activity</h2>
          <span className="text-xs font-semibold tracking-wide uppercase text-[#B91C1C] bg-[#B91C1C]/10 px-2.5 py-1 rounded-full">{posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>
        </div>

        {editingPost && (
          <div className="mb-4">
            <UpdatePostForm
              post={editingPost}
              onUpdated={(updatedPost) => {
                onPostUpdated(updatedPost)
                setEditingPost(null)
                setSuccessMessage('Post updated successfully')
              }}
              onCancel={() => setEditingPost(null)}
            />
          </div>
        )}

        {posts.length === 0 ? (
          <div className="py-10 text-center text-gray-500">
            <p className="text-gray-700 font-medium">No posts yet</p>
            <p className="text-sm mt-1">Start sharing with your network</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={isOwn ? setEditingPost : undefined}
                onDelete={isOwn ? handleDeletePost : undefined}
                onAuthorClick={onAuthorClick}
                isDeleting={deletingPostId === post.id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

interface ProfileFormData {
  localizedFirstName: string
  localizedLastName: string
  vanityName: string
  firstName: {
    localized: Record<string, string>
    preferredLocale: { country: string; language: string }
  }
  lastName: {
    localized: Record<string, string>
    preferredLocale: { country: string; language: string }
  }
}

function CreateProfileForm({ onCreated, onCancel }: {
  onCreated: (profile: Profile) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<ProfileFormData>({
    localizedFirstName: '',
    localizedLastName: '',
    vanityName: '',
    firstName: {
      localized: { en_US: '' },
      preferredLocale: { country: 'US', language: 'en' }
    },
    lastName: {
      localized: { en_US: '' },
      preferredLocale: { country: 'US', language: 'en' }
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await api.callTool('create_my_profile', {
        person_data: {
          ...formData,
          firstName: {
            localized: { [`${formData.firstName.preferredLocale.language}_${formData.firstName.preferredLocale.country}`]: formData.localizedFirstName },
            preferredLocale: formData.firstName.preferredLocale
          },
          lastName: {
            localized: { [`${formData.lastName.preferredLocale.language}_${formData.lastName.preferredLocale.country}`]: formData.localizedLastName },
            preferredLocale: formData.lastName.preferredLocale
          }
        }
      })

      if (result?.data) {
        onCreated(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 tracking-tight">Create Your Profile</h2>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
              <input
                type="text"
                value={formData.localizedFirstName}
                onChange={(e) => setFormData({ ...formData, localizedFirstName: e.target.value })}
                className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
              <input
                type="text"
                value={formData.localizedLastName}
                onChange={(e) => setFormData({ ...formData, localizedLastName: e.target.value })}
                className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Profile URL</label>
            <div className="flex items-center">
              <span className="text-gray-500 text-sm mr-2">{`${APP_DOMAIN}/in/`}</span>
              <input
                type="text"
                value={formData.vanityName}
                onChange={(e) => setFormData({ ...formData, vanityName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="flex-1 bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                placeholder="your-name"
                required
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Creating…' : 'Create Profile'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function UpdateProfileForm({ profile, onUpdated, onCancel }: {
  profile: Profile
  onUpdated: (profile: Profile) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<ProfileFormData>({
    localizedFirstName: profile.localizedFirstName,
    localizedLastName: profile.localizedLastName,
    vanityName: profile.vanityName,
    firstName: profile.firstName || {
      localized: { en_US: profile.localizedFirstName },
      preferredLocale: { country: 'US', language: 'en' }
    },
    lastName: profile.lastName || {
      localized: { en_US: profile.localizedLastName },
      preferredLocale: { country: 'US', language: 'en' }
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const localeKey = `${formData.firstName.preferredLocale.language}_${formData.firstName.preferredLocale.country}`
      const result = await api.callTool('update_my_profile', {
        person_data: {
          localizedFirstName: formData.localizedFirstName,
          localizedLastName: formData.localizedLastName,
          vanityName: formData.vanityName,
          firstName: {
            localized: { [localeKey]: formData.localizedFirstName },
            preferredLocale: formData.firstName.preferredLocale
          },
          lastName: {
            localized: { [localeKey]: formData.localizedLastName },
            preferredLocale: formData.lastName.preferredLocale
          }
        }
      })

      if (result?.data) {
        onUpdated(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 tracking-tight">Edit Profile</h2>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
              <input
                type="text"
                value={formData.localizedFirstName}
                onChange={(e) => setFormData({ ...formData, localizedFirstName: e.target.value })}
                className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
              <input
                type="text"
                value={formData.localizedLastName}
                onChange={(e) => setFormData({ ...formData, localizedLastName: e.target.value })}
                className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Profile URL</label>
            <div className="flex items-center">
              <span className="text-gray-500 text-sm mr-2">{`${APP_DOMAIN}/in/`}</span>
              <input
                type="text"
                value={formData.vanityName}
                onChange={(e) => setFormData({ ...formData, vanityName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="flex-1 bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

const ACL_ROLES = [
  'ADMINISTRATOR',
  'DIRECT_SPONSORED_CONTENT_POSTER',
  'RECRUITING_POSTER',
  'LEAD_CAPTURE_ADMINISTRATOR',
  'LEAD_GEN_FORMS_MANAGER',
  'ANALYST',
  'CURATOR',
  'CONTENT_ADMINISTRATOR',
  'EDITOR',
  'VIEWER',
] as const

const ACL_STATES = ['ACTIVE', 'REQUESTED'] as const
const ACL_STATES_ALL = ['ACTIVE', 'REJECTED', 'REQUESTED', 'REVOKED'] as const

interface CreateAclFormProps {
  organization: Organization
  personId: string
  onCreated: (acl: OrganizationAcl) => void
  onCancel: () => void
}

interface UpdateAclFormProps {
  acl: OrganizationAcl
  onUpdated: (acl: OrganizationAcl) => void
  onCancel: () => void
}

function UpdateAclForm({ acl, onUpdated, onCancel }: UpdateAclFormProps) {
  const [role, setRole] = useState<string>(acl.role)
  const [state, setState] = useState<string>(acl.state)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await api.callTool('update_organization_acl', {
        acl_id: acl.aclId,
        acl_data: {
          roleAssignee: acl.roleAssignee,
          role,
          organization: acl.organization,
          state,
        },
      })

      if (result?.data) {
        onUpdated(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ACL')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="rounded-xl p-5 bg-stone-50 ring-1 ring-stone-200/60">
        <h3 className="font-semibold text-gray-900 mb-4 tracking-tight">Edit Access Control Record</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Role Assignee</label>
            <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
              {acl.roleAssignee}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Organization</label>
            <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
              {acl.organization}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ACL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full bg-white border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ACL_STATES_ALL.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-white hover:bg-stone-100 text-gray-700 rounded-full text-sm font-medium transition-colors ring-1 ring-stone-200/60"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

interface AclCardProps {
  acl: OrganizationAcl
  onEdit: (acl: OrganizationAcl) => void
  onDelete: (acl: OrganizationAcl) => void
  isDeleting: boolean
}

function AclCard({ acl, onEdit, onDelete, isDeleting }: AclCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <div className="rounded-xl p-5 bg-stone-50/60 ring-1 ring-stone-200/50 transition-colors hover:bg-stone-50">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Role<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)', textTransform: 'none', letterSpacing: 'normal' }}>[{acl.aclId}]</span></label>
          <p className="text-gray-900 font-medium capitalize mt-0.5">{acl.role.toLowerCase().replace(/_/g, ' ')}</p>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">State</label>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            acl.state === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
            acl.state === 'REQUESTED' ? 'bg-amber-100 text-amber-800' :
            acl.state === 'REJECTED' ? 'bg-red-100 text-red-800' :
            'bg-stone-200 text-gray-700'
          }`}>
            {acl.state}
          </span>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Role Assignee</label>
          <p className="text-gray-700 text-xs font-mono mt-0.5 break-all">{acl.roleAssignee}</p>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Organization</label>
          <p className="text-gray-700 text-xs font-mono mt-0.5 break-all">{acl.organization}</p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => onEdit(acl)}
          className="px-3.5 py-1.5 text-sm text-[#B91C1C] bg-[#B91C1C]/8 hover:bg-[#B91C1C] hover:text-white rounded-full font-semibold transition-all"
          style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}
        >
          Edit
        </button>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3.5 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-full font-semibold transition-colors"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Delete this ACL?</span>
            <button
              onClick={() => onDelete(acl)}
              disabled={isDeleting}
              className="px-3.5 py-1.5 text-sm text-white bg-red-600 rounded-full font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isDeleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3.5 py-1.5 text-sm text-gray-700 bg-stone-100 hover:bg-stone-200 rounded-full font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateAclForm({ organization, personId, onCreated, onCancel }: CreateAclFormProps) {
  const [role, setRole] = useState<string>(ACL_ROLES[0])
  const [state, setState] = useState<string>(ACL_STATES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await api.callTool('create_organization_acl', {
        acl_data: {
          roleAssignee: `urn:li:person:${personId}`,
          role,
          organization: `urn:li:organization:${organization.id}`,
          state,
        },
      })

      if (result?.data) {
        onCreated(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ACL')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="rounded-xl p-5 bg-stone-50 ring-1 ring-stone-200/60">
        <h3 className="font-semibold text-gray-900 mb-4 tracking-tight">Create Access Control Record</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Role Assignee</label>
            <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
              urn:li:person:{personId}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Organization</label>
            <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
              urn:li:organization:{organization.id}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ACL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full bg-white border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ACL_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Creating…' : 'Create ACL'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-white hover:bg-stone-100 text-gray-700 rounded-full text-sm font-medium transition-colors ring-1 ring-stone-200/60"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

const ORGANIZATION_TYPES = ['COMPANY', 'SCHOOL'] as const

interface OrganizationFormData {
  vanityName: string
  displayName: string
  primaryOrganizationType: 'COMPANY' | 'SCHOOL'
}

function CreateOrganizationForm({ onCreated, onCancel }: {
  onCreated: (org: Organization) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<OrganizationFormData>({
    vanityName: '',
    displayName: '',
    primaryOrganizationType: 'COMPANY'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const formatErrorMessage = (err: unknown): string => {
    const message = err instanceof Error ? err.message : 'Failed to create organization'
    // Make error messages more user-friendly
    if (message.toLowerCase().includes('vanity') || message.toLowerCase().includes('duplicate')) {
      return 'An organization with this URL already exists. Please choose a different one.'
    }
    if (message.toLowerCase().includes('already exists')) {
      return 'This organization already exists. Please use a different name or URL.'
    }
    return message
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await api.callTool('create_organization', {
        organization_data: {
          vanityName: formData.vanityName,
          name: {
            localized: { en_US: formData.displayName },
            preferredLocale: { country: 'US', language: 'en' }
          },
          primaryOrganizationType: formData.primaryOrganizationType
        }
      })

      if (result?.data) {
        onCreated(result.data)
      }
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 tracking-tight">Create New Organization</h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
              placeholder="Acme Corporation"
              required
            />
            <p className="text-xs text-gray-500 mt-1.5">This is the display name that will appear on your organization page</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Page URL</label>
            <div className="flex items-center">
              <span className="text-gray-500 text-sm mr-2">{`${APP_DOMAIN}/company/`}</span>
              <input
                type="text"
                value={formData.vanityName}
                onChange={(e) => setFormData({ ...formData, vanityName: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                className="flex-1 bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                placeholder="acme-corp"
                required
                minLength={3}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Choose a unique URL for your organization page (lowercase letters, numbers, and hyphens only)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Type</label>
            <select
              value={formData.primaryOrganizationType}
              onChange={(e) => setFormData({ ...formData, primaryOrganizationType: e.target.value as 'COMPANY' | 'SCHOOL' })}
              className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ORGANIZATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Creating…' : 'Create Organization'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function UpdateOrganizationForm({ organization, onUpdated, onCancel }: {
  organization: Organization
  onUpdated: (org: Organization) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<OrganizationFormData>({
    vanityName: organization.vanityName,
    displayName: getOrgDisplayName(organization),
    primaryOrganizationType: organization.primaryOrganizationType || 'COMPANY'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const formatErrorMessage = (err: unknown): string => {
    const message = err instanceof Error ? err.message : 'Failed to update organization'
    if (message.toLowerCase().includes('vanity') || message.toLowerCase().includes('duplicate')) {
      return 'An organization with this URL already exists. Please choose a different one.'
    }
    if (message.toLowerCase().includes('already exists')) {
      return 'This organization already exists. Please use a different name or URL.'
    }
    return message
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await api.callTool('update_organization_by_id', {
        organization_id: String(organization.id),
        organization_data: {
          vanityName: formData.vanityName,
          name: {
            localized: { en_US: formData.displayName },
            preferredLocale: { country: 'US', language: 'en' }
          },
          primaryOrganizationType: formData.primaryOrganizationType
        }
      })

      if (result?.data) {
        onUpdated(result.data)
      }
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 tracking-tight">Edit Organization</h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Page URL</label>
            <div className="flex items-center">
              <span className="text-gray-500 text-sm mr-2">{`${APP_DOMAIN}/company/`}</span>
              <input
                type="text"
                value={formData.vanityName}
                onChange={(e) => setFormData({ ...formData, vanityName: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                className="flex-1 bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
                required
                minLength={3}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Type</label>
            <select
              value={formData.primaryOrganizationType}
              onChange={(e) => setFormData({ ...formData, primaryOrganizationType: e.target.value as 'COMPANY' | 'SCHOOL' })}
              className="w-full bg-stone-50/70 border border-stone-200/70 rounded-lg px-3.5 py-2.5 text-gray-900 transition-all focus:outline-none focus:bg-white focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {ORGANIZATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function OrganizationView({ organization, acls, onBack, onAclCreated, onAclUpdated, onAclDeleted, onOrganizationUpdated, onOrganizationDeleted, personId }: {
  organization: Organization | null
  acls: OrganizationAcl[]
  onBack: () => void
  onAclCreated: (acl: OrganizationAcl) => void
  onAclUpdated: (acl: OrganizationAcl) => void
  onAclDeleted: (aclId: string) => void
  onOrganizationUpdated: (org: Organization) => void
  onOrganizationDeleted: () => void
  personId: string | null
}) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingAcl, setEditingAcl] = useState<OrganizationAcl | null>(null)
  const [deletingAclId, setDeletingAclId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isEditingOrg, setIsEditingOrg] = useState(false)
  const [showOrgDeleteConfirm, setShowOrgDeleteConfirm] = useState(false)
  const [isDeletingOrg, setIsDeletingOrg] = useState(false)
  const [orgDeleteError, setOrgDeleteError] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  const api = useBackendAPI('linkedup')

  const handleDeleteAcl = async (acl: OrganizationAcl) => {
    setDeletingAclId(acl.aclId)
    setDeleteError(null)
    setSuccessMessage(null)

    try {
      await api.callTool('delete_organization_acl', {
        acl_id: acl.aclId,
      })
      onAclDeleted(acl.aclId)
      setSuccessMessage('Access control record deleted successfully')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete ACL')
    } finally {
      setDeletingAclId(null)
    }
  }

  const handleDeleteOrganization = async () => {
    if (!organization) return
    setIsDeletingOrg(true)
    setOrgDeleteError(null)

    try {
      await api.callTool('delete_organization_by_id', {
        organization_id: String(organization.id)
      })
      onOrganizationDeleted()
    } catch (err) {
      setOrgDeleteError(err instanceof Error ? err.message : 'Failed to delete organization')
    } finally {
      setIsDeletingOrg(false)
      setShowOrgDeleteConfirm(false)
    }
  }

  const handleDeleteOrganizationByVanityName = async () => {
    if (!organization) return
    setIsDeletingOrg(true)
    setOrgDeleteError(null)

    try {
      await api.callTool('delete_organization_by_vanity_name', {
        query_field: 'vanityName',
        vanity_name: organization.vanityName
      })
      onOrganizationDeleted()
    } catch (err) {
      setOrgDeleteError(err instanceof Error ? err.message : 'Failed to delete organization by vanity name')
    } finally {
      setIsDeletingOrg(false)
      setShowOrgDeleteConfirm(false)
    }
  }

  // Follow button handler
  const handleFollow = async () => {
    if (!personId || !organization) return
    setFollowLoading(true)
    try {
      await api.callTool('create_organization_acl', {
        acl_data: {
          roleAssignee: `urn:li:person:${personId}`,
          role: 'VIEWER',
          organization: `urn:li:organization:${organization.id}`,
          state: 'ACTIVE',
        },
      })
      setIsFollowing(true)
      setSuccessMessage('Now following this organization')
    } catch {
      setIsFollowing(true)
      setSuccessMessage('Already following this organization')
    } finally {
      setFollowLoading(false)
    }
  }

  if (!organization) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl p-10 text-center text-gray-500 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
          <p className="text-gray-700 font-medium">No organization data available</p>
          <button
            onClick={onBack}
            className="mt-5 px-5 py-2 bg-[#B91C1C] hover:bg-[#7F1D1D] text-white rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow"
          >
            Go Back
          </button>
        </div>
      </main>
    )
  }

  if (isEditingOrg) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <UpdateOrganizationForm
          organization={organization}
          onUpdated={(updatedOrg) => {
            setIsEditingOrg(false)
            onOrganizationUpdated(updatedOrg)
            setSuccessMessage('Organization updated successfully')
          }}
          onCancel={() => setIsEditingOrg(false)}
        />
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Success Banner */}
      {successMessage && (
        <DismissableBanner
          message={successMessage}
          type="success"
          onDismiss={() => setSuccessMessage(null)}
          autoDismissMs={5000}
        />
      )}

      {/* Error Banners */}
      {orgDeleteError && (
        <DismissableBanner
          message={orgDeleteError}
          type="error"
          onDismiss={() => setOrgDeleteError(null)}
        />
      )}

      {deleteError && (
        <DismissableBanner
          message={deleteError}
          type="error"
          onDismiss={() => setDeleteError(null)}
        />
      )}

      {/* Back button to return to organizations list */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[#B91C1C] font-semibold mb-4 hover:gap-2 transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Organizations
      </button>

      {/* Organization Header Card */}
      <div className="bg-white rounded-2xl overflow-hidden mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        {/* Cover Photo */}
        <div className="h-32 bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900" />

        {/* Organization Info */}
        <div className="px-7 pb-6">
          <div className="flex justify-between items-start">
            <div className="-mt-12">
              <div
                className="w-24 h-24 ring-4 ring-white rounded-2xl shadow-lg flex items-center justify-center text-white text-4xl font-semibold"
                style={{ backgroundColor: getAvatarColor(`urn:li:organization:${organization.id}`) }}
              >
                {getOrgDisplayName(organization).charAt(0).toUpperCase() || '?'}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <button
                onClick={handleFollow}
                disabled={isFollowing || followLoading}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  isFollowing
                    ? 'bg-stone-100 text-gray-600 cursor-default'
                    : 'bg-[#B91C1C] text-white hover:bg-[#7F1D1D] shadow-sm hover:shadow'
                } disabled:opacity-50`}
              >
                {followLoading ? 'Following…' : isFollowing ? 'Following' : '+ Follow'}
              </button>
              <button
                onClick={() => setIsEditingOrg(true)}
                className="px-4 py-1.5 bg-[#B91C1C]/8 text-[#B91C1C] rounded-full text-sm font-semibold hover:bg-[#B91C1C] hover:text-white transition-all"
                style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}
              >
                Edit
              </button>
              {!showOrgDeleteConfirm ? (
                <button
                  onClick={() => setShowOrgDeleteConfirm(true)}
                  className="px-4 py-1.5 bg-red-50 text-red-600 rounded-full text-sm font-semibold hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteOrganization}
                    disabled={isDeletingOrg}
                    className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                    title="Delete by organization ID"
                  >
                    {isDeletingOrg ? 'Deleting…' : 'By ID'}
                  </button>
                  <button
                    onClick={handleDeleteOrganizationByVanityName}
                    disabled={isDeletingOrg}
                    className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                    title="Delete by vanity name"
                  >
                    {isDeletingOrg ? 'Deleting…' : 'By Name'}
                  </button>
                  <button
                    onClick={() => setShowOrgDeleteConfirm(false)}
                    className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{getOrgDisplayName(organization)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{organization.id}]</span></h1>
            <p className="text-gray-500 mt-1">{`${APP_DOMAIN}/company/${organization.vanityName}`}</p>
          </div>

          {/* Organization Type Badge */}
          {organization.primaryOrganizationType && (
            <div className="mt-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-gray-700 tracking-wide">
                {organization.primaryOrganizationType === 'COMPANY' ? (
                  <>
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Company
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                    </svg>
                    School
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Organization Details Card */}
      <div className="bg-white rounded-2xl p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-semibold text-gray-900 mb-5 tracking-tight">About</h2>
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Vanity Name</label>
            <p className="text-gray-900 font-medium mt-0.5">{organization.vanityName}</p>
          </div>

          {organization.name?.localized && Object.keys(organization.name.localized).length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Name (Localized)</label>
              <div className="mt-1 space-y-1">
                {Object.entries(organization.name.localized).map(([locale, name]) => (
                  <p key={locale} className="text-gray-900">
                    <span className="text-gray-500 text-sm">{locale}:</span> {name}
                  </p>
                ))}
              </div>
            </div>
          )}

          {organization.primaryOrganizationType && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Organization Type</label>
              <p className="text-gray-900 font-medium capitalize mt-0.5">{organization.primaryOrganizationType.toLowerCase()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Access Control Section */}
      <div className="bg-white rounded-2xl p-7 mt-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Access Control</h2>
          {personId && !showCreateForm && !editingAcl && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-3.5 py-1.5 bg-[#B91C1C] text-white text-sm rounded-full font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow"
            >
              + Add ACL
            </button>
          )}
        </div>

        {showCreateForm && personId && (
          <div className="mb-4">
            <CreateAclForm
              organization={organization}
              personId={personId}
              onCreated={(acl) => {
                onAclCreated(acl)
                setShowCreateForm(false)
                setSuccessMessage('Access control record created successfully')
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {editingAcl && (
          <div className="mb-4">
            <UpdateAclForm
              acl={editingAcl}
              onUpdated={(acl) => {
                onAclUpdated(acl)
                setEditingAcl(null)
                setSuccessMessage('Access control record updated successfully')
              }}
              onCancel={() => setEditingAcl(null)}
            />
          </div>
        )}

        {acls.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <p className="text-gray-700 font-medium">No access control records found</p>
            <p className="text-sm mt-1">You don't have any roles in this organization</p>
          </div>
        ) : (
          <div className="space-y-3">
            {acls.map(acl => (
              <AclCard
                key={acl.aclId}
                acl={acl}
                onEdit={(acl) => {
                  setShowCreateForm(false)
                  setEditingAcl(acl)
                }}
                onDelete={handleDeleteAcl}
                isDeleting={deletingAclId === acl.aclId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
