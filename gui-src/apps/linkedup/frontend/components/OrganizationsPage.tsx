import { useState } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { DismissableBanner } from './DismissableBanner'
import { getAvatarColor } from '../avatarColor'

interface Organization {
  id: number
  vanityName: string
  name?: {
    localized: Record<string, string>
    preferredLocale: { country: string; language: string }
  }
  primaryOrganizationType?: 'COMPANY' | 'SCHOOL'
}

interface OrganizationAcl {
  aclId: string
  roleAssignee: string
  role: string
  organization: string
  state: string
}

interface OrganizationsPageProps {
  personId: string | null
  onSelectOrganization: (org: Organization, acls: OrganizationAcl[]) => void
  onCreateOrganization: () => void
}

export function OrganizationsPage({ personId, onSelectOrganization, onCreateOrganization }: OrganizationsPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Organization[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  const api = useBackendAPI('linkedup')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    setError(null)
    setSearched(true)

    try {
      const result = await api.callTool('get_organizations_by_vanity_name', {
        query_field: 'vanityName',
        vanity_name: searchQuery.trim(),
      })

      if (result?.data && result.data.length > 0) {
        setSearchResults(result.data)
      } else {
        setSearchResults([])
        setError('No organization found with that name')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setSearchResults([])
    } finally {
      setSearchLoading(false)
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

  const getDisplayName = (org: Organization) => {
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

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Search Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Organizations</h2>
          <button
            onClick={onCreateOrganization}
            className="px-4 py-2 bg-[#0077B5] text-white rounded-full font-medium hover:bg-[#005582] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
              placeholder="Search by vanity name..."
              className="w-full bg-[#eef3f8] text-gray-900 rounded px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0077B5]"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>
          <button
            type="submit"
            disabled={searchLoading || !searchQuery.trim()}
            className="px-6 py-2 bg-[#0077B5] text-white rounded font-medium hover:bg-[#005582] transition-colors disabled:opacity-50"
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
          {searched && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded font-medium hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Error Banner */}
      {error && (
        <DismissableBanner
          message={error}
          type="error"
          onDismiss={() => setError(null)}
          autoDismissMs={5000}
        />
      )}

      {/* Results */}
      {searched && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {searchResults.length > 0
              ? `Found ${searchResults.length} organization${searchResults.length === 1 ? '' : 's'}`
              : 'No results'
            }
          </h3>

          {searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map(org => (
                <div
                  key={org.id}
                  onClick={() => handleSelectOrganization(org)}
                  className="border border-gray-200 rounded-lg p-4 hover:border-[#0077B5] hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded flex items-center justify-center flex-shrink-0 text-white text-2xl font-bold"
                      style={{ backgroundColor: getAvatarColor(`urn:li:organization:${org.id}`) }}
                    >
                      {getDisplayName(org).charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{getDisplayName(org)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{org.id}]</span></h4>
                      <p className="text-sm text-gray-500">linkedup.com/company/{org.vanityName}</p>
                      {org.primaryOrganizationType && (
                        <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {org.primaryOrganizationType === 'COMPANY' ? 'Company' : 'School'}
                        </span>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">
              No organizations found. Try a different search term or create a new organization.
            </p>
          )}
        </div>
      )}

      {/* Prompt to search (when not searching) */}
      {!searched && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="py-8 text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg font-medium text-gray-700">Search for Organizations</p>
            <p className="text-sm mt-1">Enter a vanity name above to find organizations</p>
          </div>
        </div>
      )}
    </main>
  )
}
