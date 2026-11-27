import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useBackendAPI } from "@shared/hooks/useBackendAPI";

const APP_NAME = "GridwellChat";

// Space type enum matching backend
type SpaceType = "SPACE" | "GROUP_CHAT" | "DIRECT_MESSAGE";

// Space interface matching backend response
interface Space {
  name: string;
  displayName: string;
  spaceType: SpaceType;
  singleUserBotDm?: boolean;
  spaceThreadingState?: string;
  spaceDetails?: {
    description?: string;
    guidelines?: string;
  };
  spaceHistoryState?: string;
  importMode?: boolean;
  createTime?: string;
  adminInstalled?: boolean;
  accessSettings?: {
    accessState?: string;
    audience?: string;
  };
  membershipCount?: number | Record<string, number>;
  lastActiveTime?: string;
  externalUserAllowed?: boolean;
  spaceUri?: string;
}

interface AppProps {
  onClose: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
  openWindow?: (config: {
    id: string;
    title: string;
    content: React.ReactNode;
    width?: number;
    height?: number;
  }) => void;
}

export default function GridwellChatApp({ setRefreshHandler, openWindow }: AppProps) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createSpaceName, setCreateSpaceName] = useState("");
  const [createSpaceType, setCreateSpaceType] = useState<SpaceType>("SPACE");
  const [createSpaceDescription, setCreateSpaceDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [useSetupSpace, setUseSetupSpace] = useState(false);
  const [setupMembers, setSetupMembers] = useState("");
  const [showSetupSpaceDialog, setShowSetupSpaceDialog] = useState(false);
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const [showViewDetailsDialog, setShowViewDetailsDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showSpaceEventsDialog, setShowSpaceEventsDialog] = useState(false);
  const [updateSpaceName, setUpdateSpaceName] = useState("");
  const [updateSpaceDescription, setUpdateSpaceDescription] = useState("");
  const [updating, setUpdating] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRemoveMemberConfirm, setShowRemoveMemberConfirm] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "ROLE_MEMBER" | "ROLE_MANAGER"
  >("ROLE_MEMBER");
  const [addingMember, setAddingMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [showMemberDetailsDialog, setShowMemberDetailsDialog] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [showNotificationSettingsDialog, setShowNotificationSettingsDialog] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<{
    name: string;
    notificationSetting: string;
    muteSetting: string;
  } | null>(null);
  const [loadingNotificationSettings, setLoadingNotificationSettings] = useState(false);
  const [notificationSettingsError, setNotificationSettingsError] = useState<string | null>(null);
  const [editingNotificationSettings, setEditingNotificationSettings] = useState(false);
  const [pendingNotificationSettings, setPendingNotificationSettings] = useState<{
    notificationSetting: string;
    muteSetting: string;
  } | null>(null);
  const [updatingNotificationSettings, setUpdatingNotificationSettings] = useState(false);
  const [showSpaceReadStateDialog, setShowSpaceReadStateDialog] = useState(false);
  const [spaceReadState, setSpaceReadState] = useState<{
    name: string;
    lastReadTime: string | null;
  } | null>(null);
  const [loadingSpaceReadState, setLoadingSpaceReadState] = useState(false);
  const [spaceReadStateError, setSpaceReadStateError] = useState<string | null>(null);

  const defaultSpaceEventTypeIds = [
    "gridwell.workspace.chat.membership.v1.created",
    "gridwell.workspace.chat.membership.v1.updated",
    "gridwell.workspace.chat.membership.v1.deleted",
    "gridwell.workspace.chat.space.v1.updated",
    "gridwell.workspace.chat.message.v1.created",
  ];
  const spaceEventOptions = [
    {
      id: "gridwell.workspace.chat.membership.v1.created",
      label: "Membership created",
    },
    {
      id: "gridwell.workspace.chat.membership.v1.updated",
      label: "Membership updated",
    },
    {
      id: "gridwell.workspace.chat.membership.v1.deleted",
      label: "Membership deleted",
    },
    {
      id: "gridwell.workspace.chat.space.v1.updated",
      label: "Space updated",
    },
    {
      id: "gridwell.workspace.chat.message.v1.created",
      label: "Message created",
    },
  ];
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(
    defaultSpaceEventTypeIds
  );
  const [spaceEvents, setSpaceEvents] = useState<any[]>([]);
  const [spaceEventsLoading, setSpaceEventsLoading] = useState(false);
  const [spaceEventsLoadingMore, setSpaceEventsLoadingMore] = useState(false);
  const [spaceEventsError, setSpaceEventsError] = useState<string | null>(null);
  const [spaceEventsPageToken, setSpaceEventsPageToken] = useState<
    string | null
  >(null);
  const [showSpaceEventDetailsDialog, setShowSpaceEventDetailsDialog] =
    useState(false);
  const [selectedSpaceEvent, setSelectedSpaceEvent] = useState<any | null>(
    null
  );
  const [spaceEventDetailsLoading, setSpaceEventDetailsLoading] =
    useState(false);
  const [spaceEventDetailsError, setSpaceEventDetailsError] = useState<
    string | null
  >(null);

  // Message states
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [showMessageDetailsDialog, setShowMessageDetailsDialog] =
    useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [editMessageText, setEditMessageText] = useState("");
  const [updatingMessage, setUpdatingMessage] = useState(false);
  const [usePatchMessage, setUsePatchMessage] = useState(false);
  const [showAttachmentDetailDialog, setShowAttachmentDetailDialog] = useState(false);
  const [attachmentDetail, setAttachmentDetail] = useState<any | null>(null);
  const [loadingAttachmentDetail, setLoadingAttachmentDetail] = useState(false);
  const [showDeleteMessageConfirm, setShowDeleteMessageConfirm] =
    useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [threadReadState, setThreadReadState] = useState<any | null>(null);
  const [threadReadStateLoading, setThreadReadStateLoading] = useState(false);
  const [threadReadStateError, setThreadReadStateError] = useState<
    string | null
  >(null);
  const [replyTargetMessage, setReplyTargetMessage] = useState<any | null>(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Reaction states
  const [messageReactions, setMessageReactions] = useState<Map<string, any[]>>(
    new Map()
  );
  const [loadingReactions, setLoadingReactions] = useState<Set<string>>(
    new Set()
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // message name for which emoji picker is shown

  // Attachment states
  interface PendingAttachment {
    id: string;
    file?: File;
    fileName: string;
    mimeType: string;
    size: number;
    previewUrl?: string;
  }
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<
    string | null
  >(null);
  // Cache attachment metadata: resourceName -> {contentName, contentType, name}
  const [attachmentMetadataCache, setAttachmentMetadataCache] = useState<
    Record<string, any>
  >({});

  // In-app attach dialog states
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachFileName, setAttachFileName] = useState("");
  const [attachFileMimeType, setAttachFileMimeType] = useState("application/octet-stream");

  // In-app download preview states
  const [showDownloadPreview, setShowDownloadPreview] = useState(false);
  const [downloadPreviewData, setDownloadPreviewData] = useState<any>(null);
  const [downloadPreviewLabel, setDownloadPreviewLabel] = useState("");

  const loadDataRef = useRef<() => void>(() => {});
  const newChatButtonRef = useRef<HTMLButtonElement>(null);
  const newChatMenuRef = useRef<HTMLDivElement>(null);
  const spaceMenuButtonRef = useRef<HTMLButtonElement>(null);
  const spaceMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Incremented every time loadMessages populates the list. The layout effect
  // below reads this to jump the scroll container to the bottom synchronously
  // before paint — so the initial render shows the newest messages, and the
  // lazy-reaction IntersectionObserver only fires for rows actually visible
  // (not every row scrolled past during a smooth-scroll animation).
  const [scrollToBottomKey, setScrollToBottomKey] = useState(0);
  const attachmentIdCounterRef = useRef(0);

  // Lazy-reaction infrastructure: one shared IntersectionObserver attaches to
  // each rendered message row and fires loadReactions() when the row enters
  // the viewport. Refs mirror the latest state so the observer callback (set
  // up once at mount) always sees current values.
  const reactionObserverRef = useRef<IntersectionObserver | null>(null);
  const observedMessageNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const loadReactionsRef = useRef<(messageName: string) => void>(() => {});
  const messageReactionsRef = useRef<Map<string, any[]>>(new Map());
  const loadingReactionsRef = useRef<Set<string>>(new Set());

  const api = useBackendAPI("gridwell_chat");

  // Cached user map to avoid redundant state fetches
  const userMapCacheRef = useRef<{ map: Map<string, { displayName: string; name: string }>; timestamp: number } | null>(null);
  const USER_MAP_CACHE_TTL = 30_000; // 30 seconds

  // Cached current user so read/notification writes go to the right "users/{id}/..." path.
  const currentUserCacheRef = useRef<{ name: string; timestamp: number } | null>(null);
  const CURRENT_USER_CACHE_TTL = 30_000;

  const fetchCurrentUser = useCallback(async (): Promise<string> => {
    const now = Date.now();
    if (
      currentUserCacheRef.current &&
      now - currentUserCacheRef.current.timestamp < CURRENT_USER_CACHE_TTL
    ) {
      return currentUserCacheRef.current.name;
    }
    try {
      const resp = await fetch("./api/services/gridwell_chat/state");
      if (resp.ok) {
        const data = await resp.json();
        const name = data.state?.current_user;
        if (typeof name === "string" && name) {
          currentUserCacheRef.current = { name, timestamp: now };
          return name;
        }
      }
    } catch {
      // fall through to default
    }
    // Fall back to the legacy default so demo DBs without current_user still work.
    const fallback = "users/USER123";
    currentUserCacheRef.current = { name: fallback, timestamp: now };
    return fallback;
  }, []);

  // Helper: fetch User entries from backend state (with cache)
  const fetchUserMap = useCallback(async (): Promise<Map<string, { displayName: string; name: string }>> => {
    const now = Date.now();
    if (userMapCacheRef.current && now - userMapCacheRef.current.timestamp < USER_MAP_CACHE_TTL) {
      return userMapCacheRef.current.map;
    }
    try {
      const resp = await fetch("./api/services/gridwell_chat/state");
      if (!resp.ok) return new Map();
      const data = await resp.json();
      const users = data.state?.User || [];
      const map = new Map<string, { displayName: string; name: string }>();
      for (const u of users) {
        if (u.name) {
          map.set(u.name, { displayName: u.displayName || u.name, name: u.name });
        }
      }
      userMapCacheRef.current = { map, timestamp: now };
      return map;
    } catch {
      return new Map();
    }
  }, []);

  // Helper: enrich members list with displayName from User DB
  const enrichMembersWithDisplayName = useCallback(async (membersList: any[]): Promise<any[]> => {
    // Skip if all members already have displayNames
    if (membersList.every((m) => !m.member || m.member.displayName)) return membersList;
    const userMap = await fetchUserMap();
    if (userMap.size === 0) return membersList;
    return membersList.map((m) => {
      if (m.member && !m.member.displayName && m.member.name) {
        const user = userMap.get(m.member.name);
        if (user) {
          return { ...m, member: { ...m.member, displayName: user.displayName } };
        }
      }
      return m;
    });
  }, [fetchUserMap]);

  // Helper: resolve email to user ID by looking up cached user map
  const resolveEmailToUserId = useCallback(async (email: string): Promise<string | null> => {
    const userMap = await fetchUserMap();
    // Check if any user's name contains the email
    for (const [, user] of userMap) {
      const userId = user.name.replace("users/", "");
      if (userId.toLowerCase() === email.toLowerCase()) {
        return user.name;
      }
    }
    // Check if displayName matches (partial match on email prefix)
    const emailPrefix = email.split("@")[0].replace(/[._]/g, " ").toLowerCase();
    for (const [, user] of userMap) {
      if (user.displayName.toLowerCase().includes(emailPrefix)) {
        return user.name;
      }
    }
    return null;
  }, [fetchUserMap]);

  // Register refresh handler - uses ref to avoid infinite re-render loop
  // Empty deps array: register once on mount, clean up on unmount
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(() => loadDataRef.current());
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the ref always up to date
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  // Set up the shared IntersectionObserver once. rootMargin=200px starts the
  // fetch slightly before the row reaches the viewport so reactions appear
  // close to immediately on scroll. Also picks up any message rows whose ref
  // callback fired before this effect ran (ref callbacks happen in the commit
  // phase, before passive effects).
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const name = (entry.target as HTMLElement).dataset.messageName;
          if (name) loadReactionsRef.current(name);
        }
      },
      { rootMargin: "200px" }
    );
    reactionObserverRef.current = observer;
    for (const node of observedMessageNodesRef.current.values()) {
      observer.observe(node);
    }
    return () => {
      observer.disconnect();
      reactionObserverRef.current = null;
      observedMessageNodesRef.current.clear();
    };
  }, []);

  // Ref callback used on each message row to (un)register it with the shared
  // observer as React mounts/unmounts rows. Tracks nodes even if the observer
  // isn't ready yet so the effect above can pick them up when it runs.
  const messageRowRefCallback = useCallback(
    (node: HTMLElement | null, messageName: string) => {
      const observer = reactionObserverRef.current;
      const existing = observedMessageNodesRef.current.get(messageName);
      if (existing === node) return;
      if (existing && observer) observer.unobserve(existing);
      if (node) {
        observedMessageNodesRef.current.set(messageName, node);
        if (observer) observer.observe(node);
      } else {
        observedMessageNodesRef.current.delete(messageName);
      }
    },
    []
  );

  // Pin the message list to the bottom when loadMessages finishes. Runs
  // synchronously before paint via useLayoutEffect so the user never sees the
  // top of the conversation, and the IntersectionObserver evaluates row
  // visibility against the already-scrolled layout instead of firing for
  // every row an animated scroll would pass through.
  useLayoutEffect(() => {
    if (scrollToBottomKey === 0) return;
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [scrollToBottomKey]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load messages and members when space is selected
  useEffect(() => {
    if (selectedSpace) {
      loadMessages();
      // Pre-fetch members so they are available when the members dialog is opened
      (async () => {
        try {
          const result = await api.callTool<{ memberships?: any[] }>(
            "list_space_members",
            {
              parent: selectedSpace.name,
              pageSize: 100,
              showInvited: true,
            }
          );
          const membersList = result?.memberships || [];
          const enriched = await enrichMembersWithDisplayName(membersList);
          setMembers(enriched);
        } catch (err) {
          console.error("Failed to pre-load members:", err);
        }
      })();
    } else {
      setMessages([]);
      setMembers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpace?.name]);

  // Close new chat menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        newChatMenuRef.current &&
        !newChatMenuRef.current.contains(e.target as Node) &&
        newChatButtonRef.current &&
        !newChatButtonRef.current.contains(e.target as Node)
      ) {
        setShowNewChatMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close space menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        spaceMenuRef.current &&
        !spaceMenuRef.current.contains(e.target as Node) &&
        spaceMenuButtonRef.current &&
        !spaceMenuButtonRef.current.contains(e.target as Node)
      ) {
        setShowSpaceMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside emoji picker
      if (showEmojiPicker && !target.closest(".relative")) {
        setShowEmojiPicker(null);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showEmojiPicker]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setIsSearchMode(false);
    try {
      // List all spaces the current user is a member of
      const result = await api.callTool<{ spaces?: Space[] }>("list_spaces", {
        pageSize: 100,
      });

      const spacesList = result?.spaces || [];
      setSpaces(spacesList);

      // If a space was previously selected, try to keep it selected
      if (selectedSpace) {
        const stillExists = spacesList.find(
          (s) => s.name === selectedSpace.name
        );
        if (stillExists) {
          setSelectedSpace(stillExists);
        } else {
          setSelectedSpace(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spaces");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      // If search is empty, reload all spaces
      await loadData();
      return;
    }

    setSearching(true);
    setIsSearchMode(true);
    setError(null);
    try {
      // Use the search_spaces API for admin search
      const searchQuery = `customer = "customers/my_customer" AND spaceType = "SPACE" AND displayName : "${query.trim()}"`;
      const searchResult = await api.callTool<{ spaces?: Space[] }>("search_spaces", {
        query: searchQuery,
        useAdminAccess: true,
        pageSize: 100,
      }).catch(() => null);

      if (searchResult?.spaces && searchResult.spaces.length > 0) {
        setSpaces(searchResult.spaces);
      } else {
        // Fallback: load all spaces and filter client-side for non-SPACE types
        const result = await api.callTool<{ spaces?: Space[] }>("list_spaces", {
          pageSize: 100,
        });

        const allSpaces = result?.spaces || [];
        const searchTerm = query.trim().toLowerCase();
        const filteredSpaces = allSpaces.filter((space) =>
          space.displayName?.toLowerCase().includes(searchTerm)
        );

        setSpaces(filteredSpaces);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search spaces");
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = async () => {
    setSearchQuery("");
    await loadData();
  };

  // Format time in UTC to match database values (avoid timezone conversion)
  const formatUtcTime = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString("en-US", { timeZone: "UTC" });
    } catch {
      return isoString;
    }
  };

  const getSpaceIcon = (space: Space): string => {
    if (space.spaceType === "DIRECT_MESSAGE") return "💬";
    if (space.spaceType === "GROUP_CHAT") return "👥";
    return "🏢";
  };

  const getSpaceTypeLabel = (type: SpaceType): string => {
    switch (type) {
      case "DIRECT_MESSAGE":
        return "Direct Message";
      case "GROUP_CHAT":
        return "Group Chat";
      case "SPACE":
        return "Space";
      default:
        return type;
    }
  };

  const handleNewChatMenuSelect = (type: SpaceType) => {
    setCreateSpaceType(type);
    setShowNewChatMenu(false);
    setShowCreateDialog(true);
  };

  const handleViewSpaceDetails = async () => {
    setShowSpaceMenu(false);
    if (!selectedSpace) return;

    // Show dialog immediately with current data, then refresh in background
    setShowViewDetailsDialog(true);

    // Fetch fresh space details from backend in background
    try {
      const result = await api.callTool<Space>("get_space_details", {
        name: selectedSpace.name,
      });

      // Update selected space with fresh data
      if (result) {
        setSelectedSpace(result);
      }
    } catch (err) {
      console.error("Failed to fetch space details:", err);
    }
  };

  const handleViewSpaceEvents = () => {
    setShowSpaceMenu(false);
    setShowSpaceEventsDialog(true);
  };

  const getEventTypeLabel = (eventType?: string) => {
    if (!eventType) return "Unknown event";
    const match = spaceEventOptions.find((option) => option.id === eventType);
    return match?.label || eventType;
  };

  const getEventActorName = (event: any) => {
    return (
      event?.user?.displayName ||
      event?.user?.name ||
      event?.actor?.displayName ||
      event?.actor?.name ||
      event?.membership?.member?.name ||
      "Unknown actor"
    );
  };

  const getEventSummary = (event: any) => {
    if (event?.membershipCreatedEventData?.membership) {
      const member =
        event.membershipCreatedEventData.membership.member?.displayName ||
        event.membershipCreatedEventData.membership.member?.name ||
        "Unknown member";
      return `${member} joined the space.`;
    }
    if (event?.membershipUpdatedEventData?.membership) {
      const member =
        event.membershipUpdatedEventData.membership.member?.displayName ||
        event.membershipUpdatedEventData.membership.member?.name ||
        "Unknown member";
      return `${member} membership updated.`;
    }
    if (event?.membershipDeletedEventData?.membership) {
      const member =
        event.membershipDeletedEventData.membership.member?.displayName ||
        event.membershipDeletedEventData.membership.member?.name ||
        "Unknown member";
      return `${member} left the space.`;
    }
    if (event?.spaceUpdatedEventData?.space) {
      const spaceName =
        event.spaceUpdatedEventData.space.displayName ||
        event.spaceUpdatedEventData.space.name ||
        "Space";
      return `${spaceName} was updated.`;
    }
    return getEventTypeLabel(event?.eventType);
  };

  const buildSpaceEventsFilter = () => {
    if (selectedEventTypes.length === 0) return null;
    return selectedEventTypes
      .map((eventType) => `event_types:"${eventType}"`)
      .join(" OR ");
  };

  const loadSpaceEvents = async (pageToken?: string, append?: boolean) => {
    if (!selectedSpace) return;
    const filter = buildSpaceEventsFilter();
    if (!filter) {
      setSpaceEvents([]);
      setSpaceEventsError("Select at least one event type.");
      setSpaceEventsPageToken(null);
      return;
    }

    if (append) {
      setSpaceEventsLoadingMore(true);
    } else {
      setSpaceEventsLoading(true);
    }
    setSpaceEventsError(null);

    const fetchEvents = () =>
      api.callTool<{ spaceEvents?: any[]; nextPageToken?: string }>("list_space_events", {
        parent: selectedSpace.name,
        filter,
        pageSize: 25,
        pageToken,
      });

    try {
      let result: { spaceEvents?: any[]; nextPageToken?: string } | null = null;
      try {
        result = await fetchEvents();
      } catch (firstErr) {
        // If user is not a member, try adding them as JOINED member first
        if (firstErr instanceof Error && firstErr.message.includes("UserNotMemberError")) {
          try {
            const currentUser = await fetchCurrentUser();
            await api.callTool("add_space_member", {
              parent: selectedSpace.name,
              membership: {
                member: { name: currentUser, type: "HUMAN" },
                role: "ROLE_MEMBER",
                state: "JOINED",
              },
            });
          } catch {
            // Member might already exist, ignore add errors
          }
          result = await fetchEvents();
        } else {
          throw firstErr;
        }
      }

      const eventsList = result?.spaceEvents || [];
      setSpaceEvents((prev) =>
        append ? [...prev, ...eventsList] : eventsList
      );
      setSpaceEventsPageToken(result?.nextPageToken || null);
    } catch (err) {
      setSpaceEventsError(
        err instanceof Error ? err.message : "Failed to load space events"
      );
      if (!append) {
        setSpaceEvents([]);
      }
    } finally {
      if (append) {
        setSpaceEventsLoadingMore(false);
      } else {
        setSpaceEventsLoading(false);
      }
    }
  };

  const handleViewSpaceEventDetails = async (event: any) => {
    if (!event?.name) return;
    setShowSpaceEventDetailsDialog(true);
    setSpaceEventDetailsLoading(true);
    setSpaceEventDetailsError(null);
    try {
      const result = await api.callTool<any>("get_space_event", {
        name: event.name,
      });
      setSelectedSpaceEvent(result || event);
    } catch (err) {
      setSpaceEventDetailsError(
        err instanceof Error ? err.message : "Failed to load event details"
      );
      setSelectedSpaceEvent(event);
    } finally {
      setSpaceEventDetailsLoading(false);
    }
  };

  const toggleEventType = (eventType: string) => {
    setSelectedEventTypes((prev) =>
      prev.includes(eventType)
        ? prev.filter((value) => value !== eventType)
        : [...prev, eventType]
    );
  };

  const handleUpdateSpaceDetails = () => {
    setShowSpaceMenu(false);
    if (!selectedSpace) return;

    // Pre-fill form with current values
    setUpdateSpaceName(selectedSpace.displayName || "");
    const description = selectedSpace.spaceDetails?.description || "";
    setUpdateSpaceDescription(description);
    setShowUpdateDialog(true);
  };

  const handleUpdateSpaceSubmit = async () => {
    if (!selectedSpace) return;

    setUpdating(true);
    try {
      const updateData: Record<string, any> = {};
      const updateMask: string[] = [];

      // Only update displayName if changed and if it's a SPACE type
      if (
        updateSpaceName.trim() &&
        updateSpaceName.trim() !== selectedSpace.displayName
      ) {
        if (selectedSpace.spaceType === "SPACE") {
          updateData.displayName = updateSpaceName.trim();
          updateMask.push("display_name");
        }
      }

      // Update description if changed
      const currentDescription = selectedSpace.spaceDetails?.description || "";

      if (updateSpaceDescription.trim() !== currentDescription) {
        updateData.spaceDetails = {
          description: updateSpaceDescription.trim(),
        };
        updateMask.push("space_details");
      }

      if (updateMask.length === 0) {
        setShowUpdateDialog(false);
        setUpdating(false);
        return;
      }

      await api.callTool("update_space_details", {
        name: selectedSpace.name,
        updateMask: updateMask.join(","),
        space_updates: updateData,
      });

      // Reset form and close dialog
      setUpdateSpaceName("");
      setUpdateSpaceDescription("");
      setShowUpdateDialog(false);

      // Reload spaces list
      await loadData();
    } catch (err) {
      alert(
        `Failed to update space: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteSpace = () => {
    setShowSpaceMenu(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedSpace) return;

    setDeleting(true);
    try {
      await api.callTool("delete_space", {
        name: selectedSpace.name,
        useAdminAccess: true,
      });

      // Clear selection and reload
      setSelectedSpace(null);
      setShowDeleteConfirm(false);
      await loadData();
    } catch (err) {
      alert(
        `Failed to delete space: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleViewNotificationSettings = async () => {
    if (!selectedSpace) return;

    setShowSpaceMenu(false);
    setShowNotificationSettingsDialog(true);
    setLoadingNotificationSettings(true);
    setNotificationSettingsError(null);
    setNotificationSettings(null);

    try {
      const spaceId = selectedSpace.name.split("/")[1];
      
      try {
        const result = await api.callTool<{
          name: string;
          notificationSetting: string;
          muteSetting: string;
        }>("get_space_notification_settings_for_user", {
          name: `users/me/spaces/${spaceId}/spaceNotificationSetting`,
        });

        setNotificationSettings(result);
      } catch (err) {
        // If the settings don't exist in the backend, use default values
        // This handles the case where notification settings haven't been created yet
        if (err instanceof Error && err.message.includes("SpaceNotificationSettingNotFoundError")) {
          // Return default notification settings
          setNotificationSettings({
            name: `users/me/spaces/${spaceId}/spaceNotificationSetting`,
            notificationSetting: "ALL",
            muteSetting: "UNMUTED",
          });
        } else {
          throw err;
        }
      }
    } catch (err) {
      setNotificationSettingsError(
        err instanceof Error ? err.message : "Failed to load notification settings"
      );
    } finally {
      setLoadingNotificationSettings(false);
    }
  };

  const handleUpdateNotificationSettings = async () => {
    if (!selectedSpace || !notificationSettings || !pendingNotificationSettings) return;

    setUpdatingNotificationSettings(true);

    try {
      const spaceId = selectedSpace.name.split("/")[1];
      const currentUser = await fetchCurrentUser();
      const userId = currentUser.replace(/^users\//, "");

      try {
        await api.callTool("update_space_notification_settings_for_user", {
          name: `users/${userId}/spaces/${spaceId}/spaceNotificationSetting`,
          updateMask: "notification_setting,mute_setting",
          requestBody: {
            notification_setting: pendingNotificationSettings.notificationSetting,
            mute_setting: pendingNotificationSettings.muteSetting,
          },
        });

        // Update the displayed settings with the new values only after successful API call
        setNotificationSettings({
          ...notificationSettings,
          notificationSetting: pendingNotificationSettings.notificationSetting,
          muteSetting: pendingNotificationSettings.muteSetting,
        });

        setEditingNotificationSettings(false);
        setPendingNotificationSettings(null);
      } catch (err) {
        // If settings don't exist, still update local state (graceful fallback)
        if (err instanceof Error && err.message.includes("SpaceNotificationSettingNotFoundError")) {
          setNotificationSettings({
            ...notificationSettings,
            notificationSetting: pendingNotificationSettings.notificationSetting,
            muteSetting: pendingNotificationSettings.muteSetting,
          });

          setEditingNotificationSettings(false);
          setPendingNotificationSettings(null);
        } else {
          throw err;
        }
      }
    } catch (err) {
      alert(
        `Failed to update notification settings: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setUpdatingNotificationSettings(false);
    }
  };

  const handleCancelEditNotificationSettings = () => {
    setEditingNotificationSettings(false);
    setPendingNotificationSettings(null);
  };

  // Fetch read state with fallback chain
  const fetchSpaceReadState = async (spaceId: string): Promise<{ name: string; lastReadTime: string | null } | null> => {
    const currentUser = await fetchCurrentUser();
    const userId = currentUser.replace(/^users\//, "");
    const readStateName = `users/${userId}/spaces/${spaceId}/spaceReadState`;
    for (const name of [readStateName, `users/me/spaces/${spaceId}/spaceReadState`]) {
      try {
        return await api.callTool<{ name: string; lastReadTime: string | null }>(
          "get_space_read_state_for_user",
          { name }
        );
      } catch {
        continue;
      }
    }
    // Fallback: look up from state directly
    try {
      const resp = await fetch("./api/services/gridwell_chat/state");
      if (resp.ok) {
        const data = await resp.json();
        const found = (data.state?.SpaceReadState || []).find(
          (s: any) => s.name?.includes(`spaces/${spaceId}/spaceReadState`)
        );
        if (found) return found;
      }
    } catch { /* ignore */ }
    return null;
  };

  const handleViewSpaceReadState = async () => {
    if (!selectedSpace?.name) return;

    setShowSpaceReadStateDialog(true);
    setLoadingSpaceReadState(true);
    setSpaceReadStateError(null);

    try {
      const spaceId = selectedSpace.name.split("/")[1];
      const result = await fetchSpaceReadState(spaceId);

      if (result) {
        setSpaceReadState(result);
      } else {
        const currentUser = await fetchCurrentUser();
        const userId = currentUser.replace(/^users\//, "");
        setSpaceReadState({
          name: `users/${userId}/spaces/${spaceId}/spaceReadState`,
          lastReadTime: null,
        });
      }
    } catch (err) {
      setSpaceReadStateError(
        err instanceof Error ? err.message : "Failed to load space read state"
      );
      setSpaceReadState(null);
    } finally {
      setLoadingSpaceReadState(false);
    }
  };

  const handleUpdateSpaceReadState = async (space?: Space) => {
    const targetSpace = space || selectedSpace;
    if (!targetSpace?.name) return;

    try {
      const spaceId = targetSpace.name.split("/")[1];
      const currentTime = new Date().toISOString();
      const currentUser = await fetchCurrentUser();
      const userId = currentUser.replace(/^users\//, "");
      const readStateName = `users/${userId}/spaces/${spaceId}/spaceReadState`;

      await api.callTool("update_space_read_state_for_user", {
        name: readStateName,
        updateMask: "lastReadTime",
        requestBody: {
          name: readStateName,
          lastReadTime: currentTime,
        },
      });

      // Update local state to reflect the new read time
      setSpaceReadState({
        name: readStateName,
        lastReadTime: currentTime,
      });
    } catch (err) {
      // Silently fail - don't disrupt user experience for read state updates
      console.error("Failed to update space read state:", err);
    }
  };

  const hydrateAttachmentMetadata = useCallback(
    async (messagesList: any[]) => {
      // Attachment metadata (name/contentName/contentType) is already inlined
      // on each Message.attachment entry returned by list_messages, so seed
      // the cache from that instead of round-tripping through download_media.
      // download_media only finds records in DB.Attachment, which is empty in
      // most scenarios — attachments live inline on the message.
      const updates: Record<string, any> = {};
      for (const message of messagesList) {
        for (const att of message.attachment || []) {
          const resourceName = att.attachmentDataRef?.resourceName || att.name;
          if (!resourceName) continue;
          updates[resourceName] = {
            name: att.name || resourceName,
            contentName: att.contentName,
            contentType: att.contentType,
          };
        }
      }

      if (Object.keys(updates).length === 0) return;

      setAttachmentMetadataCache((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Message functions
  const loadMessages = useCallback(async () => {
    if (!selectedSpace) return;

    setLoadingMessages(true);
    try {
      const result = await api.callTool<{ messages?: any[] }>("list_messages", {
        parent: selectedSpace.name,
        pageSize: 100,
      });

      // Sort messages by createTime (oldest first, newest last)
      const messagesList = result?.messages || [];
      const sortedMessages = [...messagesList].sort((a, b) => {
        const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
        const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
        return timeA - timeB;
      });

      setMessages(sortedMessages);
      await hydrateAttachmentMetadata(sortedMessages);

      // Reactions are loaded lazily as messages scroll into view (see the
      // IntersectionObserver hook around each message row). Clear any
      // previously-fetched reactions so we don't carry over stale data when
      // switching spaces.
      setMessageReactions(new Map());

      // Tell the layout effect to pin the scroll at the bottom on the next
      // render pass — synchronous, instantaneous, before the browser paints.
      setScrollToBottomKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoadingMessages(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpace, api, hydrateAttachmentMetadata]);

  const handleSendMessage = async () => {
    if (
      !selectedSpace ||
      (!newMessageText.trim() && pendingAttachments.length === 0)
    )
      return;

    setSendingMessage(true);
    setUploadingAttachments(true);

    try {
      // Step 1: Upload all attachments sequentially
      const uploadedAttachments: any[] = [];

      for (const pending of pendingAttachments) {
        try {
          const result = await api.callTool("upload_media", {
            parent: selectedSpace.name,
            attachment_request: {
              contentName: pending.fileName,
              contentType: pending.mimeType,
            },
          });

          // Cache the attachment metadata for later display
          setAttachmentMetadataCache((prev) => ({
            ...prev,
            [result.name]: {
              name: result.name,
              contentName: result.contentName,
              contentType: result.contentType,
            },
          }));

          // Transform to the format expected by create_message
          uploadedAttachments.push({
            attachmentDataRef: {
              resourceName: result.name,
            },
          });
        } catch (err) {
          console.error(`Failed to upload ${pending.fileName}:`, err);
          throw new Error(
            `Failed to upload ${pending.fileName}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }

      // Step 2: Create message with text and attachments
      const messageBody: any = {};

      if (newMessageText.trim()) {
        messageBody.text = newMessageText.trim();
      }

      if (uploadedAttachments.length > 0) {
        messageBody.attachment = uploadedAttachments;
      }

      const replyThreadName =
        typeof replyTargetMessage?.thread === "string"
          ? replyTargetMessage.thread
          : replyTargetMessage?.thread?.name;
      if (replyThreadName) {
        messageBody.thread = { name: replyThreadName };
      }

      const createPayload: any = {
        parent: selectedSpace.name,
        message_body: messageBody,
      };

      if (replyTargetMessage) {
        createPayload.messageReplyOption = "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD";
      }

      await api.callTool("create_message", createPayload);

      // Step 3: Cleanup and reload
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      setPendingAttachments([]);
      setNewMessageText("");
      setReplyTargetMessage(null);
      await loadMessages();

      // Step 4: Update space read state after sending message
      await handleUpdateSpaceReadState();
    } catch (err) {
      alert(
        `Failed to send message: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSendingMessage(false);
      setUploadingAttachments(false);
    }
  };

  // Helper functions for attachments
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith("image/")) return "🖼️";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
    if (mimeType.includes("zip") || mimeType.includes("rar")) return "🗜️";
    if (mimeType.startsWith("video/")) return "🎥";
    if (mimeType.startsWith("audio/")) return "🎵";
    return "📎";
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const dismissAttachDialog = () => {
    setShowAttachDialog(false);
    setAttachFileName("");
    setAttachFileMimeType("application/octet-stream");
  };

  const dismissDownloadPreview = () => {
    setShowDownloadPreview(false);
    setDownloadPreviewData(null);
    setDownloadPreviewLabel("");
  };

  const handleAddAttachmentFromDialog = () => {
    if (!attachFileName.trim()) {
      alert("Please enter a file name");
      return;
    }

    if (pendingAttachments.length >= 5) {
      alert("Maximum 5 attachments per message");
      return;
    }

    const attachment: PendingAttachment = {
      id: `temp-${Date.now()}-${attachmentIdCounterRef.current++}`,
      fileName: attachFileName.trim(),
      mimeType: attachFileMimeType || "application/octet-stream",
      size: 0,
    };

    setPendingAttachments((prev) => [...prev, attachment]);
    dismissAttachDialog();
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((att) => att.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((att) => att.id !== id);
    });
  };

  const handleDownloadAttachment = async (attachment: any) => {
    const resourceName =
      attachment?.resourceName ||
      attachment?.name ||
      attachment?.attachmentDataRef?.resourceName;
    const downloadLabel =
      attachment?.contentName || resourceName || "attachment";

    if (!resourceName) {
      alert("Failed to download attachment: missing resource name.");
      return;
    }

    setDownloadingAttachment(downloadLabel);

    try {
      // Call download_media API
      const data = await api.callTool("download_media", {
        resourceName,
      });

      // Show the downloaded content in an in-app preview dialog
      // instead of triggering native OS download
      setDownloadPreviewLabel(data.contentName || attachment.contentName || downloadLabel);
      setDownloadPreviewData(data);
      setShowDownloadPreview(true);
    } catch (err) {
      alert(
        `Failed to download attachment: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const handleViewAttachmentDetail = async (attachment: any, message: any) => {
    // Build the attachment resource name
    const attachmentName = attachment?.name ||
      (message?.name && attachment?.attachmentDataRef?.resourceName
        ? `${message.name}/attachments/${attachment.attachmentDataRef.resourceName.split('/').pop()}`
        : null);

    if (!attachmentName) {
      alert("Cannot determine attachment resource name");
      return;
    }

    setLoadingAttachmentDetail(true);
    setShowAttachmentDetailDialog(true);
    setAttachmentDetail(null);

    try {
      const result = await api.callTool("get_message_attachment", {
        name: attachmentName,
      });
      setAttachmentDetail(result);
    } catch (err) {
      // Try alternate name format
      try {
        const altName = `${message.name}/attachments/${
          attachment.attachmentDataRef?.resourceName?.split("/").pop() ||
          attachment.name?.split("/").pop() ||
          "unknown"
        }`;
        const result = await api.callTool("get_message_attachment", {
          name: altName,
        });
        setAttachmentDetail(result);
      } catch {
        setAttachmentDetail({
          error: err instanceof Error ? err.message : "Failed to fetch attachment details",
        });
      }
    } finally {
      setLoadingAttachmentDetail(false);
    }
  };

  // Clear pending attachments when space changes
  useEffect(() => {
    if (pendingAttachments.length > 0) {
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      setPendingAttachments([]);
    }
    setReplyTargetMessage(null);
  }, [selectedSpace?.name]);

  const getThreadReadStateName = (threadName: string): string | null => {
    const match = threadName.match(/^spaces\/([^/]+)\/threads\/([^/]+)$/);
    if (!match) return null;
    return `users/me/spaces/${match[1]}/threads/${match[2]}/threadReadState`;
  };

  const getThreadNameFromMessage = (message: any): string | null => {
    if (!message) return null;
    if (typeof message.thread === "string") return message.thread;
    return message.thread?.name || null;
  };

  const formatRelativeTime = (timestamp: string): string => {
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return "Read just now";
    const diffMs = Date.now() - time;
    if (diffMs < 60 * 1000) return "Read just now";
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 60) {
      return `Read ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `Read ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
      return `Read ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }
    if (diffDays < 365) {
      const diffMonths = Math.floor(diffDays / 30);
      return `Read ${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
    }
    const diffYears = Math.floor(diffDays / 365);
    return `Read ${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
  };

  const getLatestThreadMessageTime = (threadName: string): number | null => {
    let latestTime: number | null = null;
    messages.forEach((message) => {
      const messageThreadName = getThreadNameFromMessage(message);
      if (messageThreadName !== threadName) return;
      if (!message.createTime) return;
      const messageTime = new Date(message.createTime).getTime();
      if (Number.isNaN(messageTime)) return;
      if (latestTime === null || messageTime > latestTime) {
        latestTime = messageTime;
      }
    });
    return latestTime;
  };

  const getThreadReadStateDisplay = (message: any): string => {
    const threadName = getThreadNameFromMessage(message);
    if (!threadName) return "No thread info";
    if (threadReadStateLoading) return "Loading...";
    const lastReadTime = threadReadState?.lastReadTime;
    if (!lastReadTime) return "Unread";
    const latestThreadTime = getLatestThreadMessageTime(threadName);
    const lastReadMs = new Date(lastReadTime).getTime();
    if (Number.isNaN(lastReadMs)) return "Unread";
    if (latestThreadTime !== null && lastReadMs < latestThreadTime) {
      return "Unread";
    }
    if (threadReadStateError) {
      if (threadReadStateError.toLowerCase().includes("not found")) {
        return "Unread";
      }
      return "Failed to load thread read state";
    }
    return formatRelativeTime(lastReadTime);
  };

  const loadThreadReadState = async (message: any) => {
    const threadName =
      typeof message?.thread === "string"
        ? message.thread
        : message?.thread?.name;
    if (!threadName) {
      setThreadReadState(null);
      setThreadReadStateError(null);
      setThreadReadStateLoading(false);
      return;
    }

    const readStateName = getThreadReadStateName(threadName);
    if (!readStateName) {
      setThreadReadState(null);
      setThreadReadStateError("Invalid thread name");
      setThreadReadStateLoading(false);
      return;
    }

    setThreadReadStateLoading(true);
    setThreadReadState(null);
    setThreadReadStateError(null);

    try {
      const result = await api.callTool("get_thread_read_state_for_user", { name: readStateName });
      setThreadReadState(result);
    } catch (err) {
      // API call failed, try fallback via state endpoint
      try {
        const response = await fetch("./api/services/gridwell_chat/state");
        if (!response.ok) {
          throw new Error(`Failed to fetch state: ${response.status}`);
        }
        const data = await response.json();
        const state = data.state || {};
        const currentUser = await fetchCurrentUser();
        const fallbackNames = [
          readStateName,
          readStateName.replace("users/me/", `${currentUser}/`),
        ];
        const fallbackState = (state.ThreadReadState || []).find((entry: any) =>
          fallbackNames.includes(entry.name)
        );
        if (fallbackState) {
          setThreadReadState(fallbackState);
        } else {
          setThreadReadStateError("Thread read state not found");
        }
      } catch (fallbackErr) {
        setThreadReadStateError(
          fallbackErr instanceof Error ? fallbackErr.message : "Unknown error"
        );
      }
    } finally {
      setThreadReadStateLoading(false);
    }
  };

  const handleViewMessageDetails = async (message: any) => {
    // Fetch fresh message details from backend
    try {
      const result = await api.callTool<any>("get_message", {
        name: message.name,
      });

      // Use fresh data from backend
      const messageData = result ? { ...message, ...result } : message;
      if (
        (!messageData.thread ||
          (typeof messageData.thread === "object" &&
            !messageData.thread?.name)) &&
        message.thread
      ) {
        messageData.thread = message.thread;
      }
      setSelectedMessage(messageData);
      setEditMessageText(messageData.text || "");
      await loadThreadReadState(messageData);
      setShowMessageDetailsDialog(true);
    } catch (err) {
      console.error("Failed to fetch message details:", err);
      alert(
        `Failed to fetch latest message details: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );

      setSelectedMessage(message);
      setEditMessageText(message.text || "");
      await loadThreadReadState(message);
      setShowMessageDetailsDialog(true);
    }
  };

  const handleUpdateMessage = async () => {
    if (!selectedMessage || !editMessageText.trim()) return;

    setUpdatingMessage(true);
    try {
      if (usePatchMessage) {
        // Use patch_message for partial updates
        await api.callTool("patch_message", {
          name: selectedMessage.name,
          updateMask: "text",
          allowMissing: false,
          message: {
            text: editMessageText.trim(),
          },
        });
      } else {
        await api.callTool("update_message", {
          name: selectedMessage.name,
          updateMask: "text",
          allowMissing: false,
          body: {
            text: editMessageText.trim(),
          },
        });
      }

      // Update local message state immediately for instant UI feedback
      const updatedText = editMessageText.trim();
      setMessages((prev) =>
        prev.map((m) =>
          m.name === selectedMessage.name
            ? { ...m, text: updatedText, lastUpdateTime: new Date().toISOString() }
            : m
        )
      );

      setEditingMessage(false);
      setShowMessageDetailsDialog(false);
      setSelectedMessage(null);

      // Reload messages in background to sync with backend
      loadMessages();
    } catch (err) {
      alert(
        `Failed to update message: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setUpdatingMessage(false);
    }
  };

  const handleDeleteMessage = () => {
    setShowDeleteMessageConfirm(true);
  };

  const handleConfirmDeleteMessage = async () => {
    if (!selectedMessage) return;

    setDeletingMessage(true);
    try {
      await api.callTool("delete_message", {
        name: selectedMessage.name,
      });

      setShowDeleteMessageConfirm(false);
      setShowMessageDetailsDialog(false);
      setSelectedMessage(null);
      await loadMessages();
    } catch (err) {
      alert(
        `Failed to delete message: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setDeletingMessage(false);
    }
  };

  // Reaction functions
  const loadReactions = useCallback(
    async (messageName: string, opts?: { force?: boolean }) => {
      // Guard: the IntersectionObserver can fire repeatedly as rows scroll
      // in/out, so skip redundant fetches unless the caller explicitly wants
      // a refresh (e.g. after add/remove).
      if (!opts?.force) {
        if (messageReactionsRef.current.has(messageName)) return;
        if (loadingReactionsRef.current.has(messageName)) return;
      }
      setLoadingReactions((prev) => new Set(prev).add(messageName));
      try {
        const result = await api.callTool<{ reactions?: any[] }>(
          "list_message_reactions",
          {
            parent: messageName,
            pageSize: 100,
          }
        );

        const reactions = result?.reactions || [];
        setMessageReactions((prev) => {
          const newMap = new Map(prev);
          newMap.set(messageName, reactions);
          return newMap;
        });
      } catch (err) {
        console.error("Failed to load reactions:", err);
      } finally {
        setLoadingReactions((prev) => {
          const newSet = new Set(prev);
          newSet.delete(messageName);
          return newSet;
        });
      }
    },
    [api]
  );

  // Mirror the latest values into refs so the IntersectionObserver callback
  // (set up once) always sees the current function/state. Doing this
  // synchronously during render is safe: ref writes have no React-level
  // side-effect semantics, and placing the writes here (after the consts are
  // declared) avoids the TDZ hit of referencing them from a hook near the
  // top of the component.
  loadReactionsRef.current = loadReactions;
  messageReactionsRef.current = messageReactions;
  loadingReactionsRef.current = loadingReactions;

  const handleAddReaction = async (
    messageName: string,
    emoji: string,
    currentUserName?: string
  ) => {
    try {
      const userName = currentUserName || (await fetchCurrentUser());
      await api.callTool("add_message_reaction", {
        parent: messageName,
        reaction: {
          emoji: {
            unicode: emoji,
          },
          user: {
            name: userName,
          },
        },
      });

      // Reload reactions for this message
      await loadReactions(messageName, { force: true });

      // Close emoji picker
      setShowEmojiPicker(null);
    } catch (err) {
      alert(
        `Failed to add reaction: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleRemoveReaction = async (
    reactionName: string,
    messageName: string
  ) => {
    try {
      await api.callTool("delete_message_reaction", {
        name: reactionName,
      });

      // Reload reactions for this message
      await loadReactions(messageName, { force: true });
    } catch (err) {
      alert(
        `Failed to remove reaction: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleToggleReaction = async (
    messageName: string,
    emoji: string,
    currentUserName?: string
  ) => {
    const userName = currentUserName || (await fetchCurrentUser());
    const reactions = messageReactions.get(messageName) || [];

    // Check if current user already reacted with this emoji
    const existingReaction = reactions.find(
      (r) => r.emoji?.unicode === emoji && r.user?.name === userName
    );

    if (existingReaction) {
      // Remove reaction
      await handleRemoveReaction(existingReaction.name, messageName);
    } else {
      // Add reaction
      await handleAddReaction(messageName, emoji, userName);
    }
  };

  // Group reactions by emoji
  const getGroupedReactions = (messageName: string) => {
    const reactions = messageReactions.get(messageName) || [];
    const grouped = new Map<
      string,
      { emoji: string; count: number; users: any[]; reactions: any[] }
    >();

    reactions.forEach((reaction) => {
      const emoji = reaction.emoji?.unicode;
      if (!emoji) return;

      if (!grouped.has(emoji)) {
        grouped.set(emoji, {
          emoji,
          count: 0,
          users: [],
          reactions: [],
        });
      }

      const group = grouped.get(emoji)!;
      group.count++;
      group.users.push(reaction.user);
      group.reactions.push(reaction);
    });

    return Array.from(grouped.values());
  };

  const handleSpaceClick = (space: Space) => {
    setSelectedSpace(space);
    // Update space read state when viewing the space
    handleUpdateSpaceReadState(space);
  };

  const handleManageMembers = async () => {
    setShowSpaceMenu(false);
    if (!selectedSpace) return;

    setShowMembersDialog(true);

    // Use pre-fetched members if available to avoid loading lag
    if (members.length > 0) {
      // Enrich existing members with displayName in background
      enrichMembersWithDisplayName(members).then(setMembers);
      return;
    }

    setLoadingMembers(true);

    try {
      const result = await api.callTool<{ memberships?: any[] }>(
        "list_space_members",
        {
          parent: selectedSpace.name,
          pageSize: 100,
          showInvited: true,
        }
      );

      const membersList = result?.memberships || [];
      const enriched = await enrichMembersWithDisplayName(membersList);
      setMembers(enriched);
    } catch (err) {
      alert(
        `Failed to load members: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedSpace || !newMemberEmail.trim()) return;

    setAddingMember(true);
    try {
      const spaceName = selectedSpace.name; // Save space name before reload

      // Normalize member name: remove 'users/' prefix if present, then add it back
      let memberInput = newMemberEmail.trim();
      if (memberInput.startsWith("users/")) {
        memberInput = memberInput.substring(6); // Remove 'users/' prefix
      }

      // If input looks like an email, try to resolve it to a user ID
      if (memberInput.includes("@")) {
        const resolvedName = await resolveEmailToUserId(memberInput);
        if (resolvedName) {
          memberInput = resolvedName.replace("users/", "");
        } else {
          throw new Error(
            `Could not find a user matching email "${memberInput}". Please use a User ID instead (e.g., users/USR_AISHA).`
          );
        }
      }

      await api.callTool("add_space_member", {
        parent: spaceName,
        membership: {
          member: {
            name: `users/${memberInput}`,
            type: "HUMAN",
          },
          role: newMemberRole,
        },
      });

      // Reset form and close dialog
      setNewMemberEmail("");
      setNewMemberRole("ROLE_MEMBER");
      setShowAddMemberDialog(false);

      // Refresh members list and enrich with displayNames
      const result = await api.callTool<{ memberships?: any[] }>(
        "list_space_members",
        {
          parent: spaceName,
          pageSize: 100,
          showInvited: true,
        }
      );

      // Enrich members with displayName from User DB
      const enriched = await enrichMembersWithDisplayName(result?.memberships || []);
      setMembers(enriched);
    } catch (err) {
      alert(
        `Failed to add member: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleViewMemberDetails = async (membership: any) => {
    try {
      console.log("Viewing member details:", {
        membershipName: membership.name,
        membershipState: membership.state,
        fullMembership: membership,
      });

      try {
        const result = await api.callTool<any>("get_space_member", {
          name: membership.name,
        });

        setSelectedMember(result);
        setShowMemberDetailsDialog(true);
      } catch (apiError) {
        // Workaround: If API call fails (e.g., due to malformed name in DB),
        // use the membership data from the list instead
        console.warn(
          "get_space_member failed, using data from list:",
          apiError
        );
        setSelectedMember(membership);
        setShowMemberDetailsDialog(true);
      }
    } catch (err) {
      console.error("Failed to load member details:", err);
      alert(
        `Failed to load member details: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleUpdateMemberRole = async (
    newRole: "ROLE_MEMBER" | "ROLE_MANAGER"
  ) => {
    if (!selectedMember) return;

    setUpdatingRole(true);
    try {
      // Try with original name first
      let memberNameToUse = selectedMember.name;

      try {
        await api.callTool("update_space_member", {
          name: memberNameToUse,
          updateMask: "role",
          membership: {
            name: memberNameToUse,
            role: newRole,
          },
        });
      } catch (firstError) {
        // If failed due to malformed name, try to fix it
        const match = memberNameToUse.match(/^(spaces\/[^/]+\/members\/)(.+)$/);
        if (
          match &&
          (firstError as Error).message?.includes("validation error")
        ) {
          const [, prefix, memberPart] = match;
          if (memberPart.includes("/")) {
            // Extract just the ID part
            const parts = memberPart.split("/");
            memberNameToUse = `${prefix}${parts[parts.length - 1]}`;
            console.log(`Retrying with fixed name: ${memberNameToUse}`);

            await api.callTool("update_space_member", {
              name: memberNameToUse,
              updateMask: "role",
              membership: {
                name: memberNameToUse,
                role: newRole,
              },
            });
          } else {
            throw firstError;
          }
        } else {
          throw firstError;
        }
      }

      // Update local state
      setSelectedMember({ ...selectedMember, role: newRole });

      // Refresh members list
      if (selectedSpace) {
        const result = await api.callTool<{ memberships?: any[] }>(
          "list_space_members",
          {
            parent: selectedSpace.name,
            pageSize: 100,
            showInvited: true, // Show members in INVITED state as well
          }
        );

        setMembers(result?.memberships || []);
      }
    } catch (err) {
      alert(
        `Failed to update member role: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleRemoveMember = () => {
    // Just show the confirmation dialog
    setShowRemoveMemberConfirm(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!selectedSpace || !selectedMember) return;

    setRemovingMember(true);
    try {
      const spaceName = selectedSpace.name; // Save space name before reload
      const memberName = selectedMember.name;

      // Try with original name first
      let memberNameToUse = memberName;

      try {
        await api.callTool("remove_space_member", {
          name: memberNameToUse,
        });
      } catch (firstError) {
        // If failed due to malformed name, try to fix it
        const match = memberNameToUse.match(/^(spaces\/[^/]+\/members\/)(.+)$/);
        if (
          match &&
          (firstError as Error).message?.includes("validation error")
        ) {
          const [, prefix, memberPart] = match;
          if (memberPart.includes("/")) {
            // Extract just the ID part
            const parts = memberPart.split("/");
            memberNameToUse = `${prefix}${parts[parts.length - 1]}`;
            console.log(`Retrying remove with fixed name: ${memberNameToUse}`);

            await api.callTool("remove_space_member", {
              name: memberNameToUse,
            });
          } else {
            throw firstError;
          }
        } else {
          throw firstError;
        }
      }

      // Close dialogs and reset state
      setShowRemoveMemberConfirm(false);
      setShowMemberDetailsDialog(false);
      setSelectedMember(null);

      // Reload spaces to update member count
      await loadData();

      // Refresh members list after loadData to ensure sync with updated selectedSpace
      const result = await api.callTool<{ memberships?: any[] }>(
        "list_space_members",
        {
          parent: spaceName,
          pageSize: 100,
          showInvited: true, // Show members in INVITED state as well
        }
      );

      setMembers(result?.memberships || []);
    } catch (err) {
      alert(
        `Failed to remove member: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setRemovingMember(false);
    }
  };

  const handleCreateSpace = async () => {
    // SPACE type requires displayName, others are optional
    if (createSpaceType === "SPACE" && !createSpaceName.trim()) {
      alert("Space name is required for SPACE type");
      return;
    }

    setCreating(true);
    try {
      const spaceData: Record<string, any> = {
        spaceType: createSpaceType,
      };

      // Add customer field for SPACE type (required by backend)
      if (createSpaceType === "SPACE") {
        spaceData.customer = "customers/my_customer";
      }

      // Add displayName if provided
      if (createSpaceName.trim()) {
        spaceData.displayName = createSpaceName.trim();
      }

      // Add description if provided
      if (createSpaceDescription.trim()) {
        spaceData.spaceDetails = {
          description: createSpaceDescription.trim(),
        };
      }

      await api.callTool("create_space", {
        space: spaceData,
      });

      // Reset form and close dialog
      setCreateSpaceName("");
      setCreateSpaceDescription("");
      setCreateSpaceType("SPACE");
      setShowCreateDialog(false);

      // Reload spaces list
      await loadData();
    } catch (err) {
      alert(
        `Failed to create space: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSetupSpace = async () => {
    if (createSpaceType === "SPACE" && !createSpaceName.trim()) {
      alert("Space name is required for SPACE type");
      return;
    }

    setCreating(true);
    try {
      const spaceData: Record<string, any> = {
        spaceType: createSpaceType,
      };

      // Add customer field for SPACE type (required by backend)
      if (createSpaceType === "SPACE") {
        spaceData.customer = "customers/my_customer";
      }

      if (createSpaceName.trim()) {
        spaceData.displayName = createSpaceName.trim();
      }

      if (createSpaceDescription.trim()) {
        spaceData.spaceDetails = {
          description: createSpaceDescription.trim(),
        };
      }

      // Parse initial members from comma-separated list
      const memberships = setupMembers
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
        .map((memberName) => ({
          member: {
            name: memberName.startsWith("users/") ? memberName : `users/${memberName}`,
            type: "HUMAN" as const,
          },
        }));

      await api.callTool("setup_space", {
        setup_body: {
          space: spaceData,
          memberships,
        },
      });

      // Reset form and close dialog
      setCreateSpaceName("");
      setCreateSpaceDescription("");
      setCreateSpaceType("SPACE");
      setSetupMembers("");
      setUseSetupSpace(false);
      setShowSetupSpaceDialog(false);
      setShowCreateDialog(false);

      // Reload spaces list
      await loadData();
    } catch (err) {
      alert(
        `Failed to setup space: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-primary)] gap-4">
        <p className="text-[var(--danger-color)]">{error}</p>
        <button
          className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors font-medium"
          onClick={loadData}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--bg-primary)]">
      {/* Left Sidebar - Spaces List */}
      <div className="w-72 flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-color)]">
        {/* Header with New Chat button */}
        <div className="p-3 border-b border-[var(--border-color)] relative">
          <button
            ref={newChatButtonRef}
            onClick={() => setShowNewChatMenu(!showNewChatMenu)}
            className="w-full px-4 py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <span className="text-lg">💬</span>
            <span>New Chat</span>
            <span className="text-xs ml-auto">▼</span>
          </button>

          {/* New Chat Menu */}
          {showNewChatMenu && (
            <div
              ref={newChatMenuRef}
              className="absolute left-full top-0 ml-2 w-64 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 overflow-hidden"
            >
              <button
                onClick={() => handleNewChatMenuSelect("DIRECT_MESSAGE")}
                className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
              >
                <span className="text-xl">💬</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Direct Message
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    Private 1:1 conversation
                  </div>
                </div>
              </button>
              <button
                onClick={() => handleNewChatMenuSelect("GROUP_CHAT")}
                className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
              >
                <span className="text-xl">👥</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Group Chat
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    Quick team collaboration
                  </div>
                </div>
              </button>
              <button
                onClick={() => handleNewChatMenuSelect("SPACE")}
                className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3"
              >
                <span className="text-xl">🏢</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Space
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    Organized team workspace
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Search Box */}
        <div className="p-3 border-b border-[var(--border-color)]">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleSearch(searchQuery);
                }
              }}
              placeholder="Search spaces..."
              className="w-full pl-9 pr-20 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              🔍
            </span>
            {searchQuery && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  onClick={handleClearSearch}
                  className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                  title="Clear search"
                >
                  ✕
                </button>
                <button
                  onClick={() => handleSearch(searchQuery)}
                  disabled={searching}
                  className="px-2 py-1 text-xs bg-[#0D9488] hover:bg-[#0F766E] text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Search"
                >
                  {searching ? "..." : "Go"}
                </button>
              </div>
            )}
          </div>
          {isSearchMode && (
            <div className="mt-2 text-xs text-[var(--text-secondary)] flex items-center justify-between">
              <span>Search results for: "{searchQuery}"</span>
              <button
                onClick={handleClearSearch}
                className="text-[#0D9488] hover:underline"
              >
                Show all
              </button>
            </div>
          )}
        </div>

        {/* Spaces List */}
        <div className="flex-1 overflow-y-auto">
          {spaces.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-secondary)] text-sm">
              <p className="mb-2">No spaces found</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Create or join a space to get started
              </p>
            </div>
          ) : (
            <div className="py-2">
              {/* Group by space type */}
              {["DIRECT_MESSAGE", "GROUP_CHAT", "SPACE"].map((type) => {
                const typeSpaces = spaces.filter((s) => s.spaceType === type);
                if (typeSpaces.length === 0) return null;

                return (
                  <div key={type} className="mb-4">
                    <div className="px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {getSpaceTypeLabel(type as SpaceType)}s
                    </div>
                    <div className="space-y-0.5">
                      {typeSpaces.map((space) => (
                        <button
                          key={space.name}
                          onClick={() => handleSpaceClick(space)}
                          className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left ${
                            selectedSpace?.name === space.name
                              ? "bg-[#F0FDFA] dark:bg-[#0D9488]/20 text-[#0D9488] dark:text-[#14B8A6]"
                              : "text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                          }`}
                        >
                          <span className="text-lg flex-shrink-0">
                            {getSpaceIcon(space)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {space.displayName || "Unnamed Space"}
                              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{space.name}]</span>
                            </div>
                            {space.membershipCount && (
                              <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                {space.membershipCount} member
                                {space.membershipCount !== 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <div className="p-3 border-t border-[var(--border-color)]">
          <button
            onClick={loadData}
            className="w-full px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedSpace ? (
          // Space selected - show space details
          <div className="flex-1 flex flex-col min-h-0">
            {/* Space Header */}
            <div className="h-16 flex items-center px-6 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] relative">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{getSpaceIcon(selectedSpace)}</span>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {selectedSpace.displayName || "Unnamed Space"}
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedSpace.name}]</span>
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span>{getSpaceTypeLabel(selectedSpace.spaceType)}</span>
                    {selectedSpace.membershipCount != null && (
                      <>
                        <span>•</span>
                        <span>
                          {typeof selectedSpace.membershipCount === "object"
                            ? `${Object.values(selectedSpace.membershipCount).reduce((a, b) => a + b, 0)} members`
                            : `${selectedSpace.membershipCount} member${selectedSpace.membershipCount !== 1 ? "s" : ""}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Space Menu Button */}
              <button
                ref={spaceMenuButtonRef}
                onClick={() => setShowSpaceMenu(!showSpaceMenu)}
                className="ml-auto p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                aria-label="Space options"
              >
                <svg
                  className="w-5 h-5 text-[var(--text-secondary)]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {/* Space Menu Dropdown */}
              {showSpaceMenu && (
                <div
                  ref={spaceMenuRef}
                  className="absolute top-full right-6 mt-1 w-56 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 overflow-hidden"
                >
                  <button
                    onClick={handleViewSpaceDetails}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
                  >
                    <span className="text-lg">👁️</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      View space details
                    </span>
                  </button>
                  <button
                    onClick={handleUpdateSpaceDetails}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
                  >
                    <span className="text-lg">✏️</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      Update space details
                    </span>
                  </button>
                  <button
                    onClick={handleManageMembers}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3"
                  >
                    <span className="text-lg">👤</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      Manage space members
                    </span>
                  </button>
                  <button
                    onClick={handleViewSpaceEvents}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-t border-[var(--border-color)]"
                  >
                    <span className="text-lg">🗂️</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      View space events
                    </span>
                  </button>
                  <button
                    onClick={handleViewNotificationSettings}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
                  >
                    <span className="text-lg">🔔</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      Notification settings
                    </span>
                  </button>
                  <button
                    onClick={handleViewSpaceReadState}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
                  >
                    <span className="text-lg">📖</span>
                    <span className="text-sm text-[var(--text-primary)]">
                      View read state
                    </span>
                  </button>
                  <button
                    onClick={handleDeleteSpace}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 border-b border-[var(--border-color)]"
                  >
                    <span className="text-lg">🗑️</span>
                    <span className="text-sm text-[var(--danger-color)]">
                      Delete space
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0">
              {/* Messages List */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-md">
                      <div className="text-6xl mb-4">💬</div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                        No messages yet
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Start the conversation by sending a message below
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => {
                      const reactionsLoaded = messageReactions.has(
                        message.name
                      );
                      const groupedReactions = getGroupedReactions(
                        message.name
                      );
                      const isEmojiPickerOpen =
                        showEmojiPicker === message.name;
                      const threadName =
                        typeof message.thread === "string"
                          ? message.thread
                          : message.thread?.name;
                      const threadId = threadName
                        ? threadName.split("/threads/")[1]
                        : null;
                      const commonEmojis = [
                        "👍",
                        "❤️",
                        "😊",
                        "🎉",
                        "👏",
                        "🔥",
                        "😂",
                        "👀",
                      ];

                      return (
                        <div
                          key={message.name}
                          ref={(el) =>
                            messageRowRefCallback(el, message.name)
                          }
                          data-message-name={message.name}
                          className="group p-3 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                          onMouseLeave={() => {
                            // Close emoji picker when mouse leaves the message
                            if (showEmojiPicker === message.name) {
                              setShowEmojiPicker(null);
                            }
                          }}
                        >
                          <div
                            onClick={() => handleViewMessageDetails(message)}
                            className="flex items-start gap-3 cursor-pointer"
                          >
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0D9488] flex items-center justify-center text-white font-medium text-sm">
                              {message.sender?.displayName?.[0]?.toUpperCase() ||
                                message.sender?.name?.[0]?.toUpperCase() ||
                                "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="font-medium text-[var(--text-primary)] text-sm">
                                  {message.sender?.displayName ||
                                    message.sender?.name ||
                                    "Unknown User"}
                                </span>
                                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{message.name}]</span>
                                <span className="text-xs text-[var(--text-tertiary)]">
                                  {message.createTime
                                    ? new Date(
                                        message.createTime
                                      ).toLocaleString()
                                    : ""}
                                </span>
                              </div>
                              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                                {message.text || "(No content)"}
                              </p>
                              {message.lastUpdateTime &&
                                message.lastUpdateTime !==
                                  message.createTime && (
                                  <span className="text-xs text-[var(--text-tertiary)] italic">
                                    (edited)
                                  </span>
                                )}
                              {threadName && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                                  <span>🧵</span>
                                  <span>
                                    {message.threadReply
                                      ? "Reply in thread"
                                      : "Thread root"}
                                  </span>
                                  {threadId && (
                                    <span className="text-[var(--text-tertiary)]">
                                      · Thread #{threadId}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Attachments Section */}
                              {message.attachment &&
                                message.attachment.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs text-[var(--text-tertiary)] mb-2">
                                      Attachments ({message.attachment.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {message.attachment.map((att: any) => {
                                        // Get metadata from cache or use what's in the attachment object
                                        const resourceName =
                                          att.attachmentDataRef?.resourceName ||
                                          att.name;
                                        const cachedMetadata =
                                          attachmentMetadataCache[resourceName];
                                        const displayName =
                                          cachedMetadata?.contentName ||
                                          att.contentName ||
                                          "Unknown file";
                                        const displayType =
                                          cachedMetadata?.contentType ||
                                          att.contentType ||
                                          "application/octet-stream";
                                        const attachmentName =
                                          cachedMetadata?.name ||
                                          att.name ||
                                          resourceName;
                                        const isDriveFile = !!att.driveDataRef;
                                        const driveFileId = att.driveDataRef?.driveFileId;

                                        return (
                                          <div
                                            key={attachmentName}
                                            className={`border rounded-lg p-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3 min-w-[200px] ${isDriveFile ? 'border-[#0D9488]/30' : 'border-[var(--border-color)]'}`}
                                          >
                                            <div className="text-3xl flex-shrink-0">
                                              {isDriveFile ? (
                                                <svg className="w-8 h-8" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                                  <path d="M6.6 66.85L3.3 61.35l23.65-40.9h13.3L6.6 66.85z" fill="#0D9488"/>
                                                  <path d="M43.65 78L30.35 54.45l23.65-40.9 13.3 23.55L43.65 78z" fill="#059669"/>
                                                  <path d="M73.55 78H47l13.3-23.55H87.3L73.55 78z" fill="#E11D48"/>
                                                  <path d="M30.35 54.45L6.6 66.85l13.35-23.5 23.7-.05-13.3 11.15z" fill="#047857"/>
                                                  <path d="M60.3 54.45H33.5l10.15-17.6 26.85-.05-10.2 17.65z" fill="#0D9488"/>
                                                  <path d="M43.65 78l16.65-23.55L73.55 78H43.65z" fill="#F59E0B"/>
                                                </svg>
                                              ) : getFileIcon(displayType)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p
                                                className="text-sm font-medium text-[var(--text-primary)] truncate"
                                                title={displayName}
                                              >
                                                {displayName}
                                              </p>
                                              <p className="text-xs text-[var(--text-tertiary)]">
                                                {isDriveFile ? (
                                                  <span className="text-[#0D9488]">GridwellDrive file</span>
                                                ) : displayType}
                                              </p>
                                            </div>
                                            <div className="flex-shrink-0 flex gap-1">
                                              {isDriveFile && openWindow && driveFileId && (
                                                <button
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                      const mod = await import('../../gridwell_drive/frontend/App.tsx');
                                                      const GridwellDriveApp = mod.default;
                                                      openWindow({
                                                        id: `gridwell_drive-from-chat-${driveFileId}`,
                                                        title: `${displayName} - GridwellDrive`,
                                                        content: <GridwellDriveApp onClose={() => {}} />,
                                                        width: 1400,
                                                        height: 800,
                                                      });
                                                    } catch (err) {
                                                      console.error('Failed to open GridwellDrive:', err);
                                                    }
                                                  }}
                                                  className="px-3 py-1 text-xs bg-white border border-[#0D9488] text-[#0D9488] rounded hover:bg-[#F0FDFA] transition-colors"
                                                  title="Open in GridwellDrive"
                                                >
                                                  Open in Drive
                                                </button>
                                              )}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDownloadAttachment({
                                                    resourceName,
                                                    contentName:
                                                      cachedMetadata?.contentName ||
                                                      att.contentName,
                                                    contentType:
                                                      cachedMetadata?.contentType ||
                                                      att.contentType,
                                                  });
                                                }}
                                                disabled={
                                                  downloadingAttachment ===
                                                  attachmentName
                                                }
                                                className="flex-shrink-0 px-3 py-1 text-xs bg-[#0D9488] text-white rounded hover:bg-[#0F766E] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                                title="Download"
                                              >
                                                {downloadingAttachment ===
                                                attachmentName ? (
                                                  <span className="inline-block animate-spin">
                                                    ⏳
                                                  </span>
                                                ) : (
                                                  "Download"
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Skeleton placeholder while reactions are being
                              lazy-fetched. Mirrors the real pill layout so
                              the row doesn't shift when data arrives. */}
                          {!reactionsLoaded && (
                            <div
                              className="ml-11 mt-2 flex flex-wrap items-center gap-2"
                              aria-hidden="true"
                            >
                              <div className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-full animate-pulse">
                                <span className="inline-block w-4 h-3 bg-[var(--border-color)] rounded" />
                                <span className="inline-block w-3 h-3 bg-[var(--border-color)] rounded" />
                              </div>
                              <div className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-full animate-pulse">
                                <span className="inline-block w-4 h-3 bg-[var(--border-color)] rounded" />
                                <span className="inline-block w-3 h-3 bg-[var(--border-color)] rounded" />
                              </div>
                            </div>
                          )}

                          {/* Reactions Section - Hidden when no reactions unless hovering */}
                          {reactionsLoaded && (
                          <div
                            className={`ml-11 flex flex-wrap items-center gap-2 transition-all ${
                              groupedReactions.length > 0
                                ? "mt-2"
                                : "mt-0 max-h-0 invisible group-hover:max-h-96 group-hover:visible group-hover:mt-2"
                            }`}
                          >
                            {/* Display existing reactions */}
                            {groupedReactions.map((group) => (
                              <button
                                key={group.emoji}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleReaction(
                                    message.name,
                                    group.emoji
                                  );
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] border border-[var(--border-color)] rounded-full text-xs transition-colors"
                                title={group.users
                                  .map((u) => u.displayName || u.name)
                                  .join(", ")}
                              >
                                <span>{group.emoji}</span>
                                <span className="text-[var(--text-secondary)]">
                                  {group.count}
                                </span>
                              </button>
                            ))}

                            {/* Add reaction button - Only visible on hover */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowEmojiPicker(
                                    isEmojiPickerOpen ? null : message.name
                                  );
                                }}
                                className="inline-flex items-center justify-center w-7 h-7 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] border border-[var(--border-color)] rounded-full text-xs transition-all opacity-0 group-hover:opacity-100"
                                title="Add reaction"
                              >
                                <span>😀</span>
                              </button>

                              {/* Emoji Picker Popup */}
                              {isEmojiPickerOpen && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute left-0 top-full mt-1 p-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 flex gap-1"
                                >
                                  {commonEmojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleReaction(
                                          message.name,
                                          emoji
                                        );
                                      }}
                                      className="w-8 h-8 flex items-center justify-center hover:bg-[var(--bg-tertiary)] rounded transition-colors text-lg"
                                      title={emoji}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Send Message Input */}
              <div className="border-t border-[var(--border-color)] p-4">
                {/* No hidden file input - using in-app attach dialog instead */}

                {replyTargetMessage && (
                  <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--text-tertiary)]">
                        Replying to thread
                      </div>
                      <div className="text-sm text-[var(--text-primary)] truncate">
                        {replyTargetMessage.text || "(No content)"}
                      </div>
                    </div>
                    <button
                      onClick={() => setReplyTargetMessage(null)}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                      title="Cancel reply"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Attachment Previews */}
                {pendingAttachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pendingAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="relative border border-[var(--border-color)] rounded p-2 w-32 bg-[var(--bg-secondary)]"
                      >
                        {att.previewUrl ? (
                          <img
                            src={att.previewUrl}
                            alt={att.fileName}
                            className="w-full h-20 object-cover mb-1 rounded"
                          />
                        ) : (
                          <div className="w-full h-20 flex items-center justify-center bg-[var(--bg-tertiary)] mb-1 rounded text-3xl">
                            {getFileIcon(att.mimeType)}
                          </div>
                        )}
                        <p className="text-xs truncate text-[var(--text-primary)]">
                          {att.fileName}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formatFileSize(att.size)}
                        </p>
                        <button
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  {/* Attach button */}
                  <button
                    onClick={() => setShowAttachDialog(true)}
                    disabled={!selectedSpace || sendingMessage}
                    className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Attach files"
                  >
                    <span>📎</span>
                    <span className="hidden sm:inline">Attach</span>
                  </button>

                  <input
                    type="text"
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    disabled={sendingMessage}
                    className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] disabled:opacity-50"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={
                      sendingMessage ||
                      (!newMessageText.trim() &&
                        pendingAttachments.length === 0)
                    }
                    className="px-6 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sendingMessage ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <span>Send</span>
                        <span>📤</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // No space selected - show welcome page
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)] p-6">
            <div className="text-center max-w-lg">
              <div className="text-8xl mb-6">💬</div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
                Welcome to {APP_NAME}
              </h1>
              <p className="text-[var(--text-secondary)] text-lg mb-6">
                Select a space from the sidebar to start chatting, or create a
                new conversation.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div
                  onClick={() => {
                    setCreateSpaceType("DIRECT_MESSAGE");
                    setShowCreateDialog(true);
                  }}
                  className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] hover:border-[#0D9488] hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="text-3xl mb-3">💬</div>
                  <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                    Direct Messages
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Have private conversations with colleagues
                  </p>
                </div>
                <div
                  onClick={() => {
                    setCreateSpaceType("GROUP_CHAT");
                    setShowCreateDialog(true);
                  }}
                  className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] hover:border-[#0D9488] hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="text-3xl mb-3">👥</div>
                  <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                    Group Chats
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Collaborate with small teams instantly
                  </p>
                </div>
                <div
                  onClick={() => {
                    setCreateSpaceType("SPACE");
                    setShowCreateDialog(true);
                  }}
                  className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] hover:border-[#0D9488] hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="text-3xl mb-3">🏢</div>
                  <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                    Spaces
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Organized places for topic-based discussions
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Space Events Dialog */}
      {showSpaceEventsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-color)]">
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Space Events
              </h2>
            </div>
            <div className="px-6 py-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
                  Event types
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {spaceEventOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEventTypes.includes(option.id)}
                        onChange={() => toggleEventType(option.id)}
                        className="rounded border-[var(--border-color)]"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => loadSpaceEvents()}
                    disabled={spaceEventsLoading}
                    className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {spaceEventsLoading ? "Loading..." : "Apply"}
                  </button>
                </div>
              </div>
              <div className="mt-5 border-t border-[var(--border-color)] pt-4">
                {spaceEventsError && (
                  <div
                    className="mb-3 p-3 bg-red-50 dark:bg-red-900/10 border border-[var(--danger-color)] rounded text-sm text-[var(--danger-color)]"
                    data-testid="space-events-error"
                  >
                    {spaceEventsError}
                  </div>
                )}
                {!spaceEventsError && spaceEvents.length === 0 ? (
                  <div
                    className="py-6 text-center text-sm text-[var(--text-secondary)]"
                    data-testid="space-events-empty"
                  >
                    {spaceEventsLoading && (
                      <div className="mx-auto mb-2 w-6 h-6 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                    )}
                    No events found
                  </div>
                ) : !spaceEventsError ? (
                  <div className="space-y-2">
                    {spaceEvents.map((event) => (
                      <button
                        key={event.name}
                        data-testid="space-event-row"
                        onClick={() => handleViewSpaceEventDetails(event)}
                        className="w-full text-left p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[var(--text-primary)]">
                            {getEventTypeLabel(event.eventType)}
                            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{event.name}]</span>
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)]">
                            {event.eventTime
                              ? new Date(event.eventTime).toLocaleString()
                              : "Unknown time"}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                          {getEventActorName(event)}
                        </div>
                      </button>
                    ))}
                    {spaceEventsPageToken && (
                      <button
                        onClick={() =>
                          loadSpaceEvents(spaceEventsPageToken, true)
                        }
                        disabled={spaceEventsLoadingMore}
                        className="w-full px-3 py-2 text-sm text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {spaceEventsLoadingMore ? "Loading..." : "Load more"}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end">
              <button
                onClick={() => setShowSpaceEventsDialog(false)}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Space Event Details Dialog */}
      {showSpaceEventDetailsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-xl mx-4 border border-[var(--border-color)]">
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Event Details
                {selectedSpaceEvent?.name && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedSpaceEvent.name}]</span>
                )}
              </h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              {spaceEventDetailsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-6 h-6 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : spaceEventDetailsError ? (
                <p className="text-sm text-[var(--danger-color)]">
                  {spaceEventDetailsError}
                </p>
              ) : selectedSpaceEvent ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                      Event type
                    </p>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                      {getEventTypeLabel(selectedSpaceEvent.eventType)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                      Event time
                    </p>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                      {selectedSpaceEvent.eventTime
                        ? new Date(
                            selectedSpaceEvent.eventTime
                          ).toLocaleString()
                        : "Unknown time"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                      Actor
                    </p>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                      {getEventActorName(selectedSpaceEvent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                      Summary
                    </p>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                      {getEventSummary(selectedSpaceEvent)}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  No event selected.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end">
              <button
                onClick={() => setShowSpaceEventDetailsDialog(false)}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Space Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Create New {getSpaceTypeLabel(createSpaceType)}
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Space Type */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Type
                </label>
                <select
                  value={createSpaceType}
                  onChange={(e) =>
                    setCreateSpaceType(e.target.value as SpaceType)
                  }
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                >
                  <option value="DIRECT_MESSAGE">Direct Message</option>
                  <option value="GROUP_CHAT">Group Chat</option>
                  <option value="SPACE">Space</option>
                </select>
              </div>

              {/* Space Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Name {createSpaceType === "SPACE" ? "*" : "(optional)"}
                </label>
                <input
                  type="text"
                  value={createSpaceName}
                  onChange={(e) => setCreateSpaceName(e.target.value)}
                  placeholder={
                    createSpaceType === "SPACE"
                      ? "Enter space name (required)"
                      : "Enter name (optional)"
                  }
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                />
                {createSpaceType === "SPACE" && (
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Space names must be unique
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={createSpaceDescription}
                  onChange={(e) => setCreateSpaceDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] resize-none"
                />
              </div>

              {/* Setup Space toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSetupSpace}
                    onChange={(e) => setUseSetupSpace(e.target.checked)}
                    className="w-4 h-4 text-[#0D9488] rounded"
                  />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Setup with initial members
                  </span>
                </label>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Use setup_space to create and add members in one step
                </p>
              </div>

              {/* Initial Members (only shown when setup_space is enabled) */}
              {useSetupSpace && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Initial Members (comma-separated user IDs)
                  </label>
                  <input
                    type="text"
                    value={setupMembers}
                    onChange={(e) => setSetupMembers(e.target.value)}
                    placeholder="e.g. user1@example.com, users/USER456"
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Max 49 members. You are auto-added as manager.
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateSpaceName("");
                  setCreateSpaceDescription("");
                  setCreateSpaceType("SPACE");
                  setUseSetupSpace(false);
                  setSetupMembers("");
                }}
                disabled={creating}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={useSetupSpace ? handleSetupSpace : handleCreateSpace}
                disabled={
                  creating ||
                  (createSpaceType === "SPACE" && !createSpaceName.trim())
                }
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>{useSetupSpace ? "Setup" : "Create"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Space Details Dialog */}
      {showViewDetailsDialog && selectedSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-color)] max-h-[80vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-primary)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Space Details
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedSpace.name}]</span>
              </h2>
            </div>

            {/* Dialog Content - Show all available space parameters */}
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Name
                  </label>
                  <p className="text-[var(--text-primary)] mt-1 font-mono text-xs break-all">
                    {selectedSpace.name}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Display Name
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedSpace.displayName || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Type
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {getSpaceTypeLabel(selectedSpace.spaceType)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Created
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedSpace.createTime
                      ? selectedSpace.createTime
                      : "N/A"}
                  </p>
                </div>
                {selectedSpace.membershipCount != null && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Membership Count
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {typeof selectedSpace.membershipCount === "object"
                        ? JSON.stringify(selectedSpace.membershipCount)
                        : `${selectedSpace.membershipCount} member${selectedSpace.membershipCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                )}
                {selectedSpace.spaceThreadingState && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Threading State
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {selectedSpace.spaceThreadingState}
                    </p>
                  </div>
                )}
                {selectedSpace.spaceHistoryState && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      History State
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {selectedSpace.spaceHistoryState}
                    </p>
                  </div>
                )}
                {selectedSpace.singleUserBotDm != null && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Single User Bot DM
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {String(selectedSpace.singleUserBotDm)}
                    </p>
                  </div>
                )}
                {selectedSpace.importMode != null && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Import Mode
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {String(selectedSpace.importMode)}
                    </p>
                  </div>
                )}
                {selectedSpace.adminInstalled != null && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Admin Installed
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {String(selectedSpace.adminInstalled)}
                    </p>
                  </div>
                )}
                {selectedSpace.lastActiveTime && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Last Active Time
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {selectedSpace.lastActiveTime}
                    </p>
                  </div>
                )}
                {selectedSpace.externalUserAllowed != null && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      External User Allowed
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {String(selectedSpace.externalUserAllowed)}
                    </p>
                  </div>
                )}
                {selectedSpace.spaceUri && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Space URI
                    </label>
                    <p className="text-[var(--text-primary)] mt-1 font-mono text-xs break-all">
                      {selectedSpace.spaceUri}
                    </p>
                  </div>
                )}
              </div>

              {selectedSpace.accessSettings && (
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Access Settings
                  </label>
                  <p className="text-[var(--text-primary)] mt-1 text-sm">
                    {selectedSpace.accessSettings.accessState && (
                      <span>Access State: {selectedSpace.accessSettings.accessState}</span>
                    )}
                    {selectedSpace.accessSettings.audience && (
                      <span className="ml-3">Audience: {selectedSpace.accessSettings.audience}</span>
                    )}
                  </p>
                </div>
              )}

              {selectedSpace.spaceDetails?.description && (
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Description
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedSpace.spaceDetails.description}
                  </p>
                </div>
              )}

              {selectedSpace.spaceDetails?.guidelines && (
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Guidelines
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedSpace.spaceDetails.guidelines}
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end">
              <button
                onClick={() => setShowViewDetailsDialog(false)}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Space Dialog */}
      {showUpdateDialog && selectedSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Update Space Details
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Space Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Name{" "}
                  {selectedSpace.spaceType === "SPACE" ? "" : "(read-only)"}
                </label>
                <input
                  type="text"
                  value={updateSpaceName}
                  onChange={(e) => setUpdateSpaceName(e.target.value)}
                  disabled={selectedSpace.spaceType !== "SPACE" || updating}
                  placeholder="Enter space name"
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {selectedSpace.spaceType !== "SPACE" && (
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Display names cannot be updated for{" "}
                    {getSpaceTypeLabel(selectedSpace.spaceType)} types
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Description
                </label>
                <textarea
                  value={updateSpaceDescription}
                  onChange={(e) => setUpdateSpaceDescription(e.target.value)}
                  disabled={updating}
                  placeholder="Enter description"
                  rows={4}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUpdateDialog(false);
                  setUpdateSpaceName("");
                  setUpdateSpaceDescription("");
                }}
                disabled={updating}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSpaceSubmit}
                disabled={updating}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && selectedSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Delete Space
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <span className="text-xl">⚠️</span>
                </div>
                <div className="flex-1">
                  <p className="text-[var(--text-primary)] mb-2">
                    Are you sure you want to delete{" "}
                    <span className="font-semibold">
                      "{selectedSpace.displayName || "this space"}"
                    </span>
                    ?
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    This action cannot be undone. All messages, members, and
                    space data will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Space</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      {showRemoveMemberConfirm && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                {selectedMember.state === "INVITED"
                  ? "Cancel Invitation"
                  : "Remove Member"}
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <span className="text-xl">⚠️</span>
                </div>
                <div className="flex-1">
                  <p className="text-[var(--text-primary)] mb-2">
                    Are you sure you want to{" "}
                    {selectedMember.state === "INVITED"
                      ? "cancel the invitation for"
                      : "remove"}{" "}
                    <span className="font-semibold">
                      {selectedMember.member?.displayName ||
                        selectedMember.member?.name ||
                        "this member"}
                    </span>
                    ?
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {selectedMember.state === "INVITED"
                      ? "The invitation will be cancelled and the user will not be able to join this space."
                      : "This member will be removed from the space and will lose access to all messages and resources."}
                  </p>
                </div>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => setShowRemoveMemberConfirm(false)}
                disabled={removingMember}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveMember}
                disabled={removingMember}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {removingMember ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>
                      {selectedMember.state === "INVITED"
                        ? "Cancelling..."
                        : "Removing..."}
                    </span>
                  </>
                ) : (
                  <span>
                    {selectedMember.state === "INVITED"
                      ? "Cancel Invitation"
                      : "Remove Member"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Members Dialog */}
      {showMembersDialog && selectedSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-color)] max-h-[80vh] flex flex-col">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Manage Members - {selectedSpace.displayName}
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedSpace.name}]</span>
              </h2>
              <button
                onClick={() => setShowAddMemberDialog(true)}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <span>➕</span>
                <span>Add Member</span>
              </button>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 flex-1 overflow-y-auto">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] py-8">
                  No members found
                </p>
              ) : (
                <div className="space-y-2">
                  {members.map((membership) => (
                    <div
                      key={membership.name}
                      onClick={() => handleViewMemberDetails(membership)}
                      className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[#0D9488] hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-2xl">
                          {membership.member?.type === "BOT" ? "🤖" : "👤"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--text-primary)] truncate">
                            {membership.member?.displayName ||
                              membership.member?.name ||
                              "Unknown"}
                            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{membership.name}]</span>
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                            <span>{membership.role || "ROLE_MEMBER"}</span>
                            <span>•</span>
                            <span>{membership.state || "JOINED"}</span>
                            {membership.member?.type && (
                              <>
                                <span>•</span>
                                <span>{membership.member.type}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-[var(--text-tertiary)]">›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end">
              <button
                onClick={() => setShowMembersDialog(false)}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Dialog */}
      {showAddMemberDialog && selectedSpace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Add Member
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Member Email */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  User ID or Email *
                </label>
                <input
                  type="text"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  disabled={addingMember}
                  placeholder="e.g., user@example.com or user_id"
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Enter the user ID or email address
                </p>
              </div>

              {/* Member Role */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) =>
                    setNewMemberRole(
                      e.target.value as "ROLE_MEMBER" | "ROLE_MANAGER"
                    )
                  }
                  disabled={addingMember}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] disabled:opacity-50"
                >
                  <option value="ROLE_MEMBER">Member</option>
                  <option value="ROLE_MANAGER">Manager</option>
                </select>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddMemberDialog(false);
                  setNewMemberEmail("");
                  setNewMemberRole("ROLE_MEMBER");
                }}
                disabled={addingMember}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={addingMember || !newMemberEmail.trim()}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addingMember ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add Member</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Details Dialog */}
      {showMemberDetailsDialog && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-color)] max-h-[80vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-primary)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Member Details
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedMember.name}]</span>
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 space-y-6">
              {/* Member Info Card */}
              <div className="flex items-center gap-4 p-4 bg-[var(--bg-secondary)] rounded-lg">
                <span className="text-4xl">
                  {selectedMember.member?.type === "BOT" ? "🤖" : "👤"}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {selectedMember.member?.displayName ||
                      selectedMember.member?.name ||
                      "Unknown"}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {selectedMember.member?.name}
                  </p>
                </div>
              </div>

              {/* Member Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Resource Name
                  </label>
                  <p className="text-[var(--text-primary)] mt-1 break-all">
                    {selectedMember.name}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    State
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedMember.state || "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Type
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedMember.member?.type || "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Domain ID
                  </label>
                  <p className="text-[var(--text-primary)] mt-1">
                    {selectedMember.member?.domainId || "N/A"}
                  </p>
                </div>

                {selectedMember.createTime && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Joined
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {new Date(selectedMember.createTime).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Role Management */}
              <div className="border-t border-[var(--border-color)] pt-4">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                  Role
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedMember.role || "ROLE_MEMBER"}
                    onChange={(e) =>
                      handleUpdateMemberRole(
                        e.target.value as "ROLE_MEMBER" | "ROLE_MANAGER"
                      )
                    }
                    disabled={updatingRole}
                    className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] disabled:opacity-50"
                  >
                    <option value="ROLE_MEMBER">Member</option>
                    <option value="ROLE_MANAGER">Manager</option>
                  </select>
                  {updatingRole && (
                    <div className="w-5 h-5 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                  )}
                </div>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  Managers can modify space settings and manage members
                </p>
              </div>

              {/* Danger Zone */}
              {selectedMember.state !== "NOT_A_MEMBER" && (
                <div className="border-t border-[var(--border-color)] pt-4">
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                    Danger Zone
                  </label>
                  <button
                    onClick={handleRemoveMember}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🗑️</span>
                    <span>
                      {selectedMember.state === "INVITED"
                        ? "Cancel Invitation"
                        : "Remove Member"}
                    </span>
                  </button>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    {selectedMember.state === "INVITED"
                      ? "This will cancel the invitation to this space"
                      : "This will remove the member from the space"}
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-primary)] flex justify-end">
              <button
                onClick={() => {
                  setShowMemberDetailsDialog(false);
                  setSelectedMember(null);
                }}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Details Dialog */}
      {showMessageDetailsDialog && selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-color)] max-h-[80vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-primary)] z-10">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Message Details
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedMessage.name}]</span>
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="p-6 space-y-4">
              {/* Sender Info */}
              <div>
                <label className="text-sm font-medium text-[var(--text-tertiary)]">
                  Sender
                </label>
                <p className="text-[var(--text-primary)] mt-1">
                  {selectedMessage.sender?.displayName ||
                    selectedMessage.sender?.name ||
                    "Unknown User"}
                </p>
              </div>

              {/* Created Time */}
              <div>
                <label className="text-sm font-medium text-[var(--text-tertiary)]">
                  Sent
                </label>
                <p className="text-[var(--text-primary)] mt-1">
                  {selectedMessage.createTime
                    ? new Date(selectedMessage.createTime).toLocaleString()
                    : "Unknown"}
                </p>
              </div>

              {/* Last Update Time */}
              {selectedMessage.lastUpdateTime &&
                selectedMessage.lastUpdateTime !==
                  selectedMessage.createTime && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-tertiary)]">
                      Last Edited
                    </label>
                    <p className="text-[var(--text-primary)] mt-1">
                      {new Date(
                        selectedMessage.lastUpdateTime
                      ).toLocaleString()}
                    </p>
                  </div>
                )}

              {/* Thread Read State */}
              <div>
                <label className="text-sm font-medium text-[var(--text-tertiary)]">
                  Thread Read State
                  {threadReadState?.name && (
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{threadReadState.name}]</span>
                  )}
                </label>
                <p className="text-[var(--text-primary)] mt-1">
                  {getThreadReadStateDisplay(selectedMessage)}
                </p>
              </div>

              {/* Message Content */}
              <div>
                <label className="text-sm font-medium text-[var(--text-tertiary)] mb-2 flex items-center justify-between">
                  <span>Message</span>
                  {!editingMessage && (
                    <button
                      onClick={() => setEditingMessage(true)}
                      className="text-xs text-[#0D9488] hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </label>
                {editingMessage ? (
                  <div className="space-y-3">
                    <textarea
                      value={editMessageText}
                      onChange={(e) => setEditMessageText(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488] min-h-[100px]"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePatchMessage}
                        onChange={(e) => setUsePatchMessage(e.target.checked)}
                        className="w-4 h-4 text-[#0D9488] rounded"
                      />
                      <span className="text-xs text-[var(--text-secondary)]">
                        Use patch_message (partial update)
                      </span>
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingMessage(false);
                          setEditMessageText(selectedMessage.text || "");
                        }}
                        disabled={updatingMessage}
                        className="px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpdateMessage}
                        disabled={updatingMessage || !editMessageText.trim()}
                        className="px-3 py-1.5 text-sm bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {updatingMessage ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Save</span>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[var(--text-primary)] mt-1 whitespace-pre-wrap break-words bg-[var(--bg-secondary)] p-3 rounded-lg">
                    {selectedMessage.text || "(No content)"}
                  </p>
                )}
              </div>

              {/* Attachments */}
              {selectedMessage.attachment && selectedMessage.attachment.length > 0 && !editingMessage && (
                <div>
                  <label className="text-sm font-medium text-[var(--text-tertiary)]">
                    Attachments
                  </label>
                  <div className="mt-2 space-y-2">
                    {selectedMessage.attachment.map((att: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-[var(--bg-secondary)] rounded-lg">
                        <span className="text-lg">📎</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-primary)] truncate">
                            {att.contentName || att.name || "Attachment"}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {att.contentType || "Unknown type"}
                          </p>
                        </div>
                        <button
                          onClick={() => handleViewAttachmentDetail(att, selectedMessage)}
                          className="px-2 py-1 text-xs text-[#0D9488] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                          title="View attachment details"
                        >
                          Details
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              {!editingMessage && (
                <div className="border-t border-[var(--border-color)] pt-4 mt-6">
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                    Danger Zone
                  </label>
                  <button
                    onClick={handleDeleteMessage}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🗑️</span>
                    <span>Delete Message</span>
                  </button>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    This will permanently delete the message
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-primary)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setReplyTargetMessage(selectedMessage);
                  setShowMessageDetailsDialog(false);
                  setSelectedMessage(null);
                  setEditingMessage(false);
                  setThreadReadState(null);
                  setThreadReadStateError(null);
                  setThreadReadStateLoading(false);
                }}
                className="px-4 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors"
              >
                Reply to thread
              </button>
              <button
                onClick={() => {
                  setShowMessageDetailsDialog(false);
                  setSelectedMessage(null);
                  setEditingMessage(false);
                  setThreadReadState(null);
                  setThreadReadStateError(null);
                  setThreadReadStateLoading(false);
                }}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirmation Dialog */}
      {showDeleteMessageConfirm && selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Delete Message
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <span className="text-xl">⚠️</span>
                </div>
                <div className="flex-1">
                  <p className="text-[var(--text-primary)] mb-2">
                    Are you sure you want to delete this message?
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    This action cannot be undone. The message will be
                    permanently removed from the conversation.
                  </p>
                </div>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteMessageConfirm(false)}
                disabled={deletingMessage}
                className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteMessage}
                disabled={deletingMessage}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingMessage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Message</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Detail Dialog */}
      {showAttachmentDetailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Attachment Details
                {attachmentDetail?.name && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachmentDetail.name}]</span>
                )}
              </h2>
            </div>
            <div className="px-6 py-4">
              {loadingAttachmentDetail ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : attachmentDetail?.error ? (
                <p className="text-red-500 text-sm">{attachmentDetail.error}</p>
              ) : attachmentDetail ? (
                <div className="space-y-3">
                  {attachmentDetail.name && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Resource Name</label>
                      <p className="text-sm text-[var(--text-primary)] font-mono break-all">{attachmentDetail.name}</p>
                    </div>
                  )}
                  {attachmentDetail.contentName && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">File Name</label>
                      <p className="text-sm text-[var(--text-primary)]">{attachmentDetail.contentName}</p>
                    </div>
                  )}
                  {attachmentDetail.contentType && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Content Type</label>
                      <p className="text-sm text-[var(--text-primary)]">{attachmentDetail.contentType}</p>
                    </div>
                  )}
                  {attachmentDetail.source && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Source</label>
                      <p className="text-sm text-[var(--text-primary)]">{attachmentDetail.source}</p>
                    </div>
                  )}
                  {attachmentDetail.downloadUri && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Download URI</label>
                      <p className="text-sm text-[var(--text-primary)] break-all">{attachmentDetail.downloadUri}</p>
                    </div>
                  )}
                  {attachmentDetail.thumbnailUri && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Thumbnail URI</label>
                      <p className="text-sm text-[var(--text-primary)] break-all">{attachmentDetail.thumbnailUri}</p>
                    </div>
                  )}
                  {attachmentDetail.attachmentDataRef && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Attachment Data Ref</label>
                      <pre className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(attachmentDetail.attachmentDataRef, null, 2)}
                      </pre>
                    </div>
                  )}
                  {attachmentDetail.driveDataRef && (
                    <div>
                      <label className="text-xs font-medium text-[var(--text-tertiary)]">Drive Data Ref</label>
                      <pre className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(attachmentDetail.driveDataRef, null, 2)}
                      </pre>
                      {openWindow && attachmentDetail.driveDataRef.driveFileId && (
                        <button
                          onClick={async () => {
                            try {
                              const mod = await import('../../gridwell_drive/frontend/App.tsx');
                              const GridwellDriveApp = mod.default;
                              openWindow({
                                id: `gridwell_drive-from-chat-${attachmentDetail.driveDataRef.driveFileId}`,
                                title: 'GridwellDrive',
                                content: <GridwellDriveApp onClose={() => {}} />,
                                width: 1400,
                                height: 800,
                              });
                            } catch (err) {
                              console.error('Failed to open GridwellDrive:', err);
                            }
                          }}
                          className="mt-2 px-4 py-2 text-sm bg-white border border-[#0D9488] text-[#0D9488] rounded-lg hover:bg-[#F0FDFA] transition-colors"
                        >
                          Open in GridwellDrive
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[var(--text-secondary)] text-sm">No details available</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end">
              <button
                onClick={() => {
                  setShowAttachmentDetailDialog(false);
                  setAttachmentDetail(null);
                }}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Indicator */}
      {uploadingAttachments && (
        <div className="fixed top-4 right-4 z-50 bg-white shadow-xl rounded-lg p-4 flex items-center gap-3 border border-gray-200">
          <svg
            className="animate-spin h-5 w-5 text-teal-500"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            Uploading attachments...
          </span>
        </div>
      )}

      {/* Notification Settings Dialog */}
      {showNotificationSettingsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Notification Settings
                {notificationSettings?.name && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{notificationSettings.name}]</span>
                )}
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {loadingNotificationSettings ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : notificationSettingsError ? (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <span className="text-xl">❌</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[var(--text-primary)] font-medium mb-1">
                      Error loading settings
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {notificationSettingsError}
                    </p>
                  </div>
                </div>
              ) : notificationSettings ? (
                <div className="space-y-6">
                  {/* Resource Name */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Resource Name
                    </label>
                    <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-secondary)] p-3 rounded-lg break-all">
                      {notificationSettings.name}
                    </p>
                  </div>

                  {/* Notification Setting */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                      Notification Level
                    </label>
                    {editingNotificationSettings ? (
                      <div className="space-y-2">
                        <select
                          value={pendingNotificationSettings?.notificationSetting || ""}
                          onChange={(e) => {
                            if (pendingNotificationSettings) {
                              setPendingNotificationSettings({
                                ...pendingNotificationSettings,
                                notificationSetting: e.target.value,
                              });
                            }
                          }}
                          disabled={updatingNotificationSettings}
                          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
                        >
                          <option value="ALL">All Messages</option>
                          <option value="MAIN_CONVERSATIONS">Main Conversations</option>
                          <option value="FOR_YOU">For You</option>
                          <option value="OFF">Off</option>
                        </select>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {pendingNotificationSettings?.notificationSetting === "ALL"
                            ? "You'll be notified about all messages in this space."
                            : pendingNotificationSettings?.notificationSetting ===
                                "MAIN_CONVERSATIONS"
                            ? "You'll be notified only about main conversation messages."
                            : pendingNotificationSettings?.notificationSetting === "FOR_YOU"
                            ? "You'll be notified only about messages directed at you."
                            : "You won't receive notifications from this space."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {notificationSettings.notificationSetting === "ALL"
                                ? "All Messages"
                                : notificationSettings.notificationSetting ===
                                    "MAIN_CONVERSATIONS"
                                ? "Main Conversations"
                                : notificationSettings.notificationSetting ===
                                    "FOR_YOU"
                                ? "For You"
                                : "Off"}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {notificationSettings.notificationSetting === "ALL"
                            ? "You'll be notified about all messages in this space."
                            : notificationSettings.notificationSetting ===
                                "MAIN_CONVERSATIONS"
                            ? "You'll be notified only about main conversation messages."
                            : notificationSettings.notificationSetting === "FOR_YOU"
                            ? "You'll be notified only about messages directed at you."
                            : "You won't receive notifications from this space."}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Mute Setting */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                      Mute Status
                    </label>
                    {editingNotificationSettings ? (
                      <div className="space-y-2">
                        <select
                          value={pendingNotificationSettings?.muteSetting || ""}
                          onChange={(e) => {
                            if (pendingNotificationSettings) {
                              setPendingNotificationSettings({
                                ...pendingNotificationSettings,
                                muteSetting: e.target.value,
                              });
                            }
                          }}
                          disabled={updatingNotificationSettings}
                          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
                        >
                          <option value="MUTED">Muted</option>
                          <option value="UNMUTED">Unmuted</option>
                        </select>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {pendingNotificationSettings?.muteSetting === "MUTED"
                            ? "All notifications from this space are muted."
                            : "Notifications from this space are active."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {notificationSettings.muteSetting === "MUTED"
                                ? "Muted"
                                : "Unmuted"}
                            </p>
                          </div>
                          <span className="text-2xl">
                            {notificationSettings.muteSetting === "MUTED"
                              ? "🔇"
                              : "🔔"}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {notificationSettings.muteSetting === "MUTED"
                            ? "All notifications from this space are muted."
                            : notificationSettings.muteSetting === "UNMUTED"
                            ? "Notifications from this space are active."
                            : "Mute status is not specified."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              {editingNotificationSettings ? (
                <>
                  <button
                    onClick={handleCancelEditNotificationSettings}
                    disabled={updatingNotificationSettings}
                    className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateNotificationSettings}
                    disabled={updatingNotificationSettings}
                    className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {updatingNotificationSettings && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingNotificationSettings(true);
                      if (notificationSettings) {
                        setPendingNotificationSettings({
                          notificationSetting: notificationSettings.notificationSetting,
                          muteSetting: notificationSettings.muteSetting,
                        });
                      }
                    }}
                    className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => {
                      setShowNotificationSettingsDialog(false);
                      setNotificationSettings(null);
                      setNotificationSettingsError(null);
                      setEditingNotificationSettings(false);
                      setPendingNotificationSettings(null);
                    }}
                    className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Space Read State Dialog */}
      {showSpaceReadStateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-lg w-full max-w-md max-h-96 flex flex-col">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Space Read State
                {spaceReadState?.name && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{spaceReadState.name}]</span>
                )}
              </h2>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingSpaceReadState ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-[var(--border-color)] border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : spaceReadStateError ? (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-500">{spaceReadStateError}</p>
                </div>
              ) : spaceReadState ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">
                      Resource Name
                    </label>
                    <p className="text-sm text-[var(--text-primary)] break-all font-mono bg-[var(--bg-secondary)] p-2 rounded">
                      {spaceReadState.name}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                      Last Read Time
                    </label>
                    <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {spaceReadState.lastReadTime
                            ? formatUtcTime(spaceReadState.lastReadTime)
                            : "Not set"}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {spaceReadState.lastReadTime
                            ? `Raw: ${spaceReadState.lastReadTime}`
                            : "No read state recorded yet"}
                        </p>
                      </div>
                      <span className="text-2xl">📖</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSpaceReadStateDialog(false);
                  setSpaceReadState(null);
                  setSpaceReadStateError(null);
                }}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* In-App Attach File Dialog */}
      {showAttachDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-md mx-4 border border-[var(--border-color)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Attach File
              </h3>
              <button
                onClick={dismissAttachDialog}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  File Name
                </label>
                <input
                  type="text"
                  value={attachFileName}
                  onChange={(e) => setAttachFileName(e.target.value)}
                  placeholder="e.g. document.pdf, image.png"
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAttachmentFromDialog();
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  MIME Type
                </label>
                <select
                  value={attachFileMimeType}
                  onChange={(e) => setAttachFileMimeType(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                >
                  <option value="application/octet-stream">Binary (application/octet-stream)</option>
                  <option value="application/pdf">PDF (application/pdf)</option>
                  <option value="image/png">PNG Image (image/png)</option>
                  <option value="image/jpeg">JPEG Image (image/jpeg)</option>
                  <option value="text/plain">Text (text/plain)</option>
                  <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">Word Document (.docx)</option>
                  <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">Excel Spreadsheet (.xlsx)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
              <button
                onClick={dismissAttachDialog}
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAttachmentFromDialog}
                disabled={!attachFileName.trim()}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Attachment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Download Preview Dialog */}
      {showDownloadPreview && downloadPreviewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl w-full max-w-lg mx-4 border border-[var(--border-color)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Downloaded: {downloadPreviewLabel}
              </h3>
              <button
                onClick={dismissDownloadPreview}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {downloadPreviewData.contentName && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-[var(--text-tertiary)]">File Name</label>
                  <p className="text-sm text-[var(--text-primary)]">{downloadPreviewData.contentName}</p>
                </div>
              )}
              {downloadPreviewData.contentType && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-[var(--text-tertiary)]">Content Type</label>
                  <p className="text-sm text-[var(--text-primary)]">{downloadPreviewData.contentType}</p>
                </div>
              )}
              {downloadPreviewData.name && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-[var(--text-tertiary)]">Resource Name</label>
                  <p className="text-sm text-[var(--text-primary)] font-mono break-all">{downloadPreviewData.name}</p>
                </div>
              )}
              {downloadPreviewData.downloadUri && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-[var(--text-tertiary)]">Download URI</label>
                  <p className="text-sm text-[var(--text-primary)] break-all">{downloadPreviewData.downloadUri}</p>
                </div>
              )}
              <div className="mb-3">
                <label className="text-xs font-medium text-[var(--text-tertiary)]">Full Response Data</label>
                <pre className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] p-3 rounded-lg overflow-x-auto mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(downloadPreviewData, null, 2)}
                </pre>
              </div>
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  File content retrieved successfully from the playground.
                </p>
              </div>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-[var(--border-color)]">
              <button
                onClick={dismissDownloadPreview}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
