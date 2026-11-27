import { useCallback, useEffect, useMemo, useState } from "react";

interface Issue {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels?: Array<{ name: string; color?: string }>;
  assignees?: Array<{ login: string }>;
  user?: { login: string; id?: number };
  created_at?: string;
  updated_at?: string;
  comments?: number;
}

interface IssueComment {
  id: number;
  body: string;
  user?: { login: string; id?: number };
  created_at?: string;
  updated_at?: string;
}

interface RepoOption {
  owner: string;
  name: string;
  full_name?: string;
  description?: string;
  open_issues_count?: number;
}

interface IssuesTabProps {
  api: { callTool: <T = unknown>(toolName: string, params: Record<string, unknown>) => Promise<T> };
  showErrorModal: (title: string, message: string) => void;
  currentUserLogin: string;
  embeddedOwner?: string;
  embeddedRepo?: string;
  availableRepos?: RepoOption[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function IssueOpenIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

function IssueClosedIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
    </svg>
  );
}

export default function IssuesTab({
  api,
  showErrorModal,
  embeddedOwner,
  embeddedRepo,
  availableRepos,
}: IssuesTabProps) {
  const isEmbedded = !!(embeddedOwner && embeddedRepo);

  const [pickedOwner, setPickedOwner] = useState<string>(embeddedOwner ?? "");
  const [pickedRepo, setPickedRepo] = useState<string>(embeddedRepo ?? "");
  const [stateFilter, setStateFilter] = useState("open");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");

  // Detail view
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Create issue
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newLabels, setNewLabels] = useState("");
  const [newAssignees, setNewAssignees] = useState("");

  // Edit issue
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editState, setEditState] = useState("open");
  const [editLabels, setEditLabels] = useState("");
  const [editAssignees, setEditAssignees] = useState("");

  // Add comment
  const [commentBody, setCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  // Sync embedded repo when parent changes (e.g. switching repo in detail view)
  useEffect(() => {
    if (embeddedOwner && embeddedRepo) {
      setPickedOwner(embeddedOwner);
      setPickedRepo(embeddedRepo);
      setSelectedIssue(null);
    }
  }, [embeddedOwner, embeddedRepo]);

  const owner = pickedOwner;
  const repo = pickedRepo;

  const callTool = api.callTool;

  const loadIssues = useCallback(async () => {
    if (!owner.trim() || !repo.trim()) return;
    setLoading(true);
    try {
      const result = await callTool<any>("list_repository_issues", {
        owner: owner.trim(),
        repo: repo.trim(),
        state: stateFilter,
      });
      const list = result?.items ?? result?.issues ?? result ?? [];
      setIssues(Array.isArray(list) ? list : []);
      setLoaded(true);
    } catch (e: any) {
      showErrorModal("Failed to Load Issues", e?.message || "Unknown error");
      setIssues([]);
    } finally {
      setLoading(false);
    }
    // showErrorModal intentionally excluded — it changes identity every parent
    // render, but using its latest value is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callTool, owner, repo, stateFilter]);

  // Auto-load whenever owner/repo/state changes.
  // Depend on values, not the loadIssues function — its identity may change
  // when the parent re-renders, which would cause an infinite request loop.
  useEffect(() => {
    if (owner && repo) {
      loadIssues();
    } else {
      setIssues([]);
      setLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, stateFilter]);

  const loadIssueDetail = async (issueNumber: number) => {
    try {
      const result = await api.callTool<any>("get_issue_content", {
        owner: owner.trim(),
        repo: repo.trim(),
        issue_number: issueNumber,
      });
      setSelectedIssue(result);
      loadComments(issueNumber);
    } catch (e: any) {
      showErrorModal("Failed to Load Issue", e?.message || "Unknown error");
    }
  };

  const loadComments = async (issueNumber: number) => {
    setCommentsLoading(true);
    try {
      const result = await api.callTool<any>("get_issue_comments", {
        owner: owner.trim(),
        repo: repo.trim(),
        issue_number: issueNumber,
      });
      const list = result?.items ?? result?.comments ?? result ?? [];
      setComments(Array.isArray(list) ? list : []);
    } catch (e: any) {
      console.error("Failed to load comments:", e);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const createIssue = async () => {
    if (!newTitle.trim()) return;
    try {
      const params: Record<string, unknown> = {
        owner: owner.trim(),
        repo: repo.trim(),
        title: newTitle.trim(),
      };
      if (newBody.trim()) params.body = newBody.trim();
      if (newLabels.trim()) params.labels = newLabels.split(",").map((l) => l.trim()).filter(Boolean);
      if (newAssignees.trim()) params.assignees = newAssignees.split(",").map((a) => a.trim()).filter(Boolean);

      await api.callTool<any>("create_issue", params);
      setShowCreateModal(false);
      setNewTitle("");
      setNewBody("");
      setNewLabels("");
      setNewAssignees("");
      await loadIssues();
    } catch (e: any) {
      showErrorModal("Failed to Create Issue", e?.message || "Unknown error");
    }
  };

  const updateIssue = async () => {
    if (!selectedIssue) return;
    try {
      const params: Record<string, unknown> = {
        owner: owner.trim(),
        repo: repo.trim(),
        issue_number: selectedIssue.number,
      };
      if (editTitle.trim()) params.title = editTitle.trim();
      if (editBody.trim()) params.body = editBody.trim();
      if (editState) params.state = editState;
      if (editLabels.trim()) params.labels = editLabels.split(",").map((l) => l.trim()).filter(Boolean);
      if (editAssignees.trim()) params.assignees = editAssignees.split(",").map((a) => a.trim()).filter(Boolean);

      const result = await api.callTool<any>("update_issue", params);
      setSelectedIssue(result);
      setShowEditModal(false);
      await loadIssues();
    } catch (e: any) {
      showErrorModal("Failed to Update Issue", e?.message || "Unknown error");
    }
  };

  const addComment = async () => {
    if (!selectedIssue || !commentBody.trim()) return;
    setAddingComment(true);
    try {
      await api.callTool<any>("add_issue_comment", {
        owner: owner.trim(),
        repo: repo.trim(),
        issue_number: selectedIssue.number,
        body: commentBody.trim(),
      });
      setCommentBody("");
      await loadComments(selectedIssue.number);
    } catch (e: any) {
      showErrorModal("Failed to Add Comment", e?.message || "Unknown error");
    } finally {
      setAddingComment(false);
    }
  };

  const openEditModal = () => {
    if (!selectedIssue) return;
    setEditTitle(selectedIssue.title);
    setEditBody(selectedIssue.body || "");
    setEditState(selectedIssue.state);
    setEditLabels(selectedIssue.labels?.map((l) => l.name).join(", ") || "");
    setEditAssignees(selectedIssue.assignees?.map((a) => a.login).join(", ") || "");
    setShowEditModal(true);
  };

  const filteredRepos = useMemo(() => {
    if (!availableRepos) return [];
    const q = repoFilter.trim().toLowerCase();
    if (!q) return availableRepos;
    return availableRepos.filter((r) => {
      const fn = (r.full_name || `${r.owner}/${r.name}`).toLowerCase();
      return fn.includes(q);
    });
  }, [availableRepos, repoFilter]);

  // Repo picker (standalone mode, before user has chosen a repo)
  if (!isEmbedded && (!owner || !repo)) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4">
          <input
            type="text"
            placeholder="Filter repositories…"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
          />
        </div>
        <div className="flex-1 overflow-auto px-4 pb-3">
          {!availableRepos || availableRepos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">No repositories loaded yet.</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Open the Repos tab first to fetch your repositories.
              </p>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
              <p className="text-sm">No repositories match.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRepos.map((r) => {
                const fullName = r.full_name || `${r.owner}/${r.name}`;
                return (
                  <button
                    key={fullName}
                    onClick={() => {
                      setPickedOwner(r.owner);
                      setPickedRepo(r.name);
                    }}
                    className="w-full flex items-center justify-between gap-3 py-2.5 px-3 text-left hover:bg-[var(--bg-secondary)] rounded-lg transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-color)] truncate transition-colors">
                        {fullName}
                      </div>
                      {r.description && (
                        <div className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                          {r.description}
                        </div>
                      )}
                    </div>
                    {typeof r.open_issues_count === "number" && r.open_issues_count > 0 && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)]">
                        <IssueOpenIcon className="text-emerald-600" />
                        {r.open_issues_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-tertiary)]">
          Pick a repository to view its issues.
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedIssue) {
    const isOpen = selectedIssue.state === "open";
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <button
            onClick={() => setSelectedIssue(null)}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] font-medium mb-3 px-2 py-1 -ml-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span aria-hidden>←</span> Back to issues
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] break-words tracking-tight">
                {selectedIssue.title}{" "}
                <span className="text-[var(--text-tertiary)] font-normal">
                  #{selectedIssue.number}
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    isOpen
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                      : "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200"
                  }`}
                >
                  {isOpen ? <IssueOpenIcon /> : <IssueClosedIcon />}
                  {isOpen ? "Open" : "Closed"}
                </span>
                {selectedIssue.user && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    <span className="font-medium text-[var(--text-secondary)]">{selectedIssue.user.login}</span> opened
                    {selectedIssue.created_at && ` ${formatDate(selectedIssue.created_at)}`}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={openEditModal}
              className="px-3.5 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] transition-all duration-150 flex-shrink-0"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {selectedIssue.body && (
            <div className="p-4 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <pre className="whitespace-pre-wrap text-sm text-[var(--text-primary)] font-sans leading-relaxed">
                {selectedIssue.body}
              </pre>
            </div>
          )}

          {selectedIssue.labels && selectedIssue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIssue.labels.map((label) => (
                <span
                  key={label.name}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-color)]/8 text-[var(--accent-color)] ring-1 ring-inset ring-[var(--accent-color)]/15"
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-[var(--border-color)] pt-5">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] mb-3 uppercase tracking-wider">
              Comments {!commentsLoading && `· ${comments.length}`}
            </h3>

            {commentsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">No comments yet.</p>
            ) : (
              <div className="space-y-2.5">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-[11px] font-semibold">
                        {(comment.user?.login || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {comment.user?.login || "unknown"}
                      </span>
                      {comment.created_at && (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {formatDate(comment.created_at)}
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] font-sans leading-relaxed">
                      {comment.body}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment…"
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150"
              />
              <button
                onClick={addComment}
                disabled={addingComment || !commentBody.trim()}
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
              >
                {addingComment ? "Adding…" : "Comment"}
              </button>
            </div>
          </div>
        </div>

        {showEditModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full max-h-[85vh] overflow-auto shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Edit issue <span className="text-[var(--text-tertiary)] font-normal">#{selectedIssue.number}</span>
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
                />
                <textarea
                  placeholder="Body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150"
                />
                <select
                  value={editState}
                  onChange={(e) => setEditState(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 text-sm text-[var(--text-primary)] transition-all duration-150"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
                <input
                  type="text"
                  placeholder="Labels (comma-separated)"
                  value={editLabels}
                  onChange={(e) => setEditLabels(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
                />
                <input
                  type="text"
                  placeholder="Assignees (comma-separated)"
                  value={editAssignees}
                  onChange={(e) => setEditAssignees(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
                />
                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updateIssue}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  const openCount = issues.filter((i) => i.state === "open").length;
  const closedCount = issues.filter((i) => i.state === "closed").length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-[var(--border-color)] flex items-center gap-3 flex-wrap">
        {!isEmbedded && (
          <button
            onClick={() => {
              setPickedOwner("");
              setPickedRepo("");
              setSelectedIssue(null);
            }}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] font-medium px-2 py-1 -ml-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span aria-hidden>←</span> Change repo
          </button>
        )}
        <span className="text-sm text-[var(--text-secondary)] font-mono">
          {owner}/<span className="font-medium text-[var(--text-primary)]">{repo}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-[var(--bg-secondary)] rounded-full ring-1 ring-inset ring-[var(--border-color)]">
            {(["open", "closed", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStateFilter(s)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-all duration-150 ${
                  stateFilter === s
                    ? "bg-[var(--bg-primary)] text-[var(--accent-color)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-xs font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99]"
          >
            New issue
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && issues.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
          </div>
        ) : !loaded ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
            <IssueOpenIcon className="w-8 h-8 mb-2 text-[var(--text-tertiary)]" />
            <p className="text-sm">Loading issues…</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2">
              <IssueClosedIcon className="w-6 h-6 text-[var(--accent-color)]" />
            </div>
            <p className="text-base font-medium text-[var(--text-primary)]">No {stateFilter !== "all" ? stateFilter : ""} issues</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Try a different filter or create a new issue.
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {issues.map((issue) => {
              const isOpen = issue.state === "open";
              return (
                <li
                  key={issue.number}
                  onClick={() => loadIssueDetail(issue.number)}
                  className="px-5 py-3 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors mx-1 rounded-lg group"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex-shrink-0 ${
                        isOpen ? "text-emerald-600" : "text-purple-600"
                      }`}
                      title={isOpen ? "Open" : "Closed"}
                    >
                      {isOpen ? <IssueOpenIcon /> : <IssueClosedIcon />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-color)] transition-colors">
                          {issue.title}
                        </span>
                        {issue.labels && issue.labels.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            {issue.labels.map((label) => (
                              <span
                                key={label.name}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-color)]/8 text-[var(--accent-color)] ring-1 ring-inset ring-[var(--accent-color)]/15"
                              >
                                {label.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">
                        #{issue.number}
                        {issue.user && ` opened by ${issue.user.login}`}
                        {issue.created_at && ` · ${formatDate(issue.created_at)}`}
                      </div>
                    </div>
                    {typeof issue.comments === "number" && issue.comments > 0 && (
                      <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 flex-shrink-0">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
                          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z" />
                        </svg>
                        {issue.comments}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-tertiary)] flex items-center gap-4">
        {loading ? "Loading…" : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <IssueOpenIcon className="text-emerald-600" />
              {openCount} open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IssueClosedIcon className="text-purple-600" />
              {closedCount} closed
            </span>
            <span className="ml-auto uppercase tracking-wider">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span>
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full max-h-[85vh] overflow-auto shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
              New issue
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
              />
              <textarea
                placeholder="Description (optional)"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150"
              />
              <input
                type="text"
                placeholder="Labels (comma-separated, optional)"
                value={newLabels}
                onChange={(e) => setNewLabels(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
              />
              <input
                type="text"
                placeholder="Assignees (comma-separated, optional)"
                value={newAssignees}
                onChange={(e) => setNewAssignees(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150"
              />
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewTitle("");
                    setNewBody("");
                    setNewLabels("");
                    setNewAssignees("");
                  }}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={createIssue}
                  disabled={!newTitle.trim()}
                  className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                >
                  Create Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
