import { useCallback, useEffect, useMemo, useState } from "react";

interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean;
  head?: { ref: string; sha?: string; label?: string };
  base?: { ref: string; sha?: string; label?: string };
  user?: { login: string; id?: number };
  labels?: Array<{ name: string; color?: string }>;
  assignees?: Array<{ login: string }>;
  created_at?: string;
  updated_at?: string;
  merged_at?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes?: number;
  patch?: string;
}

interface PRReview {
  id: number;
  user?: { login: string };
  state: string;
  body?: string;
  submitted_at?: string;
}

interface PRReviewComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  side?: string;
  user?: { login: string };
  created_at?: string;
}

interface PRStatus {
  state?: string;
  total_count?: number;
  statuses?: Array<{ state: string; context?: string; description?: string }>;
}

interface RepoOption {
  owner: string;
  name: string;
  full_name?: string;
  description?: string;
}

interface PullRequestsTabProps {
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

function PROpenIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function PRMergedIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M5 3.254V3.25v.005a.75.75 0 1 1 0-.005v.004Zm.45 1.9a2.25 2.25 0 1 0-1.95.218v5.256a2.25 2.25 0 1 0 1.5 0V7.123A5.735 5.735 0 0 0 9.25 9h1.378a2.251 2.251 0 1 0 0-1.5H9.25a4.25 4.25 0 0 1-3.8-2.346ZM12.75 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-8.5 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
    </svg>
  );
}

function PRClosedIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 0-1.5 0v4.628a2.251 2.251 0 1 0 1.5 0V6.5ZM2.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.78-8.78a.75.75 0 0 1 1.06 0l1.22 1.22 1.22-1.22a.75.75 0 1 1 1.06 1.06L13.06 5.5l1.22 1.22a.75.75 0 1 1-1.06 1.06l-1.22-1.22-1.22 1.22a.75.75 0 1 1-1.06-1.06l1.22-1.22-1.22-1.22a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function PRDraftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0-3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
    </svg>
  );
}

