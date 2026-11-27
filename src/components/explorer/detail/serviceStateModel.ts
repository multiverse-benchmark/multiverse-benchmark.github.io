import type { ReferenceDiffEntry } from "@/types";
import { calendarSnapshotDateTime } from "../../../../gui-src/frontend/src/snapshotCalendar";

type ObjectData = Record<string, unknown>;
export interface ServiceRecord {
  id: string;
  path: string[];
  title: string;
  subtitle?: string;
  body?: string;
  fields: { label: string; value: string }[];
}
export interface ServiceView {
  kind: "calendar" | "mail" | "messages" | "contacts" | "files";
  label: string;
  records: ServiceRecord[];
}

const object = (value: unknown): ObjectData => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectData : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const entries = (value: unknown) => Object.entries(object(value)).filter(([, row]) => row !== null && typeof row === "object" && !Array.isArray(row));
const values = (value: unknown): ObjectData[] => Array.isArray(value) ? value.map(object) : [];
const display = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value) ?? "";
const field = (label: string, value: unknown) => value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0 ? [] : [{ label, value: display(value) }];
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/** Display Calendar API times, independent of the browser's timezone. */
export function calendarTime(value: unknown): string {
  if (typeof value === "string") return value;
  const data = object(calendarSnapshotDateTime(value));
  const dateTime = text(data.dateTime);
  if (!dateTime) return text(data.date);
  return join(dateTime, text(data.timeZone));
}

function documentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const row = object(item);
    return text(row.text) || values(object(row.paragraph).elements).map((element) => text(object(element.textRun).content)).join("");
  }).filter(Boolean).join("\n");
}

function plainPayload(value: unknown): string {
  const payload = object(value);
  if (payload.mimeType === "text/plain" && typeof object(payload.body).data === "string") {
    try {
      const encoded = text(object(payload.body).data).replace(/-/g, "+").replace(/_/g, "/");
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
    } catch { return ""; }
  }
  return values(payload.parts).map(plainPayload).filter(Boolean).join("\n");
}

function participant(value: unknown): string {
  if (typeof value === "string") return value;
  const row = object(value);
  return join(text(row.contact_name) || text(row.displayName), text(row.email) || text(row.emailAddress) || values(row.contact_endpoints).map((endpoint) => text(endpoint.endpoint_value)).filter(Boolean).join(", "));
}

function record(path: string[], title: string, fields: ServiceRecord["fields"], subtitle = "", body = ""): ServiceRecord {
  return { id: JSON.stringify(path), path, title: title || path.at(-1) || "", subtitle, body, fields };
}

