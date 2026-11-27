import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useBackendAPI } from "@shared/hooks/useBackendAPI";

const APP_NAME = "Whatsup";

// =====================================================================================
// TYPES
// =====================================================================================

type BackendCallTool = ReturnType<typeof useBackendAPI>["callTool"];

type SidebarView = "chats" | "contacts" | "calls";

interface Chat {
  chat_jid: string;
  name: string;
  last_message?: string;
  last_message_timestamp?: string;
  unread_count?: number;
  last_active_timestamp?: string;
  is_archived?: boolean;
  is_pinned?: boolean;
  is_muted_until?: string | null;
  is_demo?: boolean;
  is_local?: boolean;
  last_interaction_time?: string;
}

interface Message {
  message_id: string;
  sender_name: string;
  text_content: string;
  timestamp: string;
  is_outgoing: boolean;
  status?: string;
  media_info?: {
    media_type: string;
    file_name?: string;
    caption?: string;
    preview_url?: string;
    simulated_local_path?: string;
  };
}

interface ContextMessage {
  id: string;
  timestamp: number;
  sender_id: string;
  chat_id: string;
  content_type: string;
  text_content?: string | null;
  media_caption?: string | null;
  is_sent_by_me: boolean;
  status: string;
  replied_to_message_id?: string | null;
  forwarded?: boolean | null;
}

interface MessageContextResponse {
  target_message: ContextMessage;
  messages_before: ContextMessage[];
  messages_after: ContextMessage[];
}

interface Contact {
  jid: string;
  name_in_address_book?: string | null;
  profile_name?: string | null;
  phone_number?: string | null;
  is_whatsup_user: boolean;
}

interface CallEntry {
  id: string;
  contactName: string;
  phoneNumber?: string | null;
  timestamp: string;
  isVideo: boolean;
  status: "completed" | "missed";
  isDemo?: boolean;
}

interface GroupParticipant {
  jid: string;
  name_in_address_book?: string | null;
  profile_name?: string | null;
  is_admin: boolean;
}

interface GroupMetadata {
  group_description?: string | null;
  creation_timestamp?: string | null;
  owner_jid?: string | null;
  participants_count: number;
  participants: GroupParticipant[];
}

interface OpenWindowConfig {
  id: string;
  title: string;
  content: React.ReactNode;
  width?: number;
  height?: number;
}

interface AppProps {
  onClose: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
  openWindow?: (config: OpenWindowConfig) => void;
}

interface UiState {
  newChatMode: boolean;
  newCallMode: boolean;
  addContactOpen: boolean;
  settingsOpen: boolean;
  archiveInfoOpen: boolean;
  // Mute modal state
  muteModalOpen: boolean;
  muteModalChat: Chat | null;
  // Block modal state
  blockModalOpen: boolean;
  blockModalContact: Contact | null;
  blockModalIsBlocked: boolean;
}

// =====================================================================================
// CONSTANTS
// =====================================================================================

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const DEMO_BASE_TIME = Date.now();
const DEMO_TIMESTAMP = new Date(DEMO_BASE_TIME).toISOString();
const DEMO_OLD_TIMESTAMP = new Date(
  DEMO_BASE_TIME - 3600 * 1000,
).toISOString();
const DEMO_IMAGE_PREVIEW = (() => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#A78BFA"/>
          <stop offset="100%" stop-color="#7C3AED"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#g)"/>
      <circle cx="620" cy="140" r="60" fill="rgba(255,255,255,0.25)"/>
      <rect x="120" y="150" width="560" height="240" rx="24" fill="rgba(0,0,0,0.2)"/>
      <text x="400" y="285" text-anchor="middle" font-size="28" fill="#FFFFFF" font-family="Arial, sans-serif">
        Demo Image Preview
      </text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
})();
const MESSAGE_FETCH_LIMIT = 200;

const DEMO_CHAT: Chat = {
  chat_jid: "demo-chat",
  name: "Demo Chat",
  last_message: "Tap to explore media examples",
  is_pinned: true,
  unread_count: 0,
  is_demo: true,
};
const DEMO_ARCHIVED_CHATS: Chat[] = [
  {
    chat_jid: "demo-archived-1",
    name: "Archived Demo",
    last_message: "This chat is archived for preview",
    last_message_timestamp: DEMO_TIMESTAMP,
    is_archived: true,
    unread_count: 0,
    is_demo: true,
  },
  {
    chat_jid: "demo-archived-2",
    name: "Old Project",
    last_message: "Archived example conversation",
    last_message_timestamp: DEMO_TIMESTAMP,
    is_archived: true,
    unread_count: 0,
    is_demo: true,
  },
];
const DEMO_MESSAGES: Message[] = [
  {
    message_id: "demo-1",
    sender_name: "Alex Demo",
    text_content: "Welcome to the demo chat! 👋",
    timestamp: DEMO_TIMESTAMP,
    is_outgoing: false,
  },
  {
    message_id: "demo-2",
    sender_name: "You",
    text_content: "Here are a few media examples.",
    timestamp: DEMO_TIMESTAMP,
    is_outgoing: true,
    status: "read",
  },
  {
    message_id: "demo-3",
    sender_name: "Alex Demo",
    text_content: "",
    timestamp: DEMO_TIMESTAMP,
    is_outgoing: false,
    media_info: {
      media_type: "image",
      file_name: "sample-image.jpg",
      caption: "A sample image attachment",
      preview_url: DEMO_IMAGE_PREVIEW,
    },
  },
  {
    message_id: "demo-4",
    sender_name: "You",
    text_content: "",
    timestamp: DEMO_TIMESTAMP,
    is_outgoing: true,
    status: "delivered",
    media_info: {
      media_type: "document",
      file_name: "proposal.pdf",
      caption: "Demo PDF attachment",
    },
  },
];
const DEMO_CALLS: CallEntry[] = [
  {
    id: "demo-call-1",
    contactName: "Demo Contact",
    phoneNumber: "+15551234567",
    timestamp: DEMO_TIMESTAMP,
    isVideo: false,
    status: "completed",
    isDemo: true,
  },
  {
    id: "demo-call-2",
    contactName: "Video Preview",
    phoneNumber: "+15559876543",
    timestamp: DEMO_OLD_TIMESTAMP,
    isVideo: true,
    status: "completed",
    isDemo: true,
  },
];

// =====================================================================================
// UTILITIES
// =====================================================================================

function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInSeconds = Math.floor(
    (now.getTime() - messageTime.getTime()) / 1000,
  );

  if (diffInSeconds < 60) {
    return "Just now";
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  } else {
    return messageTime.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

function getMediaIconName(mediaType?: string): IconName {
  if (mediaType === "image") return "image";
  if (mediaType === "video") return "video";
  if (mediaType === "audio") return "audio";
  return "attachment";
}

function getPublicPreviewUrl(simulatedPath?: string): string | null {
  if (!simulatedPath) return null;
  const marker = "/public/";
  const index = simulatedPath.indexOf(marker);
  if (index === -1) return null;
  const publicPath = simulatedPath.slice(index + marker.length);
  if (!publicPath) return null;
  return `/${publicPath.replace(/^\/+/, "")}`;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatMessageTime(timestamp: string): string {
  const messageTime = new Date(timestamp);
  return messageTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatContextTime(timestamp: number): string {
  const messageTime = new Date(timestamp * 1000);
  return messageTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChatTimestamp(timestamp?: string): string | null {
  if (!timestamp) return null;
  const messageTime = new Date(timestamp);
  if (Number.isNaN(messageTime.getTime())) return null;

  const now = new Date();
  const isSameDay = now.toDateString() === messageTime.toDateString();
  if (isSameDay) {
    return messageTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return messageTime.toLocaleDateString([], { month: "short", day: "numeric" });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getContextPreviewText(message: ContextMessage): string {
  if (message.content_type === "text") {
    return message.text_content || "[Empty message]";
  }

  if (message.media_caption) {
    return message.media_caption;
  }

  return `[${message.content_type}]`;
}

function getContactDisplayName(contact: Contact): string {
  return (
    contact.name_in_address_book ||
    contact.profile_name ||
    contact.phone_number ||
    contact.jid
  );
}

function getContactSearchText(contact: Contact): string {
  return [
    contact.name_in_address_book,
    contact.profile_name,
    contact.phone_number,
    contact.jid,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getPhoneNumberFromChatJid(chatJid?: string): string | null {
  if (!chatJid) return null;
  if (chatJid.includes("@g.us")) return null;
  const raw = chatJid.split("@")[0] || "";
  const digits = raw.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function mapChatFromApi(chat: any): Chat {
  return {
    chat_jid: chat.chat_jid,
    name: chat.name || "Unknown",
    last_message: chat.last_message_preview?.text_snippet,
    last_message_timestamp: chat.last_message_preview?.timestamp,
    unread_count: Number.isFinite(Number(chat.unread_count))
      ? Number(chat.unread_count)
      : 0,
    last_active_timestamp: chat.last_active_timestamp,
    is_archived: chat.is_archived,
    is_pinned: chat.is_pinned,
  };
}

function mapMessageFromApi(msg: any): Message {
  return {
    message_id: msg.message_id,
    sender_name: msg.sender_name || "Unknown",
    text_content: msg.text_content || "",
    timestamp: msg.timestamp,
    is_outgoing: msg.is_outgoing || false,
    status: msg.status,
    media_info: msg.media_info,
  };
}

function createLocalMessage(prefix: string, text: string): Message {
  return {
    message_id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sender_name: "You",
    text_content: text.trim(),
    timestamp: new Date().toISOString(),
    is_outgoing: true,
    status: "sent",
  };
}

function sortChatsByPriority(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }

    const aTimestamp = a.last_active_timestamp || a.last_message_timestamp;
    const bTimestamp = b.last_active_timestamp || b.last_message_timestamp;
    const aTime = aTimestamp ? new Date(aTimestamp).getTime() : 0;
    const bTime = bTimestamp ? new Date(bTimestamp).getTime() : 0;

    return bTime - aTime;
  });
}

// =====================================================================================
// HOOKS
// =====================================================================================

function useRefreshHandler(
  setRefreshHandler: AppProps["setRefreshHandler"],
  refreshFn: () => void,
  debounceMs: number = 150,
) {
  const refreshRef = useRef(refreshFn);
  const setRefreshHandlerRef = useRef(setRefreshHandler);
  const debounceMsRef = useRef(debounceMs);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    refreshRef.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler;
  }, [setRefreshHandler]);

  useEffect(() => {
    debounceMsRef.current = debounceMs;
  }, [debounceMs]);

  useEffect(() => {
    if (!setRefreshHandlerRef.current) return;

    setRefreshHandlerRef.current(() => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        refreshRef.current();
      }, debounceMsRef.current);
    });
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setRefreshHandlerRef.current?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function useModalAutoFocus<T extends HTMLElement>(isOpen: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isOpen) {
      ref.current?.focus();
    }
  }, [isOpen]);

  return ref;
}

function useEscToClose(isEnabled: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled]);
}

function useWhatsupData() {
  const { callTool } = useBackendAPI("whatsup");
  const [chats, setChats] = useState<Chat[]>([]);
  const [mutedByChat, setMutedByChat] = useState<Record<string, string | null>>(
    {},
  );
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mutedFetchRef = useRef<Set<string>>(new Set());
  const mutedFailedRef = useRef<Set<string>>(new Set());

  // Keep ref in sync for use in stable callbacks
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const loadChats = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent;
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const chatsResult = await callTool<{ chats?: any[] }>("list_chats", {
          sort_by: "last_active",
          include_last_message: true,
        });
        const transformedChats = (chatsResult?.chats || []).map(mapChatFromApi);

        // Fetch last interaction time for each chat (batch in groups of 5)
        const chatBatches = chunkArray(transformedChats, 5);
        for (const batch of chatBatches) {
          await Promise.all(
            batch.map(async (chat: Chat) => {
              try {
                const result = await callTool<{ last_interaction_time?: string }>(
                  "get_last_interaction",
                  { jid: chat.chat_jid },
                );
                if (result?.last_interaction_time) {
                  chat.last_interaction_time = result.last_interaction_time;
                }
              } catch {
                // Ignore per-chat failures
              }
            }),
          );
        }

        setChats(transformedChats);
      } catch (err) {
        console.error("Load chats failed:", err);
        setError(GENERIC_ERROR_MESSAGE);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [callTool],
  );

  const loadMessages = useCallback(
    async (chat: Chat) => {
      try {
        setSelectedChat(chat);
        const messagesResult = await callTool<{ results?: any[] }>(
          "list_messages",
          {
            chat_jid: chat.chat_jid,
            include_context: false,
            limit: MESSAGE_FETCH_LIMIT,
          },
        );

        const transformedMessages = (messagesResult?.results || []).map(
          mapMessageFromApi,
        );

        // Merge: keep locally-sent messages that weren't returned by the API
        setMessages((prev) => {
          const apiIds = new Set(transformedMessages.map((m: Message) => m.message_id));
          const localSent = prev.filter(
            (m) => m.message_id.startsWith("sent-") && !apiIds.has(m.message_id),
          );
          const merged = [...transformedMessages, ...localSent];
          // Sort by timestamp to ensure consistent ordering and correct isLast
          merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          return merged;
        });
        return transformedMessages;
      } catch (err) {
        console.error("Load messages failed:", err);
        setError(GENERIC_ERROR_MESSAGE);
        return [];
      }
    },
    [callTool],
  );

  const openPlaceholderChat = useCallback((chat: Chat) => {
    setSelectedChat(chat);
    setMessages([]);
    setError(null);
  }, []);

  const addLocalMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const markChatReadOptimistic = useCallback((chatJid: string) => {
    // Optimistically clear unread count on the client until the backend supports mark-read.
    setChats((prev) =>
      prev.map((chat) =>
        chat.chat_jid === chatJid ? { ...chat, unread_count: 0 } : chat,
      ),
    );
    setSelectedChat((prev) =>
      prev && prev.chat_jid === chatJid ? { ...prev, unread_count: 0 } : prev,
    );
  }, []);

  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      await loadChats(options);
      const currentChat = selectedChatRef.current;
      if (currentChat) {
        await loadMessages(currentChat);
      }
    },
    [loadChats, loadMessages],
  );

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    const missingMutedChats = chats.filter(
      (chat) =>
        mutedByChat[chat.chat_jid] === undefined &&
        !mutedFetchRef.current.has(chat.chat_jid) &&
        !mutedFailedRef.current.has(chat.chat_jid),
    );

    if (missingMutedChats.length === 0) return;

    const fetchMutedStatuses = async () => {
      const batches = chunkArray(missingMutedChats, 5);
      for (const batch of batches) {
        await Promise.all(
          batch.map(async (chat) => {
            mutedFetchRef.current.add(chat.chat_jid);
            try {
              const result = await callTool<{ is_muted_until?: string | null }>(
                "get_chat",
                {
                  chat_jid: chat.chat_jid,
                  include_last_message: false,
                },
              );
              setMutedByChat((prev) => ({
                ...prev,
                [chat.chat_jid]: result?.is_muted_until ?? null,
              }));
            } catch (err) {
              mutedFailedRef.current.add(chat.chat_jid);
            } finally {
              mutedFetchRef.current.delete(chat.chat_jid);
            }
          }),
        );
      }
    };

    fetchMutedStatuses();
  }, [callTool, chats, mutedByChat]);

  const orderedChats = useMemo(() => {
    const mergedChats = chats.map((chat) => ({
      ...chat,
      is_muted_until: mutedByChat[chat.chat_jid] ?? null,
    }));
    return sortChatsByPriority(mergedChats);
  }, [chats, mutedByChat]);

  // Sync selectedChat with the latest chat data when chats are reloaded
  const prevOrderedChatsRef = useRef(orderedChats);
  useEffect(() => {
    // Only run when orderedChats actually changes (not when selectedChat changes)
    if (prevOrderedChatsRef.current === orderedChats) return;
    prevOrderedChatsRef.current = orderedChats;

    const current = selectedChatRef.current;
    if (!current) return;

    const updatedChat = orderedChats.find(c => c.chat_jid === current.chat_jid);
    if (updatedChat) {
      if (
        updatedChat.is_pinned !== current.is_pinned ||
        updatedChat.is_muted_until !== current.is_muted_until ||
        updatedChat.is_archived !== current.is_archived
      ) {
        setSelectedChat(prev => prev ? { ...prev, ...updatedChat } : null);
      }
    }
  }, [orderedChats]);

  const updateMutedStatus = useCallback(
    (chatJid: string, mutedUntil: string | null) => {
      setMutedByChat((prev) => ({
        ...prev,
        [chatJid]: mutedUntil,
      }));
    },
    [],
  );

  const updateChatFieldLocal = useCallback(
    (chatJid: string, field: keyof Pick<Chat, "is_pinned" | "is_archived">, value: boolean) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.chat_jid === chatJid ? { ...chat, [field]: value } : chat,
        ),
      );
      setSelectedChat((prev) =>
        prev && prev.chat_jid === chatJid ? { ...prev, [field]: value } : prev,
      );
    },
    [],
  );

  const updateChatPinLocal = useCallback(
    (chatJid: string, pinned: boolean) => updateChatFieldLocal(chatJid, "is_pinned", pinned),
    [updateChatFieldLocal],
  );

  const updateChatArchiveLocal = useCallback(
    (chatJid: string, archived: boolean) => updateChatFieldLocal(chatJid, "is_archived", archived),
    [updateChatFieldLocal],
  );

  const [groupMetadata, setGroupMetadata] = useState<GroupMetadata | null>(null);

  const loadGroupMetadata = useCallback(
    async (chatJid: string) => {
      if (!chatJid.includes("@g.us")) {
        setGroupMetadata(null);
        return;
      }
      try {
        const result = await callTool<{
          is_group?: boolean;
          group_metadata?: GroupMetadata;
        }>("get_chat", {
          chat_jid: chatJid,
          include_last_message: false,
        });
        if (result?.group_metadata) {
          setGroupMetadata(result.group_metadata);
        } else {
          setGroupMetadata(null);
        }
      } catch {
        setGroupMetadata(null);
      }
    },
    [callTool],
  );

  return {
    callTool,
    chats: orderedChats,
    selectedChat,
    messages,
    addLocalMessage,
    loading,
    error,
    loadChats,
    loadMessages,
    openPlaceholderChat,
    markChatReadOptimistic,
    refreshAll,
    updateMutedStatus,
    updateChatPinLocal,
    updateChatArchiveLocal,
    groupMetadata,
    loadGroupMetadata,
  };
}

