/**
 * One short description per simulated service, shown when a service is
 * selected in "Tools and environment".
 *
 * These lines are written for the page; the paper has no per-service sentence
 * to quote. Each one says in plain words what kind of service it is and what
 * its tools let an agent do. The scope follows the "Grounding" column of the paper's
 * service table (for example "SMS and chat", "personal notes and checklists",
 * "mobile notification tray", "playback control") and the service's tool list.
 * Services appear under their released (pseudo) names only.
 *
 * Keyed by service id, in the order of src/data/services.json (most tools
 * first). Keep each line under about 120 characters so that it stays on one
 * line under the service name in the ring layout.
 */
export const SERVICE_DESCRIPTIONS: Record<string, string> = {
  zira: 'An issue tracker for software teams. Tools create, assign, link, and search issues across projects and versions.',
  slick: 'A team messaging workspace. Tools post and search messages, manage channels, share files, and set reminders.',
  gridwell_mail: 'An email account. Tools read, search, draft, send, and label messages and threads, and change mailbox settings.',
  salespower: 'A sales CRM. Tools create, update, and query accounts, contacts, leads, opportunities, events, and tasks.',
  gridwell_drive: 'Cloud file storage. Tools create, read, move, and share files and folders, and manage comments and permissions.',
  streamify: 'A music streaming service. Tools search the catalog, browse artists and albums, and build and edit playlists.',
  docfluence: 'A team knowledge base. Tools create, edit, label, and search pages and comments across spaces.',
  hubscape: 'A marketing platform. Tools manage campaigns, marketing emails, forms, events, and email templates.',
  githut: 'A code hosting platform. Tools read and change repositories, branches, and files, and manage issues and pull requests.',
  gridwell_calendar: 'A calendar. Tools create, find, move, and update events, and manage calendars and who can access them.',
  gridwell_chat: 'A workplace chat app. Tools send and read messages in spaces, react to them, and manage spaces and members.',
  shopster: 'An online store back office. Tools look up customers and products, and create, change, return, or cancel orders.',
  strope: 'A payments and billing service. Tools manage customers, products, prices, invoices, subscriptions, and refunds.',
  zenhelp: 'A customer support desk. Tools open, update, comment on, and search tickets, and manage users and organizations.',
  clock: 'The clock app of a device. Tools set and change alarms and timers and run a stopwatch.',
  linkedup: 'A professional network. Tools manage a member profile, organization pages, and posts.',
  gridwell_meet: 'A video meeting service. Tools create meeting spaces and read participants, recordings, and transcripts.',
  sapspend: 'A business travel service. Tools search flights, book and change trips, and update reservations.',
  gridwell_sheets: 'A spreadsheet editor. Tools create spreadsheets and read, write, append, and clear cell values.',
  device_setting: 'The settings of a device. Tools adjust volume, connect to Wi-Fi, and switch app notifications on or off.',
  notes_and_lists: 'A notes app. Tools create, search, and update personal notes and checklists, and undo the last change.',
  whatsup: 'A consumer messaging app. Tools read chats, find contacts, send text, audio, and files, and place calls.',
  device_actions: 'System actions of a device. Tools open apps and web pages, take photos and screenshots, and restart or power off.',
  media_control: 'Playback control for the media playing on a device. Tools pause, resume, skip, seek, and like or dislike.',
  messages: 'Text messaging (SMS and chat) on a device. Tools find recipients, read conversations, and send messages.',
  photogram: 'A photo sharing network. Tools publish media posts and read and add comments for professional accounts.',
  contacts: 'An address book. Tools find, add, and update personal contacts and search the workspace directory.',
  githut_actions: 'Automation for code repositories. Tools list workflows and trigger, rerun, or cancel their runs.',
  gridwell_slides: 'A presentation editor. Tools create presentations and read, edit, and summarize their slides.',
  generic_reminders: 'A reminders app. Tools create, find, and change scheduled reminders, and undo the last change.',
  cliptok: 'A short-video platform for business accounts. Tools read profile data and publish videos.',
  phone: 'The phone app of a device. Tools resolve who to call and place the call.',
  gridwell_docs: 'A document editor. Tools create text documents and read and edit their content.',
  notifications: 'The notification tray of a mobile device. Tools read incoming notifications and reply to them.',
  generic_media: 'A media library across providers. Tools search for media to play and start playback.',
};
