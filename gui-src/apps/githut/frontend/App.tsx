import { useCallback, useEffect, useRef, useState } from "react";
import { useBackendAPI } from "@shared/hooks/useBackendAPI";
import IssuesTab from "./IssuesTab";
import PullRequestsTab from "./PullRequestsTab";
import UserTab from "./UserTab";

const APP_NAME = "Githut";

interface Repository {
  id?: number;
  name: string;
  full_name?: string;
  description?: string;
  private?: boolean;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  updated_at?: string;
  default_branch?: string;
  topics?: string[];
  owner?: {
    login: string;
  };
}

interface FileContent {
  type: "file";
  encoding: string;
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
}

interface DirectoryItem {
  type: "file" | "dir";
  size?: number;
  name: string;
  path: string;
  sha: string;
}

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author?: {
    login: string;
  };
}

interface CommitDetail extends Commit {
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  parents?: Array<{ sha: string }>;
}

interface Branch {
  name: string;
  commit: {
    sha: string;
    url?: string;
  };
  protected?: boolean;
}

interface CodeSearchResult {
  name: string;
  path: string;
  sha: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    private?: boolean;
    description?: string | null;
    owner: {
      login: string;
      id: number;
    };
  };
  score?: number;
}

interface AppProps {
  onClose: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
}

type Tab = "repos" | "issues" | "prs" | "search" | "me";
type DetailTab = "overview" | "files" | "issues" | "pulls" | "commits" | "branches";
type ViewMode = "list" | "detail";
type SearchType = "code" | "users" | "issues";

// Helper function to decode base64 content
function decodeBase64Content(content: string): string {
  try {
    return atob(content);
  } catch (e) {
    console.error("Failed to decode base64 content:", e);
    return content;
  }
}

// Helper function to encode content to base64
function encodeToBase64(content: string): string {
  try {
    return btoa(content);
  } catch (e) {
    console.error("Failed to encode to base64:", e);
    return content;
  }
}

// Helper function to build breadcrumb items from path
function buildBreadcrumbs(
  path: string,
): Array<{ label: string; path: string }> {
  if (path === "/" || path === "") {
    return [{ label: "/", path: "/" }];
  }

  const parts = path.split("/").filter((p) => p.length > 0);
  const breadcrumbs: Array<{ label: string; path: string }> = [
    { label: "/", path: "/" },
  ];

  let currentPath = "";
  for (const part of parts) {
    currentPath += part;
    breadcrumbs.push({ label: part, path: currentPath });
    currentPath += "/";
  }

  return breadcrumbs;
}

// Helper function to format dates in human-readable format
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

// Helper function to truncate SHA to short form
function truncateSha(sha: string): string {
  return sha.substring(0, 7);
}