function useMessageComposer({
  callTool,
  selectedChat,
  onMessageSent,
  onDemoMessageSent,
  onLocalMessageSent,
  isBlocked,
}: {
  callTool: BackendCallTool;
  selectedChat: Chat | null;
  onMessageSent: () => Promise<void> | void;
  onDemoMessageSent?: (message: Message) => void;
  onLocalMessageSent?: (message: Message) => void;
  isBlocked?: boolean;
}) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendMessage = useCallback(async () => {
    if (!selectedChat || !messageText.trim()) return;
    if (isBlocked) {
      setSendError("You cannot send messages to a blocked contact.");
      return;
    }

    // Handle demo and locally-created group messages without calling the backend
    if (selectedChat.is_demo || selectedChat.is_local) {
      setSendError(null);
      const prefix = selectedChat.is_demo ? "demo-local" : "local";
      const msg = createLocalMessage(prefix, messageText);
      const handler = selectedChat.is_demo ? onDemoMessageSent : onLocalMessageSent;
      if (handler) handler(msg);
      setMessageText("");
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const result = await callTool<{
        success?: boolean;
        status_message?: string;
      }>("send_message", {
        recipient: selectedChat.chat_jid,
        message: messageText.trim(),
      });

      if (result?.success) {
        setMessageText("");
        await onMessageSent();
      } else {
        console.error("Send message failed:", result);
        setSendError(GENERIC_ERROR_MESSAGE);
      }
    } catch (err) {
      console.error("Send message error:", err);
      setSendError(GENERIC_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }, [callTool, messageText, onMessageSent, onDemoMessageSent, onLocalMessageSent, selectedChat, isBlocked]);

  return {
    messageText,
    setMessageText,
    sending,
    sendError,
    sendMessage,
  };
}

function useMediaSender({
  callTool,
  selectedChat,
  onMediaSent,
}: {
  callTool: BackendCallTool;
  selectedChat: Chat | null;
  onMediaSent: () => Promise<void> | void;
}) {
  const [mediaPath, setMediaPath] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaMode, setMediaMode] = useState<"file" | "audio">("file");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const toggleMediaOpen = useCallback(() => {
    setMediaOpen((prev) => !prev);
    setMediaError(null);
  }, []);

  const closeMedia = useCallback(() => {
    setMediaOpen(false);
    setMediaError(null);
  }, []);

  const sendMedia = useCallback(async () => {
    if (!selectedChat || !mediaPath.trim()) return;

    setSendingMedia(true);
    setMediaError(null);

    try {
      const recipient = selectedChat.chat_jid;
      const trimmedPath = mediaPath.trim();
      const result =
        mediaMode === "audio"
          ? await callTool<{ success?: boolean }>("send_audio_message", {
              recipient,
              media_path: trimmedPath,
            })
          : await callTool<{ success?: boolean }>("send_file", {
              recipient,
              media_path: trimmedPath,
              caption: caption.trim() || undefined,
            });

      if (result?.success) {
        setMediaPath("");
        setCaption("");
        setMediaOpen(false);
        await onMediaSent();
      } else {
        console.error("Send media failed:", result);
        setMediaError(GENERIC_ERROR_MESSAGE);
      }
    } catch (err) {
      console.error("Send media error:", err);
      setMediaError(GENERIC_ERROR_MESSAGE);
    } finally {
      setSendingMedia(false);
    }
  }, [callTool, selectedChat, mediaPath, caption, mediaMode, onMediaSent]);

  return {
    mediaPath,
    setMediaPath,
    caption,
    setCaption,
    mediaMode,
    setMediaMode,
    mediaOpen,
    toggleMediaOpen,
    closeMedia,
    sendingMedia,
    mediaError,
    sendMedia,
  };
}

function useMediaViewer(callTool: BackendCallTool) {
  const [activeMedia, setActiveMedia] = useState<{
    message: Message;
    chatJid: string;
    isDemo: boolean;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const openMedia = useCallback(
    (message: Message, chatJid: string, isDemo: boolean) => {
      setActiveMedia({ message, chatJid, isDemo });
      setDownloadError(null);
      setDownloadStatus(null);
    },
    [],
  );

  const closeMedia = useCallback(() => {
    setActiveMedia(null);
    setDownloadError(null);
    setDownloadStatus(null);
  }, []);

  const downloadMedia = useCallback(async () => {
    if (!activeMedia) return;

    setDownloading(true);
    setDownloadError(null);
    setDownloadStatus(null);

    const { message, chatJid, isDemo } = activeMedia;
    const fallbackName =
      message.media_info?.file_name || `media-${message.message_id}`;

    if (isDemo) {
      const safeName = fallbackName.replace(/\s+/g, "-");
      const blob = new Blob([`Demo media placeholder for ${fallbackName}.`], {
        type: "text/plain",
      });
      triggerBrowserDownload(blob, safeName);
      setDownloadStatus("Saved demo media to your downloads.");
      setDownloading(false);
      return;
    }

    try {
      const result = await callTool<{
        success?: boolean;
        status_message?: string;
        file_path?: string;
        original_file_name?: string;
      }>("download_media", {
        message_id: message.message_id,
        chat_jid: chatJid,
      });

      if (result?.success) {
        const location = result.file_path
          ? `Saved to ${result.file_path}`
          : "Download complete.";
        setDownloadStatus(location);
      } else {
        console.error("Download media failed:", result);
        setDownloadError(GENERIC_ERROR_MESSAGE);
      }
    } catch (err) {
      console.error("Download media error:", err);
      setDownloadError(GENERIC_ERROR_MESSAGE);
    } finally {
      setDownloading(false);
    }
  }, [activeMedia, callTool]);

  return {
    activeMedia,
    downloading,
    downloadError,
    downloadStatus,
    openMedia,
    closeMedia,
    downloadMedia,
  };
}

// NOTE: This hook is currently unused but kept for future implementation of message search.
// When users search for messages, clicking a search result will use get_message_context
// to show surrounding messages without loading the entire chat history.
// See PLAN.md "Message Context - Better Implementation" section for details.
function useMessageContext(callTool: BackendCallTool) {
  const [contextOpen, setContextOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextData, setContextData] = useState<MessageContextResponse | null>(
    null,
  );

  const openContext = useCallback(
    async (messageId: string) => {
      setContextOpen(true);
      setContextLoading(true);
      setContextError(null);
      try {
        const result = await callTool<MessageContextResponse>(
          "get_message_context",
          {
            message_id: messageId,
            before: 5,
            after: 5,
          },
        );
        setContextData(result || null);
      } catch (err) {
        console.error("Load message context failed:", err);
        setContextError(GENERIC_ERROR_MESSAGE);
      } finally {
        setContextLoading(false);
      }
    },
    [callTool],
  );

  const closeContext = useCallback(() => {
    setContextOpen(false);
    setContextError(null);
  }, []);

  return {
    contextOpen,
    contextLoading,
    contextError,
    contextData,
    openContext,
    closeContext,
  };
}

function useSidebarView() {
  const [activeView, setActiveView] = useState<SidebarView>("chats");

  return {
    activeView,
    setActiveView,
  };
}

function useContacts(callTool: BackendCallTool) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);

  const loadAllContacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const collected = new Map<string, Contact>();

      const addContact = (contact: any) => {
        if (!contact) return;
        const nameFallback =
          contact.name_in_address_book && contact.profile_name
            ? `${contact.name_in_address_book}-${contact.profile_name}`
            : contact.name_in_address_book || contact.profile_name || null;
        const key = contact.jid || contact.phone_number || nameFallback;
        if (!key || collected.has(key)) return;
        collected.set(key, {
          jid: contact.jid || key,
          name_in_address_book: contact.name_in_address_book ?? null,
          profile_name: contact.profile_name ?? null,
          phone_number: contact.phone_number ?? null,
          is_whatsup_user: contact.is_whatsup_user ?? (contact.phone_number ? true : false),
        });
      };

      // Try search_contacts API first
      const querySeeds = [..."abcdefghijklmnopqrstuvwxyz", ..."0123456789", "+"];
      const batches = chunkArray(querySeeds, 5);

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map((seed) =>
            callTool<Contact[]>("search_contacts", { query: seed }),
          ),
        );
        results.forEach((result) => {
          if (result.status !== "fulfilled" || !result.value) return;
          const contacts = Array.isArray(result.value) ? result.value : [];
          contacts.forEach(addContact);
        });
      }

      // Fallback: load contacts directly from DB state if search returned nothing
      if (collected.size === 0) {
        try {
          const response = await fetch("./api/services/whatsup/state");
          if (response.ok) {
            const data = await response.json();
            const contactsDict = data?.state?.contacts;
            if (contactsDict && typeof contactsDict === "object") {
              for (const [key, contactData] of Object.entries(contactsDict)) {
                const c = contactData as any;
                if (!c || typeof c !== "object") continue;
                const wa = c.whatsup || {};
                const names = c.names || [];
                const givenName = names[0]?.givenName || "";
                const familyName = names[0]?.familyName || "";
                const fullName = `${givenName} ${familyName}`.trim();
                const phones = (c.phoneNumbers || []).map((p: any) => p?.value).filter(Boolean);
                const primaryPhone = wa.phone_number || phones[0] || null;
                const jid = wa.jid || (key.startsWith("people/") ? key.slice(7) : key);
                addContact({
                  jid: jid.includes("@") ? jid : null,
                  name_in_address_book: wa.name_in_address_book || fullName || null,
                  profile_name: wa.profile_name || fullName || null,
                  phone_number: primaryPhone,
                  is_whatsup_user: wa.is_whatsup_user ?? (jid.includes("@s.whatsup.net") || !!primaryPhone),
                });
              }
            }
          }
        } catch {
          // Ignore fallback errors
        }
      }

      const sortedContacts = Array.from(collected.values()).sort((a, b) =>
        getContactDisplayName(a).localeCompare(getContactDisplayName(b)),
      );
      setContacts(sortedContacts);
      setHasLoadedAll(true);
      if (sortedContacts.length === 0) {
        setSelectedContact(null);
      }
    } catch (err) {
      console.error("Load contacts failed:", err);
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [callTool]);

  const filteredContacts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return contacts;
    return contacts.filter((contact) =>
      getContactSearchText(contact).includes(trimmed),
    );
  }, [contacts, query]);

  return {
    contacts: filteredContacts,
    hasLoadedAll,
    query,
    setQuery,
    loading,
    error,
    selectedContact,
    setSelectedContact,
    loadAllContacts,
  };
}

function useStartChat(callTool: BackendCallTool) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const isMissingDirectChat = (err: unknown) => {
    if (!(err instanceof Error)) return false;
    return /ContactNotFoundError|No direct chat found/i.test(err.message);
  };

  const startChatWithContact = useCallback(
    async (phoneNumber: string): Promise<string | null> => {
      setStarting(true);
      setStartError(null);

      try {
        const result = await callTool<{ chat_jid?: string }>(
          "get_direct_chat_by_contact",
          {
            sender_phone_number: phoneNumber,
          },
        );

        if (result?.chat_jid) {
          return result.chat_jid;
        } else {
          console.error("Start chat failed:", result);
          setStartError(GENERIC_ERROR_MESSAGE);
          return null;
        }
      } catch (err) {
        if (!isMissingDirectChat(err)) {
          console.error("Start chat error:", err);
          setStartError(GENERIC_ERROR_MESSAGE);
        }
        return null;
      } finally {
        setStarting(false);
      }
    },
    [callTool],
  );

  return {
    starting,
    startError,
    startChatWithContact,
  };
}

type CallStatus = "idle" | "initiating" | "ringing" | "connected" | "ended";
type CallType = "voice" | "video";

interface ActiveCall {
  recipientName: string;
  recipientPhone: string;
  callType: CallType;
  status: CallStatus;
  startTime?: number;
  callId?: string;
}

function useMakeCall(callTool: BackendCallTool) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [callHistory, setCallHistory] = useState<CallEntry[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallEntry | null>(null);

  const initiateCall = useCallback(
    async (
      recipientName: string,
      recipientPhone: string,
      callType: CallType,
    ) => {
      setCallError(null);
      setActiveCall({
        recipientName,
        recipientPhone,
        callType,
        status: "initiating",
      });

      try {
        const result = await callTool<{
          status?: string;
          call_id?: string;
          message?: string;
        }>("make_call", {
          recipient_name: recipientName,
          recipient_phone_number: recipientPhone,
          video_call: callType === "video",
        });

        if (result?.status === "success" || result?.call_id) {
          const callEntry: CallEntry = {
            id: result?.call_id || `call-${Date.now()}`,
            contactName: recipientName,
            phoneNumber: recipientPhone,
            timestamp: new Date().toISOString(),
            isVideo: callType === "video",
            status: "completed",
          };
          setCallHistory((prev) => [callEntry, ...prev]);
          setSelectedCall(callEntry);

          // Simulate call progression: initiating → ringing → connected
          setActiveCall((prev) =>
            prev
              ? { ...prev, status: "ringing", callId: result.call_id }
              : null,
          );

          // After 1 second, move to connected
          setTimeout(() => {
            setActiveCall((prev) =>
              prev
                ? { ...prev, status: "connected", startTime: Date.now() }
                : null,
            );
          }, 1000);
        } else {
          console.error("Make call failed:", result);
          setCallError(GENERIC_ERROR_MESSAGE);
          setActiveCall(null);
        }
      } catch (err) {
        console.error("Make call error:", err);
        setCallError(GENERIC_ERROR_MESSAGE);
        setActiveCall(null);
      }
    },
    [callTool],
  );

  const endCall = useCallback(() => {
    if (activeCall) {
      setActiveCall({ ...activeCall, status: "ended" });
      // Clear call after showing "ended" for 2 seconds
      setTimeout(() => {
        setActiveCall(null);
        setCallError(null);
      }, 2000);
    }
  }, [activeCall]);

  const clearCall = useCallback(() => {
    setActiveCall(null);
    setCallError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setCallHistory([]);
    setSelectedCall(null);
  }, []);

  // Load call history from backend state on mount
  useEffect(() => {
    const loadBackendHistory = async () => {
      try {
        // Fetch call history from the DB state endpoint
        const response = await fetch("./api/services/whatsup/state");
        if (!response.ok) return;
        const data = await response.json();
        const callHistoryData = data?.state?.call_history;
        if (callHistoryData && typeof callHistoryData === "object") {
          const callsArray = Object.values(callHistoryData) as any[];
          const transformed: CallEntry[] = callsArray.map((c: any) => ({
            id: c.call_id || `call-${c.timestamp}`,
            contactName: c.recipient_name || "Unknown",
            phoneNumber: c.phone_number,
            timestamp: typeof c.timestamp === "number"
              ? new Date(c.timestamp * 1000).toISOString()
              : c.timestamp,
            isVideo: c.video_call || false,
            status: (c.status as "completed" | "missed") || "completed",
          }));
          setCallHistory((prev) => {
            const existingIds = new Set(prev.map((call) => call.id));
            const newCalls = transformed.filter((c) => !existingIds.has(c.id));
            return [...newCalls, ...prev];
          });
        }
      } catch (err) {
        console.error("Failed to load call history:", err);
      }
    };
    loadBackendHistory();
  }, []);

  return {
    activeCall,
    callError,
    initiateCall,
    endCall,
    clearCall,
    callHistory,
    selectedCall,
    setSelectedCall,
    clearHistory,
  };
}

type MuteDuration = "8_hours" | "1_week" | "indefinitely";