/** Only explicitly supported collections are projected; the source browser retains all data. */
export function getServiceView(service: string, data: unknown): ServiceView | null {
  const root = object(data);
  const scopes: [string[], ObjectData][] = [[[], root], ...entries(root.users).map(([account, user]): [string[], ObjectData] => [["users", account], object(user)])];
  const records: ServiceRecord[] = [];
  let recognized = false;
  const each = (scope: ObjectData, prefix: string[], key: string, add: (row: ObjectData, path: string[]) => void) => {
    const collection = scope[key];
    if (collection === null || typeof collection !== "object") return;
    const rows = Object.entries(collection);
    if (!rows.length) recognized = true;
    rows.forEach(([id, value]) => {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        recognized = true;
        add(object(value), [...prefix, key, id]);
      }
    });
  };

  if (service === "gridwell_calendar") {
    for (const [prefix, scope] of scopes) each(scope, prefix, "events", (row, path) => {
      const start = calendarTime(row.start);
      records.push(record(path, text(row.summary), [
        ...field("Starts", start), ...field("Ends", calendarTime(row.end)), ...field("Location", row.location),
        ...field("Status", row.status), ...field("Recurrence", row.recurrence),
        ...field("Attendees", values(row.attendees).map(participant).filter(Boolean).join("\n")),
        ...field("Account", prefix[1]), ...field("Event ID", row.id),
      ], start, text(row.description)));
    });
    records.sort((a, b) => (a.subtitle || "").localeCompare(b.subtitle || ""));
    return recognized ? { kind: "calendar", label: "Calendar agenda", records } : null;
  }

  if (service === "gridwell_mail") {
    for (const [prefix, scope] of scopes) each(scope, prefix, "messages", (row, path) => {
      const headers = values(object(row.payload).headers);
      const header = (name: string) => text(headers.find((item) => text(item.name).toLowerCase() === name)?.value);
      const from = text(row.sender) || header("from");
      const to = text(row.recipient) || header("to");
      const date = text(row.date) || header("date");
      records.push(record(path, text(row.subject) || header("subject"), [
        ...field("From", from), ...field("To", to), ...field("Date", date), ...field("Cc", row.cc || header("cc")),
        ...field("Bcc", row.bcc || header("bcc")), ...field("Labels", row.labelIds), ...field("Read", row.isRead),
        ...field("Account", prefix[1]), ...field("Message ID", row.id), ...field("Snippet (preview)", row.snippet),
      ], join(from, date), text(row.body) || plainPayload(row.payload)));
    });
    return recognized ? { kind: "mail", label: "Mail", records } : null;
  }

  if (service === "messages") {
    for (const [prefix, scope] of scopes) each(scope, prefix, "messages", (row, path) => {
      const from = participant(row.sender), to = participant(row.recipient);
      records.push(record(path, to || from || text(row.subject), [
        ...field("From", from), ...field("To", to), ...field("Timestamp", row.timestamp), ...field("Status", row.status),
        ...field("Read", row.read), ...field("Type", row.message_type), ...field("Thread", row.thread_id), ...field("Account", prefix[1]),
      ], join(from, text(row.timestamp)), text(row.message_body)));
    });
    return recognized ? { kind: "messages", label: "Messages", records } : null;
  }

  if (service === "contacts") {
    for (const [prefix, scope] of scopes) for (const collection of ["myContacts", "otherContacts", "directory"]) each(scope, prefix, collection, (row, path) => {
      const name = values(row.names)[0] || {};
      const title = text(name.displayName) || [text(name.givenName), text(name.familyName)].filter(Boolean).join(" ");
      const emails = values(row.emailAddresses).map((item) => text(item.value)).filter(Boolean).join(", ");
      records.push(record(path, title, [
        ...field("Email", emails), ...field("Phone", values(row.phoneNumbers).map((item) => text(item.value)).filter(Boolean).join(", ")),
        ...field("Organizations", values(row.organizations).map((item) => join(text(item.name), text(item.title))).filter(Boolean).join("\n")), ...field("Collection", collection), ...field("Account", prefix[1]),
      ], emails));
    });
    return recognized ? { kind: "contacts", label: "Contacts", records } : null;
  }

  if (service === "gridwell_drive" || service === "gridwell_docs") {
    for (const [prefix, scope] of scopes) for (const collection of ["files", "documents"]) each(scope, prefix, collection, (row, path) => {
      records.push(record(path, text(row.name) || text(row.title), [
        ...field("Type", row.mimeType), ...field("Modified", row.modifiedTime), ...field("Owners", Array.isArray(row.owners) ? row.owners.map(participant).filter(Boolean).join("\n") : row.owners),
        ...field("Folders", row.parents), ...field("Trashed", row.trashed), ...field("Account", prefix[1]), ...field("File ID", row.id || row.documentId),
      ], join(text(row.mimeType), prefix[1] || ""), documentText(row.content) || documentText(object(row.body).content) || text(row.description)));
    });
    return recognized ? { kind: "files", label: service === "gridwell_docs" ? "Documents" : "Drive files", records } : null;
  }
  return null;
}

const hasPrefix = (path: string[], prefix: string[]) => prefix.length <= path.length && prefix.every((key, index) => key === path[index]);
function descendant(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => current !== null && typeof current === "object" && Object.hasOwn(current, key) ? (current as ObjectData)[key] : undefined, value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) && sameValue((a as ObjectData)[key], (b as ObjectData)[key]));
}

/** Match real source paths, not record IDs or text: identical IDs in other accounts do not match. */
export function recordChange(service: string, path: string[], changes: ReferenceDiffEntry[], phase: "initial" | "final"): "added" | "removed" | "changed" | null {
  const fullPath = [service, ...path];
  let status: "added" | "removed" | "changed" | null = null;
  for (const change of changes) {
    if (hasPrefix(change.path, fullPath)) {
      if (change.path.length === fullPath.length && change.operation !== "changed") {
        if (change.operation === "added" && phase === "final" || change.operation === "removed" && phase === "initial") return change.operation;
      } else status = "changed";
    } else if (hasPrefix(fullPath, change.path)) {
      const suffix = fullPath.slice(change.path.length);
      const before = descendant(change.before, suffix), after = descendant(change.after, suffix);
      if (before === undefined && after !== undefined && phase === "final") return "added";
      if (after === undefined && before !== undefined && phase === "initial") return "removed";
      if (before !== undefined && after !== undefined && !sameValue(before, after)) status = "changed";
    }
  }
  return status;
}