export default function PullRequestsTab({
  api,
  showErrorModal,
  embeddedOwner,
  embeddedRepo,
  availableRepos,
}: PullRequestsTabProps) {
  const isEmbedded = !!(embeddedOwner && embeddedRepo);

  const [pickedOwner, setPickedOwner] = useState<string>(embeddedOwner ?? "");
  const [pickedRepo, setPickedRepo] = useState<string>(embeddedRepo ?? "");
  const [stateFilter, setStateFilter] = useState("open");
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");

  // Detail view
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [detailTab, setDetailTab] = useState<"conversation" | "files" | "reviews" | "status">("conversation");
  const [prFiles, setPrFiles] = useState<PRFile[]>([]);
  const [prReviews, setPrReviews] = useState<PRReview[]>([]);
  const [prReviewComments, setPrReviewComments] = useState<PRReviewComment[]>([]);
  const [prStatus, setPrStatus] = useState<PRStatus | null>(null);
  const [prStatusError, setPrStatusError] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Create PR
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newHead, setNewHead] = useState("");
  const [newBase, setNewBase] = useState("main");
  const [newDraft, setNewDraft] = useState(false);

  // Update PR
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editState, setEditState] = useState("open");

  // Merge
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeMethod, setMergeMethod] = useState("merge");
  const [mergeTitle, setMergeTitle] = useState("");
  const [mergeMessage, setMergeMessage] = useState("");

  // Review
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewEvent, setReviewEvent] = useState("APPROVE");
  const [reviewBody, setReviewBody] = useState("");

  // Review comment
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentPath, setCommentPath] = useState("");
  const [commentLine, setCommentLine] = useState("");

  useEffect(() => {
    if (embeddedOwner && embeddedRepo) {
      setPickedOwner(embeddedOwner);
      setPickedRepo(embeddedRepo);
      setSelectedPR(null);
    }
  }, [embeddedOwner, embeddedRepo]);

  const owner = pickedOwner;
  const repo = pickedRepo;

  const callTool = api.callTool;

  const loadPRs = useCallback(async () => {
    if (!owner.trim() || !repo.trim()) return;
    setLoading(true);
    try {
      const result = await callTool<any>("list_repository_pull_requests", {
        owner: owner.trim(),
        repo: repo.trim(),
        state: stateFilter,
      });
      const list = result?.items ?? result?.pull_requests ?? result ?? [];
      setPrs(Array.isArray(list) ? list : []);
      setLoaded(true);
    } catch (e: any) {
      showErrorModal("Failed to Load Pull Requests", e?.message || "Unknown error");
      setPrs([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callTool, owner, repo, stateFilter]);

  // Auto-load on owner/repo/state changes. Depend on values, not the function
  // reference — loadPRs identity may change every parent render, which would
  // cause an infinite request loop.
  useEffect(() => {
    if (owner && repo) {
      loadPRs();
    } else {
      setPrs([]);
      setLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, stateFilter]);

  const loadPRDetail = async (prNumber: number) => {
    try {
      const result = await api.callTool<any>("get_pull_request_details", {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: prNumber,
      });
      setSelectedPR(result);
      setDetailTab("conversation");
    } catch (e: any) {
      showErrorModal("Failed to Load PR", e?.message || "Unknown error");
    }
  };

  const loadPRFiles = async (prNumber: number) => {
    setFilesLoading(true);
    try {
      const result = await api.callTool<any>("get_pull_request_files", {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: prNumber,
      });
      const files = result?.files ?? result?.items ?? result ?? [];
      setPrFiles(Array.isArray(files) ? files : []);
    } catch (e: any) {
      console.error("Failed to load PR files:", e);
      setPrFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const loadPRReviews = async (prNumber: number) => {
    setReviewsLoading(true);
    try {
      const [reviewsResult, commentsResult] = await Promise.all([
        api.callTool<any>("get_pull_request_reviews", {
          owner: owner.trim(),
          repo: repo.trim(),
          pull_number: prNumber,
        }),
        api.callTool<any>("get_pull_request_review_comments", {
          owner: owner.trim(),
          repo: repo.trim(),
          pull_number: prNumber,
        }),
      ]);
      const reviews = reviewsResult?.items ?? reviewsResult?.reviews ?? reviewsResult ?? [];
      setPrReviews(Array.isArray(reviews) ? reviews : []);
      const comments = commentsResult?.items ?? commentsResult?.comments ?? commentsResult ?? [];
      setPrReviewComments(Array.isArray(comments) ? comments : []);
    } catch (e: any) {
      console.error("Failed to load PR reviews:", e);
      setPrReviews([]);
      setPrReviewComments([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const loadPRStatus = async (prNumber: number) => {
    setPrStatusError(null);
    try {
      const result = await api.callTool<any>("get_pull_request_status", {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: prNumber,
      });
      setPrStatus(result);
    } catch (e: any) {
      console.error("Failed to load PR status:", e);
      setPrStatus(null);
      const msg = e?.message || "Failed to load status";
      if (msg.includes("NotFound") || msg.includes("not found") || msg.includes("404")) {
        setPrStatusError("__no_status__");
      } else {
        setPrStatusError(msg);
      }
    }
  };

  const createPR = async () => {
    if (!newTitle.trim() || !newHead.trim()) return;
    try {
      await api.callTool<any>("create_pull_request", {
        owner: owner.trim(),
        repo: repo.trim(),
        title: newTitle.trim(),
        head: newHead.trim(),
        base: newBase.trim(),
        body: newBody.trim() || undefined,
        draft: newDraft,
      });
      setShowCreateModal(false);
      setNewTitle("");
      setNewBody("");
      setNewHead("");
      setNewBase("main");
      setNewDraft(false);
      await loadPRs();
    } catch (e: any) {
      showErrorModal("Failed to Create PR", e?.message || "Unknown error");
    }
  };

  const updatePR = async () => {
    if (!selectedPR) return;
    try {
      const params: Record<string, unknown> = {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: selectedPR.number,
      };
      if (editTitle.trim()) params.title = editTitle.trim();
      if (editBody.trim()) params.body = editBody.trim();
      if (editState) params.state = editState;

      const result = await api.callTool<any>("update_pull_request", params);
      setSelectedPR(result);
      setShowEditModal(false);
      await loadPRs();
    } catch (e: any) {
      showErrorModal("Failed to Update PR", e?.message || "Unknown error");
    }
  };

  const mergePR = async () => {
    if (!selectedPR) return;
    try {
      const params: Record<string, unknown> = {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: selectedPR.number,
        merge_method: mergeMethod,
      };
      if (mergeTitle.trim()) params.commit_title = mergeTitle.trim();
      if (mergeMessage.trim()) params.commit_message = mergeMessage.trim();

      await api.callTool<any>("merge_pull_request", params);
      setShowMergeModal(false);
      await loadPRDetail(selectedPR.number);
      await loadPRs();
    } catch (e: any) {
      showErrorModal("Failed to Merge PR", e?.message || "Unknown error");
    }
  };

  const updateBranch = async () => {
    if (!selectedPR) return;
    try {
      await api.callTool<any>("update_pull_request_branch", {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: selectedPR.number,
      });
      await loadPRDetail(selectedPR.number);
    } catch (e: any) {
      showErrorModal("Failed to Update Branch", e?.message || "Unknown error");
    }
  };

  const createReview = async () => {
    if (!selectedPR) return;
    try {
      await api.callTool<any>("create_pull_request_review", {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: selectedPR.number,
        event: reviewEvent,
        body: reviewBody.trim() || undefined,
      });
      setShowReviewModal(false);
      setReviewBody("");
      await loadPRReviews(selectedPR.number);
    } catch (e: any) {
      showErrorModal("Failed to Create Review", e?.message || "Unknown error");
    }
  };

  const addReviewComment = async () => {
    if (!selectedPR || !commentBody.trim()) return;
    try {
      const params: Record<string, unknown> = {
        owner: owner.trim(),
        repo: repo.trim(),
        pull_number: selectedPR.number,
        body: commentBody.trim(),
      };
      if (commentPath.trim()) params.path = commentPath.trim();
      if (commentLine.trim()) params.line = parseInt(commentLine, 10);

      await api.callTool<any>("add_pull_request_review_comment", params);
      setShowCommentModal(false);
      setCommentBody("");
      setCommentPath("");
      setCommentLine("");
      await loadPRReviews(selectedPR.number);
    } catch (e: any) {
      showErrorModal("Failed to Add Review Comment", e?.message || "Unknown error");
    }
  };

  const openEditModal = () => {
    if (!selectedPR) return;
    setEditTitle(selectedPR.title);
    setEditBody(selectedPR.body || "");
    setEditState(selectedPR.state);
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

  // Repo picker (standalone mode)
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
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-tertiary)]">
          Pick a repository to view its pull requests.
        </div>
      </div>
    );
  }

  // PR detail view
  if (selectedPR) {
    const isMerged = !!selectedPR.merged;
    const isOpen = !isMerged && selectedPR.state === "open";
    const StateIcon = isMerged ? PRMergedIcon : isOpen && selectedPR.draft ? PRDraftIcon : isOpen ? PROpenIcon : PRClosedIcon;
    const stateLabel = isMerged ? "Merged" : selectedPR.draft ? "Draft" : isOpen ? "Open" : "Closed";
    const stateClass = isMerged
      ? "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200"
      : selectedPR.draft
        ? "bg-[var(--bg-secondary)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-color)]"
        : isOpen
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200";

    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <button
            onClick={() => { setSelectedPR(null); setPrFiles([]); setPrReviews([]); setPrReviewComments([]); setPrStatus(null); setPrStatusError(null); }}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] font-medium mb-3 px-2 py-1 -ml-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span aria-hidden>←</span> Back to pull requests
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] break-words tracking-tight">
                {selectedPR.title}{" "}
                <span className="text-[var(--text-tertiary)] font-normal">
                  #{selectedPR.number}
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${stateClass}`}>
                  <StateIcon />
                  {stateLabel}
                </span>
                {selectedPR.head && selectedPR.base && (
                  <span className="text-xs text-[var(--text-tertiary)] inline-flex items-center gap-1.5">
                    <code className="px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[11px] ring-1 ring-inset ring-[var(--border-color)]">
                      {selectedPR.head.ref || selectedPR.head.label}
                    </code>
                    <span className="text-[var(--text-tertiary)]">→</span>
                    <code className="px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[11px] ring-1 ring-inset ring-[var(--border-color)]">
                      {selectedPR.base.ref || selectedPR.base.label}
                    </code>
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={openEditModal}
                className="px-3.5 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] transition-all duration-150"
              >
                Edit
              </button>
              {selectedPR.state === "open" && !selectedPR.merged && (
                <>
                  <button
                    onClick={updateBranch}
                    className="px-3.5 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] transition-all duration-150"
                  >
                    Update Branch
                  </button>
                  <button
                    onClick={() => setShowMergeModal(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99]"
                  >
                    Merge
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-0.5 mt-4 -mb-4">
            {(["conversation", "files", "reviews", "status"] as const).map((tab) => (
              <button
                key={tab}
                className={`relative px-3.5 py-2.5 text-sm font-medium transition-all duration-150 rounded-t-lg ${
                  detailTab === tab
                    ? "text-[var(--accent-color)] after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:bg-[var(--accent-color)] after:rounded-full"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                }`}
                onClick={() => {
                  setDetailTab(tab);
                  if (tab === "files") loadPRFiles(selectedPR.number);
                  if (tab === "reviews") loadPRReviews(selectedPR.number);
                  if (tab === "status") loadPRStatus(selectedPR.number);
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-5">
          {detailTab === "conversation" && (
            <div className="space-y-4">
              {selectedPR.body && (
                <div className="p-4 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="text-xs text-[var(--text-tertiary)] mb-2">
                    <span className="font-medium text-[var(--text-secondary)]">{selectedPR.user?.login}</span> opened {selectedPR.created_at && formatDate(selectedPR.created_at)}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-[var(--text-primary)] font-sans leading-relaxed">
                    {selectedPR.body}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2.5 text-sm">
                {typeof selectedPR.commits === "number" && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Commits</div>
                    <div className="text-2xl font-semibold text-[var(--text-primary)] mt-1 tracking-tight">{selectedPR.commits}</div>
                  </div>
                )}
                {typeof selectedPR.changed_files === "number" && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Files</div>
                    <div className="text-2xl font-semibold text-[var(--text-primary)] mt-1 tracking-tight">{selectedPR.changed_files}</div>
                  </div>
                )}
                {typeof selectedPR.additions === "number" && (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)]">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Lines</div>
                    <div className="text-sm font-mono font-semibold mt-1.5">
                      <span className="text-emerald-600">+{selectedPR.additions}</span>{" "}
                      <span className="text-rose-600">−{selectedPR.deletions ?? 0}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="px-3.5 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99]"
                >
                  Add Review
                </button>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="px-3.5 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] transition-all duration-150"
                >
                  Add Review Comment
                </button>
              </div>
            </div>
          )}

          {detailTab === "files" && (
            filesLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : prFiles.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-10">No files changed.</p>
            ) : (
              <div className="space-y-2.5">
                {prFiles.map((file) => (
                  <div
                    key={file.filename}
                    className="rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)]/60 bg-[var(--bg-secondary)]/50">
                      <span className="text-xs font-mono text-[var(--text-primary)] truncate">
                        {file.filename}
                      </span>
                      <div className="flex items-center gap-2 text-xs flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium ${
                          file.status === "added" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : file.status === "removed" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                          : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                        }`}>
                          {file.status}
                        </span>
                        <span className="text-emerald-600 font-mono font-semibold">+{file.additions}</span>
                        <span className="text-rose-600 font-mono font-semibold">−{file.deletions}</span>
                      </div>
                    </div>
                    {file.patch && (
                      <pre className="text-xs font-mono bg-[var(--bg-secondary)]/40 p-4 overflow-x-auto text-[var(--text-secondary)] leading-relaxed">
                        {file.patch}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {detailTab === "reviews" && (
            reviewsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-5">
                {prReviews.length === 0 && prReviewComments.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-10">No reviews yet.</p>
                ) : (
                  <>
                    {prReviews.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-tertiary)] mb-2.5 uppercase tracking-wider">Reviews</h3>
                        <div className="space-y-2">
                          {prReviews.map((review) => (
                            <div
                              key={review.id}
                              className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="w-6 h-6 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-[11px] font-semibold">
                                  {(review.user?.login || "?").charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-[var(--text-primary)]">
                                  {review.user?.login || "unknown"}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium ${
                                  review.state === "APPROVED" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                                  : review.state === "CHANGES_REQUESTED" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-color)]"
                                }`}>
                                  {review.state}
                                </span>
                                {review.submitted_at && (
                                  <span className="text-xs text-[var(--text-tertiary)]">
                                    {formatDate(review.submitted_at)}
                                  </span>
                                )}
                              </div>
                              {review.body && (
                                <pre className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)] font-sans leading-relaxed">
                                  {review.body}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {prReviewComments.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-tertiary)] mb-2.5 uppercase tracking-wider">Review Comments</h3>
                        <div className="space-y-2">
                          {prReviewComments.map((comment) => (
                            <div
                              key={comment.id}
                              className="p-3.5 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                            >
                              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] flex-wrap">
                                <span className="font-medium text-[var(--text-primary)] text-sm">
                                  {comment.user?.login || "unknown"}
                                </span>
                                {comment.path && <span className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">{comment.path}{comment.line ? `:${comment.line}` : ""}</span>}
                                {comment.created_at && <span>{formatDate(comment.created_at)}</span>}
                              </div>
                              <pre className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)] font-sans leading-relaxed">
                                {comment.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          )}

          {detailTab === "status" && (
            prStatus ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Status</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      prStatus.state === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                      : prStatus.state === "failure" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                    }`}>
                      {prStatus.state || "unknown"}
                    </span>
                    {typeof prStatus.total_count === "number" && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {prStatus.total_count} check{prStatus.total_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {prStatus.statuses && prStatus.statuses.length > 0 && (
                  <div className="space-y-1.5">
                    {prStatus.statuses.map((s, i) => (
                      <div
                        key={i}
                        className="px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] text-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${
                            s.state === "success" ? "bg-emerald-500" : s.state === "failure" ? "bg-rose-500" : "bg-amber-500"
                          }`} />
                          <span className="font-medium text-[var(--text-primary)]">{s.context || "Check"}</span>
                        </div>
                        {s.description && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-1 ml-4">{s.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : prStatusError === "__no_status__" ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)]">
                <p className="text-sm">No status checks configured for this pull request.</p>
              </div>
            ) : prStatusError ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)] gap-2">
                <p className="text-sm text-[var(--danger-color)]">{prStatusError}</p>
                <button
                  className="text-xs text-[var(--accent-color)] hover:underline font-medium"
                  onClick={() => selectedPR && loadPRStatus(selectedPR.number)}
                >
                  Retry
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-10">Loading status…</p>
            )
          )}
        </div>

        {showEditModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Edit PR <span className="text-[var(--text-tertiary)] font-normal">#{selectedPR.number}</span>
              </h2>
              <div className="space-y-3">
                <input type="text" placeholder="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                <textarea placeholder="Body" value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                <select value={editState} onChange={(e) => setEditState(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 text-sm text-[var(--text-primary)] transition-all duration-150">
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                  <button onClick={updatePR}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]">Save</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMergeModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Merge PR <span className="text-[var(--text-tertiary)] font-normal">#{selectedPR.number}</span>
              </h2>
              <div className="space-y-3">
                <select value={mergeMethod} onChange={(e) => setMergeMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 text-sm text-[var(--text-primary)] transition-all duration-150">
                  <option value="merge">Merge commit</option>
                  <option value="squash">Squash and merge</option>
                  <option value="rebase">Rebase and merge</option>
                </select>
                <input type="text" placeholder="Commit title (optional)" value={mergeTitle} onChange={(e) => setMergeTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                <textarea placeholder="Commit message (optional)" value={mergeMessage} onChange={(e) => setMergeMessage(e.target.value)} rows={3}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => setShowMergeModal(false)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                  <button onClick={mergePR}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]">Merge</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showReviewModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Submit review
              </h2>
              <div className="space-y-3">
                <select value={reviewEvent} onChange={(e) => setReviewEvent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 text-sm text-[var(--text-primary)] transition-all duration-150">
                  <option value="APPROVE">Approve</option>
                  <option value="REQUEST_CHANGES">Request Changes</option>
                  <option value="COMMENT">Comment</option>
                </select>
                <textarea placeholder="Review body (optional)" value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} rows={4}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => setShowReviewModal(false)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                  <button onClick={createReview}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]">Submit</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCommentModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Add review comment
              </h2>
              <div className="space-y-3">
                <textarea placeholder="Comment body" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} rows={4}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                <input type="text" placeholder="File path (optional)" value={commentPath} onChange={(e) => setCommentPath(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150" />
                <input type="text" placeholder="Line number (optional)" value={commentLine} onChange={(e) => setCommentLine(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => setShowCommentModal(false)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                  <button onClick={addReviewComment} disabled={!commentBody.trim()}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">Add Comment</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-[var(--border-color)] flex items-center gap-3 flex-wrap">
        {!isEmbedded && (
          <button
            onClick={() => {
              setPickedOwner("");
              setPickedRepo("");
              setSelectedPR(null);
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
            New PR
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && prs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
          </div>
        ) : !loaded ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
            <PROpenIcon className="w-8 h-8 mb-2 text-[var(--text-tertiary)]" />
            <p className="text-sm">Loading pull requests…</p>
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2">
              <PRMergedIcon className="w-6 h-6 text-[var(--accent-color)]" />
            </div>
            <p className="text-base font-medium text-[var(--text-primary)]">No {stateFilter !== "all" ? stateFilter : ""} pull requests</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Try a different filter or create a new PR.
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {prs.map((pr) => {
              const isMerged = !!pr.merged;
              const isOpen = !isMerged && pr.state === "open";
              const Icon = isMerged ? PRMergedIcon : pr.draft ? PRDraftIcon : isOpen ? PROpenIcon : PRClosedIcon;
              const iconColor = isMerged
                ? "text-purple-600"
                : pr.draft
                  ? "text-[var(--text-tertiary)]"
                  : isOpen
                    ? "text-emerald-600"
                    : "text-rose-600";
              return (
                <li
                  key={pr.number}
                  onClick={() => loadPRDetail(pr.number)}
                  className="px-5 py-3 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors mx-1 rounded-lg group"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                      <Icon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-color)] transition-colors">
                        {pr.title}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">
                        #{pr.number}
                        {pr.user && ` by ${pr.user.login}`}
                        {pr.created_at && ` · ${formatDate(pr.created_at)}`}
                        {pr.draft && " · Draft"}
                      </div>
                      {pr.head && pr.base && (
                        <div className="text-xs text-[var(--text-tertiary)] mt-1.5 inline-flex items-center gap-1.5">
                          <code className="px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[11px] ring-1 ring-inset ring-[var(--border-color)]">
                            {pr.head.ref || pr.head.label}
                          </code>
                          <span className="text-[var(--text-tertiary)]/60">→</span>
                          <code className="px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[11px] ring-1 ring-inset ring-[var(--border-color)]">
                            {pr.base.ref || pr.base.label}
                          </code>
                        </div>
                      )}
                    </div>
                    {typeof pr.comments === "number" && pr.comments > 0 && (
                      <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 flex-shrink-0">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
                          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z" />
                        </svg>
                        {pr.comments}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
        {loading ? "Loading…" : loaded ? `${prs.length} ${prs.length === 1 ? "pull request" : "pull requests"}` : ""}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
              New pull request
            </h2>
            <div className="space-y-3">
              <input type="text" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
              <div className="flex gap-2 items-center">
                <input type="text" placeholder="Head branch" value={newHead} onChange={(e) => setNewHead(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150" />
                <span className="text-[var(--text-tertiary)]">→</span>
                <input type="text" placeholder="Base branch" value={newBase} onChange={(e) => setNewBase(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150" />
              </div>
              <textarea placeholder="Description (optional)" value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
              <label className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                <input type="checkbox" checked={newDraft} onChange={(e) => setNewDraft(e.target.checked)} className="rounded accent-[var(--accent-color)] w-4 h-4" />
                <span>Draft</span>
              </label>
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => { setShowCreateModal(false); setNewTitle(""); setNewBody(""); setNewHead(""); setNewBase("main"); setNewDraft(false); }}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                <button onClick={createPR} disabled={!newTitle.trim() || !newHead.trim()}
                  className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">Create PR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