function useChatActions(
  callTool: BackendCallTool,
  onSuccess: () => Promise<void>,
  updateMutedStatus: (chatJid: string, mutedUntil: string | null) => void,
  onLocalPin?: (chatJid: string, pinned: boolean) => void,
  onLocalArchive?: (chatJid: string, archived: boolean) => void,
) {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const chatActionWithFallback = useCallback(
    async (
      actionName: string,
      toolName: string,
      toolParams: Record<string, unknown>,
      localFallback?: () => void,
    ) => {
      setActionInProgress(actionName);
      setActionError(null);
      try {
        let backendSucceeded = false;
        try {
          const result = await callTool<{ success: boolean }>(toolName, toolParams);
          backendSucceeded = !!result?.success;
        } catch {
          // Backend doesn't support this endpoint — will fall back to local
        }
        if (backendSucceeded) {
          await onSuccess();
        } else {
          localFallback?.();
          // Persist the change to DB state so it survives page refreshes
          try {
            const chatJid = toolParams.chat_jid as string;
            if (chatJid) {
              const response = await fetch("./api/services/whatsup/state");
              if (response.ok) {
                const data = await response.json();
                const state = data?.state;
                if (state?.chats?.[chatJid]) {
                  if (toolName === "update_chat_pin_status" && "pinned" in toolParams) {
                    state.chats[chatJid].is_pinned = toolParams.pinned;
                  }
                  if (toolName === "update_chat_archive_status" && "archived" in toolParams) {
                    state.chats[chatJid].is_archived = toolParams.archived;
                  }
                  await fetch("./api/services/whatsup/state", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ state }),
                  });
                }
              }
            }
          } catch {
            // Best-effort persistence
          }
        }
        return { success: true };
      } catch {
        setActionError(GENERIC_ERROR_MESSAGE);
        return null;
      } finally {
        setActionInProgress(null);
      }
    },
    [callTool, onSuccess],
  );

  const archiveChat = useCallback(
    async (chatJid: string, archive: boolean) =>
      chatActionWithFallback(
        "archive",
        "update_chat_archive_status",
        { chat_jid: chatJid, archived: archive },
        () => onLocalArchive?.(chatJid, archive),
      ),
    [chatActionWithFallback, onLocalArchive],
  );

  const pinChat = useCallback(
    async (chatJid: string, pin: boolean) =>
      chatActionWithFallback(
        "pin",
        "update_chat_pin_status",
        { chat_jid: chatJid, pinned: pin },
        () => onLocalPin?.(chatJid, pin),
      ),
    [chatActionWithFallback, onLocalPin],
  );

  const muteChat = useCallback(
    async (chatJid: string, duration: MuteDuration | null) => {
      setActionInProgress("mute");
      setActionError(null);
      try {
        const result = await callTool<{ success: boolean; is_muted_until?: string | null }>(
          "update_chat_mute_status",
          { chat_jid: chatJid, mute_duration: duration },
        );
        if (result?.success) {
          // Update local muted status cache immediately
          updateMutedStatus(chatJid, result.is_muted_until ?? null);
          await onSuccess();
        } else {
          setActionError(GENERIC_ERROR_MESSAGE);
        }
        return result;
      } catch {
        setActionError(GENERIC_ERROR_MESSAGE);
        return null;
      } finally {
        setActionInProgress(null);
      }
    },
    [callTool, onSuccess, updateMutedStatus],
  );

  const markAsRead = useCallback(
    async (chatJid: string) => {
      try {
        await callTool("mark_chat_as_read", { chat_jid: chatJid });
      } catch {
        // Backend may not support this endpoint; ignore silently
      }
    },
    [callTool],
  );

  const markMessagesAsRead = useCallback(
    async (chatJid: string, messageIds: string[]) => {
      if (messageIds.length === 0) return;
      try {
        await callTool("mark_messages_as_read", { chat_jid: chatJid, message_ids: messageIds });
      } catch (err) {
        console.error("Failed to mark messages as read:", err);
      }
    },
    [callTool],
  );

  return {
    archiveChat,
    pinChat,
    muteChat,
    markAsRead,
    markMessagesAsRead,
    actionInProgress,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
  };
}

function useContactActions(callTool: BackendCallTool) {
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const blockContact = useCallback(
    async (jid: string, block: boolean) => {
      setBlocking(true);
      setBlockError(null);
      try {
        const result = await callTool<{ success: boolean; is_blocked: boolean }>(
          "update_contact_block_status",
          { jid, blocked: block },
        );
        if (!result?.success) {
          setBlockError(GENERIC_ERROR_MESSAGE);
        }
        return result;
      } catch {
        setBlockError(GENERIC_ERROR_MESSAGE);
        return null;
      } finally {
        setBlocking(false);
      }
    },
    [callTool],
  );

  return {
    blockContact,
    blocking,
    blockError,
    clearBlockError: useCallback(() => setBlockError(null), []),
  };
}

// =====================================================================================
// UI HELPERS
// =====================================================================================

function InlineSpinner({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center">
      <div
        className="border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin"
        style={{ width: size, height: size }}
      />
    </div>
  );
}

type IconName =
  | "settings"
  | "whatsup"
  | "attachment"
  | "pin"
  | "archive"
  | "mute"
  | "call"
  | "video"
  | "image"
  | "audio"
  | "users"
  | "user"
  | "message"
  | "sparkles"
  | "check"
  | "check-double"
  | "clock";
const iconDefs: Record<
  IconName,
  {
    viewBox: string;
    fill: string;
    stroke: string;
    strokeWidth: number;
    path: React.ReactNode;
  }
> = {
  settings: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3 1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7 1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
      </>
    ),
  },
  whatsup: {
    viewBox: "0 0 360 362",
    fill: "currentColor",
    stroke: "none",
    strokeWidth: 0,
    path: (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M307.546 52.5655C273.709 18.685 228.706 0.0171895 180.756 0C81.951 0 1.53846 80.404 1.50408 179.235C1.48689 210.829 9.74646 241.667 25.4319 268.844L0 361.736L95.0236 336.811C121.203 351.096 150.683 358.616 180.679 358.625H180.756C279.544 358.625 359.966 278.212 360 179.381C360.017 131.483 341.392 86.4547 307.546 52.5741V52.5655ZM180.756 328.354H180.696C153.966 328.346 127.744 321.16 104.865 307.589L99.4242 304.358L43.034 319.149L58.0834 264.168L54.5423 258.53C39.6304 234.809 31.749 207.391 31.7662 179.244C31.8006 97.1036 98.6334 30.2707 180.817 30.2707C220.61 30.2879 258.015 45.8015 286.145 73.9665C314.276 102.123 329.755 139.562 329.738 179.364C329.703 261.513 262.871 328.346 180.756 328.346V328.354ZM262.475 216.777C257.997 214.534 235.978 203.704 231.869 202.209C227.761 200.713 224.779 199.966 221.796 204.452C218.814 208.939 210.228 219.029 207.615 222.011C205.002 225.002 202.389 225.372 197.911 223.128C193.434 220.885 179.003 216.158 161.891 200.902C148.578 189.024 139.587 174.362 136.975 169.875C134.362 165.389 136.7 162.965 138.934 160.739C140.945 158.728 143.412 155.505 145.655 152.892C147.899 150.279 148.638 148.406 150.133 145.423C151.629 142.432 150.881 139.82 149.764 137.576C148.646 135.333 139.691 113.287 135.952 104.323C132.316 95.5909 128.621 96.777 125.879 96.6309C123.266 96.5019 120.284 96.4762 117.293 96.4762C114.302 96.4762 109.454 97.5935 105.346 102.08C101.238 106.566 89.6691 117.404 89.6691 139.441C89.6691 161.478 105.716 182.785 107.959 185.776C110.202 188.767 139.544 234.001 184.469 253.408C195.153 258.023 203.498 260.782 210.004 262.845C220.731 266.257 230.494 265.776 238.212 264.624C246.816 263.335 264.71 253.786 268.44 243.326C272.17 232.866 272.17 223.893 271.053 222.028C269.936 220.163 266.945 219.037 262.467 216.794L262.475 216.777Z"
      />
    ),
  },
  attachment: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <path d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.44a2 2 0 0 1-2.83-2.83l8.49-8.49" />
    ),
  },
  pin: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="M12 17v5" />
        <path d="M9 3h6l1 7 3 3H5l3-3 1-7z" />
      </>
    ),
  },
  archive: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <path d="M6 8v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </>
    ),
  },
  mute: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ),
  },
  call: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 11.19 19a19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.36 1.7.7 2.48a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.78.34 1.62.58 2.48.7A2 2 0 0 1 22 16.92z" />
    ),
  },
  video: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <rect x="2" y="7" width="15" height="10" rx="2" />
        <path d="m22 7-5 3v4l5 3z" />
      </>
    ),
  },
  image: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  },
  audio: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  users: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  user: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
  message: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
  },
  sparkles: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="M5 3v4" />
        <path d="M19 17v4" />
        <path d="M3 5h4" />
        <path d="M17 19h4" />
      </>
    ),
  },
  check: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: <polyline points="20 6 9 17 4 12" />,
  },
  "check-double": {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <path d="M18 6 7 17l-5-5" />
        <path d="m22 10-7.5 7.5L13 16" />
      </>
    ),
  },
  clock: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    path: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  },
};

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const icon = iconDefs[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill={icon.fill}
      stroke={icon.stroke}
      strokeWidth={icon.strokeWidth || undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.path}
    </svg>
  );
}

function FeatureNoticeModal({
  isOpen,
  title,
  description,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const closeButtonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h4>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MuteDurationModal({
  isOpen,
  chatName,
  onSelect,
  onClose,
  loading,
}: {
  isOpen: boolean;
  chatName: string;
  onSelect: (duration: MuteDuration) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const closeButtonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);

  useEscToClose(isOpen && !loading, onClose);

  if (!isOpen) return null;

  const durations: { value: MuteDuration; label: string }[] = [
    { value: "8_hours", label: "8 hours" },
    { value: "1_week", label: "1 week" },
    { value: "indefinitely", label: "Always" },
  ];

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            Mute notifications
          </h4>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            disabled={loading}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Mute notifications for "{chatName}"
          </p>
          <div className="flex flex-col gap-2">
            {durations.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onSelect(d.value)}
                disabled={loading}
                className="w-full px-4 py-3 text-left bg-[var(--bg-tertiary)] hover:bg-[color:rgba(124,58,237,0.10)] hover:text-[var(--accent-color)] rounded-xl text-sm text-[var(--text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockConfirmModal({
  isOpen,
  contactName,
  isBlocked,
  onConfirm,
  onClose,
  loading,
}: {
  isOpen: boolean;
  contactName: string;
  isBlocked: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const confirmButtonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);

  useEscToClose(isOpen && !loading, onClose);

  if (!isOpen) return null;

  const action = isBlocked ? "Unblock" : "Block";
  const title = `${action} ${contactName}?`;
  const description = isBlocked
    ? `${contactName} will be able to call you and send you messages.`
    : `${contactName} will no longer be able to call you or send you messages.`;

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h4>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              ref={confirmButtonRef}
              disabled={loading}
              className={`px-5 py-2 text-white rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${
                isBlocked
                  ? "bg-[var(--accent-color)] hover:bg-[var(--accent-hover)]"
                  : "bg-[var(--danger-color)] hover:bg-[var(--danger-hover)]"
              }`}
            >
              {loading ? "..." : action}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddContactModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
  onContactCreated?: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            Add New Contact
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
            <Icon name="user" size={24} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {`Adding new contacts is not available. Contacts are managed through your phone's address book and synced automatically with ${APP_NAME}.`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full transition-all font-medium shadow-sm hover:shadow-md"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: IconName; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-4">
      <div className="mb-3">
        <Icon name={icon} size={56} />
      </div>
      <p className="text-sm text-center">{message}</p>
    </div>
  );
}

function NewChatEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-primary)]">
      <div className="text-center max-w-md px-6">
        <div className="mb-5 flex justify-center">
          <div className="w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.10)] flex items-center justify-center text-[var(--accent-color)]">
            <Icon name="sparkles" size={36} />
          </div>
        </div>
        <p className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
          Start a new chat
        </p>
        <p className="text-[13px] text-[var(--text-tertiary)] mt-1.5 tracking-wide">
          Pick a contact on the left to open a fresh conversation.
        </p>
      </div>
    </div>
  );
}

function NewCallEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-primary)]">
      <div className="text-center max-w-md px-6">
        <div className="mb-5 flex justify-center">
          <div className="w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.10)] flex items-center justify-center text-[var(--accent-color)]">
            <Icon name="call" size={36} />
          </div>
        </div>
        <p className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
          Start a new call
        </p>
        <p className="text-[13px] text-[var(--text-tertiary)] mt-1.5 tracking-wide">
          Pick a contact on the left to make a voice or video call.
        </p>
      </div>
    </div>
  );
}

function ContactDetailCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--bg-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.05)] p-4">
      <div className="text-[11px] tracking-wide font-medium text-[var(--text-tertiary)]">{label}</div>
      <div className={valueClassName || "text-sm text-[var(--text-primary)] mt-1"}>
        {value}
      </div>
    </div>
  );
}

// =====================================================================================
// CHAT LIST COMPONENTS
// =====================================================================================

