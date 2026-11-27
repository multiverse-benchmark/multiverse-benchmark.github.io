import { useEffect, useState } from "react";

interface AuthenticatedUser {
  login: string;
  id?: number;
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
}

interface SearchedUser {
  login: string;
  id?: number;
  avatar_url?: string;
  type?: string;
  score?: number;
}

interface UserTabProps {
  api: { callTool: <T = unknown>(toolName: string, params: Record<string, unknown>) => Promise<T> };
  showErrorModal: (title: string, message: string) => void;
}

export default function UserTab({ api, showErrorModal }: UserTabProps) {
  const [me, setMe] = useState<AuthenticatedUser | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meLoaded, setMeLoaded] = useState(false);

  // User search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const loadMe = async () => {
    setMeLoading(true);
    try {
      const result = await api.callTool<any>("get_authenticated_user", {});
      setMe(result);
      setMeLoaded(true);
    } catch (e: any) {
      showErrorModal("Failed to Load Profile", e?.message || "Unknown error");
    } finally {
      setMeLoading(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const result = await api.callTool<any>("search_users", {
        q: searchQuery.trim(),
      });
      const items = result?.items ?? result?.users ?? [];
      setSearchResults(Array.isArray(items) ? items : []);
      setSearchTotal(result?.total_count ?? items?.length ?? 0);
    } catch (e: any) {
      showErrorModal("Failed to Search Users", e?.message || "Unknown error");
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--border-color)]">
        <div className="inline-flex items-center gap-1 p-1 bg-[var(--bg-secondary)] rounded-full ring-1 ring-inset ring-[var(--border-color)]">
          <button
            onClick={() => setShowSearch(false)}
            className={`px-3.5 py-1.5 text-xs rounded-full font-medium transition-all duration-150 ${
              !showSearch
                ? "bg-[var(--bg-primary)] text-[var(--accent-color)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => setShowSearch(true)}
            className={`px-3.5 py-1.5 text-xs rounded-full font-medium transition-all duration-150 ${
              showSearch
                ? "bg-[var(--bg-primary)] text-[var(--accent-color)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Search Users
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {!showSearch ? (
          // Profile view
          meLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : !meLoaded || !me ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-2">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">👤</div>
              <p className="text-base font-medium text-[var(--text-primary)]">Profile</p>
              <button
                onClick={loadMe}
                className="mt-2 px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99]"
              >
                Load Profile
              </button>
            </div>
          ) : (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-color)]/20 to-[var(--accent-color)]/5 text-[var(--accent-color)] flex items-center justify-center text-2xl font-semibold ring-1 ring-[var(--accent-color)]/15">
                  {me.login.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
                    {me.name || me.login}
                  </h2>
                  <p className="text-sm text-[var(--text-tertiary)] font-mono">@{me.login}</p>
                </div>
              </div>

              {me.bio && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{me.bio}</p>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                {me.email && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Email</div>
                    <div className="text-sm text-[var(--text-primary)] mt-1 truncate">{me.email}</div>
                  </div>
                )}
                {me.company && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Company</div>
                    <div className="text-sm text-[var(--text-primary)] mt-1 truncate">{me.company}</div>
                  </div>
                )}
                {me.location && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Location</div>
                    <div className="text-sm text-[var(--text-primary)] mt-1 truncate">{me.location}</div>
                  </div>
                )}
                {me.blog && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Blog</div>
                    <div className="text-sm text-[var(--text-primary)] mt-1 truncate">{me.blog}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-5 text-sm text-[var(--text-secondary)] pt-1">
                {typeof me.public_repos === "number" && (
                  <span><strong className="text-[var(--text-primary)] text-base font-semibold tracking-tight">{me.public_repos}</strong> <span className="text-xs text-[var(--text-tertiary)]">repos</span></span>
                )}
                {typeof me.followers === "number" && (
                  <span><strong className="text-[var(--text-primary)] text-base font-semibold tracking-tight">{me.followers}</strong> <span className="text-xs text-[var(--text-tertiary)]">followers</span></span>
                )}
                {typeof me.following === "number" && (
                  <span><strong className="text-[var(--text-primary)] text-base font-semibold tracking-tight">{me.following}</strong> <span className="text-xs text-[var(--text-tertiary)]">following</span></span>
                )}
              </div>

              {me.created_at && (
                <p className="text-xs text-[var(--text-tertiary)]">
                  Joined {new Date(me.created_at).toLocaleDateString()}
                </p>
              )}

              <button
                onClick={loadMe}
                className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] transition-all duration-150"
              >
                Refresh Profile
              </button>
            </div>
          )
        ) : (
          // User search view
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search users…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchUsers(); }}
                className="flex-1 px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
              />
              <button
                onClick={searchUsers}
                disabled={searchLoading || !searchQuery.trim()}
                className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
              >
                {searchLoading ? "Searching…" : "Search"}
              </button>
            </div>

            {searchLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--text-secondary)] gap-1">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">🔍</div>
                <p className="text-sm text-[var(--text-tertiary)]">
                  {searchTotal === 0 && searchQuery ? "No users found" : "Search for Githut users"}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{searchTotal} users found</p>
                <div className="space-y-1.5">
                  {searchResults.map((user) => (
                    <div
                      key={user.login}
                      className="p-3 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] flex items-center gap-3 hover:ring-[var(--accent-color)]/30 transition-all duration-150"
                    >
                      <div className="w-10 h-10 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-base font-semibold">
                        {user.login.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-[var(--text-primary)]">{user.login}</div>
                        {user.type && (
                          <div className="text-xs text-[var(--text-tertiary)]">{user.type}</div>
                        )}
                      </div>
                      {typeof user.score === "number" && (
                        <div className="ml-auto text-xs text-[var(--text-tertiary)] font-mono">
                          {user.score.toFixed(1)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