export default function App({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI("githut");
  const [activeTab, setActiveTab] = useState<Tab>("repos");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadReposRef = useRef<() => void>(() => {});
  const [availableUsers, setAvailableUsers] = useState<{ login: string; id: number }[]>([]);
  const setRefreshHandlerRef = useRef(setRefreshHandler);

  // Detail view state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRepo, setSelectedRepo] = useState<{
    owner: string;
    name: string;
    data: Repository;
  } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  // File browser state
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [directoryContents, setDirectoryContents] = useState<DirectoryItem[]>(
    [],
  );
  const [filesLoading, setFilesLoading] = useState(false);
  const [viewingFile, setViewingFile] = useState<{
    path: string;
    content: string;
    name: string;
    sha: string;
  } | null>(null);

  // File editing state
  const [editingFile, setEditingFile] = useState<{
    path: string;
    name: string;
    content: string;
    sha: string;
    originalContent: string;
  } | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>("");

  // Commits state
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitDetails, setCommitDetails] = useState<CommitDetail | null>(null);

  // Branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchSource, setNewBranchSource] = useState("main");

  // Repository actions state
  const [showCreateRepoModal, setShowCreateRepoModal] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDescription, setNewRepoDescription] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoAutoInit, setNewRepoAutoInit] = useState(true);

  // Fork repository state
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkingRepo, setForkingRepo] = useState<Repository | null>(null);

  // Error modal state
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    title: string;
    message: string;
  } | null>(null);

  // User switcher state
  const [currentUser, setCurrentUser] = useState<{ login: string; id: number }>(
    {
      login: "",
      id: 0,
    },
  );
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Code search state
  const [searchType, setSearchType] = useState<SearchType>("code");
  const [codeQuery, setCodeQuery] = useState("");
  const [codeResults, setCodeResults] = useState<CodeSearchResult[]>([]);
  const [codeTotal, setCodeTotal] = useState(0);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // User search state
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<Array<{ login: string; id?: number; type?: string; score?: number }>>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userLoading, setUserLoading] = useState(false);

  // Issues/PRs search state
  const [issueQuery, setIssueQuery] = useState("");
  const [issueResults, setIssueResults] = useState<Array<{ number: number; title: string; state: string; body?: string; user?: { login: string }; created_at?: string; pull_request?: any; repository_url?: string; html_url?: string }>>([]);
  const [issueTotal, setIssueTotal] = useState(0);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Push files state
  const [showPushFilesModal, setShowPushFilesModal] = useState(false);
  const [pushBranch, setPushBranch] = useState("main");
  const [pushMessage, setPushMessage] = useState("");
  const [pushFiles, setPushFiles] = useState<Array<{ path: string; content: string }>>([{ path: "", content: "" }]);

  // Keep ref in sync with prop
  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler;
  }, [setRefreshHandler]);

  // Stable callback for admin refresh
  const refreshApp = useCallback(() => {
    loadReposRef.current();
  }, []);

  // Show error modal helper
  const showErrorModal = (title: string, message: string) => {
    setErrorModal({ show: true, title, message });
  };

  const errorModalNode = errorModal?.show ? (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_120ms_ease-out]">
      <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
        <h2 className="text-lg font-semibold text-[var(--danger-color)] mb-2 tracking-tight">
          {errorModal.title}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-6">
          {errorModal.message}
        </p>
        <button
          onClick={() => setErrorModal(null)}
          className="w-full px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]"
        >
          OK
        </button>
      </div>
    </div>
  ) : null;

  // Switch user function
  const switchUser = async (login: string, id: number) => {
    try {
      // Call backend state API to switch user
      const response = await fetch("./api/services/githut/state", {
        method: "GET",
      });
      const data = await response.json();

      // Update CurrentUser in state
      const state = data.state || data;
      state.CurrentUser = { login, id };

      // Send updated state back
      await fetch("./api/services/githut/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.state ? { state } : state),
      });

      // Update local state and reload repos
      setCurrentUser({ login, id });
      setShowUserDropdown(false);
      await loadRepos();
    } catch (e) {
      console.error("Failed to switch user:", e);
      showErrorModal(
        "Failed to Switch User",
        "Could not switch to the selected user. Please try again.",
      );
    }
  };

  const loadRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = (query || "").trim();
      // Use space to list all repos, or actual query to search
      const safeQuery = q.length > 0 ? q : " ";

      const result = await api.callTool<any>("search_repositories", {
        query: safeQuery,
      });

      const list =
        result?.search_results?.items ??
        result?.items ??
        result?.repositories ??
        result?.repos ??
        result?.data ??
        [];

      setRepos(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("search_repositories failed:", e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : JSON.stringify(e);
      setError(msg || "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  };

  const runCodeSearch = async () => {
    setCodeLoading(true);
    setCodeError(null);
    try {
      const result = await api.callTool<any>("search_repository_code", {
        query: codeQuery.trim(),
      });
      setCodeResults(result?.items ?? []);
      setCodeTotal(result?.total_count ?? 0);
    } catch (e) {
      console.error("search_repository_code failed:", e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : JSON.stringify(e);
      setCodeError(msg || "Failed to search code");
      setCodeResults([]);
      setCodeTotal(0);
    } finally {
      setCodeLoading(false);
    }
  };

  const runUserSearch = async () => {
    if (!userQuery.trim()) return;
    setUserLoading(true);
    try {
      const result = await api.callTool<any>("search_users", {
        q: userQuery.trim(),
      });
      setUserResults(result?.items ?? result?.users ?? []);
      setUserTotal(result?.total_count ?? 0);
    } catch (e) {
      console.error("search_users failed:", e);
      setUserResults([]);
      setUserTotal(0);
    } finally {
      setUserLoading(false);
    }
  };

  const runIssueSearch = async () => {
    if (!issueQuery.trim()) return;
    setIssueLoading(true);
    setIssueError(null);
    try {
      const result = await api.callTool<any>("search_issues_and_pull_requests", {
        query: issueQuery.trim(),
      });
      const items = result?.search_results?.items ?? result?.items ?? [];
      setIssueResults(Array.isArray(items) ? items : []);
      setIssueTotal(result?.search_results?.total_count ?? result?.total_count ?? 0);
    } catch (e: any) {
      console.error("search_issues_and_pull_requests failed:", e);
      setIssueResults([]);
      setIssueTotal(0);
      setIssueError(e?.message || "Search failed. Please try a different query.");
    } finally {
      setIssueLoading(false);
    }
  };

  const pushRepositoryFiles = async () => {
    if (!selectedRepo || !pushMessage.trim() || pushFiles.some(f => !f.path.trim())) return;
    try {
      await api.callTool<any>("push_repository_files", {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        branch: pushBranch.trim(),
        files: pushFiles.map(f => ({ path: f.path.trim(), content: f.content })),
        message: pushMessage.trim(),
      });
      setShowPushFilesModal(false);
      setPushBranch("main");
      setPushMessage("");
      setPushFiles([{ path: "", content: "" }]);
    } catch (e: any) {
      showErrorModal("Failed to Push Files", e?.message || "Unknown error");
    }
  };

  useEffect(() => {
    loadReposRef.current = loadRepos;
  });

  useEffect(() => {
    // Fetch available users and current user from backend state
    const init = async () => {
      try {
        const response = await fetch("./api/services/githut/state", { method: "GET" });
        const data = await response.json();
        const state = data.state || data;
        const users = (state.Users || []).map((u: any) => ({ login: u.login, id: u.id }));
        setAvailableUsers(users);
        const cur = state.CurrentUser;
        if (cur?.login && typeof cur.id === "number") {
          setCurrentUser({ login: cur.login, id: cur.id });
        } else if (users.length > 0) {
          setCurrentUser(users[0]);
        }
        await loadRepos();
      } catch (e) {
        console.error("Failed to initialize Githut app:", e);
        await loadRepos();
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = setRefreshHandlerRef.current;
    if (handler) {
      handler(refreshApp);
    }
    return () => {
      setRefreshHandlerRef.current?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load directory contents when Files tab is active
  useEffect(() => {
    if (viewMode === "detail" && detailTab === "files" && selectedRepo) {
      loadDirectoryContents(selectedRepo.owner, selectedRepo.name, currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, detailTab, currentPath, selectedRepo]);

  // Load commits when Commits tab is active
  useEffect(() => {
    if (viewMode === "detail" && detailTab === "commits" && selectedRepo) {
      loadCommits(selectedRepo.owner, selectedRepo.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, detailTab, selectedRepo]);

  // Load branches when Branches tab is active
  useEffect(() => {
    if (viewMode === "detail" && detailTab === "branches" && selectedRepo) {
      loadBranches(selectedRepo.owner, selectedRepo.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, detailTab, selectedRepo]);

  // Handle repo selection and navigate to detail view
  const handleRepoClick = (repo: Repository) => {
    const fullName = repo.full_name || repo.name;
    const [owner, name] = fullName.includes("/")
      ? fullName.split("/")
      : ["", fullName];

    setSelectedRepo({ owner, name, data: repo });
    setViewMode("detail");
    setDetailTab("overview");
    setCurrentPath("/"); // Reset to root for file browser
  };

  // Load commits for the selected repository
  const loadCommits = async (owner: string, name: string) => {
    setCommitsLoading(true);
    try {
      const result = await api.callTool<any>("list_repository_commits", {
        owner,
        repo: name,
      });

      const commitsList =
        result?.items ?? result?.commits ?? result?.data ?? result ?? [];
      setCommits(Array.isArray(commitsList) ? commitsList : []);
    } catch (e) {
      console.error("Failed to load commits:", e);
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  };

  // Load detailed info for a specific commit
  const loadCommitDetails = async (
    owner: string,
    name: string,
    sha: string,
  ) => {
    try {
      const result = await api.callTool<CommitDetail>(
        "get_repository_commit_details",
        {
          owner,
          repo: name,
          sha,
        },
      );
      setCommitDetails(result);
    } catch (e) {
      console.error("Failed to load commit details:", e);
      setCommitDetails(null);
    }
  };

  // Handle commit click to toggle details view
  const handleCommitClick = (sha: string) => {
    if (selectedCommit === sha) {
      // Collapse if already expanded
      setSelectedCommit(null);
      setCommitDetails(null);
    } else {
      // Expand and load details
      setSelectedCommit(sha);
      if (selectedRepo) {
        loadCommitDetails(selectedRepo.owner, selectedRepo.name, sha);
      }
    }
  };

  // Load branches for the selected repository
  const loadBranches = async (owner: string, name: string) => {
    setBranchesLoading(true);
    try {
      const result = await api.callTool<any>("list_repository_branches", {
        owner,
        repo: name,
      });

      const branchesList =
        result?.items ?? result?.branches ?? result?.data ?? result ?? [];
      setBranches(Array.isArray(branchesList) ? branchesList : []);
    } catch (e) {
      console.error("Failed to load branches:", e);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  // Create a new branch
  const createBranch = async () => {
    if (!selectedRepo || !newBranchName.trim()) {
      return;
    }

    try {
      // Get the SHA of the source branch
      const sourceBranch = branches.find((b) => b.name === newBranchSource);
      if (!sourceBranch) {
        return;
      }

      await api.callTool<any>("create_repository_branch", {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        branch: newBranchName,
        sha: sourceBranch.commit.sha,
      });

      // Close modal and reset form
      setShowCreateBranchModal(false);
      setNewBranchName("");
      setNewBranchSource("main");

      // Reload branches
      await loadBranches(selectedRepo.owner, selectedRepo.name);
    } catch (e) {
      console.error("Failed to create branch:", e);
    }
  };

  // Create a new repository
  const createRepository = async () => {
    // Validate repository name
    if (!newRepoName.trim()) {
      showErrorModal(
        "Invalid Repository Name",
        "Please enter a repository name.",
      );
      return;
    }

    setLoading(true);
    try {
      await api.callTool<any>("create_repository", {
        name: newRepoName.trim(),
        description: newRepoDescription.trim(),
        private: newRepoPrivate,
        auto_init: newRepoAutoInit,
      });

      // Close modal and reset form
      setShowCreateRepoModal(false);
      setNewRepoName("");
      setNewRepoDescription("");
      setNewRepoPrivate(false);
      setNewRepoAutoInit(true);

      // Reload repositories to show the new one
      await loadRepos();
    } catch (e) {
      console.error("Failed to create repository:", e);
      const msg =
        e instanceof Error ? e.message : "Failed to create repository";
      showErrorModal("Failed to Create Repository", msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle fork button click
  const handleForkClick = (repo: Repository) => {
    setForkingRepo(repo);
    setShowForkModal(true);
  };

  // Fork a repository
  const forkRepository = async () => {
    if (!forkingRepo) return;

    const full = forkingRepo.full_name || forkingRepo.name;
    const [owner, name] = full.includes("/")
      ? full.split("/")
      : [forkingRepo.owner?.login || "", full];

    setLoading(true);
    try {
      await api.callTool<any>("fork_repository", {
        owner: owner,
        repo: name,
      });

      // Reload repositories to show the forked one
      await loadRepos();
    } catch (e) {
      console.error("Failed to fork repository:", e);
      const msg = e instanceof Error ? e.message : "Failed to fork repository";
      showErrorModal("Failed to Fork Repository", msg);
    } finally {
      // Always close modal and reset, even on error
      setShowForkModal(false);
      setForkingRepo(null);
      setLoading(false);
    }
  };

  // Load directory contents
  const loadDirectoryContents = async (
    owner: string,
    name: string,
    path: string,
  ) => {
    setFilesLoading(true);
    try {
      const result = await api.callTool<any>("get_repository_file_contents", {
        owner,
        repo: name,
        path,
        ref: "main",
      });

      // API may return plain array or {"items": [...]} for directories
      const items = Array.isArray(result) ? result : result?.items || [];
      setDirectoryContents(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error("Failed to load directory contents:", e);
      setDirectoryContents([]);
    } finally {
      setFilesLoading(false);
    }
  };

  // Load file content
  const loadFileContent = async (owner: string, name: string, path: string) => {
    setFilesLoading(true);
    try {
      const result = await api.callTool<any>("get_repository_file_contents", {
        owner,
        repo: name,
        path,
        ref: "main",
      });

      // API may return {"file": {...}} or file object directly
      const fileData = result?.file ?? (result?.type === "file" ? result : null);
      if (fileData) {
        const content =
          fileData.encoding === "base64"
            ? decodeBase64Content(fileData.content)
            : fileData.content;

        setViewingFile({
          path: fileData.path,
          name: fileData.name,
          content,
          sha: fileData.sha,
        });
      }
    } catch (e) {
      console.error("Failed to load file content:", e);
    } finally {
      setFilesLoading(false);
    }
  };

  // Handle clicking on a file or directory
  const handleItemClick = (item: DirectoryItem) => {
    if (item.type === "dir") {
      // Navigate into directory
      setCurrentPath(item.path);
      setViewingFile(null);
    } else {
      // Load and view file content
      if (selectedRepo) {
        loadFileContent(selectedRepo.owner, selectedRepo.name, item.path);
      }
    }
  };

  const handleCodeResultClick = (item: CodeSearchResult) => {
    const repo = item.repository;
    setSelectedRepo({
      owner: repo.owner.login,
      name: repo.name,
      data: repo,
    });
    setViewMode("detail");
    setDetailTab("files");
    const hasDirectory = item.path.includes("/");
    setCurrentPath(hasDirectory ? item.path.split("/").slice(0, -1).join("/") : "/");
    setViewingFile(null);
    loadFileContent(repo.owner.login, repo.name, item.path);
  };

  // Handle Edit button click
  const handleEditFile = () => {
    if (viewingFile) {
      setEditingFile({
        path: viewingFile.path,
        name: viewingFile.name,
        content: viewingFile.content,
        sha: viewingFile.sha,
        originalContent: viewingFile.content,
      });
      setCommitMessage("");
    }
  };

  // Handle Cancel button click in editor
  const handleCancelEdit = () => {
    setEditingFile(null);
    setCommitMessage("");
  };

  // Save file changes
  const saveFileChanges = async () => {
    if (!editingFile || !selectedRepo) return;

    // Validate commit message
    if (!commitMessage.trim()) {
      showErrorModal(
        "Invalid Commit Message",
        "Please enter a commit message.",
      );
      return;
    }

    setFilesLoading(true);
    try {
      // Encode content to base64
      const encodedContent = encodeToBase64(editingFile.content);

      // Call API to save file
      await api.callTool<any>("create_or_update_repository_file", {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        path: editingFile.path,
        message: commitMessage,
        content: encodedContent,
        branch: "main",
        sha: editingFile.sha,
      });

      // Reload file content to show updated version
      await loadFileContent(
        selectedRepo.owner,
        selectedRepo.name,
        editingFile.path,
      );

      // Clear editing state
      setEditingFile(null);
      setCommitMessage("");
    } catch (e) {
      console.error("Failed to save file:", e);
      const msg = e instanceof Error ? e.message : "Failed to save file";
      showErrorModal("Failed to Save File", msg);
    } finally {
      setFilesLoading(false);
    }
  };

  // Navigate back to list view
  const handleBackToRepos = () => {
    setViewMode("list");
    setSelectedRepo(null);
    setCurrentPath("/");
    setViewingFile(null);
  };

  // Render detail view
  if (viewMode === "detail" && selectedRepo) {
    return (
      <div
        style={{
          padding: 28,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          ["--bg-primary" as any]: "#FCFBF8",
          ["--bg-secondary" as any]: "#F5F2EC",
          ["--bg-tertiary" as any]: "#EDE8DF",
          ["--text-primary" as any]: "#162B2A",
          ["--text-secondary" as any]: "#4F6360",
          ["--text-tertiary" as any]: "#7A8E8B",
          ["--border-color" as any]: "#DCD5C6",
          ["--accent-color" as any]: "#0F766E",
          ["--accent-hover" as any]: "#115E59",
          ["--danger-color" as any]: "#B83A3A",
          ["--success-color" as any]: "#3F7A4F",
          backgroundColor: "#FCFBF8",
          fontFeatureSettings: "'cv11', 'ss01'",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <button
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] font-medium transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-[var(--bg-secondary)]"
            onClick={handleBackToRepos}
          >
            <span aria-hidden>←</span> Back
          </button>
          <span className="text-[var(--text-tertiary)]/60">·</span>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] truncate tracking-tight">
            <span className="text-[var(--text-tertiary)] font-normal">
              {selectedRepo.owner}
            </span>
            <span className="text-[var(--text-tertiary)] font-normal mx-0.5">/</span>
            <span>{selectedRepo.name}</span>
          </h1>
          {selectedRepo.data.private !== undefined && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--border-color)]">
              {selectedRepo.data.private ? "Private" : "Public"}
            </span>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="-mx-1 mb-5 overflow-x-auto">
          <div className="flex gap-0.5 px-1 border-b border-[var(--border-color)]">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "files", label: "Files" },
                { id: "issues", label: "Issues" },
                { id: "pulls", label: "Pull requests" },
                { id: "commits", label: "Commits" },
                { id: "branches", label: "Branches" },
              ] as Array<{ id: DetailTab; label: string }>
            ).map(({ id, label }) => (
              <button
                key={id}
                className={`relative px-3.5 py-2.5 text-sm font-medium transition-all duration-150 whitespace-nowrap rounded-t-lg ${
                  detailTab === id
                    ? "text-[var(--accent-color)] after:absolute after:left-2 after:right-2 after:bottom-[-1px] after:h-[2px] after:bg-[var(--accent-color)] after:rounded-full"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                }`}
                onClick={() => setDetailTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {detailTab === "overview" && (
            <div className="px-1">
              {/* Description */}
              {selectedRepo.data.description && (
                <p className="text-[var(--text-secondary)] mb-4 text-sm">
                  {selectedRepo.data.description}
                </p>
              )}

              {/* Repo Stats */}
              <div className="flex gap-5 mb-6 text-sm text-[var(--text-secondary)] flex-wrap">
                {selectedRepo.data.language && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)]" />
                    {selectedRepo.data.language}
                  </span>
                )}
                {selectedRepo.data.stargazers_count !== undefined && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
                      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                    </svg>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {selectedRepo.data.stargazers_count}
                    </span>
                    stars
                  </span>
                )}
                {selectedRepo.data.forks_count !== undefined && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
                      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                    </svg>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {selectedRepo.data.forks_count}
                    </span>
                    forks
                  </span>
                )}
                {typeof selectedRepo.data.open_issues_count === "number" && (
                  <span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {selectedRepo.data.open_issues_count}
                    </span>{" "}
                    open issues
                  </span>
                )}
              </div>

              {/* Topics */}
              {selectedRepo.data.topics &&
                selectedRepo.data.topics.length > 0 && (
                  <div className="flex gap-1.5 mb-6 flex-wrap">
                    {selectedRepo.data.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-2.5 py-1 text-xs font-medium bg-[var(--accent-color)]/10 text-[var(--accent-color)] rounded-full ring-1 ring-inset ring-[var(--accent-color)]/15"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

              {/* Push Files Button */}
              <button
                onClick={() => setShowPushFilesModal(true)}
                className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-sm font-medium text-[var(--text-primary)] transition-all duration-150 ring-1 ring-inset ring-[var(--border-color)] hover:ring-[var(--accent-color)]/30"
              >
                Push Files
              </button>
            </div>
          )}

          {detailTab === "files" && (
            <div>
              {viewingFile && !editingFile ? (
                /* File Viewer */
                <div>
                  {/* File header with back button and edit button */}
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all duration-150 text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)]"
                        onClick={() => setViewingFile(null)}
                      >
                        ← Back to Files
                      </button>
                      <span className="text-[var(--text-primary)] font-medium font-mono text-sm truncate">
                        {viewingFile.name}
                      </span>
                    </div>
                    <button
                      className="px-3.5 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.98]"
                      onClick={handleEditFile}
                    >
                      Edit
                    </button>
                  </div>

                  {/* File content */}
                  <div className="rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border-color)] overflow-auto shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <pre className="whitespace-pre-wrap text-sm text-[var(--text-primary)] font-mono p-5 leading-relaxed">
                      {viewingFile.content}
                    </pre>
                  </div>
                </div>
              ) : editingFile ? (
                /* File Editor */
                <div>
                  {/* Editor header with cancel and save buttons */}
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <button
                      className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all duration-150 text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)]"
                      onClick={handleCancelEdit}
                    >
                      ← Cancel
                    </button>
                    <span className="text-[var(--text-primary)] font-medium text-sm">
                      Editing <span className="font-mono text-[var(--text-secondary)]">{editingFile.name}</span>
                    </span>
                    <button
                      className="px-3.5 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                      onClick={saveFileChanges}
                      disabled={filesLoading}
                    >
                      {filesLoading ? "Saving…" : "Save Changes"}
                    </button>
                  </div>

                  {/* Commit message input */}
                  <div className="mb-3">
                    <input
                      type="text"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-primary)] ring-1 ring-inset ring-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 transition-all duration-150"
                      placeholder="Commit message"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                    />
                  </div>

                  {/* File content editor */}
                  <div className="rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border-color)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--accent-color)]/40 transition-all duration-150">
                    <textarea
                      className="w-full h-[420px] p-5 bg-transparent text-[var(--text-primary)] font-mono text-sm resize-none focus:outline-none leading-relaxed"
                      value={editingFile.content}
                      onChange={(e) =>
                        setEditingFile({
                          ...editingFile,
                          content: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                /* Directory Listing */
                <div>
                  {/* Breadcrumb navigation */}
                  <div className="flex items-center gap-1.5 mb-4 text-sm flex-wrap">
                    <span className="text-[var(--text-tertiary)] text-xs uppercase tracking-wider mr-1">Path</span>
                    {buildBreadcrumbs(currentPath).map((crumb, index, arr) => (
                      <div key={crumb.path} className="flex items-center gap-1.5">
                        <button
                          className="text-[var(--accent-color)] hover:underline font-medium px-1.5 py-0.5 rounded hover:bg-[var(--accent-color)]/5 transition-colors"
                          onClick={() => setCurrentPath(crumb.path)}
                        >
                          {crumb.label}
                        </button>
                        {index < arr.length - 1 && (
                          <span className="text-[var(--text-tertiary)]/60 text-xs">
                            ›
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {filesLoading ? (
                    <div className="flex items-center justify-center p-10">
                      <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      {currentPath !== "/" && currentPath !== "" && (
                        <div
                          className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer text-sm"
                          onClick={() => {
                            const parent = currentPath.includes("/")
                              ? currentPath.split("/").slice(0, -1).join("/")
                              : "";
                            setCurrentPath(parent === "" ? "/" : parent);
                          }}
                        >
                          <span className="text-base flex-shrink-0 opacity-80">↩</span>
                          <span className="text-[var(--text-secondary)] group-hover:text-[var(--accent-color)] font-mono transition-colors">
                            ..
                          </span>
                          <span className="ml-auto text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Parent</span>
                        </div>
                      )}
                      {directoryContents.map((item, idx) => {
                        const showBorder = idx > 0 || (currentPath !== "/" && currentPath !== "");
                        return (
                          <div
                            key={item.path}
                            className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer text-sm ${
                              showBorder ? "border-t border-[var(--border-color)]/60" : ""
                            }`}
                            onClick={() => handleItemClick(item)}
                          >
                            <span className="text-base flex-shrink-0 opacity-80">
                              {item.type === "dir" ? "📁" : "📄"}
                            </span>
                            <span className="text-[var(--text-primary)] group-hover:text-[var(--accent-color)] truncate transition-colors">
                              {item.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {detailTab === "issues" && (
            <div className="flex flex-col h-full">
              <IssuesTab
                api={api}
                showErrorModal={showErrorModal}
                currentUserLogin={currentUser.login}
                embeddedOwner={selectedRepo.owner}
                embeddedRepo={selectedRepo.name}
              />
            </div>
          )}

          {detailTab === "pulls" && (
            <div className="flex flex-col h-full">
              <PullRequestsTab
                api={api}
                showErrorModal={showErrorModal}
                currentUserLogin={currentUser.login}
                embeddedOwner={selectedRepo.owner}
                embeddedRepo={selectedRepo.name}
              />
            </div>
          )}

          {detailTab === "commits" && (
            <div>
              {commitsLoading ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  Loading commits…
                </div>
              ) : commits.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  No commits found
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  {commits.map((commit, idx) => (
                    <div
                      key={commit.sha}
                      className={`commit-item px-5 py-3.5 transition-colors hover:bg-[var(--bg-secondary)]/60 ${
                        idx > 0 ? "border-t border-[var(--border-color)]/60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="commit-message font-medium text-[var(--text-primary)] truncate text-sm">
                            {commit.commit.message.split("\n")[0]}
                          </div>
                          <div className="commit-author text-xs text-[var(--text-secondary)] mt-1.5 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-[10px] font-semibold">
                              {commit.commit.author.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-[var(--text-secondary)]">{commit.commit.author.name}</span>
                            <span className="text-[var(--text-tertiary)]">committed {formatDate(commit.commit.author.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="commit-sha text-[11px] text-[var(--text-secondary)] font-mono px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)]">
                            {truncateSha(commit.sha)}
                          </span>
                          <button
                            onClick={() => handleCommitClick(commit.sha)}
                            className="px-2 py-1 text-xs text-[var(--accent-color)] hover:bg-[var(--accent-color)]/5 rounded-md transition-colors font-medium"
                          >
                            {selectedCommit === commit.sha
                              ? "Hide"
                              : "Details"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {selectedCommit === commit.sha && commitDetails && (
                        <div className="commit-details mt-4 pt-4 border-t border-[var(--border-color)]/60">
                          <div className="text-sm space-y-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                                Full SHA
                              </span>
                              <span className="full-sha font-mono text-xs text-[var(--text-secondary)] px-2 py-0.5 rounded bg-[var(--bg-secondary)]">
                                {commitDetails.sha}
                              </span>
                            </div>
                            {commitDetails.stats && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                                  Changes
                                </span>
                                <span className="text-[var(--success-color)] text-xs font-mono font-semibold">
                                  +{commitDetails.stats.additions}
                                </span>
                                <span className="text-[var(--danger-color)] text-xs font-mono font-semibold">
                                  −{commitDetails.stats.deletions}
                                </span>
                              </div>
                            )}
                            {commitDetails.files &&
                              commitDetails.files.length > 0 && (
                                <div>
                                  <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                                    Changed files
                                  </div>
                                  <div className="space-y-0.5">
                                    {commitDetails.files.map((file, idx) => (
                                      <div
                                        key={idx}
                                        className="text-[var(--text-secondary)] text-xs font-mono pl-2 border-l-2 border-[var(--border-color)]"
                                      >
                                        {file.filename}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === "branches" && (
            <div>
              {branchesLoading ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  Loading branches…
                </div>
              ) : branches.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  No branches found
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                      Default branch{" "}
                      <span className="ml-1 font-mono text-sm text-[var(--text-primary)] tracking-normal normal-case px-2 py-0.5 rounded bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)]">
                        main
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCreateBranchModal(true)}
                      className="px-3.5 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.98]"
                    >
                      New Branch
                    </button>
                  </div>

                  <div className="rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    {branches.map((branch, idx) => (
                      <div
                        key={branch.name}
                        className={`branch-item flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]/60 ${
                          idx > 0 ? "border-t border-[var(--border-color)]/60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" className="text-[var(--accent-color)]/70 flex-shrink-0" aria-hidden>
                            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                          </svg>
                          <span className="branch-name font-medium text-sm text-[var(--text-primary)] truncate font-mono">
                            {branch.name}
                          </span>
                          {branch.protected && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[var(--accent-color)]/10 text-[var(--accent-color)] rounded-full font-medium flex-shrink-0">
                              Protected
                            </span>
                          )}
                        </div>
                        <span className="branch-commit text-[11px] text-[var(--text-secondary)] font-mono px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] flex-shrink-0">
                          {truncateSha(branch.commit.sha)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Create Branch Modal */}
        {showCreateBranchModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="create-branch-modal bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5 tracking-tight">
                Create new branch
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                    Branch name
                  </label>
                  <input
                    type="text"
                    placeholder="feature/my-branch"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                    Create from
                  </label>
                  <select
                    value={newBranchSource}
                    onChange={(e) => setNewBranchSource(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 text-sm text-[var(--text-primary)] transition-all duration-150"
                  >
                    {branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2.5 mt-6">
                  <button
                    onClick={() => {
                      setShowCreateBranchModal(false);
                      setNewBranchName("");
                      setNewBranchSource("main");
                    }}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createBranch}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Push Files Modal (in detail view) */}
        {showPushFilesModal && selectedRepo && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-lg w-full max-h-[85vh] overflow-auto shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 tracking-tight">
                Push files
              </h2>
              <p className="text-xs text-[var(--text-tertiary)] mb-5 font-mono">{selectedRepo.owner}/{selectedRepo.name}</p>
              <div className="space-y-3">
                <input type="text" placeholder="Branch" value={pushBranch} onChange={(e) => setPushBranch(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150" />
                <input type="text" placeholder="Commit message" value={pushMessage} onChange={(e) => setPushMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                {pushFiles.map((file, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="File path (e.g. src/index.ts)" value={file.path}
                        onChange={(e) => { const nf = [...pushFiles]; nf[idx] = { ...nf[idx], path: e.target.value }; setPushFiles(nf); }}
                        className="flex-1 px-2.5 py-1.5 bg-[var(--bg-primary)] rounded-md ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-[var(--accent-color)]/40 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                      {pushFiles.length > 1 && (
                        <button onClick={() => setPushFiles(pushFiles.filter((_, i) => i !== idx))}
                          className="text-[var(--danger-color)] text-xs px-2 py-1 rounded hover:bg-[var(--danger-color)]/10 font-medium transition-colors">Remove</button>
                      )}
                    </div>
                    <textarea placeholder="File content" value={file.content}
                      onChange={(e) => { const nf = [...pushFiles]; nf[idx] = { ...nf[idx], content: e.target.value }; setPushFiles(nf); }}
                      rows={3}
                      className="w-full px-2.5 py-2 bg-[var(--bg-primary)] rounded-md ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-[var(--accent-color)]/40 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                  </div>
                ))}
                <button onClick={() => setPushFiles([...pushFiles, { path: "", content: "" }])}
                  className="text-sm text-[var(--accent-color)] hover:underline font-medium">+ Add another file</button>
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => { setShowPushFilesModal(false); setPushFiles([{ path: "", content: "" }]); setPushMessage(""); }}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                  <button onClick={pushRepositoryFiles} disabled={!pushMessage.trim() || pushFiles.some(f => !f.path.trim())}
                    className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">Push</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {errorModalNode}
      </div>
    );
  }

  // Render list view
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        padding: 28,
        ["--bg-primary" as any]: "#FCFBF8",
        ["--bg-secondary" as any]: "#F5F2EC",
        ["--bg-tertiary" as any]: "#EDE8DF",
        ["--text-primary" as any]: "#162B2A",
        ["--text-secondary" as any]: "#4F6360",
        ["--text-tertiary" as any]: "#7A8E8B",
        ["--border-color" as any]: "#DCD5C6",
        ["--accent-color" as any]: "#0F766E",
        ["--accent-hover" as any]: "#115E59",
        ["--danger-color" as any]: "#B83A3A",
        ["--success-color" as any]: "#3F7A4F",
        backgroundColor: "#FCFBF8",
        fontFeatureSettings: "'cv11', 'ss01'",
      }}
    >
      <div className="flex items-center justify-between gap-4 pb-1">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
          {APP_NAME}
        </h1>
        <div className="flex gap-2">
          {/* User Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="pl-1.5 pr-2.5 py-1 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-all duration-150 flex items-center gap-2 text-sm font-medium ring-1 ring-transparent hover:ring-[var(--border-color)]"
            >
              <span className="w-7 h-7 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-xs font-semibold">
                {currentUser.login.charAt(0).toUpperCase() || "?"}
              </span>
              <span>{currentUser.login}</span>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden className="text-[var(--text-tertiary)]">
                <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0Z" />
              </svg>
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-52 bg-[var(--bg-primary)] rounded-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] ring-1 ring-[var(--border-color)] z-50 overflow-hidden p-1">
                {availableUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => switchUser(user.login, user.id)}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between text-sm rounded-lg"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-[11px] font-semibold">
                        {user.login.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[var(--text-primary)]">{user.login}</span>
                    </span>
                    {currentUser.login === user.login && <span className="text-[var(--accent-color)] text-xs">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-0.5 border-b border-[var(--border-color)] -mx-1 px-1">
        {(
          [
            { id: "repos", label: "Repos" },
            { id: "issues", label: "Issues" },
            { id: "prs", label: "PRs" },
            { id: "search", label: "Search" },
            { id: "me", label: "Me" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            className={`relative px-3.5 py-2.5 text-sm font-medium transition-all duration-150 rounded-t-lg ${
              activeTab === tab.id
                ? "text-[var(--accent-color)] after:absolute after:left-2 after:right-2 after:bottom-[-1px] after:h-[2px] after:bg-[var(--accent-color)] after:rounded-full"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "repos" && (
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
            </svg>
            <input
              className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] transition-all duration-150"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repositories…"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadRepos();
              }}
            />
          </div>
          <button
            className="px-3.5 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all duration-150 text-sm font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-color)] disabled:opacity-50"
            onClick={loadRepos}
            disabled={loading}
            title="Refresh repos"
          >
            Refresh
          </button>
          <button
            className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium whitespace-nowrap shadow-sm hover:shadow active:scale-[0.99]"
            onClick={() => setShowCreateRepoModal(true)}
          >
            New Repository
          </button>
        </div>
      )}

      {activeTab === "search" && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-[var(--bg-secondary)] rounded-full ring-1 ring-inset ring-[var(--border-color)]">
              {(["code", "users", "issues"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSearchType(t)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                    searchType === t
                      ? "bg-[var(--bg-primary)] text-[var(--accent-color)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t === "code" ? "Code" : t === "users" ? "Users" : "Issues & PRs"}
                </button>
              ))}
            </div>
          </div>

          {searchType === "code" && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <input
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] transition-all duration-150"
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value)}
                  placeholder="Search code…"
                  onKeyDown={(e) => { if (e.key === "Enter") runCodeSearch(); }}
                />
                <button className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                  onClick={runCodeSearch} disabled={codeLoading || !codeQuery.trim()} title="Search">Search</button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-tertiary)] font-mono">e.g. main.py repo:{currentUser.login}/sim-engine</p>
            </>
          )}
          {searchType === "users" && (
            <div className="mt-3 flex items-center gap-2">
              <input
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] transition-all duration-150"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search users…"
                onKeyDown={(e) => { if (e.key === "Enter") runUserSearch(); }}
              />
              <button className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                onClick={runUserSearch} disabled={userLoading || !userQuery.trim()} title="Search">Search</button>
            </div>
          )}
          {searchType === "issues" && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <input
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] transition-all duration-150"
                  value={issueQuery}
                  onChange={(e) => setIssueQuery(e.target.value)}
                  placeholder="Search issues and pull requests…"
                  onKeyDown={(e) => { if (e.key === "Enter") runIssueSearch(); }}
                />
                <button className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 text-sm font-medium shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                  onClick={runIssueSearch} disabled={issueLoading || !issueQuery.trim()} title="Search">Search</button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-tertiary)] font-mono">e.g. bug repo:{currentUser.login}/sim-engine</p>
            </>
          )}
        </>
      )}

      {(activeTab === "repos" || activeTab === "search") && <div className="flex-1 overflow-auto px-1 pt-3">
        {activeTab === "repos" ? (
          loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-[var(--danger-color)] text-sm text-center max-w-[520px] break-words">
                {error}
              </p>
              <button
                className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]"
                onClick={loadRepos}
              >
                Retry
              </button>
            </div>
          ) : repos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">
                📦
              </div>
              <p className="text-base font-medium text-[var(--text-primary)]">No repositories</p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Try a different search query.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {repos.map((repo, i) => {
                const full = repo.full_name || repo.name;
                const [owner, name] = full.includes("/")
                  ? full.split("/")
                  : [repo.owner?.login || "", full];
                return (
                  <li
                    key={`${full}-${i}`}
                    data-testid="repo-card"
                    className="px-4 py-3.5 rounded-xl cursor-pointer group transition-all duration-150 hover:bg-[var(--bg-secondary)] hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)]"
                    onClick={() => handleRepoClick(repo)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-[var(--accent-color)] group-hover:underline truncate tracking-tight">
                            <span className="text-[var(--text-tertiary)] font-normal">
                              {owner || "unknown"}
                            </span>
                            <span className="text-[var(--text-tertiary)] font-normal mx-0.5">/</span>
                            <span>{name}</span>
                          </h3>
                          {repo.private !== undefined && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--border-color)]">
                              {repo.private ? "Private" : "Public"}
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-sm text-[var(--text-secondary)] mt-1.5 line-clamp-2 leading-relaxed">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs text-[var(--text-tertiary)]">
                          {repo.language && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)]" />
                              {repo.language}
                            </span>
                          )}
                          {typeof repo.stargazers_count === "number" && (
                            <span className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden>
                                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                              </svg>
                              {repo.stargazers_count}
                            </span>
                          )}
                          {typeof repo.forks_count === "number" && (
                            <span className="inline-flex items-center gap-1">
                              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden>
                                <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                              </svg>
                              {repo.forks_count}
                            </span>
                          )}
                          {typeof repo.open_issues_count === "number" && (
                            <span>
                              {repo.open_issues_count} open issue{repo.open_issues_count === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleForkClick(repo);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium ring-1 ring-inset ring-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] hover:ring-[var(--accent-color)]/30 transition-all duration-150 flex-shrink-0"
                      >
                        Fork
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : activeTab === "search" && searchType === "code" ? (
          codeLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : codeError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-[var(--danger-color)] text-sm text-center max-w-[520px] break-words">
                {codeError}
              </p>
              <button
                className="px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99]"
                onClick={runCodeSearch}
                disabled={!codeQuery.trim()}
              >
                Retry
              </button>
            </div>
          ) : codeResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">🔎</div>
              <p className="text-base font-medium text-[var(--text-primary)]">No results</p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Try a different search query.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {codeResults.map((item, idx) => (
                <div
                  key={`${item.sha}-${idx}`}
                  className="p-4 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] cursor-pointer hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.12)] hover:ring-[var(--accent-color)]/30 transition-all duration-150"
                  onClick={() => handleCodeResultClick(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] font-mono">
                        {item.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                        {item.path}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-2 inline-flex items-center gap-1">
                        <span className="text-[var(--accent-color)]">●</span>
                        {item.repository.full_name}
                      </div>
                    </div>
                    {item.repository.private !== undefined && (
                      <span className="px-2 py-0.5 h-fit rounded-full bg-[var(--bg-secondary)] text-[10px] uppercase tracking-wider font-medium text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--border-color)]">
                        {item.repository.private ? "Private" : "Public"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "search" && searchType === "users" ? (
          userLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : userResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">👤</div>
              <p className="text-base font-medium text-[var(--text-primary)]">{userQuery ? "No users found" : "Search Users"}</p>
              <p className="text-sm text-[var(--text-tertiary)]">Enter a query to search for users.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {userResults.map((user) => (
                <div key={user.login} className="px-4 py-3 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] flex items-center gap-3 hover:ring-[var(--accent-color)]/30 transition-all duration-150">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center text-base font-semibold">
                    {user.login.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-[var(--text-primary)]">{user.login}</div>
                    {user.type && <div className="text-xs text-[var(--text-tertiary)]">{user.type}</div>}
                  </div>
                  {typeof user.score === "number" && (
                    <div className="ml-auto text-xs text-[var(--text-tertiary)] font-mono">{user.score.toFixed(1)}</div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : activeTab === "search" && searchType === "issues" ? (
          issueLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : issueError ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <div className="w-14 h-14 rounded-2xl bg-[var(--danger-color)]/10 flex items-center justify-center mb-2 text-2xl">⚠️</div>
              <p className="text-base font-medium text-[var(--text-primary)]">Search Failed</p>
              <p className="text-sm text-[var(--text-tertiary)] max-w-md text-center">{issueError}</p>
              <button className="mt-3 text-sm text-[var(--accent-color)] hover:underline font-medium" onClick={runIssueSearch}>Retry</button>
            </div>
          ) : issueResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-1">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 flex items-center justify-center mb-2 text-2xl">🔎</div>
              <p className="text-base font-medium text-[var(--text-primary)]">{issueQuery ? "No results" : "Search Issues & PRs"}</p>
              <p className="text-sm text-[var(--text-tertiary)]">Enter a query to search issues and pull requests.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {issueResults.map((item) => (
                <div key={`${item.number}-${item.title}`} className="px-4 py-3 rounded-xl bg-[var(--bg-primary)] ring-1 ring-[var(--border-color)] hover:ring-[var(--accent-color)]/30 transition-all duration-150">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      item.pull_request ? "bg-sky-500" : item.state === "open" ? "bg-emerald-500" : "bg-purple-500"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-[var(--text-primary)] truncate">{item.title} <span className="text-[var(--text-tertiary)] font-normal">#{item.number}</span></div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">
                        {item.state}
                        {item.pull_request ? " · Pull Request" : " · Issue"}
                        {item.user && ` · ${item.user.login}`}
                        {item.created_at && ` · ${formatDate(item.created_at)}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>}

      {activeTab === "issues" && (
        <div className="-mx-7 mt-4 flex-1 flex flex-col" style={{ minHeight: 420 }}>
          <IssuesTab
            api={api}
            showErrorModal={showErrorModal}
            currentUserLogin={currentUser.login}
            availableRepos={repos.map((r) => {
              const full = r.full_name || r.name;
              const [o, n] = full.includes("/") ? full.split("/") : [r.owner?.login || "", full];
              return { owner: o, name: n, full_name: full, description: r.description, open_issues_count: r.open_issues_count };
            })}
          />
        </div>
      )}

      {activeTab === "prs" && (
        <div className="-mx-7 mt-4 flex-1 flex flex-col" style={{ minHeight: 420 }}>
          <PullRequestsTab
            api={api}
            showErrorModal={showErrorModal}
            currentUserLogin={currentUser.login}
            availableRepos={repos.map((r) => {
              const full = r.full_name || r.name;
              const [o, n] = full.includes("/") ? full.split("/") : [r.owner?.login || "", full];
              return { owner: o, name: n, full_name: full, description: r.description };
            })}
          />
        </div>
      )}

      {activeTab === "me" && (
        <div className="-mx-7 mt-4 flex-1 flex flex-col min-h-0">
          <UserTab api={api} showErrorModal={showErrorModal} />
        </div>
      )}

      {activeTab === "repos" && (
        <div className="px-1 pt-3 text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
          {loading ? "Loading…" : `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`}
        </div>
      )}

      {activeTab === "search" && (
        <div className="px-1 pt-3 text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
          {searchType === "code" && (codeLoading ? "Searching…" : `${codeTotal} results`)}
          {searchType === "users" && (userLoading ? "Searching…" : `${userTotal} results`)}
          {searchType === "issues" && (issueLoading ? "Searching…" : `${issueTotal} results`)}
        </div>
      )}

      {/* Create Repository Modal */}
      {showCreateRepoModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="create-repo-modal bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 tracking-tight">
              Create new repository
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-5">A great repository starts with a great name.</p>

            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="Repository name"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150"
                  required
                />
              </div>

              <div>
                <textarea
                  placeholder="Description (optional)"
                  value={newRepoDescription}
                  onChange={(e) => setNewRepoDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150"
                  rows={3}
                />
              </div>

              <div className="space-y-1 pt-1">
                <label className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <input
                    type="checkbox"
                    checked={newRepoPrivate}
                    onChange={(e) => setNewRepoPrivate(e.target.checked)}
                    className="rounded accent-[var(--accent-color)] w-4 h-4"
                  />
                  <span>Private</span>
                </label>

                <label className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <input
                    type="checkbox"
                    checked={newRepoAutoInit}
                    onChange={(e) => setNewRepoAutoInit(e.target.checked)}
                    className="rounded accent-[var(--accent-color)] w-4 h-4"
                  />
                  <span>Initialize with README</span>
                </label>
              </div>

              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={() => {
                    setShowCreateRepoModal(false);
                    setNewRepoName("");
                    setNewRepoDescription("");
                    setNewRepoPrivate(false);
                    setNewRepoAutoInit(true);
                  }}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={createRepository}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? "Creating…" : "Create Repository"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fork Repository Modal */}
      {showForkModal && forkingRepo && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2 tracking-tight">
              Fork repository
            </h2>

            <p className="text-sm text-[var(--text-secondary)] mb-1">
              Fork <span className="font-mono text-[var(--text-primary)]">{forkingRepo.full_name || forkingRepo.name}</span>?
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mb-6 leading-relaxed">
              This will create a copy of the repository under your account.
            </p>

            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setShowForkModal(false);
                  setForkingRepo(null);
                }}
                className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={forkRepository}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? "Forking…" : "Fork Repository"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Files Modal */}
      {showPushFilesModal && selectedRepo && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-7 max-w-lg w-full max-h-[85vh] overflow-auto shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 tracking-tight">
              Push files
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mb-5 font-mono">{selectedRepo.owner}/{selectedRepo.name}</p>
            <div className="space-y-3">
              <input type="text" placeholder="Branch" value={pushBranch} onChange={(e) => setPushBranch(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono transition-all duration-150" />
              <input type="text" placeholder="Commit message" value={pushMessage} onChange={(e) => setPushMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-secondary)] rounded-lg ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
              {pushFiles.map((file, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border-color)] space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="File path (e.g. src/index.ts)" value={file.path}
                      onChange={(e) => { const nf = [...pushFiles]; nf[idx] = { ...nf[idx], path: e.target.value }; setPushFiles(nf); }}
                      className="flex-1 px-2.5 py-1.5 bg-[var(--bg-primary)] rounded-md ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-[var(--accent-color)]/40 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-150" />
                    {pushFiles.length > 1 && (
                      <button onClick={() => setPushFiles(pushFiles.filter((_, i) => i !== idx))}
                        className="text-[var(--danger-color)] text-xs px-2 py-1 rounded hover:bg-[var(--danger-color)]/10 font-medium transition-colors">Remove</button>
                    )}
                  </div>
                  <textarea placeholder="File content" value={file.content}
                    onChange={(e) => { const nf = [...pushFiles]; nf[idx] = { ...nf[idx], content: e.target.value }; setPushFiles(nf); }}
                    rows={3}
                    className="w-full px-2.5 py-2 bg-[var(--bg-primary)] rounded-md ring-1 ring-inset ring-[var(--border-color)] focus:outline-none focus:ring-[var(--accent-color)]/40 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none transition-all duration-150" />
                </div>
              ))}
              <button onClick={() => setPushFiles([...pushFiles, { path: "", content: "" }])}
                className="text-sm text-[var(--accent-color)] hover:underline font-medium">+ Add another file</button>
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => { setShowPushFilesModal(false); setPushFiles([{ path: "", content: "" }]); setPushMessage(""); }}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors font-medium text-sm">Cancel</button>
                <button onClick={pushRepositoryFiles} disabled={!pushMessage.trim() || pushFiles.some(f => !f.path.trim())}
                  className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all duration-150 font-medium text-sm shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">Push</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorModalNode}
    </div>
  );
}