function NewChatSearch({
  contacts,
  searchQuery,
  onSearchChange,
  onSelectContact,
  onCancel,
  onAddContact,
  loading,
}: {
  contacts: Contact[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectContact: (contact: Contact) => void;
  onCancel: () => void;
  onAddContact: () => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the search input when component mounts
    inputRef.current?.focus();
  }, []);

  useEscToClose(true, onCancel);

  return (
    <div className="absolute inset-0 bg-[var(--bg-primary)] z-10 flex flex-col">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-2 py-1 -ml-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
              title="Cancel"
            >
              ← Back
            </button>
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              New Chat
            </h3>
          </div>
          <button
            onClick={onAddContact}
            className="px-3 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-px"
            title="Add a new contact"
          >
            + New Contact
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts..."
          className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-secondary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
        />
        <p className="text-[11px] tracking-wide text-[var(--text-tertiary)] mt-2 ml-1">
          Press ESC to cancel
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <InlineSpinner />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="users"
            message={
              searchQuery ? "No contacts found" : "No contacts available"
            }
          />
        ) : (
          <div className="py-1 space-y-0.5 px-2">
            {contacts.map((contact) => {
              const dn = getContactDisplayName(contact);
              const init = (dn || "?").trim().charAt(0).toUpperCase() || "?";
              return (
                <button
                  key={contact.jid}
                  onClick={() => onSelectContact(contact)}
                  disabled={!contact.is_whatsup_user || !contact.phone_number}
                  className="w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-all">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]">
                      {init}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                        {dn}
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.jid}]</span>
                      </div>
                      <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] truncate mt-0.5">
                        {contact.phone_number || contact.jid}
                      </div>
                    </div>
                    {contact.is_whatsup_user ? (
                      <span className="text-[10px] font-medium text-[var(--success-color)] bg-[var(--success-color)]/10 px-2 py-0.5 rounded-full flex-shrink-0">
                        {APP_NAME}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full flex-shrink-0">
                        {`Not on ${APP_NAME}`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarHeader({
  activeView,
  onChangeView,
  onNewChat,
  onNewGroup,
  onNewContact,
  onNewCall,
  onOpenSettings,
}: {
  activeView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onNewContact: () => void;
  onNewCall: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="px-5 pt-5 pb-4 bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            {APP_NAME}
          </h2>
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Settings"
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
        {activeView === "chats" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onNewChat}
              className="px-3 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-px"
              title="Start a new chat"
            >
              + Chat
            </button>
            <button
              onClick={onNewGroup}
              className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[color:rgba(167,139,250,0.15)] text-[var(--text-primary)] rounded-full text-xs font-medium transition-colors"
              title="Create a new group"
            >
              + Group
            </button>
          </div>
        )}
        {activeView === "contacts" && (
          <button
            onClick={onNewContact}
            className="px-3 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-px"
            title="Add a new contact"
          >
            + New Contact
          </button>
        )}
        {activeView === "calls" && (
          <button
            onClick={onNewCall}
            className="px-3 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-px"
            title="Start a new call"
          >
            + New Call
          </button>
        )}
      </div>
      <div className="flex bg-[var(--bg-tertiary)] rounded-full p-1 gap-1">
        <button
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
            activeView === "chats"
              ? "bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          onClick={() => onChangeView("chats")}
        >
          Chats
        </button>
        <button
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
            activeView === "calls"
              ? "bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          onClick={() => onChangeView("calls")}
        >
          Calls
        </button>
        <button
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
            activeView === "contacts"
              ? "bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          onClick={() => onChangeView("contacts")}
        >
          Contacts
        </button>
      </div>
    </div>
  );
}

function ChatListItem({
  chat,
  isSelected,
  onSelect,
  isPending,
}: {
  chat: Chat;
  isSelected: boolean;
  onSelect: (chat: Chat) => void;
  isPending?: boolean;
}) {
  const isArchived = Boolean(chat.is_archived);
  const normalizedLastMessage =
    typeof chat.last_message === "string" ? chat.last_message.trim() : "";
  const showLastMessage =
    normalizedLastMessage.length > 0 && normalizedLastMessage !== "0";
  const unreadCount =
    typeof chat.unread_count === "number"
      ? chat.unread_count
      : Number.isFinite(Number(chat.unread_count))
        ? Number(chat.unread_count)
        : 0;

  const initial = (chat.name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <button
      className={`w-full text-left transition-all px-2 ${
        isSelected
          ? ""
          : "hover:bg-transparent"
      }`}
      onClick={() => onSelect(chat)}
      aria-selected={isSelected}
    >
      <div
        className={`flex items-start gap-3 px-3 py-3 rounded-xl transition-all ${
          isSelected
            ? "bg-[color:rgba(124,58,237,0.10)] ring-1 ring-[color:rgba(124,58,237,0.18)]"
            : isPending
              ? "bg-[color:rgba(167,139,250,0.08)] hover:bg-[color:rgba(167,139,250,0.12)]"
              : chat.is_pinned
                ? "bg-[var(--bg-tertiary)]/60 hover:bg-[var(--bg-tertiary)]"
                : "hover:bg-[var(--bg-tertiary)]"
        }`}
      >
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold tracking-wide ${
            isArchived
              ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
              : "bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]"
          }`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {chat.is_archived && (
                <span
                  className="text-[var(--text-tertiary)] flex-shrink-0"
                  aria-label="Archived chat"
                  title="Archived"
                >
                  <Icon name="archive" size={13} />
                </span>
              )}
              {chat.is_pinned && (
                <span
                  className={`flex-shrink-0 ${isArchived ? "text-[var(--text-tertiary)]" : "text-[var(--accent-color)]"}`}
                  aria-label="Pinned chat"
                  title="Pinned"
                >
                  <Icon name="pin" size={11} />
                </span>
              )}
              {chat.is_muted_until && (
                <span
                  className={`flex-shrink-0 ${isArchived ? "text-[var(--text-tertiary)]" : "text-[var(--warning-color)]"}`}
                  aria-label="Muted chat"
                  title="Muted"
                >
                  <Icon name="mute" size={11} />
                </span>
              )}
              <span
                className={`text-[14px] font-medium truncate ${
                  isArchived
                    ? "text-[var(--text-secondary)]"
                    : "text-[var(--text-primary)]"
                }`}
              >
                {chat.name}
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{chat.chat_jid}]</span>
              </span>
              {isPending && (
                <span className="text-[10px] tracking-wide bg-[var(--accent-color)]/12 text-[var(--accent-color)] px-2 py-0.5 rounded-full font-medium">
                  New
                </span>
              )}
            </div>
            {(formatChatTimestamp(
              chat.last_message_timestamp || chat.last_active_timestamp,
            ) ||
              unreadCount > 0) && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {formatChatTimestamp(
                  chat.last_message_timestamp || chat.last_active_timestamp,
                ) && (
                  <span
                    className={`text-[11px] tracking-wide ${unreadCount > 0 && !isArchived ? "text-[var(--accent-color)] font-medium" : "text-[var(--text-tertiary)]"}`}
                  >
                    {formatChatTimestamp(
                      chat.last_message_timestamp || chat.last_active_timestamp,
                    )}
                  </span>
                )}
                {unreadCount > 0 && (
                  <span
                    data-testid="unread-badge"
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-[var(--accent-color)] text-white text-[11px] font-medium rounded-full shadow-sm"
                  >
                    {unreadCount}
                  </span>
                )}
              </div>
            )}
          </div>
          {showLastMessage && (
            <p
              className={`text-[13px] truncate leading-relaxed ${
                isArchived
                  ? "text-[var(--text-tertiary)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {normalizedLastMessage}
            </p>
          )}
          {chat.last_interaction_time && (
            <p className="text-[10px] tracking-wide text-[var(--text-tertiary)] mt-1">
              Last interaction: {formatChatTimestamp(chat.last_interaction_time) || chat.last_interaction_time}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatList({
  chats,
  selectedChat,
  onSelectChat,
  pendingChat,
}: {
  chats: Chat[];
  selectedChat: Chat | null;
  onSelectChat: (chat: Chat) => void;
  pendingChat: Chat | null;
}) {
  return (
    <div className="py-1 space-y-0.5">
      {chats.map((chat) => (
        <ChatListItem
          key={chat.chat_jid}
          chat={chat}
          isSelected={selectedChat?.chat_jid === chat.chat_jid}
          onSelect={onSelectChat}
          isPending={pendingChat?.chat_jid === chat.chat_jid}
        />
      ))}
    </div>
  );
}

// =====================================================================================
// CONTACTS LIST COMPONENTS
// =====================================================================================

function ContactListItem({
  contact,
  isSelected,
  onSelect,
  isBlocked,
}: {
  contact: Contact;
  isSelected: boolean;
  onSelect: (contact: Contact) => void;
  isBlocked?: boolean;
}) {
  const displayName = getContactDisplayName(contact);
  const initial = (displayName || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      className="w-full text-left transition-all px-2"
      onClick={() => onSelect(contact)}
    >
      <div
        className={`flex items-start gap-3 px-3 py-3 rounded-xl transition-all ${
          isSelected
            ? "bg-[color:rgba(124,58,237,0.10)] ring-1 ring-[color:rgba(124,58,237,0.18)]"
            : "hover:bg-[var(--bg-tertiary)]"
        }`}
      >
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
            isBlocked
              ? "bg-[var(--danger-color)]/10 text-[var(--danger-color)]"
              : "bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]"
          }`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">
            {displayName}
            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.jid}]</span>
          </div>
          <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] truncate mt-0.5">
            {contact.phone_number || contact.jid}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isBlocked && (
            <span className="text-[10px] font-medium text-[var(--danger-color)] bg-[var(--danger-color)]/10 px-2 py-0.5 rounded-full">
              Blocked
            </span>
          )}
          {contact.is_whatsup_user ? (
            <span className="text-[10px] font-medium text-[var(--success-color)] bg-[var(--success-color)]/10 px-2 py-0.5 rounded-full">
              {APP_NAME}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
              Invite
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ContactList({
  contacts,
  selectedContact,
  onSelectContact,
  blockedContacts,
}: {
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact) => void;
  blockedContacts?: Set<string>;
}) {
  return (
    <div className="py-1 space-y-0.5">
      {contacts.map((contact) => (
        <ContactListItem
          key={contact.jid}
          contact={contact}
          isSelected={selectedContact?.jid === contact.jid}
          onSelect={onSelectContact}
          isBlocked={blockedContacts?.has(contact.jid)}
        />
      ))}
    </div>
  );
}

function ContactsSidebar({
  contacts,
  selectedContact,
  onSelectContact,
  query,
  onQueryChange,
  loading,
  error,
  onRefresh,
  blockedContacts,
}: {
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact) => void;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  blockedContacts?: Set<string>;
}) {
  return (
    <>
      <div className="px-4 pt-2 pb-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search contacts..."
            className="flex-1 px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-secondary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
          />
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent-color)] text-xs font-medium hover:bg-[color:rgba(124,58,237,0.10)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-[var(--danger-color)]">{error}</p>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <InlineSpinner />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon="users"
          message={query.trim() ? "No contacts found" : "No contacts available"}
        />
      ) : (
        <ContactList
          contacts={contacts}
          selectedContact={selectedContact}
          onSelectContact={onSelectContact}
          blockedContacts={blockedContacts}
        />
      )}
    </>
  );
}

// =====================================================================================
// CALLS LIST COMPONENTS
// =====================================================================================

function CallListItem({
  call,
  isSelected,
  onSelect,
}: {
  call: CallEntry;
  isSelected: boolean;
  onSelect: (call: CallEntry) => void;
}) {
  const isMissed = call.status === "missed";
  return (
    <button
      type="button"
      onClick={() => onSelect(call)}
      className="w-full text-left transition-all px-2"
    >
      <div
        className={`flex items-start gap-3 px-3 py-3 rounded-xl transition-all ${
          isSelected
            ? "bg-[color:rgba(124,58,237,0.10)] ring-1 ring-[color:rgba(124,58,237,0.18)]"
            : "hover:bg-[var(--bg-tertiary)]"
        }`}
      >
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            isMissed
              ? "bg-[var(--danger-color)]/10 text-[var(--danger-color)]"
              : "bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]"
          }`}
        >
          <Icon name={call.isVideo ? "video" : "call"} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[14px] font-medium text-[var(--text-primary)] truncate">
              {call.contactName}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{call.id}]</span>
            </span>
            {formatChatTimestamp(call.timestamp) && (
              <span className="text-[11px] tracking-wide text-[var(--text-tertiary)] flex-shrink-0">
                {formatChatTimestamp(call.timestamp)}
              </span>
            )}
          </div>
          <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] truncate">
            {call.phoneNumber || "Unknown number"}
          </div>
        </div>
      </div>
    </button>
  );
}

function CallsEmptyState() {
  return (
    <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
      No calls yet
    </div>
  );
}

function NewCallContactItem({
  contact,
  onSelectCall,
}: {
  contact: Contact;
  onSelectCall: (contact: Contact, callType: CallType) => void;
}) {
  const displayName = getContactDisplayName(contact);
  const phoneNumber = contact.phone_number || "No phone number";
  const init = (displayName || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="px-2">
      <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-all">
        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]">
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">
            {displayName}
            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.jid}]</span>
          </div>
          <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] truncate mt-0.5">
            {phoneNumber}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onSelectCall(contact, "voice")}
            className="p-2 rounded-full hover:bg-[var(--bg-secondary)] hover:shadow-sm transition-all text-[var(--accent-color)]"
            title="Voice call"
            aria-label="Voice call"
          >
            <Icon name="call" size={18} />
          </button>
          <button
            type="button"
            onClick={() => onSelectCall(contact, "video")}
            className="p-2 rounded-full hover:bg-[var(--bg-secondary)] hover:shadow-sm transition-all text-[var(--accent-color)]"
            title="Video call"
            aria-label="Video call"
          >
            <Icon name="video" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CallsSidebar({
  calls,
  selectedCall,
  onSelectCall,
  showLocalNotice,
  newCallMode,
  newCallSearchQuery,
  newCallFilteredContacts,
  onNewCall,
  onNewCallSearchChange,
  onNewCallSelectContact,
  onCancelNewCall,
}: {
  calls: CallEntry[];
  selectedCall: CallEntry | null;
  onSelectCall: (call: CallEntry) => void;
  showLocalNotice: boolean;
  newCallMode: boolean;
  newCallSearchQuery: string;
  newCallFilteredContacts: Contact[];
  onNewCall: () => void;
  onNewCallSearchChange: (query: string) => void;
  onNewCallSelectContact: (contact: Contact, callType: CallType) => void;
  onCancelNewCall: () => void;
}) {
  useEscToClose(newCallMode, onCancelNewCall);

  // If in new call mode, show contact search overlay
  if (newCallMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 pt-5 pb-4 bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={onCancelNewCall}
              className="px-2 py-1 -ml-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
              aria-label="Cancel new call"
            >
              ← Back
            </button>
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              New Call
            </h3>
          </div>
          <input
            type="text"
            value={newCallSearchQuery}
            onChange={(e) => onNewCallSearchChange(e.target.value)}
            placeholder="Search contacts..."
            className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-secondary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
            autoFocus
          />
          <p className="text-[11px] tracking-wide text-[var(--text-tertiary)] mt-2 ml-1">
            Press ESC to cancel
          </p>
        </div>
        <div className="flex-1 overflow-auto">
          {newCallFilteredContacts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
              {newCallSearchQuery.trim()
                ? "No contacts found"
                : `No ${APP_NAME} contacts`}
            </div>
          ) : (
            <div className="py-1 space-y-0.5">
              {newCallFilteredContacts.map((contact) => (
                <NewCallContactItem
                  key={contact.jid}
                  contact={contact}
                  onSelectCall={onNewCallSelectContact}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {showLocalNotice && (
          <div className="mx-4 mt-2 px-3 py-2 text-[11px] tracking-wide text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]/60 rounded-xl">
            Call history is stored locally for this session until the backend
            exposes a call history API.
          </div>
        )}
        <CallsEmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showLocalNotice && (
        <div className="mx-4 mt-2 px-3 py-2 text-[11px] tracking-wide text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]/60 rounded-xl">
          Call history is stored locally for this session until the backend
          exposes a call history API.
        </div>
      )}
      <div className="py-1 space-y-0.5">
        {calls.map((call) => (
          <CallListItem
            key={call.id}
            call={call}
            isSelected={selectedCall?.id === call.id}
            onSelect={onSelectCall}
          />
        ))}
      </div>
    </div>
  );
}

// =====================================================================================
// SIDEBAR LAYOUT
// =====================================================================================

function ChatSidebar({
  chats,
  archivedChats,
  selectedChat,
  loading,
  error,
  onSelectChat,
  onRetry,
  pendingChat,
  onShowArchivedInfo,
}: {
  chats: Chat[];
  archivedChats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  error: string | null;
  onSelectChat: (chat: Chat) => void;
  onRetry: () => void;
  pendingChat: Chat | null;
  onShowArchivedInfo: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <InlineSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <p className="text-[var(--danger-color)] text-center text-sm">
          {error}
        </p>
        <button
          className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium text-sm"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  if (chats.length === 0 && archivedChats.length === 0) {
    return <EmptyState icon="message" message="No chats" />;
  }

  return (
    <div className="space-y-4">
      {chats.length > 0 && (
        <ChatList
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={onSelectChat}
          pendingChat={pendingChat}
        />
      )}

      {archivedChats.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
          <div className="flex items-center justify-between px-5 mb-1.5">
            <span className="text-[11px] font-medium tracking-wide text-[var(--text-tertiary)]">
              Archived
            </span>
            <button
              type="button"
              onClick={onShowArchivedInfo}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs px-1.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Archived chat actions are coming soon"
            >
              ⓘ
            </button>
          </div>
          <ChatList
            chats={archivedChats}
            selectedChat={selectedChat}
            onSelectChat={onSelectChat}
            pendingChat={null}
          />
        </div>
      )}
    </div>
  );
}

function SidebarFooter({
  activeView,
  onRefreshChats,
  onRefreshContacts,
  contactsLoading,
  onClearCalls,
  hasCalls,
}: {
  activeView: SidebarView;
  onRefreshChats: () => void;
  onRefreshContacts: () => void;
  contactsLoading: boolean;
  onClearCalls: () => void;
  hasCalls: boolean;
}) {
  return (
    <div className="px-3 pt-2 pb-3 bg-[var(--bg-primary)]">
      {activeView === "chats" ? (
        <button
          className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[color:rgba(124,58,237,0.10)] hover:text-[var(--accent-color)] rounded-full transition-colors text-[13px] font-medium text-[var(--text-secondary)]"
          onClick={onRefreshChats}
        >
          Refresh
        </button>
      ) : activeView === "contacts" ? (
        <button
          className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[color:rgba(124,58,237,0.10)] hover:text-[var(--accent-color)] rounded-full transition-colors text-[13px] font-medium text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onRefreshContacts}
          disabled={contactsLoading}
        >
          Refresh Results
        </button>
      ) : (
        <button
          className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--danger-color)]/10 hover:text-[var(--danger-color)] rounded-full transition-colors text-[13px] font-medium text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onClearCalls}
          disabled={!hasCalls}
        >
          Clear History
        </button>
      )}
    </div>
  );
}

function ChatListSidebar({
  activeView,
  onChangeView,
  chats,
  archivedChats,
  selectedChat,
  loading,
  error,
  onSelectChat,
  onRefreshChats,
  calls,
  selectedCall,
  onSelectCall,
  showCallNotice,
  hasCalls,
  contacts,
  selectedContact,
  contactQuery,
  onContactQueryChange,
  contactsLoading,
  contactsError,
  onSelectContact,
  onRefreshContacts,
  newChatMode,
  newChatSearchQuery,
  newChatFilteredContacts,
  onNewChat,
  onNewGroup,
  onNewContact,
  onNewChatSearchChange,
  onNewChatSelectContact,
  onCancelNewChat,
  newCallMode,
  newCallSearchQuery,
  newCallFilteredContacts,
  onNewCall,
  onNewCallSearchChange,
  onNewCallSelectContact,
  onCancelNewCall,
  pendingChat,
  onOpenSettings,
  onShowArchivedInfo,
  onClearCalls,
  blockedContacts,
}: {
  activeView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  chats: Chat[];
  archivedChats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  error: string | null;
  onSelectChat: (chat: Chat) => void;
  onRefreshChats: () => void;
  calls: CallEntry[];
  selectedCall: CallEntry | null;
  onSelectCall: (call: CallEntry) => void;
  showCallNotice: boolean;
  hasCalls: boolean;
  contacts: Contact[];
  selectedContact: Contact | null;
  contactQuery: string;
  onContactQueryChange: (value: string) => void;
  contactsLoading: boolean;
  contactsError: string | null;
  onSelectContact: (contact: Contact) => void;
  onRefreshContacts: () => void;
  newChatMode: boolean;
  newChatSearchQuery: string;
  newChatFilteredContacts: Contact[];
  onNewChat: () => void;
  onNewGroup: () => void;
  onNewContact: () => void;
  onNewChatSearchChange: (query: string) => void;
  onNewChatSelectContact: (contact: Contact) => void;
  onCancelNewChat: () => void;
  newCallMode: boolean;
  newCallSearchQuery: string;
  newCallFilteredContacts: Contact[];
  onNewCall: () => void;
  onNewCallSearchChange: (query: string) => void;
  onNewCallSelectContact: (contact: Contact, callType: CallType) => void;
  onCancelNewCall: () => void;
  pendingChat: Chat | null;
  onOpenSettings: () => void;
  onShowArchivedInfo: () => void;
  onClearCalls: () => void;
  blockedContacts?: Set<string>;
}) {
  return (
    <div className="w-80 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-primary)] relative">
      <SidebarHeader
        activeView={activeView}
        onChangeView={onChangeView}
        onNewChat={onNewChat}
        onNewGroup={onNewGroup}
        onNewContact={onNewContact}
        onNewCall={onNewCall}
        onOpenSettings={onOpenSettings}
      />

      <div className="flex-1 overflow-auto">
        {activeView === "contacts" ? (
          <ContactsSidebar
            contacts={contacts}
            selectedContact={selectedContact}
            onSelectContact={onSelectContact}
            query={contactQuery}
            onQueryChange={onContactQueryChange}
            loading={contactsLoading}
            error={contactsError}
            onRefresh={onRefreshContacts}
            blockedContacts={blockedContacts}
          />
        ) : activeView === "calls" ? (
          <CallsSidebar
            calls={calls}
            selectedCall={selectedCall}
            onSelectCall={onSelectCall}
            showLocalNotice={showCallNotice}
            newCallMode={newCallMode}
            newCallSearchQuery={newCallSearchQuery}
            newCallFilteredContacts={newCallFilteredContacts}
            onNewCall={onNewCall}
            onNewCallSearchChange={onNewCallSearchChange}
            onNewCallSelectContact={onNewCallSelectContact}
            onCancelNewCall={onCancelNewCall}
          />
        ) : (
          <ChatSidebar
            chats={chats}
            archivedChats={archivedChats}
            selectedChat={selectedChat}
            loading={loading}
            error={error}
            onSelectChat={onSelectChat}
            onRetry={onRefreshChats}
            pendingChat={pendingChat}
            onShowArchivedInfo={onShowArchivedInfo}
          />
        )}
      </div>

      <SidebarFooter
        activeView={activeView}
        onRefreshChats={onRefreshChats}
        onRefreshContacts={onRefreshContacts}
        contactsLoading={contactsLoading}
        onClearCalls={onClearCalls}
        hasCalls={hasCalls}
      />

      {newChatMode && activeView === "chats" && (
        <NewChatSearch
          contacts={newChatFilteredContacts}
          searchQuery={newChatSearchQuery}
          onSearchChange={onNewChatSearchChange}
          onSelectContact={onNewChatSelectContact}
          onCancel={onCancelNewChat}
          onAddContact={onNewContact}
          loading={contactsLoading}
        />
      )}
    </div>
  );
}

// =====================================================================================
// CONVERSATION COMPONENTS
// =====================================================================================

function ConversationHeader({
  title,
  onArchive,
  onPin,
  onMute,
  onVoiceCall,
  onVideoCall,
  canCall,
  callDisabledReason,
  calling,
  showArchiveAction,
  showPinAction,
  showMuteAction,
  isPinned,
  isMuted,
  isArchived,
  onTitleClick,
  isGroup,
  groupMemberCount,
  onToggleGroupMembers,
}: {
  title: string;
  onArchive?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  canCall?: boolean;
  callDisabledReason?: string;
  calling?: boolean;
  showArchiveAction?: boolean;
  showPinAction?: boolean;
  showMuteAction?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  onTitleClick?: () => void;
  isGroup?: boolean;
  groupMemberCount?: number;
  onToggleGroupMembers?: () => void;
}) {
  return (
    <div className="px-5 py-3.5 bg-[var(--bg-primary)]/80 backdrop-blur-sm border-b border-[var(--border-color)] flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-center gap-3">
        {title && (
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)] flex items-center justify-center text-sm font-semibold">
            {(title || "?").trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="min-w-0">
          <button
            type="button"
            onClick={onTitleClick}
            className="block text-[15px] font-semibold tracking-tight text-[var(--text-primary)] hover:text-[var(--accent-color)] cursor-pointer bg-transparent border-none p-0 text-left transition-colors truncate max-w-full"
            title="View profile info"
          >
            {title}
          </button>
          {isGroup && groupMemberCount != null && (
            <button
              type="button"
              onClick={onToggleGroupMembers}
              className="block text-[11px] tracking-wide text-[var(--text-tertiary)] hover:text-[var(--accent-color)] cursor-pointer bg-transparent border-none p-0 transition-colors"
            >
              {groupMemberCount} members
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onVideoCall && (
          <button
            type="button"
            onClick={onVideoCall}
            disabled={canCall === false || calling}
            title={callDisabledReason || "Start a video call"}
            className="relative group p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Start video call"
          >
            <Icon name="video" size={16} />
            <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[11px] tracking-wide text-white shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 z-30">
              Video Call
            </span>
          </button>
        )}
        {onVoiceCall && (
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={canCall === false || calling}
            title={callDisabledReason || "Start a voice call"}
            className="relative group p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Start voice call"
          >
            <Icon name="call" size={16} />
            <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[11px] tracking-wide text-white shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 z-30">
              Voice Call
            </span>
          </button>
        )}
        {showPinAction && onPin && (
          <button
            type="button"
            onClick={onPin}
            className={`relative group p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-all ${
              isPinned
                ? "text-[var(--accent-color)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
            aria-label={isPinned ? "Unpin chat" : "Pin chat"}
          >
            <Icon name="pin" size={16} />
            <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[11px] tracking-wide text-white shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 z-30">
              {isPinned ? "Unpin" : "Pin"}
            </span>
          </button>
        )}
        {showMuteAction && onMute && (
          <button
            type="button"
            onClick={onMute}
            className={`relative group p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-all ${
              isMuted
                ? "text-[var(--warning-color)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
            aria-label={isMuted ? "Unmute chat" : "Mute chat"}
          >
            <Icon name="mute" size={16} />
            <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[11px] tracking-wide text-white shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 z-30">
              {isMuted ? "Unmute" : "Mute"}
            </span>
          </button>
        )}
        {showArchiveAction && onArchive && (
          <button
            type="button"
            onClick={onArchive}
            className={`relative group p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-all ${
              isArchived
                ? "text-[var(--accent-color)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
            aria-label={isArchived ? "Unarchive chat" : "Archive chat"}
          >
            <Icon name="archive" size={16} />
            <span className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[11px] tracking-wide text-white shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 z-30">
              {isArchived ? "Unarchive" : "Archive"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function AudioPlayer({
  src,
  isOutgoing,
}: {
  src: string;
  isOutgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setPlaying(false));
    }
  }, [playing]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  }, []);

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 w-full min-w-[180px]">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isOutgoing
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-[var(--accent-color)]/15 hover:bg-[var(--accent-color)]/25 text-[var(--accent-color)]"
        }`}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="3" height="10" rx="1" />
            <rect x="7" y="1" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <polygon points="2,1 11,6 2,11" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`h-1.5 rounded-full cursor-pointer ${
            isOutgoing ? "bg-white/20" : "bg-[var(--border-color)]"
          }`}
          onClick={handleSeek}
        >
          <div
            className={`h-full rounded-full transition-all ${
              isOutgoing ? "bg-white" : "bg-[var(--accent-color)]"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {duration > 0 && (
          <div className={`text-[10px] mt-0.5 ${isOutgoing ? "text-white/60" : "text-[var(--text-tertiary)]"}`}>
            {formatDur(duration)}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageItem({
  message,
  isFirst,
  isLast,
  previousMessage,
  onOpenMedia,
  onForwardMessage,
}: {
  message: Message;
  isFirst: boolean;
  isLast?: boolean;
  previousMessage?: Message;
  onOpenMedia?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
}) {
  const isOutgoing = message.is_outgoing;
  const showSenderName =
    !isOutgoing &&
    (isFirst || previousMessage?.sender_name !== message.sender_name);
  const hasMedia = message.media_info && message.media_info.media_type;
  const previewUrl =
    message.media_info?.preview_url ||
    getPublicPreviewUrl(message.media_info?.simulated_local_path);
  const showImagePreview =
    message.media_info?.media_type === "image" && previewUrl;
  const isAudioMessage =
    message.media_info?.media_type === "audio";
  const isVideoMessage =
    message.media_info?.media_type === "video";
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewUrl]);

  const audioSrc = isAudioMessage
    ? (previewUrl || getPublicPreviewUrl(message.media_info?.simulated_local_path))
    : null;
  const videoSrc = isVideoMessage
    ? (previewUrl || getPublicPreviewUrl(message.media_info?.simulated_local_path))
    : null;

  return (
    <div
      className={`flex ${isOutgoing ? "justify-end" : "justify-start"} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`relative max-w-md ${isOutgoing ? "max-w-sm" : "max-w-md"}`}>
        {showSenderName && (
          <div className="text-[11px] font-semibold tracking-wide text-[var(--accent-color)] mb-1 ml-4">
            {message.sender_name}
          </div>
        )}

        <div
          className={`px-3.5 py-2.5 ${
            isOutgoing
              ? "bg-[var(--chat-outgoing-bg)] text-white rounded-2xl rounded-br-md shadow-[0_2px_8px_-2px_rgba(124,58,237,0.35)]"
              : "bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-2xl rounded-bl-md shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.06)]"
          }`}
        >
          {hasMedia && (
            <div className="mb-2">
              {showImagePreview && !previewFailed && (
                <button
                  type="button"
                  onClick={() => onOpenMedia?.(message)}
                  className="w-full rounded-xl overflow-hidden mb-1"
                  aria-label="Open image"
                >
                  <img
                    src={previewUrl}
                    alt={message.media_info?.file_name || "Image preview"}
                    className="w-full max-h-48 object-cover"
                    onError={() => setPreviewFailed(true)}
                  />
                </button>
              )}

              {isVideoMessage && videoSrc && (
                <div className="rounded-xl overflow-hidden mb-1">
                  <video
                    src={videoSrc}
                    controls
                    className="w-full max-h-48"
                    preload="metadata"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {isAudioMessage && audioSrc ? (
                <AudioPlayer src={audioSrc} isOutgoing={isOutgoing} />
              ) : isAudioMessage ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/10">
                  <Icon name="audio" size={20} />
                  <span className={`text-xs ${isOutgoing ? "text-white/80" : "text-[var(--text-secondary)]"}`}>
                    Voice message
                  </span>
                </div>
              ) : null}

              {!showImagePreview && !isAudioMessage && !isVideoMessage && (
                <button
                  type="button"
                  onClick={() => onOpenMedia?.(message)}
                  className={`p-2 rounded-lg w-full text-left transition-colors ${
                    isOutgoing
                      ? "bg-white/10 hover:bg-white/20"
                      : "bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]"
                  }`}
                  aria-label="Open media"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name={getMediaIconName(message.media_info?.media_type)}
                      size={24}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${isOutgoing ? "text-white" : "text-[var(--text-primary)]"}`}
                      >
                        {message.media_info?.file_name ||
                          `${message.media_info?.media_type} file`}
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {message.media_info?.caption && (
                <div
                  className={`text-xs mt-1 ${isOutgoing ? "text-white/80" : "text-[var(--text-secondary)]"}`}
                >
                  {message.media_info.caption}
                </div>
              )}
            </div>
          )}

          {message.text_content && (
            <div
              className={`text-[14px] leading-[1.45] whitespace-pre-wrap break-words ${isOutgoing ? "text-white" : "text-[var(--text-primary)]"}`}
            >
              {message.text_content}
            </div>
          )}

          {!message.text_content && !hasMedia && (
            <div
              className={`text-[14px] italic ${isOutgoing ? "text-white/70" : "text-[var(--text-secondary)]"}`}
            >
              [Empty message]
            </div>
          )}

          <div
            className={`flex items-center gap-1 mt-1.5 text-[10.5px] tracking-wide ${isOutgoing ? "text-white/65" : "text-[var(--text-tertiary)]"}`}
          >
            <span>{formatMessageTime(message.timestamp)}</span>
            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{message.message_id}]</span>
            {isOutgoing && (
              <span className={`ml-1 ${message.status === "read" ? "text-[#bae6fd]" : ""}`}>
                {message.status === "delivered" ? (
                  <Icon name="check-double" size={12} />
                ) : message.status === "read" ? (
                  <Icon name="check-double" size={12} />
                ) : message.status === "sent" ? (
                  <Icon name="check" size={12} />
                ) : (
                  <Icon name="clock" size={12} />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Forward button on hover */}
        {showActions && onForwardMessage && (
          <button
            type="button"
            onClick={() => onForwardMessage(message)}
            className={`absolute top-1 ${isOutgoing ? "left-0 -translate-x-full mr-1" : "right-0 translate-x-full ml-1"} p-1.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-secondary)] shadow-md hover:shadow-lg transition-all`}
            title="Forward message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 17 20 12 15 7" />
              <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
            </svg>
          </button>
        )}

        {isLast && (
          <div className="text-xs text-[var(--text-tertiary)] text-center mt-1">
            {getRelativeTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageList({
  messages,
  isDemoChat,
  onOpenMedia,
  onForwardMessage,
  scrollToBottomKey,
}: {
  messages: Message[];
  isDemoChat: boolean;
  onOpenMedia?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  scrollToBottomKey?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToBottomKey || !listRef.current) return;
    const scrollToEnd = () => {
      if (!listRef.current) return;
      listRef.current.scrollTop = listRef.current.scrollHeight;
      endRef.current?.scrollIntoView({ block: "end" });
    };
    const handle = requestAnimationFrame(scrollToEnd);
    const delayed = window.setTimeout(scrollToEnd, 150);
    const delayedMore = window.setTimeout(scrollToEnd, 350);
    return () => {
      cancelAnimationFrame(handle);
      window.clearTimeout(delayed);
      window.clearTimeout(delayedMore);
    };
  }, [scrollToBottomKey, messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
        <p>No messages</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="absolute inset-0 overflow-auto px-5 py-4 space-y-1.5 bg-[var(--bg-primary)]">
      {isDemoChat && (
        <div className="mb-3 rounded-2xl bg-[color:rgba(124,58,237,0.08)] px-4 py-2.5 text-[12px] tracking-wide text-[var(--text-secondary)] text-center">
          Demo mode — messages are placeholders for UI preview only.
        </div>
      )}
      {messages.map((message, index) => (
        <MessageItem
          key={message.message_id}
          message={message}
          isFirst={index === 0}
          isLast={index === messages.length - 1}
          previousMessage={index > 0 ? messages[index - 1] : undefined}
          onOpenMedia={onOpenMedia}
          onForwardMessage={onForwardMessage}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MediaViewerModal({
  activeMedia,
  isOpen,
  downloading,
  downloadError,
  downloadStatus,
  onDownload,
  onClose,
}: {
  activeMedia: { message: Message } | null;
  isOpen: boolean;
  downloading: boolean;
  downloadError: string | null;
  downloadStatus: string | null;
  onDownload: () => void;
  onClose: () => void;
}) {
  const buttonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);
  const [imageFailed, setImageFailed] = useState(false);
  const message = activeMedia?.message;
  const mediaType = message?.media_info?.media_type || "file";
  const fileName = message?.media_info?.file_name || `${mediaType} attachment`;
  const caption = message?.media_info?.caption;
  const previewUrl =
    message?.media_info?.preview_url ||
    getPublicPreviewUrl(message?.media_info?.simulated_local_path);
  const isImage = mediaType === "image";

  useEffect(() => {
    setImageFailed(false);
  }, [previewUrl]);

  if (!isOpen || !activeMedia) return null;

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-30">
      <div className="w-full max-w-lg bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <div>
            <h4 className="text-base font-semibold text-[var(--text-primary)]">
              Media Preview
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-2xl bg-[var(--bg-tertiary)] p-4 flex items-center justify-center">
            {isImage && previewUrl && !imageFailed ? (
              <img
                src={previewUrl}
                alt={fileName}
                className="max-h-64 rounded-lg object-contain"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="text-center space-y-2">
                <Icon name={getMediaIconName(mediaType)} size={48} />
                <div className="text-sm text-[var(--text-secondary)] capitalize">
                  {mediaType} attachment
                </div>
              </div>
            )}
          </div>
          {caption && (
            <div className="text-sm text-[var(--text-secondary)]">
              {caption}
            </div>
          )}
          {downloadError && (
            <div className="text-sm text-[var(--danger-color)]">
              {downloadError}
            </div>
          )}
          {downloadStatus && (
            <div className="text-sm text-[var(--text-secondary)]">
              {downloadStatus}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-sm font-medium transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onDownload}
              ref={buttonRef}
              disabled={downloading}
              className="px-5 py-2 rounded-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:shadow-none"
            >
              {downloading ? "Downloading..." : "Download"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({
  isOpen,
  contacts,
  onClose,
  onCreate,
  creating,
}: {
  isOpen: boolean;
  contacts: Contact[];
  onClose: () => void;
  onCreate: (name: string, memberJids: string[]) => void;
  creating: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const closeButtonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);

  useEscToClose(isOpen && !creating, onClose);

  if (!isOpen) return null;

  const filteredContacts = memberSearch.trim()
    ? contacts.filter(
        (c) =>
          c.is_whatsup_user &&
          getContactSearchText(c).includes(memberSearch.trim().toLowerCase()),
      )
    : contacts.filter((c) => c.is_whatsup_user);

  const toggleMember = (jid: string) => {
    setSelectedMembers((prev) => {
      const updated = new Set(prev);
      if (updated.has(jid)) updated.delete(jid);
      else updated.add(jid);
      return updated;
    });
  };

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            Create New Group
          </h4>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            disabled={creating}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3.5">
          <div>
            <label className="block text-[11px] tracking-wide font-medium text-[var(--text-secondary)] mb-1.5">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-primary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[11px] tracking-wide font-medium text-[var(--text-secondary)] mb-1.5">
              Add Members ({selectedMembers.size} selected)
            </label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-primary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
            />
          </div>
          <div className="max-h-44 overflow-auto rounded-2xl bg-[var(--bg-tertiary)]/60 p-1">
            {filteredContacts.length === 0 ? (
              <div className="p-3 text-center text-xs text-[var(--text-secondary)]">
                No contacts found
              </div>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.jid}
                  type="button"
                  onClick={() => toggleMember(c.jid)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between rounded-xl transition-all ${
                    selectedMembers.has(c.jid)
                      ? "bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]"
                      : "hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <span className="truncate text-[var(--text-primary)]">
                    {getContactDisplayName(c)}
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{c.jid}]</span>
                  </span>
                  {selectedMembers.has(c.jid) && (
                    <span className="text-[var(--accent-color)] flex-shrink-0">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-1 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onCreate(groupName.trim(), Array.from(selectedMembers))}
              disabled={creating || !groupName.trim() || selectedMembers.size === 0}
              className="px-5 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {creating ? "Creating..." : "Create Group"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForwardMessageModal({
  isOpen,
  message,
  chats,
  onForward,
  onClose,
  forwarding,
}: {
  isOpen: boolean;
  message: Message | null;
  chats: Chat[];
  onForward: (targetChatJid: string) => void;
  onClose: () => void;
  forwarding: boolean;
}) {
  const [search, setSearch] = useState("");
  const closeButtonRef = useModalAutoFocus<HTMLButtonElement>(isOpen);

  useEscToClose(isOpen && !forwarding, onClose);

  if (!isOpen || !message) return null;

  const filteredChats = search.trim()
    ? chats.filter((c) =>
        c.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : chats;

  const previewText = message.text_content
    ? message.text_content.slice(0, 80) + (message.text_content.length > 80 ? "..." : "")
    : message.media_info
      ? `[${message.media_info.media_type}] ${message.media_info.caption || message.media_info.file_name || ""}`
      : "[Message]";

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            Forward Message
          </h4>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            disabled={forwarding}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-3">
          <div className="text-xs tracking-wide text-[var(--text-tertiary)] mb-2 px-3 py-2 bg-[var(--bg-tertiary)]/60 rounded-xl truncate">
            {previewText}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-primary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-auto px-2 pb-3">
          {filteredChats.length === 0 ? (
            <div className="p-4 text-center text-sm text-[var(--text-secondary)]">
              No chats found
            </div>
          ) : (
            filteredChats.map((chat) => {
              const init = (chat.name || "?").trim().charAt(0).toUpperCase() || "?";
              return (
                <button
                  key={chat.chat_jid}
                  type="button"
                  onClick={() => onForward(chat.chat_jid)}
                  disabled={forwarding}
                  className="w-full p-3 text-left hover:bg-[var(--bg-tertiary)] rounded-xl transition-colors disabled:opacity-50 flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]">
                    {init}
                  </div>
                  <div className="font-medium text-sm text-[var(--text-primary)] truncate flex-1 min-w-0">
                    {chat.name}
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{chat.chat_jid}]</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  isOpen,
  demoMode,
  onClose,
  onToggleDemoMode,
}: {
  isOpen: boolean;
  demoMode: boolean;
  onClose: () => void;
  onToggleDemoMode: () => void;
}) {
  const firstFieldRef = useModalAutoFocus<HTMLButtonElement>(isOpen);
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-20">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">
            Settings
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Demo Mode
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">
                Shows a demo chat with media examples.
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleDemoMode}
              ref={firstFieldRef}
              className={`w-14 h-7 rounded-full transition-colors flex items-center ${
                demoMode
                  ? "bg-[var(--accent-color)]"
                  : "bg-[var(--border-color)]"
              }`}
              aria-pressed={demoMode}
            >
              <span
                className={`w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform ${
                  demoMode ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallModal({
  call,
  onEnd,
  onClose,
}: {
  call: ActiveCall | null;
  onEnd: () => void;
  onClose: () => void;
}) {
  const buttonRef = useModalAutoFocus<HTMLButtonElement>(Boolean(call));

  if (!call) return null;

  const statusLabel =
    call.status === "connected"
      ? "Call in progress"
      : call.status === "ringing"
        ? "Ringing..."
        : call.status === "ended"
          ? "Call ended"
          : "Calling...";

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-30">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2">
            <Icon
              name={call.callType === "video" ? "video" : "call"}
              size={16}
            />
            <h4 className="text-base font-semibold text-[var(--text-primary)]">
              {call.callType === "video" ? "Video Call" : "Voice Call"}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-6 pt-6 pb-5 space-y-3 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)] flex items-center justify-center text-2xl font-semibold">
            {(call.recipientName || "?").trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            {call.recipientName}
          </div>
          <div className="text-[13px] tracking-wide text-[var(--text-tertiary)]">
            {call.recipientPhone}
          </div>
          <div className="text-[13px] text-[var(--text-secondary)]">
            {statusLabel}
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            {call.status !== "ended" ? (
              <button
                type="button"
                onClick={onEnd}
                ref={buttonRef}
                className="px-6 py-2.5 rounded-full bg-[var(--danger-color)] text-white font-medium hover:bg-[var(--danger-hover)] transition-all shadow-sm hover:shadow-md"
              >
                End Call
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                ref={buttonRef}
                className="px-6 py-2.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[color:rgba(124,58,237,0.10)] transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// NOTE: This component is currently unused but kept for future implementation of message search.
// When users search for messages, clicking a search result will open this modal to show
// the search result message with surrounding context. Currently, we load all messages in
// a chat, so showing context in a modal is redundant. See PLAN.md for details.
function MessageContextModal({
  isOpen,
  loading,
  error,
  data,
  onClose,
}: {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  data: MessageContextResponse | null;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-10">
      <div className="w-full max-w-xl bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25),0_2px_6px_-1px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--bg-secondary)]">
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              Message Context
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              Showing surrounding messages
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <InlineSpinner />
            </div>
          ) : error ? (
            <div className="p-3 bg-[var(--danger-color)]/10 border border-[var(--danger-color)]/30 rounded-lg text-sm text-[var(--danger-color)]">
              {error}
            </div>
          ) : data ? (
            <>
              {data.messages_before.map((msg) => (
                <div
                  key={`before-${msg.id}`}
                  className={`rounded-lg p-3 ${
                    msg.is_sent_by_me
                      ? "bg-[#A78BFA]/10 text-[var(--text-primary)]"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-1">
                    <span>{formatContextTime(msg.timestamp)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.id}]</span></span>
                    <span>{msg.status}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {getContextPreviewText(msg)}
                  </div>
                </div>
              ))}

              <div className="rounded-lg p-3 border border-[var(--accent-color)] bg-[var(--accent-color)]/10">
                <div className="flex items-center justify-between text-xs text-[var(--accent-color)] mb-1">
                  <span>
                    {formatContextTime(data.target_message.timestamp)}
                    <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{data.target_message.id}]</span>
                  </span>
                  <span>{data.target_message.status}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words text-[var(--text-primary)]">
                  {getContextPreviewText(data.target_message)}
                </div>
              </div>

              {data.messages_after.map((msg) => (
                <div
                  key={`after-${msg.id}`}
                  className={`rounded-lg p-3 ${
                    msg.is_sent_by_me
                      ? "bg-[#A78BFA]/10 text-[var(--text-primary)]"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-1">
                    <span>{formatContextTime(msg.timestamp)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.id}]</span></span>
                    <span>{msg.status}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {getContextPreviewText(msg)}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-sm text-[var(--text-secondary)] text-center py-6">
              Select a message to view context.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatProfilePanel({
  chat,
  groupMetadata,
  onClose,
}: {
  chat: Chat;
  groupMetadata?: GroupMetadata | null;
  onClose: () => void;
}) {
  const isGroup = chat.chat_jid.includes("@g.us");
  const phone = getPhoneNumberFromChatJid(chat.chat_jid);

  return (
    <div className="bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-[11px] font-medium tracking-wide text-[var(--text-tertiary)]">
          {isGroup ? "Group Info" : "Contact Info"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          Close
        </button>
      </div>
      <div className="px-5 pb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[color:rgba(124,58,237,0.12)] flex items-center justify-center text-[var(--accent-color)]">
            <Icon name={isGroup ? "users" : "user"} size={20} />
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">{chat.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{chat.chat_jid}]</span></div>
            {phone && (
              <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] mt-0.5">{phone}</div>
            )}
            {isGroup && groupMetadata && (
              <div className="text-[12px] tracking-wide text-[var(--text-tertiary)] mt-0.5">
                {groupMetadata.participants_count} members
              </div>
            )}
          </div>
        </div>
        <div className="text-[11px] tracking-wide text-[var(--text-tertiary)]">
          JID: {chat.chat_jid}
        </div>
        {isGroup && groupMetadata?.group_description && (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {groupMetadata.group_description}
          </div>
        )}
        {isGroup && groupMetadata?.creation_timestamp && (
          <div className="text-[11px] tracking-wide text-[var(--text-tertiary)]">
            Created: {new Date(groupMetadata.creation_timestamp).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupMembersPanel({
  metadata,
  onClose,
}: {
  metadata: GroupMetadata;
  onClose: () => void;
}) {
  return (
    <div className="bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-[11px] font-medium tracking-wide text-[var(--text-tertiary)]">
          Group Members ({metadata.participants_count || metadata.participants.length})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          Hide
        </button>
      </div>
      {metadata.group_description && (
        <div className="mx-5 mb-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)]/60 rounded-xl">
          {metadata.group_description}
        </div>
      )}
      <div className="max-h-36 overflow-auto pb-3 px-2">
        {metadata.participants.map((p) => (
          <div
            key={p.jid}
            className="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <span className="text-[var(--text-primary)] truncate">
              {p.name_in_address_book || p.profile_name || p.jid}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{p.jid}]</span>
            </span>
            {p.is_admin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
                Admin
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageComposer({
  messageText,
  onChangeMessage,
  onKeyPress,
  onSend,
  sending,
  sendError,
  focusKey,
  mediaOpen,
  mediaMode,
  mediaPath,
  caption,
  onToggleMedia,
  onMediaModeChange,
  onMediaPathChange,
  onCaptionChange,
  onSendMedia,
  onCloseMedia,
  sendingMedia,
  mediaError,
  isBlocked,
}: {
  messageText: string;
  onChangeMessage: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
  focusKey?: string | null;
  mediaOpen: boolean;
  mediaMode: "file" | "audio";
  mediaPath: string;
  caption: string;
  onToggleMedia: () => void;
  onMediaModeChange: (mode: "file" | "audio") => void;
  onMediaPathChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onSendMedia: () => void;
  onCloseMedia: () => void;
  sendingMedia: boolean;
  mediaError: string | null;
  isBlocked?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    textareaRef.current?.focus();
  }, [focusKey]);

  if (isBlocked) {
    return (
      <div className="px-5 py-4 bg-[var(--bg-primary)]">
        <div className="px-4 py-3 bg-[var(--danger-color)]/8 rounded-2xl text-center">
          <p className="text-sm text-[var(--danger-color)] font-medium">
            You cannot send messages to a blocked contact.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 tracking-wide">
            Unblock this contact to send messages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-4 bg-[var(--bg-primary)]">
      {sendError && (
        <div className="mb-2 px-3 py-2 bg-[var(--danger-color)]/8 rounded-xl">
          <p className="text-sm text-[var(--danger-color)]">{sendError}</p>
        </div>
      )}
      {mediaError && (
        <div className="mb-2 px-3 py-2 bg-[var(--danger-color)]/8 rounded-xl">
          <p className="text-sm text-[var(--danger-color)]">{mediaError}</p>
        </div>
      )}
      <div className="flex items-end gap-2 bg-[var(--bg-secondary)] rounded-3xl px-2 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-4px_rgba(15,23,42,0.08)] focus-within:shadow-[0_0_0_2px_rgba(124,58,237,0.20),0_4px_12px_-4px_rgba(124,58,237,0.18)] transition-shadow">
        <button
          type="button"
          onClick={onToggleMedia}
          className={`flex-shrink-0 p-2 rounded-full transition-all ${
            mediaOpen
              ? "bg-[color:rgba(124,58,237,0.12)] text-[var(--accent-color)]"
              : "text-[var(--text-tertiary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)]"
          }`}
          title="Attach media"
        >
          <Icon name="attachment" size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={messageText}
          onChange={(e) => onChangeMessage(e.target.value)}
          onKeyPress={onKeyPress}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 px-2 py-2 bg-transparent text-[var(--text-primary)] text-[14px] leading-[1.45] resize-none focus:outline-none placeholder:text-[var(--text-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed"
          rows={1}
          style={{ minHeight: "36px", maxHeight: "120px" }}
        />
        <button
          onClick={onSend}
          disabled={sending || !messageText.trim()}
          className="flex-shrink-0 h-9 px-4 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full transition-all text-sm font-medium shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {sending ? (
            <span className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Sending
            </span>
          ) : (
            "Send"
          )}
        </button>
      </div>
      <p className="text-[11px] tracking-wide text-[var(--text-tertiary)] mt-2 ml-2">
        Press Enter to send, Shift+Enter for new line
      </p>
      {mediaOpen && (
        <div className="mt-3 p-4 rounded-2xl bg-[var(--bg-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-4px_rgba(15,23,42,0.08)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
              Send Media
            </div>
            <button
              type="button"
              onClick={onCloseMedia}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-full p-1">
            <button
              type="button"
              onClick={() => onMediaModeChange("file")}
              className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                mediaMode === "file"
                  ? "bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => onMediaModeChange("audio")}
              className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                mediaMode === "audio"
                  ? "bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Audio
            </button>
          </div>
          <div>
            <label className="block text-[11px] tracking-wide font-medium text-[var(--text-secondary)] mb-1.5">
              File path
            </label>
            <input
              type="text"
              value={mediaPath}
              onChange={(e) => onMediaPathChange(e.target.value)}
              placeholder="/absolute/path/to/file"
              className="w-full px-3.5 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-primary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
            />
            <p className="text-[11px] tracking-wide text-[var(--text-tertiary)] mt-1 ml-1">
              Use a local absolute path accessible to the backend.
            </p>
          </div>
          {mediaMode === "file" && (
            <div>
              <label className="block text-[11px] tracking-wide font-medium text-[var(--text-secondary)] mb-1.5">
                Caption (optional)
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => onCaptionChange(e.target.value)}
                placeholder="Add a caption"
                className="w-full px-3.5 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm focus:outline-none focus:bg-[var(--bg-primary)] focus:ring-2 focus:ring-[var(--accent-color)]/40 placeholder:text-[var(--text-tertiary)] transition-all"
              />
            </div>
          )}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onSendMedia}
              disabled={sendingMedia || !mediaPath.trim()}
              className="px-5 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {sendingMedia
                ? "Sending..."
                : mediaMode === "audio"
                  ? "Send Audio"
                  : "Send File"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationView({
  selectedChat,
  messages,
  isDemoChat,
  onOpenMedia,
  onArchiveChat,
  onPinChat,
  onMuteChat,
  onVoiceCall,
  onVideoCall,
  canCall,
  callDisabledReason,
  calling,
  callError,
  messageText,
  onMessageChange,
  onKeyPress,
  onSend,
  sending,
  sendError,
  focusKey,
  mediaOpen,
  mediaMode,
  mediaPath,
  caption,
  onToggleMedia,
  onMediaModeChange,
  onMediaPathChange,
  onCaptionChange,
  onSendMedia,
  onCloseMedia,
  sendingMedia,
  mediaError,
  groupMetadata,
  showGroupMembers,
  onToggleGroupMembers,
  onForwardMessage,
  chatProfileOpen,
  onToggleChatProfile,
  isBlocked,
}: {
  selectedChat: Chat | null;
  messages: Message[];
  isDemoChat: boolean;
  onOpenMedia?: (message: Message) => void;
  onArchiveChat?: (chat: Chat) => void;
  onPinChat?: (chat: Chat) => void;
  onMuteChat?: (chat: Chat) => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  canCall?: boolean;
  callDisabledReason?: string;
  calling?: boolean;
  callError?: string | null;
  messageText: string;
  onMessageChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
  focusKey?: string | null;
  mediaOpen: boolean;
  mediaMode: "file" | "audio";
  mediaPath: string;
  caption: string;
  onToggleMedia: () => void;
  onMediaModeChange: (mode: "file" | "audio") => void;
  onMediaPathChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onSendMedia: () => void;
  onCloseMedia: () => void;
  sendingMedia: boolean;
  mediaError: string | null;
  groupMetadata?: GroupMetadata | null;
  showGroupMembers?: boolean;
  onToggleGroupMembers?: () => void;
  onForwardMessage?: (message: Message) => void;
  chatProfileOpen?: boolean;
  onToggleChatProfile?: () => void;
  isBlocked?: boolean;
}) {
  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-primary)]">
        <div className="text-center max-w-sm px-6">
          <div className="mb-5 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.10)] flex items-center justify-center text-[var(--accent-color)]">
              <Icon name="whatsup" size={40} />
            </div>
          </div>
          <p className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
            Select a chat to start messaging
          </p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1.5 tracking-wide">
            Choose a conversation from the list, or start a new one.
          </p>
        </div>
      </div>
    );
  }

  const isGroup = selectedChat.chat_jid.includes("@g.us");

  return (
    <>
      <ConversationHeader
        title={selectedChat.name}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
        canCall={canCall}
        callDisabledReason={callDisabledReason}
        calling={calling}
        showPinAction
        isPinned={Boolean(selectedChat.is_pinned)}
        onPin={onPinChat ? () => onPinChat(selectedChat) : undefined}
        showMuteAction
        isMuted={Boolean(selectedChat.is_muted_until)}
        onMute={onMuteChat ? () => onMuteChat(selectedChat) : undefined}
        showArchiveAction
        isArchived={Boolean(selectedChat.is_archived)}
        onArchive={
          onArchiveChat ? () => onArchiveChat(selectedChat) : undefined
        }
        onTitleClick={onToggleChatProfile}
        isGroup={isGroup}
        groupMemberCount={groupMetadata?.participants_count}
        onToggleGroupMembers={onToggleGroupMembers}
      />
      {showGroupMembers && groupMetadata && (
        <GroupMembersPanel
          metadata={groupMetadata}
          onClose={() => onToggleGroupMembers?.()}
        />
      )}
      {chatProfileOpen && (
        <ChatProfilePanel
          chat={selectedChat}
          groupMetadata={isGroup ? groupMetadata : undefined}
          onClose={() => onToggleChatProfile?.()}
        />
      )}
      {callError && (
        <div className="mx-5 mt-3 px-3 py-2 bg-[var(--danger-color)]/8 rounded-xl">
          <p className="text-sm text-[var(--danger-color)]">{callError}</p>
        </div>
      )}
      <div className="flex-1 relative">
        <MessageList
          messages={messages}
          isDemoChat={isDemoChat}
          onOpenMedia={onOpenMedia}
          onForwardMessage={onForwardMessage}
          scrollToBottomKey={selectedChat.chat_jid}
        />
      </div>
      <MessageComposer
        messageText={messageText}
        onChangeMessage={onMessageChange}
        onKeyPress={onKeyPress}
        onSend={onSend}
        sending={sending}
        sendError={sendError}
        focusKey={focusKey}
        mediaOpen={mediaOpen}
        mediaMode={mediaMode}
        mediaPath={mediaPath}
        caption={caption}
        onToggleMedia={onToggleMedia}
        onMediaModeChange={onMediaModeChange}
        onMediaPathChange={onMediaPathChange}
        onCaptionChange={onCaptionChange}
        onSendMedia={onSendMedia}
        onCloseMedia={onCloseMedia}
        sendingMedia={sendingMedia}
        mediaError={mediaError}
        isBlocked={isBlocked}
      />
    </>
  );
}

// =====================================================================================
// CALL DETAILS COMPONENTS
// =====================================================================================

function CallsDetailsView({
  selectedCall,
}: {
  selectedCall: CallEntry | null;
}) {
  if (!selectedCall) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-primary)]">
        <div className="text-center max-w-sm px-6">
          <div className="mb-5 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.10)] flex items-center justify-center text-[var(--accent-color)]">
              <Icon name="call" size={36} />
            </div>
          </div>
          <p className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
            Select a call to view details
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ConversationHeader title="Call Details" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-xl space-y-4">
          <ContactDetailCard
            label="Call ID"
            value={selectedCall.id}
            valueClassName="text-xs text-[var(--text-secondary)] break-all"
          />
          <ContactDetailCard
            label="Contact"
            value={selectedCall.contactName}
            valueClassName="text-lg font-semibold text-[var(--text-primary)]"
          />
          <ContactDetailCard
            label="Phone Number"
            value={selectedCall.phoneNumber || "Not available"}
          />
          <ContactDetailCard
            label="Call Type"
            value={selectedCall.isVideo ? "Video Call" : "Voice Call"}
          />
          <ContactDetailCard
            label="Time"
            value={new Date(selectedCall.timestamp).toLocaleString()}
          />
          <ContactDetailCard
            label="Status"
            value={selectedCall.status === "completed" ? "Completed" : "Missed"}
          />
        </div>
      </div>
    </>
  );
}

// =====================================================================================
// CONTACT DETAILS COMPONENTS
// =====================================================================================

function ContactsDetailsView({
  selectedContact,
  onMessageContact,
  onBlockContact,
  onViewContactChats,
  startingChat,
  startChatError,
  isBlocked,
}: {
  selectedContact: Contact | null;
  onMessageContact: (contact: Contact) => void;
  onBlockContact: (contact: Contact, isBlocked: boolean) => void;
  onViewContactChats?: (contact: Contact) => void;
  startingChat: boolean;
  startChatError: string | null;
  isBlocked: boolean;
}) {
  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-primary)]">
        <div className="text-center max-w-sm px-6">
          <div className="mb-5 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[color:rgba(124,58,237,0.10)] flex items-center justify-center text-[var(--accent-color)]">
              <Icon name="user" size={40} />
            </div>
          </div>
          <p className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
            Select a contact to view details
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ConversationHeader title="Contact Details" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-xl space-y-4">
          {selectedContact.is_whatsup_user && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onMessageContact(selectedContact)}
                disabled={startingChat || !selectedContact.phone_number}
                className="flex-1 min-w-[180px] px-5 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-full transition-all font-medium text-sm shadow-sm hover:shadow-md hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                title={
                  !selectedContact.phone_number
                    ? "Phone number not available"
                    : ""
                }
              >
                {startingChat ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Opening chat...
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Icon name="whatsup" size={16} />
                    Message
                  </span>
                )}
              </button>
              {onViewContactChats && (
                <button
                  onClick={() => onViewContactChats(selectedContact)}
                  className="flex-1 min-w-[180px] px-5 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[color:rgba(124,58,237,0.10)] hover:text-[var(--accent-color)] text-[var(--text-primary)] rounded-full transition-all font-medium text-sm"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Icon name="message" size={16} />
                    View chats
                  </span>
                </button>
              )}
              <button
                onClick={() => onBlockContact(selectedContact, isBlocked)}
                className={`flex-1 min-w-[180px] px-5 py-2.5 rounded-full font-medium text-sm transition-all ${
                  isBlocked
                    ? "bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white shadow-sm hover:shadow-md hover:-translate-y-px"
                    : "bg-transparent hover:bg-[var(--danger-color)]/10 text-[var(--danger-color)]"
                }`}
              >
                {isBlocked ? "Unblock contact" : "Block contact"}
              </button>
            </div>
          )}
          {startChatError && (
            <div className="p-3 bg-[var(--danger-color)]/10 border border-[var(--danger-color)]/30 rounded-lg">
              <p className="text-sm text-[var(--danger-color)]">
                {startChatError}
              </p>
            </div>
          )}

          <ContactDetailCard
            label="Display Name"
            value={getContactDisplayName(selectedContact)}
            valueClassName="text-lg font-semibold text-[var(--text-primary)]"
          />
          <ContactDetailCard
            label={`${APP_NAME} Profile`}
            value={selectedContact.profile_name || "No profile name"}
          />
          <ContactDetailCard
            label="Phone Number"
            value={selectedContact.phone_number || "Not available"}
          />
          <ContactDetailCard
            label={`${APP_NAME} Status`}
            value={
              selectedContact.is_whatsup_user
                ? `Active ${APP_NAME} user`
                : `Not on ${APP_NAME}`
            }
          />
          <ContactDetailCard
            label="JID"
            value={selectedContact.jid}
            valueClassName="text-xs text-[var(--text-secondary)] break-all"
          />
        </div>
      </div>
    </>
  );
}

// =====================================================================================
// MAIN COMPONENT
// =====================================================================================

export default function WhatsupApp({ setRefreshHandler }: AppProps) {
  const whatsupThemeVars = {
    "--accent-color": "#7C3AED",
    "--accent-hover": "#6D28D9",
    "--success-color": "#047857",
    "--warning-color": "#b45309",
    "--danger-color": "#dc2626",
    "--danger-hover": "#b91c1c",
    "--text-primary": "#1e1b29",
    "--text-secondary": "#5b5670",
    "--text-tertiary": "#8a849a",
    "--bg-primary": "#fbfaf7",
    "--bg-secondary": "#ffffff",
    "--bg-tertiary": "#f4f1ec",
    "--border-color": "rgba(40, 30, 60, 0.06)",
    "--chat-outgoing-bg": "#7C3AED",
  } as React.CSSProperties;

  const {
    callTool,
    chats,
    selectedChat,
    messages,
    addLocalMessage,
    loading,
    error,
    loadChats,
    loadMessages,
    openPlaceholderChat,
    markChatReadOptimistic,
    refreshAll,
    updateMutedStatus,
    updateChatPinLocal,
    updateChatArchiveLocal,
    groupMetadata,
    loadGroupMetadata,
  } = useWhatsupData();

  useRefreshHandler(setRefreshHandler, refreshAll);

  const [messageFocusNonce, setMessageFocusNonce] = useState(0);
  const [localDemoMessages, setLocalDemoMessages] = useState<Message[]>(DEMO_MESSAGES);
  const selectedChatRef = useRef(selectedChat);
  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  const handleMessageSent = useCallback(async () => {
    // Reload messages and chat list in parallel so the new message appears quickly
    const currentChat = selectedChatRef.current;
    await Promise.all([
      currentChat && !currentChat.is_demo && !currentChat.is_local ? loadMessages(currentChat) : undefined,
      loadChats({ silent: true }),
    ]);
    setMessageFocusNonce((prev) => prev + 1);
  }, [loadMessages, loadChats]);

  const handleMediaSent = useCallback(async () => {
    await refreshAll({ silent: true });
  }, [refreshAll]);

  const handleDemoMessageSent = useCallback((msg: Message) => {
    setLocalDemoMessages((prev) => [...prev, msg]);
    setMessageFocusNonce((prev) => prev + 1);
  }, []);

  const handleLocalMessageSent = useCallback((msg: Message) => {
    addLocalMessage(msg);
    setMessageFocusNonce((prev) => prev + 1);
  }, [addLocalMessage]);

  // Check if the currently selected chat's contact is blocked (needed early for message composer)
  const [blockedContacts, setBlockedContacts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("whatsup_blocked_contacts");
      if (stored) {
        return new Set(JSON.parse(stored) as string[]);
      }
    } catch {
      // Ignore parse errors
    }
    return new Set();
  });

  // Persist blocked contacts to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "whatsup_blocked_contacts",
        JSON.stringify(Array.from(blockedContacts)),
      );
    } catch {
      // Ignore storage errors
    }
  }, [blockedContacts]);

  // Blocked contacts are persisted via localStorage only.
  // We cannot store is_blocked in the DB because the WhatsupContact model
  // uses StrictBaseModel which rejects unknown fields.

  const isSelectedChatBlocked = useMemo(() => {
    if (!selectedChat) return false;
    if (selectedChat.chat_jid.includes("@g.us")) return false;
    // Check direct match
    if (blockedContacts.has(selectedChat.chat_jid)) return true;
    // Check with people/ prefix (contact JIDs use this format)
    if (blockedContacts.has(`people/${selectedChat.chat_jid}`)) return true;
    // Check if any blocked JID matches without people/ prefix
    for (const blockedJid of blockedContacts) {
      const stripped = blockedJid.startsWith("people/") ? blockedJid.slice(7) : blockedJid;
      if (stripped === selectedChat.chat_jid) return true;
    }
    return false;
  }, [selectedChat, blockedContacts]);

  const { messageText, setMessageText, sending, sendError, sendMessage } =
    useMessageComposer({
      callTool,
      selectedChat,
      onMessageSent: handleMessageSent,
      onDemoMessageSent: handleDemoMessageSent,
      onLocalMessageSent: handleLocalMessageSent,
      isBlocked: isSelectedChatBlocked,
    });

  const {
    mediaPath,
    setMediaPath,
    caption,
    setCaption,
    mediaMode,
    setMediaMode,
    mediaOpen,
    toggleMediaOpen,
    closeMedia,
    sendingMedia,
    mediaError,
    sendMedia,
  } = useMediaSender({
    callTool,
    selectedChat,
    onMediaSent: handleMediaSent,
  });

  const {
    activeMedia,
    downloading: downloadingMediaFile,
    downloadError,
    downloadStatus,
    openMedia,
    closeMedia: closeMediaViewer,
    downloadMedia,
  } = useMediaViewer(callTool);

  // NOTE: Message context hook is commented out until we implement search functionality
  // const {
  //   contextOpen,
  //   contextLoading,
  //   contextError,
  //   contextData,
  //   openContext,
  //   closeContext,
  // } = useMessageContext(callTool)

  const { activeView, setActiveView } = useSidebarView();
  const {
    contacts,
    query: contactQuery,
    setQuery: setContactQuery,
    loading: contactsLoading,
    error: contactsError,
    selectedContact,
    setSelectedContact,
    loadAllContacts,
    hasLoadedAll,
  } = useContacts(callTool);

  const {
    starting: startingChat,
    startError: startChatError,
    startChatWithContact,
  } = useStartChat(callTool);

  const {
    activeCall,
    callError,
    initiateCall,
    endCall,
    clearCall,
    callHistory,
    selectedCall,
    setSelectedCall,
    clearHistory,
  } = useMakeCall(callTool);

  const {
    archiveChat,
    pinChat,
    muteChat,
    markAsRead,
    markMessagesAsRead,
    actionInProgress,
  } = useChatActions(callTool, loadChats, updateMutedStatus, updateChatPinLocal, updateChatArchiveLocal);

  const {
    blockContact,
    blocking,
  } = useContactActions(callTool);

  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [chatProfileOpen, setChatProfileOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [newChatSearchQuery, setNewChatSearchQuery] = useState("");
  const [newCallSearchQuery, setNewCallSearchQuery] = useState("");
  const [pendingChat, setPendingChat] = useState<Chat | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [uiState, setUiState] = useState<UiState>({
    newChatMode: false,
    newCallMode: false,
    addContactOpen: false,
    settingsOpen: false,
    archiveInfoOpen: false,
    muteModalOpen: false,
    muteModalChat: null,
    blockModalOpen: false,
    blockModalContact: null,
    blockModalIsBlocked: false,
  });
  const updateUiState = useCallback((updates: Partial<UiState>) => {
    setUiState((prev) => ({ ...prev, ...updates }));
  }, []);
  const {
    newChatMode,
    newCallMode,
    addContactOpen,
    settingsOpen,
    archiveInfoOpen,
    muteModalOpen,
    muteModalChat,
    blockModalOpen,
    blockModalContact,
    blockModalIsBlocked,
  } = uiState;

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isSelectedChatBlocked) return;
      sendMessage();
    }
  }, [isSelectedChatBlocked, sendMessage]);

  const openChatByJid = useCallback(
    async (chatJid: string, fallbackName?: string) => {
      // Try exact match first, then try stripping people/ prefix
      let existingChat = chats.find((chat) => chat.chat_jid === chatJid);
      if (!existingChat && chatJid.startsWith("people/")) {
        const stripped = chatJid.slice(7);
        existingChat = chats.find((chat) => chat.chat_jid === stripped);
        if (existingChat) chatJid = stripped;
      }
      if (existingChat) {
        setPendingChat(null);
        await loadMessages(existingChat);
        return;
      }

      // Even if the chat isn't in our local list, try to load messages from the backend
      // (it may exist on the server but not yet in the sidebar)
      const placeholderChat: Chat = {
        chat_jid: chatJid,
        name: fallbackName || "New chat",
        last_message: "No messages yet",
      };
      setPendingChat(placeholderChat);
      await loadMessages(placeholderChat);
    },
    [chats, loadMessages],
  );

  const handleMessageContact = useCallback(
    async (contact: Contact) => {
      if (!contact.phone_number) {
        return;
      }
      // If the contact is blocked, add their resolved JID to blockedContacts so the
      // conversation view shows the blocked warning
      const chatJid = await startChatWithContact(contact.phone_number);
      let resolvedChatJid = chatJid || contact.jid;
      // Strip "people/" prefix from JID — chat JIDs in the DB don't use this prefix
      if (resolvedChatJid && resolvedChatJid.startsWith("people/")) {
        resolvedChatJid = resolvedChatJid.slice(7);
      }
      // If the JID doesn't look like a Whatsup JID, try to derive one from the phone number
      if (resolvedChatJid && !resolvedChatJid.includes("@")) {
        const digits = contact.phone_number.replace(/[^0-9]/g, "");
        if (digits) {
          resolvedChatJid = `${digits}@s.whatsup.net`;
        }
      }
      if (resolvedChatJid) {
        // Carry blocked status to the chat view
        if (blockedContacts.has(contact.jid)) {
          setBlockedContacts((prev) => {
            const updated = new Set(prev);
            updated.add(resolvedChatJid);
            return updated;
          });
        }
        setActiveView("chats");
        await openChatByJid(resolvedChatJid, getContactDisplayName(contact));
        await loadChats();
      }
    },
    [startChatWithContact, setActiveView, openChatByJid, loadChats, blockedContacts],
  );

  const handleViewContactChats = useCallback(
    async (contact: Contact) => {
      try {
        const result = await callTool<{ chats?: any[] }>(
          "get_contact_chats",
          { jid: contact.jid },
        );
        if (result?.chats && result.chats.length > 0) {
          // Switch to chats view and select the first chat
          setActiveView("chats");
          const firstChat = mapChatFromApi(result.chats[0]);
          loadMessages(firstChat);
        }
      } catch (err) {
        console.error("Failed to get contact chats:", err);
      }
    },
    [callTool, setActiveView, loadMessages],
  );

  const handleStartNewChat = useCallback(() => {
    updateUiState({ newChatMode: true });
    setNewChatSearchQuery("");
    // Load contacts if not already loaded
    if (!hasLoadedAll) {
      loadAllContacts();
    }
  }, [hasLoadedAll, loadAllContacts, updateUiState]);

  const handleCancelNewChat = useCallback(() => {
    updateUiState({ newChatMode: false });
    setNewChatSearchQuery("");
  }, [updateUiState]);

  const handleStartNewCall = useCallback(() => {
    updateUiState({ newCallMode: true });
    setNewCallSearchQuery("");
    // Load contacts if not already loaded
    if (!hasLoadedAll) {
      loadAllContacts();
    }
  }, [hasLoadedAll, loadAllContacts, updateUiState]);

  const handleCancelNewCall = useCallback(() => {
    updateUiState({ newCallMode: false });
    setNewCallSearchQuery("");
  }, [updateUiState]);

  const handleSelectContactFromNewCall = useCallback(
    async (contact: Contact, callType: CallType) => {
      if (!contact.phone_number) {
        return;
      }
      // Exit new call mode
      updateUiState({ newCallMode: false });
      setNewCallSearchQuery("");

      // Initiate the call
      await initiateCall(
        getContactDisplayName(contact),
        contact.phone_number,
        callType,
      );
    },
    [initiateCall, updateUiState],
  );

  const handleOpenAddContact = useCallback(() => {
    updateUiState({ addContactOpen: true });
  }, [updateUiState]);

  const handleCloseAddContact = useCallback(() => {
    updateUiState({ addContactOpen: false });
  }, [updateUiState]);

  const handleContactCreated = useCallback(() => {
    loadAllContacts();
  }, [loadAllContacts]);

  const handleSelectContactFromNewChat = useCallback(
    async (contact: Contact) => {
      if (!contact.phone_number) {
        return;
      }
      // Exit new chat mode
      updateUiState({ newChatMode: false });
      setNewChatSearchQuery("");

      // Start the chat
      const chatJid = await startChatWithContact(contact.phone_number);
      const resolvedChatJid = chatJid || contact.jid;
      if (resolvedChatJid) {
        setActiveView("chats");
        await openChatByJid(resolvedChatJid, getContactDisplayName(contact));
        await loadChats();
      }
    },
    [
      startChatWithContact,
      setActiveView,
      openChatByJid,
      loadChats,
      updateUiState,
    ],
  );

  useEffect(() => {
    if (activeView === "contacts" && !hasLoadedAll) {
      loadAllContacts();
    }
  }, [activeView, hasLoadedAll, loadAllContacts]);

  useEffect(() => {
    if (
      pendingChat &&
      chats.some((chat) => chat.chat_jid === pendingChat.chat_jid)
    ) {
      setPendingChat(null);
    }
  }, [pendingChat, chats]);

  // Filter contacts for new chat search
  const newChatFilteredContacts = useMemo(() => {
    if (!newChatSearchQuery.trim()) return contacts;
    const trimmed = newChatSearchQuery.trim().toLowerCase();
    return contacts.filter((contact) =>
      getContactSearchText(contact).includes(trimmed),
    );
  }, [contacts, newChatSearchQuery]);

  // Filter contacts for new call search (only Whatsup users with phone numbers)
  const newCallFilteredContacts = useMemo(() => {
    const whatsupContacts = contacts.filter((c) => c.phone_number);
    if (!newCallSearchQuery.trim()) return whatsupContacts;
    const trimmed = newCallSearchQuery.trim().toLowerCase();
    return whatsupContacts.filter((contact) =>
      getContactSearchText(contact).includes(trimmed),
    );
  }, [contacts, newCallSearchQuery]);

  const demoChat = DEMO_CHAT;
  const demoArchivedChats = DEMO_ARCHIVED_CHATS;
  const demoMessages = localDemoMessages;

  const [showGroupMembers, setShowGroupMembers] = useState(false);

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      if (chat.is_demo) {
        openPlaceholderChat(chat);
        return;
      }
      if (pendingChat && chat.chat_jid === pendingChat.chat_jid) {
        openPlaceholderChat(chat);
        return;
      }
      // Call backend mark_chat_as_read if there are unread messages
      if (chat.unread_count && chat.unread_count > 0) {
        markAsRead(chat.chat_jid);
      }
      markChatReadOptimistic(chat.chat_jid);
      loadMessages(chat).then((loadedMessages) => {
        // Mark individual messages as read using mark_messages_as_read
        if (loadedMessages && loadedMessages.length > 0) {
          const incomingMessageIds = loadedMessages
            .filter((m: any) => !m.is_outgoing && m.status !== "read")
            .map((m: any) => m.message_id);
          if (incomingMessageIds.length > 0) {
            markMessagesAsRead(chat.chat_jid, incomingMessageIds);
          }
        }
      });
      // Load group metadata for group chats
      if (chat.chat_jid.includes("@g.us")) {
        loadGroupMetadata(chat.chat_jid);
      }
      setShowGroupMembers(false);
    },
    [pendingChat, openPlaceholderChat, loadMessages, markChatReadOptimistic, markAsRead, markMessagesAsRead, loadGroupMetadata],
  );

  const handleArchiveChat = useCallback(
    async (chat: Chat) => {
      await archiveChat(chat.chat_jid, !chat.is_archived);
    },
    [archiveChat],
  );

  const handlePinChat = useCallback(
    async (chat: Chat) => {
      await pinChat(chat.chat_jid, !chat.is_pinned);
    },
    [pinChat],
  );

  const handleMuteChat = useCallback(
    (chat: Chat) => {
      if (chat.is_muted_until) {
        // Currently muted - unmute directly
        muteChat(chat.chat_jid, null);
      } else {
        // Not muted - open duration modal
        updateUiState({ muteModalOpen: true, muteModalChat: chat });
      }
    },
    [muteChat, updateUiState],
  );

  const handleMuteDurationSelect = useCallback(
    async (duration: MuteDuration) => {
      if (muteModalChat) {
        await muteChat(muteModalChat.chat_jid, duration);
        updateUiState({ muteModalOpen: false, muteModalChat: null });
      }
    },
    [muteChat, muteModalChat, updateUiState],
  );

  const handleBlockContact = useCallback(
    (contact: Contact, isBlocked: boolean = false) => {
      updateUiState({
        blockModalOpen: true,
        blockModalContact: contact,
        blockModalIsBlocked: isBlocked,
      });
    },
    [updateUiState],
  );

  const handleBlockConfirm = useCallback(async () => {
    if (blockModalContact) {
      const newBlockedState = !blockModalIsBlocked;
      // Try backend call but don't require it to succeed — blocking works locally
      try {
        await blockContact(blockModalContact.jid, newBlockedState);
      } catch {
        // Backend may not support blocking; proceed with local state
      }
      // Block state is persisted via localStorage (see useEffect above).
      // We cannot store is_blocked in the DB contact's whatsup object because
      // the backend WhatsupContact model uses StrictBaseModel which rejects
      // unknown fields, causing a Pydantic validation error that corrupts the
      // entire state endpoint.
      // Update blocked contacts set regardless of backend result
      // Store both the contact JID and the stripped version for matching with chat JIDs
      setBlockedContacts((prev) => {
        const updated = new Set(prev);
        const jid = blockModalContact.jid;
        const stripped = jid.startsWith("people/") ? jid.slice(7) : jid;
        if (newBlockedState) {
          updated.add(jid);
          if (stripped !== jid) updated.add(stripped);
        } else {
          updated.delete(jid);
          updated.delete(stripped);
          updated.delete(`people/${stripped}`);
        }
        return updated;
      });
      updateUiState({
        blockModalOpen: false,
        blockModalContact: null,
        blockModalIsBlocked: false,
      });
    }
  }, [blockContact, blockModalContact, blockModalIsBlocked, updateUiState]);

  const handleForwardMessage = useCallback((message: Message) => {
    setForwardMessage(message);
    setForwardModalOpen(true);
  }, []);

  const handleForwardToChat = useCallback(
    async (targetChatJid: string) => {
      if (!forwardMessage) return;
      setForwarding(true);
      try {
        const text = forwardMessage.text_content
          ? forwardMessage.text_content
          : forwardMessage.media_info
            ? `[Forwarded: ${forwardMessage.media_info.media_type}] ${forwardMessage.media_info.caption || forwardMessage.media_info.file_name || ""}`
            : "[Forwarded message]";
        const result = await callTool<{ success?: boolean }>("send_message", {
          recipient: targetChatJid,
          message: text,
        });
        if (result?.success) {
          setForwardModalOpen(false);
          setForwardMessage(null);
          await loadChats({ silent: true });
        }
      } catch (err) {
        console.error("Forward message failed:", err);
      } finally {
        setForwarding(false);
      }
    },
    [callTool, forwardMessage, loadChats],
  );

  const handleToggleChatProfile = useCallback(() => {
    setChatProfileOpen((prev) => !prev);
  }, []);

  const handleOpenCreateGroup = useCallback(() => {
    setCreateGroupOpen(true);
    if (!hasLoadedAll) {
      loadAllContacts();
    }
  }, [hasLoadedAll, loadAllContacts]);

  const handleCreateGroup = useCallback(
    async (name: string, memberJids: string[]) => {
      setCreatingGroup(true);
      try {
        // Create a local group chat that appears in the sidebar
        const groupJid = `${Date.now()}-${Math.random().toString(36).slice(2)}@g.us`;
        const now = new Date().toISOString();
        const groupChat: Chat = {
          chat_jid: groupJid,
          name,
          last_message: `Group created with ${memberJids.length} member${memberJids.length !== 1 ? "s" : ""}`,
          last_message_timestamp: now,
          last_active_timestamp: now,
          is_pinned: false,
          unread_count: 0,
          is_local: true,
        };

        // Persist the group chat to the backend DB state
        try {
          const response = await fetch("./api/services/whatsup/state");
          if (response.ok) {
            const data = await response.json();
            const state = data?.state;
            if (state) {
              if (!state.chats) state.chats = {};
              state.chats[groupJid] = {
                chat_jid: groupJid,
                name,
                is_group: true,
                last_active_timestamp: now,
                unread_count: 0,
                is_archived: false,
                is_pinned: false,
                is_muted_until: null,
                group_metadata: {
                  group_description: "",
                  creation_timestamp: now,
                  owner_jid: state.current_user_jid || "me",
                  participants_count: memberJids.length + 1,
                  participants: [
                    ...(state.current_user_jid
                      ? [{ jid: state.current_user_jid, name_in_address_book: null, profile_name: "Me", is_admin: true }]
                      : []),
                    ...memberJids.map((jid: string) => ({
                      jid,
                      name_in_address_book: null,
                      profile_name: null,
                      is_admin: false,
                    })),
                  ],
                },
                messages: [],
              };
              await fetch("./api/services/whatsup/state", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state }),
              });
            }
          }
        } catch {
          // Best-effort persistence
        }

        // Add the group chat to the sidebar and select it immediately
        setPendingChat(groupChat);
        openPlaceholderChat(groupChat);
        setCreateGroupOpen(false);

        // Send invitation messages to all members concurrently (fire-and-forget)
        Promise.allSettled(
          memberJids.map((jid) =>
            callTool("send_message", {
              recipient: jid,
              message: `You have been invited to group "${name}"`,
            }),
          ),
        )
          .then(() => {
            loadChats({ silent: true });
          })
          .catch(console.error);
      } catch (err) {
        console.error("Create group failed:", err);
      } finally {
        setCreatingGroup(false);
      }
    },
    [callTool, loadChats, openPlaceholderChat],
  );

  const handleSelectCall = useCallback(
    (call: CallEntry) => {
      setSelectedCall(call);
    },
    [setSelectedCall],
  );

  const handleVoiceCall = useCallback(async () => {
    if (!selectedChat) return;
    const phoneNumber = getPhoneNumberFromChatJid(selectedChat.chat_jid);
    if (!phoneNumber) return;
    await initiateCall(selectedChat.name, phoneNumber, "voice");
  }, [initiateCall, selectedChat]);

  const handleVideoCall = useCallback(async () => {
    if (!selectedChat) return;
    const phoneNumber = getPhoneNumberFromChatJid(selectedChat.chat_jid);
    if (!phoneNumber) return;
    await initiateCall(selectedChat.name, phoneNumber, "video");
  }, [initiateCall, selectedChat]);

  const chatListForSidebar = useMemo(() => {
    if (!pendingChat) return chats;
    if (chats.some((chat) => chat.chat_jid === pendingChat.chat_jid))
      return chats;
    return [pendingChat, ...chats];
  }, [chats, pendingChat]);

  const chatsWithDemo = useMemo(() => {
    if (!demoMode) return chatListForSidebar;
    if (chatListForSidebar.some((chat) => chat.chat_jid === demoChat.chat_jid))
      return chatListForSidebar;
    const sorted = sortChatsByPriority([...chatListForSidebar, demoChat]);
    const rest = sorted.filter(
      (chat) =>
        chat.chat_jid !== demoChat.chat_jid &&
        chat.chat_jid !== pendingChat?.chat_jid,
    );
    if (!pendingChat) return [demoChat, ...rest];
    return [pendingChat, demoChat, ...rest];
  }, [demoMode, demoChat, chatListForSidebar, pendingChat]);

  const archivedChatsFromApi = useMemo(
    () => chatsWithDemo.filter((chat) => chat.is_archived),
    [chatsWithDemo],
  );

  const archivedChats = useMemo(() => {
    if (archivedChatsFromApi.length > 0) return archivedChatsFromApi;
    if (!demoMode) return [];
    return demoArchivedChats;
  }, [archivedChatsFromApi, demoMode, demoArchivedChats]);

  const activeChats = useMemo(
    () => chatsWithDemo.filter((chat) => !chat.is_archived),
    [chatsWithDemo],
  );

  const displayedMessages = useMemo(() => {
    if (!demoMode) return messages;
    if (selectedChat?.chat_jid === demoChat.chat_jid) return demoMessages;
    return messages;
  }, [demoMode, messages, selectedChat, demoChat, demoMessages]);

  const demoCalls = DEMO_CALLS;

  const callsWithDemo = useMemo(() => {
    const merged = demoMode ? [...callHistory, ...demoCalls] : callHistory;
    return merged.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [callHistory, demoCalls, demoMode]);

  const isGroupChat = Boolean(selectedChat?.chat_jid?.includes("@g.us"));
  const selectedChatPhone = useMemo(
    () => getPhoneNumberFromChatJid(selectedChat?.chat_jid),
    [selectedChat],
  );
  const callDisabledReason = !selectedChat
    ? "Select a chat to start a call"
    : selectedChat.is_demo
      ? "Calls are not available for the demo chat"
      : isGroupChat
        ? "Calls are only available for direct chats"
        : !selectedChatPhone
          ? "Phone number not available for this chat"
          : "";
  const canCallSelectedChat = Boolean(
    selectedChat && selectedChatPhone && !selectedChat.is_demo && !isGroupChat,
  );

  const isDemoChatSelected =
    demoMode && selectedChat?.chat_jid === demoChat.chat_jid;
  const handleOpenMedia = useCallback(
    (message: Message) => {
      if (!selectedChat) return;
      openMedia(message, selectedChat.chat_jid, isDemoChatSelected);
    },
    [openMedia, selectedChat, isDemoChatSelected],
  );

  return (
    <div
      className="h-full flex bg-[var(--bg-primary)]"
      style={whatsupThemeVars}
    >
      <ChatListSidebar
        activeView={activeView}
        onChangeView={setActiveView}
        chats={activeChats}
        archivedChats={archivedChats}
        selectedChat={selectedChat}
        loading={loading}
        error={error}
        onSelectChat={handleSelectChat}
        onRefreshChats={loadChats}
        calls={callsWithDemo}
        selectedCall={selectedCall}
        onSelectCall={handleSelectCall}
        showCallNotice
        hasCalls={callHistory.length > 0}
        contacts={contacts}
        selectedContact={selectedContact}
        contactQuery={contactQuery}
        onContactQueryChange={setContactQuery}
        contactsLoading={contactsLoading}
        contactsError={contactsError}
        onSelectContact={setSelectedContact}
        onRefreshContacts={loadAllContacts}
        newChatMode={newChatMode}
        newChatSearchQuery={newChatSearchQuery}
        newChatFilteredContacts={newChatFilteredContacts}
        onNewChat={handleStartNewChat}
        onNewGroup={handleOpenCreateGroup}
        onNewContact={handleOpenAddContact}
        onNewChatSearchChange={setNewChatSearchQuery}
        onNewChatSelectContact={handleSelectContactFromNewChat}
        onCancelNewChat={handleCancelNewChat}
        newCallMode={newCallMode}
        newCallSearchQuery={newCallSearchQuery}
        newCallFilteredContacts={newCallFilteredContacts}
        onNewCall={handleStartNewCall}
        onNewCallSearchChange={setNewCallSearchQuery}
        onNewCallSelectContact={handleSelectContactFromNewCall}
        onCancelNewCall={handleCancelNewCall}
        pendingChat={pendingChat}
        onOpenSettings={() => updateUiState({ settingsOpen: true })}
        onShowArchivedInfo={() => updateUiState({ archiveInfoOpen: true })}
        onClearCalls={clearHistory}
        blockedContacts={blockedContacts}
      />

      <div className="flex-1 flex flex-col">
        {activeView === "contacts" ? (
          <ContactsDetailsView
            selectedContact={selectedContact}
            onMessageContact={handleMessageContact}
            onBlockContact={handleBlockContact}
            onViewContactChats={handleViewContactChats}
            startingChat={startingChat}
            startChatError={startChatError}
            isBlocked={selectedContact ? blockedContacts.has(selectedContact.jid) : false}
          />
        ) : activeView === "calls" ? (
          newCallMode ? (
            <NewCallEmptyState />
          ) : (
            <CallsDetailsView selectedCall={selectedCall} />
          )
        ) : newChatMode ? (
          <NewChatEmptyState />
        ) : (
          <ConversationView
            selectedChat={selectedChat}
            messages={displayedMessages}
            isDemoChat={isDemoChatSelected}
            onOpenMedia={handleOpenMedia}
            onArchiveChat={handleArchiveChat}
            onPinChat={handlePinChat}
            onMuteChat={handleMuteChat}
            onVoiceCall={handleVoiceCall}
            onVideoCall={handleVideoCall}
            canCall={canCallSelectedChat}
            callDisabledReason={callDisabledReason}
            calling={Boolean(activeCall && activeCall.status !== "ended")}
            callError={callError}
            messageText={messageText}
            onMessageChange={setMessageText}
            onKeyPress={handleKeyPress}
            onSend={sendMessage}
            sending={sending}
            sendError={sendError}
            focusKey={
              selectedChat?.chat_jid
                ? `${selectedChat.chat_jid}-${messageFocusNonce}`
                : null
            }
            mediaOpen={mediaOpen}
            mediaMode={mediaMode}
            mediaPath={mediaPath}
            caption={caption}
            onToggleMedia={toggleMediaOpen}
            onMediaModeChange={setMediaMode}
            onMediaPathChange={setMediaPath}
            onCaptionChange={setCaption}
            onSendMedia={sendMedia}
            onCloseMedia={closeMedia}
            sendingMedia={sendingMedia}
            mediaError={mediaError}
            groupMetadata={groupMetadata}
            showGroupMembers={showGroupMembers}
            onToggleGroupMembers={() => setShowGroupMembers((p) => !p)}
            onForwardMessage={handleForwardMessage}
            chatProfileOpen={chatProfileOpen}
            onToggleChatProfile={handleToggleChatProfile}
            isBlocked={isSelectedChatBlocked}
          />
        )}
      </div>

      <AddContactModal
        isOpen={addContactOpen}
        onClose={handleCloseAddContact}
        onContactCreated={handleContactCreated}
      />

      <SettingsModal
        isOpen={settingsOpen}
        demoMode={demoMode}
        onClose={() => updateUiState({ settingsOpen: false })}
        onToggleDemoMode={() => setDemoMode((prev) => !prev)}
      />

      <FeatureNoticeModal
        isOpen={archiveInfoOpen}
        title="Archived chats"
        description="This section shows archived chats. You can archive and unarchive chats using the archive button in the conversation header."
        onClose={() => updateUiState({ archiveInfoOpen: false })}
      />

      <MuteDurationModal
        isOpen={muteModalOpen}
        chatName={muteModalChat?.name || ""}
        onSelect={handleMuteDurationSelect}
        onClose={() => updateUiState({ muteModalOpen: false, muteModalChat: null })}
        loading={actionInProgress === "mute"}
      />

      <BlockConfirmModal
        isOpen={blockModalOpen}
        contactName={blockModalContact ? getContactDisplayName(blockModalContact) : ""}
        isBlocked={blockModalIsBlocked}
        onConfirm={handleBlockConfirm}
        onClose={() => updateUiState({ blockModalOpen: false, blockModalContact: null, blockModalIsBlocked: false })}
        loading={blocking}
      />

      <MediaViewerModal
        activeMedia={activeMedia}
        isOpen={Boolean(activeMedia)}
        downloading={downloadingMediaFile}
        downloadError={downloadError}
        downloadStatus={downloadStatus}
        onDownload={downloadMedia}
        onClose={closeMediaViewer}
      />

      <CallModal call={activeCall} onEnd={endCall} onClose={clearCall} />

      <ForwardMessageModal
        isOpen={forwardModalOpen}
        message={forwardMessage}
        chats={chats}
        onForward={handleForwardToChat}
        onClose={() => { setForwardModalOpen(false); setForwardMessage(null); }}
        forwarding={forwarding}
      />

      <CreateGroupModal
        isOpen={createGroupOpen}
        contacts={contacts}
        onClose={() => setCreateGroupOpen(false)}
        onCreate={handleCreateGroup}
        creating={creatingGroup}
      />
    </div>
  );
}
