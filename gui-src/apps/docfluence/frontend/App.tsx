import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { useBackendAPI } from "@shared/hooks/useBackendAPI";

// =============================================================================
// CONSTANTS
// =============================================================================

const APP_NAME = "Docfluence";
const STARRED_LABEL = "starred";

// =============================================================================
// TYPE DEFINITIONS (Placeholders for API types)
// =============================================================================

interface Space {
  spaceKey: string;
  name: string;
  description: string;
}

interface Content {
  id: string;
  type: "page" | "blogpost";
  status: "current" | "draft" | "trashed";
  title: string;
  spaceKey: string;
  body?: {
    storage: { value: string };
    view?: { value: string };
  };
  version?: {
    number: number;
    when: string;
    by: { displayName: string };
  };
  ancestors?: Content[];
  children?: Array<{ id: string; type?: string; title?: string }>;
  fullChildren?: Content[];
  labels?: Label[];
}

interface Comment {
  id: string;
  type: string;
  title: string;
  spaceKey: string;
  status: string;
  body: {
    storage: { value: string; representation: string };
    view?: { value: string; representation: string };
  };
  version: {
    number: number;
    minorEdit?: boolean;
    when?: string;
    by?: { displayName: string; username: string; type: string };
  };
  history: {
    latest: boolean;
    createdBy: { displayName: string; username: string; type: string };
    createdDate: string;
  };
  ancestors?: { id: string }[];
  link?: string;
}

interface Attachment {
  id: string;
  title: string;
  mediaType?: string;
  fileSize?: number;
  downloadUrl?: string;
  metadata?: {
    comment?: string;
    mediaType?: string;
  };
  version?: {
    number: number;
    minorEdit?: boolean;
  };
  links?: {
    self?: string;
    download?: string;
  };
}

interface Label {
  id: string;
  label: string;
  name?: string;
  prefix: string;
}

interface ContentProperty {
  id: string;
  key: string;
  value: unknown;
}

interface Restriction {
  operation: string;
  restrictions?: {
    user?: { results: Array<{ displayName: string; username: string }> };
    group?: { results: Array<{ name: string }> };
  };
}

interface Version {
  number: number;
  when: string;
  by: { displayName: string };
  message?: string;
}

// =============================================================================
// APP PROPS
// =============================================================================

interface AppProps {
  onClose: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
}

// =============================================================================
// ICON COMPONENTS
// =============================================================================

const Icons = {
  Check: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  Home: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  ),
  Clock: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Star: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  ),
  Globe: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  ),
  Apps: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  ),
  Search: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  Plus: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  ),
  Document: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Folder: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
  ChevronRight: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  ),
  ChevronDown: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  ),
  Edit: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  ),
  Share: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  ),
  MoreHorizontal: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
      />
    </svg>
  ),
  Link: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  ),
  Trash: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  ),
  Paperclip: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  ),
  Upload: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  ),
  Tag: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  ),
  MessageSquare: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  ),
  History: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Settings: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  ExternalLink: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  ),
  Bold: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
    </svg>
  ),
  Italic: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
    </svg>
  ),
  Underline: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
    </svg>
  ),
  ListOrdered: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
    </svg>
  ),
  ListUnordered: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
    </svg>
  ),
  Image: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  Table: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  ),
  Code: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  ),
  Blog: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  ),
  Calendar: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  Users: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  Close: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
};

// =============================================================================
// REUSABLE POPOVER MENU COMPONENT
// =============================================================================

interface PopoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

function PopoverMenu({
  isOpen,
  onClose,
  children,
  className = "",
  "data-testid": testId,
}: PopoverMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        data-testid={testId ? `${testId}-backdrop` : undefined}
      />
      <div
        className={`absolute bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden ${className}`}
        data-testid={testId}
      >
        {children}
      </div>
    </>
  );
}

interface PopoverMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: string;
  rightIcon?: React.ReactNode;
  "data-testid"?: string;
}

function PopoverMenuItem({
  icon,
  label,
  onClick,
  badge,
  rightIcon,
  "data-testid": testId,
}: PopoverMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <span className="text-gray-500">{icon}</span>
        <span>{label}</span>
      </div>
      {badge && (
        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-orange-500 rounded font-medium">
          {badge}
        </span>
      )}
      {rightIcon && <span className="text-gray-400">{rightIcon}</span>}
    </button>
  );
}

function PopoverMenuDivider() {
  return <div className="border-t border-gray-100 my-1" />;
}

// =============================================================================
// SIDEBAR COMPONENTS
// =============================================================================

/** Top navigation items (For you, Recent, Starred, Spaces, Apps) */
interface SidebarNavigationProps {
  spaces: Space[];
  onSelectSpace: (space: Space) => void;
  onCreateSpace?: () => void;
  onViewAllSpaces?: () => void;
  onViewAllContent?: () => void;
  onNavigate?: (view: ViewType) => void;
  activeNavItem?: string;
}

function SidebarNavigation({
  spaces,
  onSelectSpace,
  onCreateSpace,
  onViewAllSpaces,
  onViewAllContent,
  onNavigate,
  activeNavItem,
}: SidebarNavigationProps) {
  const [showSpacesDropdown, setShowSpacesDropdown] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState("");

  const filteredSpaces = spaces.filter((space) =>
    space.name.toLowerCase().includes(spaceFilter.toLowerCase())
  );

  return (
    <nav className="px-2 py-3 space-y-1">
      <SidebarNavItem icon={<Icons.Home />} label="For you" onClick={() => onNavigate?.("forYou")} isActive={activeNavItem === "forYou"} data-testid="nav-for-you" />
      <SidebarNavItem icon={<Icons.Clock />} label="Recent" onClick={() => onNavigate?.("recent")} isActive={activeNavItem === "recent"} data-testid="nav-recent" />
      <SidebarNavItem icon={<Icons.Star />} label="Starred" onClick={() => onNavigate?.("starred")} isActive={activeNavItem === "starred"} data-testid="nav-starred" />

      {/* Spaces with dropdown */}
      <div className="relative" data-testid="spaces-nav-container">
        <SidebarNavItem
          icon={<Icons.Globe />}
          label="Spaces"
          hasChevron
          onClick={() => setShowSpacesDropdown(!showSpacesDropdown)}
          data-testid="spaces-nav-button"
        />

        <PopoverMenu
          isOpen={showSpacesDropdown}
          onClose={() => setShowSpacesDropdown(false)}
          className="left-full top-0 ml-1 w-64"
          data-testid="spaces-flyout-menu"
        >
          <div className="px-3 pt-3 pb-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Spaces
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Icons.Search />
              </span>
              <input
                type="text"
                placeholder="Filter spaces"
                value={spaceFilter}
                onChange={(e) => setSpaceFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                onClick={(e) => e.stopPropagation()}
                data-testid="spaces-filter-input"
              />
            </div>
          </div>

          {/* Starred section label */}
          {filteredSpaces.length > 0 && (
            <div className="px-3 py-1">
              <div className="text-xs font-medium text-gray-500">Starred</div>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filteredSpaces.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No spaces found
              </div>
            ) : (
              <div className="py-1">
                {filteredSpaces.map((space) => {
                  const isPersonal = space.spaceKey.startsWith("~");
                  const bgColor = isPersonal
                    ? "bg-orange-500"
                    : "bg-purple-500";
                  const icon = space.name.charAt(0).toUpperCase();

                  return (
                    <button
                      key={space.spaceKey}
                      onClick={() => {
                        onSelectSpace(space);
                        setShowSpacesDropdown(false);
                        setSpaceFilter("");
                      }}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      data-testid={`space-item-${space.spaceKey}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded ${bgColor} flex items-center justify-center text-white text-xs font-bold`}
                        >
                          {icon}
                        </div>
                        <span className="font-medium">{space.name}</span>
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{space.spaceKey}]</span>
                      </div>
                      <Icons.Star />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <PopoverMenuDivider />
          <PopoverMenuItem
            icon={<span>≡</span>}
            label="View all spaces"
            onClick={() => {
              onViewAllSpaces?.();
              setShowSpacesDropdown(false);
            }}
            data-testid="view-all-spaces-option"
          />
          <PopoverMenuItem
            icon={<Icons.Plus />}
            label="Create a space"
            onClick={() => {
              onCreateSpace?.();
              setShowSpacesDropdown(false);
            }}
            data-testid="flyout-create-space-option"
          />
        </PopoverMenu>
      </div>

      {/* All Content navigation */}
      <SidebarNavItem
        icon={<Icons.Document />}
        label="All Content"
        onClick={() => onViewAllContent?.()}
        data-testid="all-content-nav-button"
      />

      <SidebarNavItem icon={<Icons.Apps />} label="Apps" onClick={() => onNavigate?.("apps")} isActive={activeNavItem === "apps"} data-testid="nav-apps" />
    </nav>
  );
}

function SidebarNavItem({
  icon,
  label,
  hasChevron,
  isActive,
  onClick,
  "data-testid": testId,
}: {
  icon: React.ReactNode;
  label: string;
  hasChevron?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 transition-colors ${
        isActive ? "bg-amber-50 text-orange-600" : "text-gray-700"
      }`}
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <span className="text-gray-500">{icon}</span>
        <span>{label}</span>
      </div>
      {hasChevron && <Icons.ChevronRight />}
    </button>
  );
}

/** User space selector section */
function SpaceSelector({ 
  space, 
  onClick 
}: { 
  space: Space | null;
  onClick?: () => void;
}) {
  if (!space) {
    return (
      <div className="mx-2 my-2">
        <button className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-orange-600 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center text-white text-xs font-bold">
              JB
            </div>
            <span>jory_braun</span>
          </div>
          <Icons.MoreHorizontal />
        </button>
      </div>
    );
  }

  const isPersonal = space.spaceKey.startsWith("~");
  const bgColor = isPersonal ? "bg-orange-500" : "bg-orange-400";
  const icon = space.name.charAt(0).toUpperCase();

  return (
    <div className="mx-2 my-2">
      <button 
        onClick={onClick}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-orange-600 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded ${bgColor} flex items-center justify-center text-white text-xs font-bold`}
          >
            {icon}
          </div>
          <span>{space.name}</span>
          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{space.spaceKey}]</span>
        </div>
        <Icons.MoreHorizontal />
      </button>
    </div>
  );
}

/** Shortcuts section */
function ShortcutsSection({ onClick, isActive }: { onClick?: () => void; isActive?: boolean }) {
  return (
    <div className="px-2 py-2">
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-gray-100 transition-colors ${isActive ? "bg-amber-50 text-orange-600" : "text-gray-700"}`}
        data-testid="nav-shortcuts"
      >
        <span className="text-gray-400">↗</span>
        <span>Shortcuts</span>
      </button>
    </div>
  );
}

/** Content tree section with search and page list */
interface ContentTreeSectionProps {
  selectedSpace: Space | null;
  onSelectContent: (content: Content) => void;
  onCreateContent: (parentContent?: Content) => void;
  refreshKey?: number;
}

function ContentTreeSection({
  selectedSpace,
  onSelectContent,
  onCreateContent,
  refreshKey,
}: ContentTreeSectionProps) {
  const api = useBackendAPI("docfluence");
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load content when space changes or refresh key updates
  useEffect(() => {
    if (!selectedSpace) {
      setContent([]);
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      try {
        const result = await api.callTool<Content[]>("get_space_content", {
          spaceKey: selectedSpace.spaceKey,
        });
        setContent(result || []);
      } catch (err) {
        console.error("Failed to load space content:", err);
        setContent([]);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [selectedSpace?.spaceKey, refreshKey]);

  // Filter to only pages and blogposts for the tree
  const pageContent = content.filter(
    (item) => item.type === "page" || item.type === "blogpost"
  );

  // Build content map for lookup
  const contentMap = new Map(pageContent.map((item) => [item.id, item]));

  // Build parent-child relationships from BOTH children array and ancestors array
  // This ensures the tree works regardless of which field the backend populates
  const childrenByParent = new Map<string, Set<string>>();

  for (const item of pageContent) {
    // From children array: parent lists its children
    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        const childItem = contentMap.get(child.id);
        if (childItem) {
          if (!childrenByParent.has(item.id)) childrenByParent.set(item.id, new Set());
          childrenByParent.get(item.id)!.add(child.id);
        }
      }
    }
    // From ancestors array: child lists its parent (last ancestor is direct parent)
    if (item.ancestors && item.ancestors.length > 0) {
      const parentId = typeof item.ancestors[item.ancestors.length - 1] === "object"
        ? (item.ancestors[item.ancestors.length - 1] as { id: string }).id
        : String(item.ancestors[item.ancestors.length - 1]);
      if (contentMap.has(parentId)) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
        childrenByParent.get(parentId)!.add(item.id);
      }
    }
  }

  // Recursively enrich each content item with full child objects
  const enrichContent = (item: Content): Content => {
    const childIds = childrenByParent.get(item.id);
    if (childIds && childIds.size > 0) {
      const fullChildren = Array.from(childIds)
        .map((id) => contentMap.get(id))
        .filter((c): c is Content => c !== undefined)
        .map(enrichContent);
      return { ...item, fullChildren };
    }
    return item;
  };

  const enrichedContent = pageContent.map(enrichContent);

  // Filter to only show root-level items (items with no ancestors pointing to items in this space)
  const rootContent = enrichedContent.filter((item) => {
    if (!item.ancestors || item.ancestors.length === 0) return true;
    // Check if the parent ancestor exists in this space's content
    const parentId = typeof item.ancestors[item.ancestors.length - 1] === "object"
      ? (item.ancestors[item.ancestors.length - 1] as { id: string }).id
      : String(item.ancestors[item.ancestors.length - 1]);
    return !contentMap.has(parentId);
  });

  // Filter content by search query
  const filteredContent = searchQuery
    ? rootContent.filter((item: Content) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : rootContent;

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {/* Content header with actions */}
      <div className="flex items-center justify-between px-3 py-2">
        <button className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1 rounded">
          <Icons.Document />
          <span>Content</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            className="p-1 hover:bg-gray-100 rounded"
            onClick={() => onCreateContent()}
          >
            <Icons.Plus />
          </button>
          <button className="p-1 hover:bg-gray-100 rounded">
            <Icons.MoreHorizontal />
          </button>
        </div>
      </div>

      {/* Search within content */}
      <div className="px-3 mb-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
            <Icons.Search />
          </span>
          <input
            type="text"
            placeholder="Search by title"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content tree items */}
      {loading ? (
        <div className="px-3 py-4 text-sm text-gray-500">
          Loading content...
        </div>
      ) : !selectedSpace ? (
        <div className="px-3 py-4 text-sm text-gray-500">
          Select a space to view content
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="px-3 py-4 text-sm text-gray-500">
          {searchQuery ? "No matching content" : "No content in this space"}
        </div>
      ) : (
        <ContentTreeItems
          content={filteredContent}
          onSelectContent={onSelectContent}
          onCreateChild={onCreateContent}
        />
      )}

      {/* Create button */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md mt-2"
        onClick={() => onCreateContent()}
      >
        <Icons.Plus />
        <span>Create</span>
      </button>
    </div>
  );
}

interface ContentTreeItemsProps {
  content: Content[];
  onSelectContent: (content: Content) => void;
  onCreateChild: (parentContent: Content) => void;
}

/** Display content as tree items */
function ContentTreeItems({
  content,
  onSelectContent,
  onCreateChild,
}: ContentTreeItemsProps) {
  return (
    <div className="space-y-0.5">
      {content.map((item) => (
        <ContentTreeItemWithActions
          key={item.id}
          content={item}
          onSelectContent={onSelectContent}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
}

/** Content type options for creating child content */
interface CreateContentTypeOption {
  icon: React.ReactNode;
  label: string;
  type: "page" | "blogpost" | "folder";
  isNew?: boolean;
}

const createContentTypeOptions: CreateContentTypeOption[] = [
  { icon: <span className="text-base">📄</span>, label: "Page", type: "page" },
  // { icon: <span className="text-base">📝</span>, label: 'Blog', type: 'blogpost' },
  // { icon: <span className="text-base">📁</span>, label: 'Folder', type: 'folder' },
];

interface ContentTreeItemWithActionsProps {
  content: Content;
  onSelectContent: (content: Content) => void;
  onCreateChild: (parentContent: Content) => void;
  level?: number;
}

function ContentTreeItemWithActions({
  content,
  onSelectContent,
  onCreateChild,
  level = 0,
}: ContentTreeItemWithActionsProps) {
  const [showActions, setShowActions] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const paddingLeft = 12 + level * 16;

  const hasChildren = content.fullChildren && content.fullChildren.length > 0;

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowCreateMenu(true);
  };

  const handleCloseMenu = () => {
    setShowCreateMenu(false);
    setMenuPosition(null);
  };

  return (
    <>
      <div
        className="group flex items-center gap-1 pr-2"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => {
          if (!showCreateMenu) setShowActions(false);
        }}
        data-testid={`content-tree-item-${content.id}`}
      >
        <button
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-900 hover:bg-gray-100 rounded-md min-w-0"
          style={{ paddingLeft }}
          onClick={() => onSelectContent(content)}
          data-testid={`content-tree-button-${content.id}`}
        >
          <span
            className={`text-gray-400 transition-transform flex-shrink-0 ${
              isExpanded ? "rotate-90" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setIsExpanded(!isExpanded);
            }}
          >
            <Icons.ChevronRight />
          </span>
          <span className="flex-shrink-0">
            {content.type === "page" ? "📄" : "📋"}
          </span>
          <span className="truncate flex-1 text-left">{content.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{content.id}]</span></span>
          {content.status === "draft" && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded flex-shrink-0">
              DRAFT
            </span>
          )}
        </button>

        {/* Action buttons - always visible */}
        <div
          className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${
            showActions ? "opacity-100" : "opacity-40"
          }`}
          data-testid={`content-actions-${content.id}`}
        >
          {/* Only pages can have child content - blog posts cannot */}
          {content.type === "page" && (
            <button
              ref={buttonRef}
              className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
              onClick={handleOpenMenu}
              data-testid={`content-add-child-button-${content.id}`}
            >
              <Icons.Plus />
            </button>
          )}
          <button
            className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
            data-testid={`content-more-button-${content.id}`}
          >
            <Icons.MoreHorizontal />
          </button>
        </div>
      </div>

      {/* Portal-based menu - renders outside sidebar */}
      {showCreateMenu &&
        menuPosition &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={handleCloseMenu}
              data-testid={`content-child-menu-backdrop-${content.id}`}
            />
            <div
              className="fixed bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden w-48"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
              }}
              data-testid={`content-child-menu-${content.id}`}
            >
              <div className="py-1">
                {createContentTypeOptions.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => {
                      handleCloseMenu();
                      setShowActions(false);
                      onCreateChild(content);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    data-testid={`create-child-${option.type}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">{option.icon}</span>
                      <span>{option.label}</span>
                    </div>
                    {option.isNew && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-orange-500 rounded font-medium">
                        NEW
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Render children recursively */}
      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {content.fullChildren!.map((child) => (
            <ContentTreeItemWithActions
              key={child.id}
              content={child}
              onSelectContent={onSelectContent}
              onCreateChild={onCreateChild}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Secondary sidebar links (Blogs, Calendars) */
function SecondarySidebarLinks() {
  return (
    <div className="px-2 py-2 border-t border-gray-200">
      <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
        <span className="text-gray-400">99</span>
        <Icons.Blog />
        <span>Blogs</span>
      </button>
      <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
        <Icons.Calendar />
        <span>Calendars</span>
      </button>
    </div>
  );
}

/** External links section (Company hub, Zira, Teams) */
function ExternalLinksSection() {
  return (
    <div className="px-2 py-2 border-t border-gray-200">
      <ExternalLinkItem icon="🏢" label="Company hub" />
      <ExternalLinkItem icon="🔷" label="Zira" />
      <ExternalLinkItem icon="👥" label="Teams" />
      <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-md">
        <span>•••</span>
        <span>More</span>
      </button>
    </div>
  );
}

function ExternalLinkItem({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
      <div className="flex items-center gap-3">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <Icons.ExternalLink />
    </button>
  );
}

/** Invite people button at sidebar bottom */
function InvitePeopleButton() {
  return (
    <div className="p-3 border-t border-gray-200">
      <button className="w-full px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
        Invite people
      </button>
    </div>
  );
}

// =============================================================================
// HEADER COMPONENTS
// =============================================================================

/** Inline header search with dropdown results */
interface HeaderSearchProps {
  onSelectContent: (content: Content) => void;
}

function HeaderSearch({ onSelectContent }: HeaderSearchProps) {
  const api = useBackendAPI("docfluence");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (searchText: string, showErrors: boolean = false) => {
    if (!searchText.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    // Skip search if quotes are unclosed (user still typing)
    const singleQuotes = (searchText.match(/'/g) || []).length;
    const doubleQuotes = (searchText.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      setError(null); // Clear any previous error while typing
      return; // Don't search with incomplete query
    }

    setLoading(true);
    setError(null);
    try {
      // Build CQL query - check if user entered raw CQL
      const isRawCql = /[=~<>!]/.test(searchText);
      let cqlQuery = isRawCql
        ? searchText
        : `text~'${searchText.trim().replace(/'/g, "\\'")}'`;

      // Exclude attachments from search - backend has validation issues with attachment metadata fields
      // This is a known limitation: attachments have extra fields (comment, mediaType) not in SearchContentItem model
      if (!cqlQuery.toLowerCase().includes("type=")) {
        cqlQuery = `(${cqlQuery}) AND type!='attachment'`;
      }

      const searchResults = await api.callTool<Content[]>("search_content", {
        query: cqlQuery,
        limit: 10,
      });
      setResults(searchResults || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Search] Failed:", errorMessage);
      if (showErrors) {
        setError(errorMessage);
      }
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowDropdown(true);
    handleSearch(value, false); // Don't show errors while typing
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowDropdown(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && query.trim()) {
      handleSearch(query, true); // Show errors on explicit search
    }
  };

  const handleResultClick = (content: Content) => {
    onSelectContent(content);
    setShowDropdown(false);
    setQuery("");
    setResults([]);
  };

  const getContentIcon = (type: string): string => {
    switch (type) {
      case "page": return "📄";
      case "blogpost": return "📝";
      default: return "📄";
    }
  };

  return (
    <div ref={containerRef} className="relative" data-testid="header-search">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <Icons.Search />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setShowDropdown(true)}
          placeholder="Search (CQL supported)"
          className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500"
          data-testid="header-search-input"
        />
        {loading && (
          <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Search results dropdown */}
      {showDropdown && (query || results.length > 0 || error) && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50"
          data-testid="header-search-dropdown"
        >
          {loading && results.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Searching...
            </div>
          )}
          {error && (
            <div className="p-4 text-center text-red-600 text-sm">
              Error: {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && query.trim() && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No results found for "{query}"
            </div>
          )}
          {results.map((content) => (
            <button
              key={content.id}
              onClick={() => handleResultClick(content)}
              className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-0"
              data-testid={`search-result-${content.id}`}
            >
              <span className="text-lg">{getContentIcon(content.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{content.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{content.id}]</span></div>
                <div className="text-xs text-gray-500">
                  {content.type} in {content.spaceKey}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Main header bar with search and create */
interface HeaderBarProps {
  onCreateClick: () => void;
  onCreateBlog?: () => void;
  onCreateSpace?: () => void;
  onSelectContent: (content: Content) => void;
  onToggleSidebar?: () => void;
}

function HeaderBar({ onCreateClick, onCreateBlog, onCreateSpace, onSelectContent, onToggleSidebar }: HeaderBarProps) {
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  return (
    <header className="h-12 px-5 flex items-center justify-between border-b border-stone-200 bg-white">
      <div className="flex items-center gap-4">
        <button
          className="p-2 hover:bg-gray-100 rounded"
          onClick={onToggleSidebar}
          data-testid="hamburger-menu-button"
          title="Toggle navigation menu"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF6B6B 0%, #F4E1C1 100%)" }}>
            <span className="text-white text-xs font-bold">C</span>
          </div>
          <span className="font-semibold text-stone-900">{APP_NAME}</span>
        </div>
      </div>

      {/* Search bar - inline search */}
      <div className="flex-1 max-w-xl mx-8">
        <HeaderSearch onSelectContent={onSelectContent} />
      </div>

      {/* Create button and user menu */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            className="flex items-center gap-2 px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            data-testid="header-create-button"
          >
            <Icons.Plus />
            <span>Create</span>
            <Icons.ChevronDown />
          </button>

          {/* Create dropdown menu - using shared PopoverMenu */}
          <PopoverMenu
            isOpen={showCreateMenu}
            onClose={() => setShowCreateMenu(false)}
            className="right-0 top-full mt-1 w-48"
            data-testid="create-dropdown-menu"
          >
            <div className="py-1">
              <PopoverMenuItem
                icon={<Icons.Document />}
                label="Page"
                onClick={() => {
                  onCreateClick();
                  setShowCreateMenu(false);
                }}
                data-testid="create-page-option"
              />
              <PopoverMenuItem
                icon={<Icons.Edit />}
                label="Blog"
                onClick={() => {
                  onCreateBlog?.();
                  setShowCreateMenu(false);
                }}
                data-testid="create-blog-option"
              />
              <PopoverMenuDivider />
              <PopoverMenuItem
                icon={<Icons.Globe />}
                label="Space"
                onClick={() => {
                  onCreateSpace?.();
                  setShowCreateMenu(false);
                }}
                data-testid="create-space-option"
              />
            </div>
          </PopoverMenu>
        </div>
        <button className="p-2 hover:bg-gray-100 rounded">
          <Icons.Settings />
        </button>
        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
          JB
        </div>
      </div>
    </header>
  );
}

/** Page header with breadcrumb and actions */
function PageHeader({
  breadcrumb,
  title,
  showEditActions = true,
}: {
  breadcrumb?: string;
  title: string;
  showEditActions?: boolean;
}) {
  return (
    <div className="px-6 py-4 border-b border-gray-200">
      {/* Breadcrumb */}
      {breadcrumb && (
        <div className="text-sm text-gray-500 mb-2">{breadcrumb}</div>
      )}

      {/* Title and actions row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>

        {showEditActions && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
              JB
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
              <Icons.Edit />
              <span>Edit</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
              <Icons.Share />
              <span>Share</span>
            </button>
            <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md">
              <Icons.Link />
            </button>
            <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md">
              <Icons.MoreHorizontal />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMMENTS COMPONENTS
// =============================================================================

/** Format timestamp to relative time (e.g. "less than a minute ago") */
function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "less than a minute ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

/** Get initials from display name for avatar */
function getInitials(displayName: string): string {
  return displayName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Avatar component */
interface AvatarProps {
  initials: string;
  displayName: string;
}

function Avatar({ initials, displayName }: AvatarProps) {
  const colors = [
    "bg-red-500",
    "bg-orange-400",
    "bg-green-500",
    "bg-purple-500",
    "bg-yellow-500",
    "bg-pink-500",
  ];
  const colorIndex = displayName.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];

  return (
    <div
      className={`${bgColor} w-8 h-8 rounded-full flex items-center justify-center`}
    >
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  );
}

/** Single comment card */
interface CommentCardProps {
  comment: Comment;
  onDelete?: (comment: Comment) => void;
  onEdit?: (comment: Comment, newText: string) => Promise<void>;
  onReply?: (parentComment: Comment, replyText: string) => Promise<void>;
  isDeleting?: boolean;
  isEditing?: boolean;
  replies?: Comment[];
  level?: number;
}

function CommentCard({
  comment,
  onDelete,
  onEdit,
  onReply,
  isDeleting = false,
  isEditing = false,
  replies = [],
  level = 0,
}: CommentCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const authorName = comment.history.createdBy.displayName || "Anonymous";
  const initials = getInitials(authorName);
  const timeAgo = formatTimeAgo(comment.history.createdDate);

  // Extract plain text from HTML for editing
  const getPlainText = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  const handleStartEdit = () => {
    const currentText = comment.body.view?.value || comment.body.storage.value;
    setEditText(getPlainText(currentText));
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditText("");
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || !onEdit) return;
    setIsSubmittingEdit(true);
    try {
      await onEdit(comment, editText);
      setEditMode(false);
      setEditText("");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !onReply) return;
    setIsSubmittingReply(true);
    try {
      await onReply(comment, replyText);
      setShowReplyInput(false);
      setReplyText("");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const maxIndentLevel = 3;
  const indentPadding = Math.min(level, maxIndentLevel) * 24;

  return (
    <div style={{ marginLeft: indentPadding }} data-testid={`comment-item-${comment.id}`}>
      <div className="flex gap-3 py-4">
        <Avatar initials={initials} displayName={authorName} />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-gray-900">{authorName}</span>
            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{comment.id}]</span>
            <span className="text-sm text-gray-600">{timeAgo}</span>
            {level > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">reply</span>
            )}
          </div>

          {/* Edit mode or display mode */}
          {editMode ? (
            <div className="mt-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={3}
                data-testid={`edit-comment-textarea-${comment.id}`}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim() || isSubmittingEdit}
                  className="px-3 py-1 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded disabled:opacity-50"
                  data-testid={`save-edit-comment-button-${comment.id}`}
                >
                  {isSubmittingEdit ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm text-gray-900 hover:text-black"
                  data-testid={`cancel-edit-comment-button-${comment.id}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-gray-900 text-sm font-normal">
              {comment.body.view?.value ? (
                <div
                  dangerouslySetInnerHTML={{ __html: comment.body.view.value }}
                  className="text-gray-900"
                />
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: comment.body.storage.value }}
                  className="text-gray-900"
                />
              )}
            </div>
          )}

          {/* Action buttons (only show when not editing) */}
          {!editMode && (
            <div className="mt-2 flex items-center gap-3">
              {onReply && (
                <button
                  onClick={() => setShowReplyInput(!showReplyInput)}
                  className="text-sm text-gray-900 hover:text-black font-medium"
                  data-testid={`reply-comment-button-${comment.id}`}
                >
                  Reply
                </button>
              )}
              {onEdit && !showDeleteConfirm && (
                <button
                  onClick={handleStartEdit}
                  className="text-sm text-gray-900 hover:text-black font-medium"
                  data-testid={`edit-comment-button-${comment.id}`}
                >
                  Edit
                </button>
              )}
              {onDelete && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                  data-testid={`delete-comment-button-${comment.id}`}
                >
                  Delete
                </button>
              )}
              {onDelete && showDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900">Delete this comment?</span>
                  <button
                    onClick={() => onDelete(comment)}
                    disabled={isDeleting}
                    className="text-sm text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded disabled:opacity-50"
                    data-testid={`confirm-delete-comment-button-${comment.id}`}
                  >
                    {isDeleting ? "Deleting..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-sm text-gray-900 hover:text-black"
                    data-testid={`cancel-delete-comment-button-${comment.id}`}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reply input */}
          {showReplyInput && (
            <div className="mt-3 pl-2 border-l-2 border-gray-200">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="w-full p-2 border border-gray-300 rounded-md text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={2}
                data-testid={`reply-comment-textarea-${comment.id}`}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim() || isSubmittingReply}
                  className="px-3 py-1 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded disabled:opacity-50"
                  data-testid={`submit-reply-button-${comment.id}`}
                >
                  {isSubmittingReply ? "Posting..." : "Reply"}
                </button>
                <button
                  onClick={() => {
                    setShowReplyInput(false);
                    setReplyText("");
                  }}
                  className="px-3 py-1 text-sm text-gray-900 hover:text-black"
                  data-testid={`cancel-reply-button-${comment.id}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {replies.length > 0 && (
        <div data-testid={`comment-replies-${comment.id}`}>
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              onDelete={onDelete}
              onEdit={onEdit}
              onReply={onReply}
              isDeleting={isDeleting}
              level={level + 1}
              replies={[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Add comment input component */
interface AddCommentInputProps {
  onSubmit: (text: string) => void;
  isLoading?: boolean;
}

function AddCommentInput({
  onSubmit,
  isLoading = false,
}: AddCommentInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText("");
    }
  };

  return (
    <div
      className="mt-4 pt-4 border-t border-gray-200"
      data-testid="add-comment-input"
    >
      <div className="flex gap-3">
        <Avatar initials="ME" displayName="You" />
        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment..."
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100 disabled:cursor-not-allowed placeholder-gray-500"
            rows={3}
            data-testid="comment-textarea"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || isLoading}
              className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-testid="post-comment-button"
            >
              {isLoading ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Comments section with list and add comment input */
interface CommentsSectionProps {
  comments: Comment[];
  contentId: string;
  onAddComment: (text: string) => void;
  onDeleteComment?: (comment: Comment) => void;
  onEditComment?: (comment: Comment, newText: string) => Promise<void>;
  onReplyComment?: (parentComment: Comment, replyText: string) => Promise<void>;
  isLoading?: boolean;
  deletingCommentId?: string | null;
}

function CommentsSection({
  comments,
  contentId,
  onAddComment,
  onDeleteComment,
  onEditComment,
  onReplyComment,
  isLoading = false,
  deletingCommentId = null,
}: CommentsSectionProps) {
  // Organize comments into a tree structure
  // Top-level comments have the content as their only ancestor: [content.id]
  // Replies have parent comment + content as ancestors: [parentComment.id, content.id]
  // Note: content.id is always LAST so get_content_comments can find all comments
  const organizeComments = () => {
    const topLevel: Comment[] = [];
    const repliesByParent: Record<string, Comment[]> = {};

    comments.forEach((comment) => {
      const ancestors = comment.ancestors || [];
      // Top-level comment: only has the content as ancestor (length 0 or 1)
      // Reply: has parent comment ID at ancestors[0], content ID at ancestors[1]
      if (ancestors.length <= 1) {
        // Top-level comment (only ancestor is the content itself)
        topLevel.push(comment);
      } else {
        // Reply - FIRST ancestor is the parent comment (ancestors[0])
        const parentId = ancestors[0]?.id;
        if (parentId && parentId !== contentId) {
          if (!repliesByParent[parentId]) {
            repliesByParent[parentId] = [];
          }
          repliesByParent[parentId].push(comment);
        } else {
          // Fallback to top-level if structure is unexpected
          topLevel.push(comment);
        }
      }
    });

    return { topLevel, repliesByParent };
  };

  const { topLevel, repliesByParent } = organizeComments();

  return (
    <div className="mb-8" data-testid="comments-section">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Comments ({comments.length})
        </h3>
        <button
          className="flex items-center gap-1 text-sm text-gray-900 hover:text-black"
          data-testid="add-reaction-button"
        >
          <span>😊</span>
          <span>Add a reaction</span>
        </button>
      </div>

      {topLevel.length > 0 ? (
        <div className="divide-y divide-gray-200" data-testid="comments-list">
          {topLevel.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onDelete={onDeleteComment}
              onEdit={onEditComment}
              onReply={onReplyComment}
              isDeleting={deletingCommentId === comment.id}
              replies={repliesByParent[comment.id] || []}
              level={0}
            />
          ))}
        </div>
      ) : (
        <div
          className="text-center py-8 text-gray-900"
          data-testid="no-comments"
        >
          No comments yet
        </div>
      )}

      <AddCommentInput onSubmit={onAddComment} isLoading={isLoading} />

      <div className="mt-4 flex justify-end">
        <button
          className="flex items-center gap-1 text-sm text-gray-900 hover:text-black"
          data-testid="add-labels-button"
        >
          <span>🏷️</span>
          <span>Add labels</span>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// CONTENT VIEW COMPONENTS
// =============================================================================

/** Inline labels section with add/remove capabilities */
function ContentLabelsSection({
  contentId,
  labels,
  onLabelsChange,
}: {
  contentId: string;
  labels: Label[];
  onLabelsChange: (labels: Label[]) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingLabel, setRemovingLabel] = useState<string | null>(null);

  const handleAddLabel = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const result = await api.callTool<Label[]>("add_content_labels", {
        id: contentId,
        labels: [newLabel.trim()],
      });
      onLabelsChange(result || [...labels, { id: "", label: newLabel.trim(), prefix: "global" }]);
      setNewLabel("");
    } catch (err) {
      console.error("Failed to add label:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveLabel = async (labelName: string) => {
    setRemovingLabel(labelName);
    try {
      await api.callTool("delete_content_labels", { id: contentId, label: labelName });
      onLabelsChange(labels.filter((l) => l.label !== labelName));
    } catch (err) {
      console.error("Failed to remove label:", err);
    } finally {
      setRemovingLabel(null);
    }
  };

  return (
    <div className="mb-8" data-testid="content-labels-section">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Labels</h3>
      <div className="flex flex-wrap gap-2 mb-2">
        {labels.map((label: Label, idx: number) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-orange-600 rounded-full"
            data-testid={`content-label-${label.label}`}
          >
            {label.label}{label.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{label.id}]</span>}
            <button
              onClick={() => handleRemoveLabel(label.label)}
              disabled={removingLabel === label.label}
              className="hover:text-stone-700 disabled:opacity-50"
              data-testid={`remove-content-label-${label.label}`}
            >
              {removingLabel === label.label ? (
                <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); }}
          placeholder="Add label..."
          className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400 w-40"
          data-testid="inline-add-label-input"
        />
        <button
          onClick={handleAddLabel}
          disabled={!newLabel.trim() || adding}
          className="px-2 py-1 text-xs text-orange-500 hover:bg-amber-50 rounded disabled:opacity-50"
          data-testid="inline-add-label-button"
        >
          {adding ? "Adding..." : "+ Add"}
        </button>
      </div>
    </div>
  );
}

/** Inline content properties section */
function ContentPropertiesSection({ contentId }: { contentId: string }) {
  const api = useBackendAPI("docfluence");
  const [properties, setProperties] = useState<ContentProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadProperties();
  }, [contentId]);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const result = await api.callTool<ContentProperty[] | { results?: ContentProperty[] }>("get_content_properties", {
        id: contentId,
        start: 0,
        limit: 20,
      });
      const props = Array.isArray(result) ? result : (result?.results || []);
      setProperties(props);
    } catch (err) {
      console.error("Failed to load properties:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (properties.length === 0) return null;

  return (
    <div className="mb-8" data-testid="content-properties-inline">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 hover:text-gray-900"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          <Icons.ChevronRight />
        </span>
        Content Properties ({properties.length})
      </button>
      {expanded && (
        <div className="space-y-2 pl-6">
          {properties.map((prop) => (
            <div key={prop.key} className="flex items-center gap-2 text-sm" data-testid={`inline-property-${prop.key}`}>
              <span className="text-gray-500 font-mono">{prop.key}{prop.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{prop.id}]</span>}:</span>
              <span className="text-gray-900">{typeof prop.value === "string" ? prop.value : JSON.stringify(prop.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline content restrictions section */
function ContentRestrictionsSection({ contentId }: { contentId: string }) {
  const api = useBackendAPI("docfluence");
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadRestrictions();
  }, [contentId]);

  const loadRestrictions = async () => {
    setLoading(true);
    try {
      const result = await api.callTool<Restriction[] | Record<string, unknown>>("get_content_restrictions_by_operation", {
        id: contentId,
      });
      // API returns object keyed by operation: {read: {operation, restrictions}, update: {...}}
      // Convert to array of Restriction objects
      const items = Array.isArray(result) ? result : (
        result && typeof result === "object"
          ? Object.values(result).filter((v): v is Restriction => v != null && typeof v === "object" && "operation" in v)
          : []
      );
      setRestrictions(items);
    } catch (err) {
      console.error("Failed to load restrictions:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mb-8" data-testid="content-restrictions-inline">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 hover:text-gray-900"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          <Icons.ChevronRight />
        </span>
        Restrictions ({restrictions.length === 0 ? "None" : restrictions.length})
      </button>
      {expanded && (
        <div className="pl-6">
          {restrictions.length === 0 ? (
            <p className="text-sm text-gray-500">No restrictions - content is accessible to all space members</p>
          ) : (
            <div className="space-y-2">
              {restrictions.map((r, i) => (
                <div key={i} className="text-sm" data-testid={`inline-restriction-${r.operation}`}>
                  <span className="font-medium text-gray-700">{r.operation}:</span>
                  {r.restrictions?.user?.results?.map((u, j) => (
                    <span key={j} className="ml-2 text-gray-600">{u.displayName}</span>
                  ))}
                  {r.restrictions?.group?.results?.map((g, j) => (
                    <span key={j} className="ml-2 text-gray-600">[{g.name}]</span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Main content view (read mode) */
interface ContentViewProps {
  content: Content;
  onNavigateBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPublish?: () => void;
  onSelectContent?: (content: Content) => void;
}

// Type for descendants response grouped by type
interface DescendantsResponse {
  page?: Content[];
  blogpost?: Content[];
  comment?: Content[];
  attachment?: Content[];
}

function ContentView({ content, onNavigateBack, onEdit, onDelete, onPublish, onSelectContent }: ContentViewProps) {
  const api = useBackendAPI("docfluence");
  const [contentDetails, setContentDetails] = useState<Content | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [descendants, setDescendants] = useState<DescendantsResponse | null>(null);
  const [descendantsTypeFilter, setDescendantsTypeFilter] = useState<string>("all");
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingComment, setAddingComment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showAttachmentsPanel, setShowAttachmentsPanel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [starLoading, setStarLoading] = useState(false);
  const [showContentSharePopup, setShowContentSharePopup] = useState(false);
  const [showContentMoreMenu, setShowContentMoreMenu] = useState(false);

  const isStarred = labels.some((l) => l.label === STARRED_LABEL);

  const copyContentLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/content/${content.id}`);
    setShowContentSharePopup(true);
    setTimeout(() => setShowContentSharePopup(false), 2000);
  };

  const handleToggleStar = async () => {
    setStarLoading(true);
    try {
      if (isStarred) {
        await api.callTool("delete_content_labels", { id: content.id, label: STARRED_LABEL });
        setLabels(labels.filter((l) => l.label !== STARRED_LABEL));
      } else {
        const result = await api.callTool<Label[]>("add_content_labels", {
          id: content.id,
          labels: [STARRED_LABEL],
        });
        if (result) {
          setLabels(result);
        } else {
          setLabels([...labels, { id: "", label: STARRED_LABEL, prefix: "global" }]);
        }
      }
    } catch (err) {
      console.error("Failed to toggle star:", err);
    } finally {
      setStarLoading(false);
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    setDeletingCommentId(comment.id);

    try {
      await api.callTool("delete_content", { id: comment.id });
      // Remove comment and its replies from the list
      setComments(comments.filter((c) => {
        // Remove the comment itself
        if (c.id === comment.id) return false;
        // Also remove any replies to this comment
        const ancestors = c.ancestors || [];
        return !ancestors.some((a) => a.id === comment.id);
      }));
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Failed to delete comment. Please try again.");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleEditComment = async (comment: Comment, newText: string) => {
    try {
      const updatedComment = await api.callTool<Comment>("update_content", {
        id: comment.id,
        body: {
          body: {
            storage: {
              value: `<p>${newText.replace(/\n/g, "<br>")}</p>`,
              representation: "storage",
            },
          },
        },
      });
      // Update comment in the list
      setComments(comments.map((c) =>
        c.id === comment.id ? { ...c, body: updatedComment.body } : c
      ));
    } catch (err) {
      console.error("Failed to edit comment:", err);
      alert("Failed to edit comment. Please try again.");
      throw err; // Re-throw to let the UI know it failed
    }
  };

  const handleReplyComment = async (parentComment: Comment, replyText: string) => {
    try {
      // Note: ancestors order matters! The API checks ancestors[-1] (last) to find comments
      // for a given content. So content.id must be LAST for replies to be fetched properly.
      // The parent comment ID goes first so we can identify it as a reply.
      const newReply = await api.callTool<Comment>("create_content", {
        body: {
          type: "comment",
          spaceKey: content.spaceKey,
          title: "Reply",
          body: {
            storage: {
              value: `<p>${replyText.replace(/\n/g, "<br>")}</p>`,
              representation: "storage",
            },
          },
          ancestors: [parentComment.id, content.id],
          createdBy: "jory_braun", // Current logged-in user
        },
      });
      // Add new reply to the comments list
      setComments([...comments, newReply]);
    } catch (err) {
      console.error("Failed to reply to comment:", err);
      alert("Failed to post reply. Please try again.");
      throw err; // Re-throw to let the UI know it failed
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.callTool("delete_content", { id: content.id });
      onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete content");
      console.error("Failed to delete content:", err);
    } finally {
      setDeleting(false);
    }
  };

  const loadContentDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch full content details
      const details = await api.callTool<Content>("get_content_details", {
        id: content.id,
      });
      setContentDetails(details);

      // Fetch comments, attachments, labels, and descendants in parallel
      const [commentsData, attachmentsData, labelsData, descendantsData] =
        await Promise.allSettled([
          api.callTool<{ comment: { results: Comment[]; size: number } }>(
            "get_content_comments",
            { id: content.id }
          ),
          api.callTool<Attachment[]>("get_content_attachments", {
            id: content.id,
          }),
          api.callTool<Label[]>("get_content_labels", { id: content.id }),
          api.callTool<DescendantsResponse>("get_content_descendants", {
            id: content.id,
            limit: 50,
          }),
        ]);

      if (
        commentsData.status === "fulfilled" &&
        commentsData.value?.comment?.results
      ) {
        setComments(commentsData.value.comment.results);
      }
      if (attachmentsData.status === "fulfilled")
        setAttachments(attachmentsData.value?.results || []);
      if (labelsData.status === "fulfilled") {
        setLabels(labelsData.value || []);
      }
      if (descendantsData.status === "fulfilled")
        setDescendants(descendantsData.value || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
      console.error("Failed to load content details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (text: string) => {
    try {
      setAddingComment(true);
      // Create comment via API
      const newComment = await api.callTool<Comment>("create_content", {
        body: {
          type: "comment",
          spaceKey: content.spaceKey,
          title: "Comment", // Simple title
          body: {
            storage: {
              value: `<p>${text.replace(/\n/g, "<br>")}</p>`,
              representation: "storage",
            },
          },
          ancestors: [content.id], // Array of ID strings, not objects
          createdBy: "jory_braun", // Current logged-in user
        },
      });

      // Add new comment to the list
      setComments([newComment, ...comments]);
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment. Please try again.");
    } finally {
      setAddingComment(false);
    }
  };

  const handlePublishDraft = async () => {
    if (!contentDetails || contentDetails.status !== "draft") return;

    setPublishing(true);
    try {
      const updatedContent = await api.callTool<Content>("update_content", {
        id: content.id,
        body: {
          status: "current",
        },
      });
      // Update local state to reflect the change
      setContentDetails(updatedContent);
      // Callback to parent to handle navigation/refresh
      onPublish?.();
    } catch (err) {
      console.error("Failed to publish draft:", err);
      alert("Failed to publish draft. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    loadContentDetails();
  }, [content.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadContentDetails}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!contentDetails) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <p className="text-gray-500">Content not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
        {/* Top bar with actions */}
        <div className="flex items-center justify-end px-6 py-3">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-300"
              >
                <Icons.Edit />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={handleToggleStar}
              disabled={starLoading}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border ${
                isStarred
                  ? "text-yellow-600 bg-yellow-50 border-yellow-300"
                  : "text-gray-700 hover:bg-gray-100 border-gray-300"
              } disabled:opacity-50`}
              data-testid="star-button"
              title={isStarred ? "Remove from starred" : "Add to starred"}
            >
              {isStarred ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              ) : (
                <Icons.Star />
              )}
              <span>{isStarred ? "Starred" : "Star"}</span>
            </button>
            <button
              onClick={copyContentLink}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-300"
              data-testid="content-share-button"
            >
              <Icons.Link />
              <span>Share</span>
            </button>
            <button
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border ${
                showHistoryPanel
                  ? "text-orange-600 bg-amber-50 border-amber-300"
                  : "text-gray-700 hover:bg-gray-100 border-gray-300"
              }`}
              data-testid="content-history-button"
            >
              <Icons.History />
              <span>History</span>
            </button>
            <button
              onClick={() => setShowAttachmentsPanel(!showAttachmentsPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border ${
                showAttachmentsPanel
                  ? "text-orange-600 bg-amber-50 border-amber-300"
                  : "text-gray-700 hover:bg-gray-100 border-gray-300"
              }`}
              data-testid="content-attachments-button"
            >
              <Icons.Paperclip />
              <span>Attachments ({attachments.length})</span>
            </button>
            {/* Publish Draft button - only for drafts */}
            {contentDetails?.status === "draft" && (
              <button
                onClick={handlePublishDraft}
                disabled={publishing}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
                data-testid="publish-draft-button"
              >
                <Icons.Check />
                <span>{publishing ? "Publishing..." : "Publish Draft"}</span>
              </button>
            )}
            {/* Delete/Discard button */}
            {onDelete && !showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md border border-red-300"
                data-testid="delete-content-button"
              >
                <Icons.Trash />
                <span>{contentDetails?.status === "draft" ? "Discard Draft" : "Delete"}</span>
              </button>
            )}
            {onDelete && showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Delete this {contentDetails?.type || "content"}?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                  data-testid="confirm-delete-button"
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md border border-gray-300"
                  data-testid="cancel-delete-button"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowContentMoreMenu(!showContentMoreMenu)}
                className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-md"
                data-testid="content-more-button"
              >
                <Icons.MoreHorizontal />
              </button>
              <PopoverMenu
                isOpen={showContentMoreMenu}
                onClose={() => setShowContentMoreMenu(false)}
                className="right-0 top-full mt-1 w-48"
                data-testid="content-more-menu"
              >
                <div className="py-1">
                  <PopoverMenuItem
                    icon={<Icons.Link />}
                    label="Copy link"
                    onClick={() => { setShowContentMoreMenu(false); copyContentLink(); }}
                    data-testid="content-more-copy-link"
                  />
                  <PopoverMenuItem
                    icon={<Icons.Star />}
                    label={isStarred ? "Remove star" : "Add star"}
                    onClick={() => { setShowContentMoreMenu(false); handleToggleStar(); }}
                    data-testid="content-more-star"
                  />
                  {onEdit && (
                    <>
                      <PopoverMenuDivider />
                      <PopoverMenuItem
                        icon={<Icons.Edit />}
                        label="Edit"
                        onClick={() => { setShowContentMoreMenu(false); onEdit(); }}
                        data-testid="content-more-edit"
                      />
                    </>
                  )}
                </div>
              </PopoverMenu>
            </div>
          </div>
          {showContentSharePopup && (
            <div className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2" data-testid="content-share-popup">
              Link copied to clipboard!
            </div>
          )}
          {deleteError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {deleteError}
            </div>
          )}
        </div>

        {/* Title section */}
        <div className="px-6 py-4 max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-3">
            {/* Avatar placeholder */}
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-medium flex-shrink-0">
              {contentDetails.title.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                {contentDetails.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contentDetails.id}]</span>
              </h1>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {contentDetails.version && (
                  <span>Version {contentDetails.version.number}</span>
                )}
                {contentDetails.status === "draft" && (
                  <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                    DRAFT
                  </span>
                )}
                {contentDetails.type && (
                  <span className="capitalize">{contentDetails.type}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content body - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          {/* Content body */}
          {contentDetails.body && (
            <div className="prose max-w-none mb-8 text-gray-900">
              <div
                dangerouslySetInnerHTML={{
                  __html:
                    contentDetails.body.view?.value ||
                    contentDetails.body.storage.value,
                }}
              />
            </div>
          )}

          {/* Labels with add/remove */}
          <ContentLabelsSection
            contentId={content.id}
            labels={labels}
            onLabelsChange={setLabels}
          />

          {/* Inline Properties Section */}
          <ContentPropertiesSection contentId={content.id} />

          {/* Inline Restrictions Section */}
          <ContentRestrictionsSection contentId={content.id} />

          {/* Comments section */}
          <CommentsSection
            comments={comments}
            contentId={content.id}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onEditComment={handleEditComment}
            onReplyComment={handleReplyComment}
            isLoading={addingComment}
            deletingCommentId={deletingCommentId}
          />

          {/* Attachments section */}
          {attachments.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Attachments ({attachments.length})
              </h3>
              <div className="space-y-2">
                {attachments.map((attachment: Attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
                  >
                    <span className="text-2xl">📎</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {attachment.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachment.id}]</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {attachment.fileSize != null ? `${attachment.fileSize} bytes` : "Unknown size"}
                      </div>
                    </div>
                    <button className="px-3 py-1 text-sm text-orange-500 hover:bg-amber-50 rounded">
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descendants section */}
          {descendants && (
            <DescendantsSection
              descendants={descendants}
              typeFilter={descendantsTypeFilter}
              onTypeFilterChange={setDescendantsTypeFilter}
              onSelectContent={onSelectContent}
              contentId={content.id}
            />
          )}
        </div>
      </div>
      </div>

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        contentId={content.id}
        currentVersion={contentDetails?.version?.number}
      />

      {/* Attachments Panel */}
      <AttachmentsPanel
        isOpen={showAttachmentsPanel}
        onClose={() => setShowAttachmentsPanel(false)}
        contentId={content.id}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        api={api}
      />
    </div>
  );
}

/** Descendants section showing all nested content */
interface DescendantsSectionProps {
  descendants: DescendantsResponse;
  typeFilter: string;
  onTypeFilterChange: (filter: string) => void;
  onSelectContent?: (content: Content) => void;
  contentId?: string;
}

function DescendantsSection({
  descendants,
  typeFilter,
  onTypeFilterChange,
  onSelectContent,
  contentId,
}: DescendantsSectionProps) {
  const api = useBackendAPI("docfluence");
  const [filteredByType, setFilteredByType] = useState<Content[] | null>(null);
  const [typeLoading, setTypeLoading] = useState(false);

  // When type filter changes to a specific type, use get_content_descendants_by_type
  useEffect(() => {
    if (typeFilter !== "all" && contentId) {
      loadDescendantsByType(typeFilter);
    } else {
      setFilteredByType(null);
    }
  }, [typeFilter, contentId]);

  const loadDescendantsByType = async (type: string) => {
    if (!contentId) return;
    setTypeLoading(true);
    try {
      const result = await api.callTool<Content[] | { results?: Content[] }>("get_content_descendants_by_type", {
        id: contentId,
        type,
        start: 0,
        limit: 50,
      });
      const items = Array.isArray(result) ? result : (result?.results || []);
      setFilteredByType(items);
    } catch (err) {
      console.error("Failed to load descendants by type:", err);
      setFilteredByType(null); // Fall back to local filtering
    } finally {
      setTypeLoading(false);
    }
  };
  // Get all descendants (includes items from child pages, grandchildren, etc.)
  const allDescendants = [
    ...(descendants.page || []),
    ...(descendants.blogpost || []),
    ...(descendants.comment || []),
    ...(descendants.attachment || []),
  ];

  // Filter descendants by type - prefer API results if available
  const filteredDescendants = filteredByType !== null
    ? filteredByType
    : typeFilter === "all"
      ? allDescendants
      : typeFilter === "page"
      ? descendants.page || []
      : typeFilter === "blogpost"
      ? descendants.blogpost || []
      : typeFilter === "comment"
      ? descendants.comment || []
      : typeFilter === "attachment"
      ? descendants.attachment || []
      : allDescendants;

  // Count by type
  const pageCount = descendants.page?.length || 0;
  const blogpostCount = descendants.blogpost?.length || 0;
  const commentCount = descendants.comment?.length || 0;
  const attachmentCount = descendants.attachment?.length || 0;
  const totalCount = pageCount + blogpostCount + commentCount + attachmentCount;

  if (totalCount === 0) {
    return null;
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "page":
        return "📄";
      case "blogpost":
        return "📝";
      case "comment":
        return "💬";
      case "attachment":
        return "📎";
      default:
        return "📄";
    }
  };

  return (
    <div className="mb-8" data-testid="descendants-section">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Descendants ({totalCount})
        </h3>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900 bg-white"
          data-testid="descendants-type-filter"
        >
          <option value="all">All Types ({totalCount})</option>
          {pageCount > 0 && <option value="page">Pages ({pageCount})</option>}
          {blogpostCount > 0 && (
            <option value="blogpost">Blog Posts ({blogpostCount})</option>
          )}
          {commentCount > 0 && (
            <option value="comment">Comments ({commentCount})</option>
          )}
          {attachmentCount > 0 && (
            <option value="attachment">Attachments ({attachmentCount})</option>
          )}
        </select>
      </div>

      <div className="space-y-2" data-testid="descendants-list">
        {filteredDescendants.map((descendant: Content) => {
          // Get parent page title for comments and attachments
          // First try to get from ancestors array, then look up by ID in pages list
          const lastAncestor = descendant.ancestors?.length
            ? descendant.ancestors[descendant.ancestors.length - 1]
            : null;

          // If ancestor doesn't have title, try to find it in the pages list
          const parentPage = lastAncestor?.title
            ? lastAncestor
            : lastAncestor?.id
            ? descendants.page?.find((p) => p.id === lastAncestor.id) || lastAncestor
            : null;

          return (
            <div
              key={descendant.id}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelectContent?.(descendant)}
              data-testid={`descendant-item-${descendant.id}`}
            >
              <span className="text-xl">{getTypeIcon(descendant.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {descendant.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{descendant.id}]</span>
                </div>
                <div className="text-sm text-gray-600">
                  {descendant.type === "comment" || descendant.type === "attachment" ? (
                    <>
                      {descendant.type}
                      {parentPage?.title ? (
                        <>
                          {" "}on <span className="text-orange-500">{parentPage.title}</span>
                        </>
                      ) : (
                        <> in {descendant.spaceKey}</>
                      )}
                    </>
                  ) : (
                    <>
                      {descendant.type} in {descendant.spaceKey}
                    </>
                  )}
                  {descendant.status === "draft" && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                      DRAFT
                    </span>
                  )}
                </div>
              </div>
              <Icons.ChevronRight />
            </div>
          );
        })}
      </div>

      {filteredDescendants.length === 0 && typeFilter !== "all" && (
        <p className="text-gray-500 text-sm">
          No {typeFilter}s found in descendants.
        </p>
      )}
    </div>
  );
}

function RecentContentSection() {
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-4">
        <span>📁</span>
        <span>Recent content that I've worked on</span>
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent updates list */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">
            Recent updates
          </h3>
          <div className="space-y-3">
            <RecentUpdateItem
              icon="📄"
              title="Get started with docs"
              time="a minute ago"
              contributor="jory braun"
            />
            <RecentUpdateItem
              icon="📋"
              title="Overview"
              time="a minute ago"
              contributor="jory braun"
            />
            <RecentUpdateItem
              icon="👤"
              title="jory_braun"
              time="a minute ago"
              contributor="jory braun"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function RecentUpdateItem({
  icon,
  title,
  time,
  contributor,
}: {
  icon: string;
  title: string;
  time: string;
  contributor: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span>{icon}</span>
      <div>
        <a href="#" className="text-orange-500 hover:underline font-medium">
          {title}
        </a>
        <p className="text-sm text-gray-500">
          {time} • contributed by{" "}
          <a href="#" className="text-orange-500 hover:underline">
            {contributor}
          </a>
        </p>
      </div>
    </div>
  );
}

function BlogStreamCard() {
  return (
    <div className="bg-gray-50 rounded-lg p-6 mb-8 max-w-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Blog stream</h3>
      <p className="text-sm text-gray-600 mb-4">
        Create a blog post to share news and announcements with your team and
        company.
      </p>
      <button className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">
        Create blog post
      </button>
    </div>
  );
}

function GetInTouchSection() {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-4">
        <span>👋</span>
        <span>Get in touch</span>
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <span>✉️</span>
          <span className="text-gray-600">Email placeholder</span>
        </div>
        <div className="flex items-center gap-3">
          <Icons.Link />
          <span className="text-gray-600">Link placeholder</span>
        </div>
        <div className="flex items-center gap-3">
          <span>💼</span>
          <span className="text-gray-600">Role placeholder</span>
        </div>
        <div className="flex items-center gap-3">
          <Icons.Users />
          <span className="text-gray-600">Team placeholder</span>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// PAGE EDITOR COMPONENTS
// =============================================================================

/** Page editor header with publish/close actions */
interface EditorHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  saveStatus: "saved" | "saving" | "unsaved";
  onPublish: () => void;
  onSaveAsDraft?: () => void;
  onClose: () => void;
  publishing: boolean;
  savingDraft?: boolean;
  isEditing?: boolean;
  isDraft?: boolean;
}

function EditorHeader({
  title,
  onTitleChange,
  saveStatus,
  onPublish,
  onSaveAsDraft,
  onClose,
  publishing,
  savingDraft,
  isEditing,
  isDraft,
}: EditorHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <button className="p-1 hover:bg-gray-100 rounded">
          <Icons.ChevronDown />
        </button>
        <div className="flex items-center gap-2">
          <Icons.Document />
          {editingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              autoFocus
              className="text-sm text-gray-700 border border-orange-400 rounded px-1 outline-none"
            />
          ) : (
            <span
              className="text-sm text-gray-700 cursor-pointer hover:bg-gray-100 px-1 rounded"
              onClick={() => setEditingTitle(true)}
            >
              {title || "Untitled"}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "saved"
            ? "Saved"
            : "Unsaved changes"}
        </span>
        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
          JB
        </div>
        {/* Save as Draft button - only for new content or existing drafts */}
        {onSaveAsDraft && !isEditing && (
          <button
            className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSaveAsDraft}
            disabled={savingDraft || !title}
            data-testid="save-draft-button"
          >
            {savingDraft ? "Saving..." : "Save as Draft"}
          </button>
        )}
        <button
          className="px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onPublish}
          disabled={publishing || !title}
          data-testid="publish-button"
        >
          {publishing
            ? isDraft
              ? "Publishing..."
              : isEditing
              ? "Updating..."
              : "Publishing..."
            : isDraft
            ? "Publish"
            : isEditing
            ? "Update"
            : "Publish"}
        </button>
        <button
          className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          onClick={onClose}
        >
          Close
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
          <Icons.Share />
          <span>Share</span>
        </button>
        <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md">
          <Icons.Link />
        </button>
        <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md">
          <Icons.MoreHorizontal />
        </button>
      </div>
    </div>
  );
}

/** Editor toolbar with formatting options */
function EditorToolbar() {
  const execFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);

  return (
    <div className="px-6 py-2 border-b border-gray-200 bg-white flex items-center gap-1" data-testid="editor-toolbar">
      {/* Text style dropdown */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={(e) => { e.preventDefault(); setShowHeadingMenu(!showHeadingMenu); setShowAlignMenu(false); setShowListMenu(false); }}
          data-testid="toolbar-heading-dropdown"
        >
          <span>Tt</span>
          <Icons.ChevronDown />
        </button>
        <PopoverMenu
          isOpen={showHeadingMenu}
          onClose={() => setShowHeadingMenu(false)}
          className="left-0 top-full mt-1 w-48"
          data-testid="heading-menu"
        >
          <div className="py-1">
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<p>"); setShowHeadingMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="format-paragraph">Normal text</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<h1>"); setShowHeadingMenu(false); }} className="w-full text-left px-4 py-2 text-lg font-bold hover:bg-gray-100" data-testid="format-h1">Heading 1</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<h2>"); setShowHeadingMenu(false); }} className="w-full text-left px-4 py-2 text-base font-bold hover:bg-gray-100" data-testid="format-h2">Heading 2</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<h3>"); setShowHeadingMenu(false); }} className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-100" data-testid="format-h3">Heading 3</button>
          </div>
        </PopoverMenu>
      </div>

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton icon={<Icons.Bold />} tooltip="Bold" onClick={() => execFormat("bold")} data-testid="toolbar-bold" />
      <ToolbarButton icon={<Icons.Italic />} tooltip="Italic" onClick={() => execFormat("italic")} data-testid="toolbar-italic" />
      <ToolbarButton icon={<Icons.Underline />} tooltip="Underline" onClick={() => execFormat("underline")} data-testid="toolbar-underline" />

      <ToolbarDivider />

      {/* Strikethrough */}
      <ToolbarButton icon={<span className="line-through text-sm">S</span>} tooltip="Strikethrough" onClick={() => execFormat("strikeThrough")} data-testid="toolbar-strikethrough" />

      {/* Highlight */}
      <ToolbarButton
        icon={<span className="w-4 h-4 bg-yellow-200 rounded inline-block" />}
        tooltip="Highlight"
        onClick={() => execFormat("hiliteColor", "yellow")}
        data-testid="toolbar-highlight"
      />

      <ToolbarDivider />

      {/* Alignment */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={(e) => { e.preventDefault(); setShowAlignMenu(!showAlignMenu); setShowHeadingMenu(false); setShowListMenu(false); }}
          data-testid="toolbar-align-dropdown"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z" />
          </svg>
          <Icons.ChevronDown />
        </button>
        <PopoverMenu
          isOpen={showAlignMenu}
          onClose={() => setShowAlignMenu(false)}
          className="left-0 top-full mt-1 w-36"
          data-testid="align-menu"
        >
          <div className="py-1">
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("justifyLeft"); setShowAlignMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="align-left">Align Left</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("justifyCenter"); setShowAlignMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="align-center">Align Center</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("justifyRight"); setShowAlignMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="align-right">Align Right</button>
          </div>
        </PopoverMenu>
      </div>

      {/* Lists */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={(e) => { e.preventDefault(); setShowListMenu(!showListMenu); setShowHeadingMenu(false); setShowAlignMenu(false); }}
          data-testid="toolbar-list-dropdown"
        >
          <Icons.ListUnordered />
          <Icons.ChevronDown />
        </button>
        <PopoverMenu
          isOpen={showListMenu}
          onClose={() => setShowListMenu(false)}
          className="left-0 top-full mt-1 w-48"
          data-testid="list-menu"
        >
          <div className="py-1">
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("insertUnorderedList"); setShowListMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="list-bullet">Bullet List</button>
            <button onMouseDown={(e) => { e.preventDefault(); execFormat("insertOrderedList"); setShowListMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100" data-testid="list-numbered">Numbered List</button>
          </div>
        </PopoverMenu>
      </div>

      <ToolbarDivider />

      {/* Insert items */}
      <ToolbarButton icon={<Icons.Code />} tooltip="Code block" onClick={() => execFormat("formatBlock", "<pre>")} data-testid="toolbar-code" />
      <ToolbarButton icon={<Icons.Link />} tooltip="Link" onClick={() => {
        const url = prompt("Enter URL:");
        if (url) execFormat("createLink", url);
      }} data-testid="toolbar-link" />
      <ToolbarButton icon={<Icons.Image />} tooltip="Image" onClick={() => {
        const url = prompt("Enter image URL:");
        if (url) execFormat("insertImage", url);
      }} data-testid="toolbar-image" />
      <ToolbarButton icon={<Icons.Table />} tooltip="Table" onClick={() => {
        execFormat("insertHTML", "<table border='1' style='border-collapse:collapse;width:100%'><tr><td style='padding:8px;border:1px solid #ddd'>&nbsp;</td><td style='padding:8px;border:1px solid #ddd'>&nbsp;</td></tr><tr><td style='padding:8px;border:1px solid #ddd'>&nbsp;</td><td style='padding:8px;border:1px solid #ddd'>&nbsp;</td></tr></table>");
      }} data-testid="toolbar-table" />

      {/* Horizontal rule */}
      <ToolbarButton icon={<span className="text-sm">—</span>} tooltip="Horizontal rule" onClick={() => execFormat("insertHorizontalRule")} data-testid="toolbar-hr" />

      {/* Undo/Redo */}
      <ToolbarDivider />
      <ToolbarButton icon={<span className="text-sm">↩</span>} tooltip="Undo" onClick={() => execFormat("undo")} data-testid="toolbar-undo" />
      <ToolbarButton icon={<span className="text-sm">↪</span>} tooltip="Redo" onClick={() => execFormat("redo")} data-testid="toolbar-redo" />
    </div>
  );
}

function ToolbarButton({
  icon,
  tooltip,
  onClick,
  "data-testid": testId,
}: {
  icon: React.ReactNode;
  tooltip?: string;
  onClick?: () => void;
  "data-testid"?: string;
}) {
  return (
    <button
      className="p-2 text-gray-600 hover:bg-gray-100 rounded"
      title={tooltip}
      onMouseDown={(e) => {
        // Prevent focus loss from contentEditable
        e.preventDefault();
        onClick?.();
      }}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

interface EditorContentProps {
  title: string;
  onTitleChange: (title: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
}

/** Main editor content area */
function EditorContent({
  title,
  onTitleChange,
  body,
  onBodyChange,
}: EditorContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Initialize content from body prop (only on mount)
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = body || "<p>Start typing here...</p>";
    }
  }, []);

  const handleInput = () => {
    if (contentRef.current) {
      onBodyChange(contentRef.current.innerHTML);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto py-8 px-6">
        {/* Page title input */}
        <input
          type="text"
          placeholder="Give this page a title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-3xl font-semibold text-gray-900 placeholder-gray-400 border-none outline-none mb-4"
          data-testid="editor-title-input"
        />

        {/* Author info */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs">
            JB
          </div>
          <span className="text-sm text-gray-600">By jory braun</span>
        </div>

        {/* Content area - no React children to avoid DOM reconciliation conflicts with execCommand */}
        <div
          ref={contentRef}
          className="min-h-[400px] text-gray-700 outline-none focus:outline-none"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          data-testid="editor-content-area"
        />
      </div>
    </div>
  );
}

// =============================================================================
// EDITOR VIEW
// =============================================================================

interface EditorViewProps {
  initialContent?: Content | null;
  parentContent?: Content | null;
  selectedSpace: Space | null;
  onClose: () => void;
  onSuccess: (content: Content) => void;
  contentType?: "page" | "blogpost";
}

function EditorView({
  initialContent,
  parentContent,
  selectedSpace,
  onClose,
  onSuccess,
  contentType = "page",
}: EditorViewProps) {
  const api = useBackendAPI("docfluence");
  const isEditing = !!initialContent?.id;
  const isDraft = initialContent?.status === "draft";
  const [title, setTitle] = useState(initialContent?.title || "");
  const [body, setBody] = useState(initialContent?.body?.storage?.value || "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "unsaved"
  );
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save effect (debounced)
  useEffect(() => {
    if (!title && !body) return;

    const timeout = setTimeout(() => {
      setSaveStatus("saving");
      // In a real app, we'd save draft here
      setTimeout(() => setSaveStatus("saved"), 500);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [title, body]);

  const buildCreateBody = (status: "current" | "draft") => {
    const createBody: {
      type: string;
      title: string;
      spaceKey: string;
      status: string;
      body: { storage: { value: string; representation: string } };
      ancestors?: string[];
      postingDay?: string;
    } = {
      type: contentType,
      title: title.trim(),
      spaceKey: selectedSpace!.spaceKey,
      status,
      body: {
        storage: {
          value: body || "<p></p>",
          representation: "storage",
        },
      },
    };
    if (contentType === "blogpost") {
      createBody.postingDay = new Date().toISOString().split("T")[0];
    }
    if (parentContent) {
      createBody.ancestors = [parentContent.id];
    }
    return createBody;
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!isEditing && !selectedSpace) {
      setError("Please select a space first");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      let content: Content;

      if (isEditing && isDraft) {
        // Publishing a draft - set status to 'current'
        content = await api.callTool<Content>("update_content", {
          id: initialContent!.id,
          body: {
            status: "current",
          },
        });
      } else if (isEditing) {
        // Update existing published content
        content = await api.callTool<Content>("update_content", {
          id: initialContent!.id,
          body: {
            title: title.trim(),
            body: {
              storage: {
                value: body || "<p></p>",
                representation: "storage",
              },
            },
          },
        });
      } else {
        // Create new content
        content = await api.callTool<Content>("create_content", {
          body: buildCreateBody("current"),
        });
      }

      // Success - call callback and close
      onSuccess(content);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${isDraft ? "publish" : isEditing ? "update" : "create"} page`
      );
      console.error(`Failed to ${isDraft ? "publish" : isEditing ? "update" : "create"} page:`, err);
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!selectedSpace) {
      setError("Please select a space first");
      return;
    }

    setSavingDraft(true);
    setError(null);

    try {
      const content = await api.callTool<Content>("create_content", {
        body: buildCreateBody("draft"),
      });

      // Success - call callback and close
      onSuccess(content);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save draft"
      );
      console.error("Failed to save draft:", err);
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Content type indicator */}
      {contentType === "blogpost" && !isEditing && (
        <div className="flex-shrink-0 px-6 py-2 bg-purple-50 border-b border-purple-100" data-testid="blog-post-indicator">
          <div className="flex items-center gap-2 text-sm text-purple-700">
            <Icons.Blog />
            <span>Creating a new blog post</span>
          </div>
        </div>
      )}
      {/* Parent content indicator */}
      {parentContent && (
        <div className="flex-shrink-0 px-6 py-2 bg-amber-50 border-b border-amber-100">
          <div className="flex items-center gap-2 text-sm text-orange-600">
            <span>Creating child page under:</span>
            <span className="font-medium">{parentContent.title}</span>
          </div>
        </div>
      )}
      <EditorHeader
        title={title}
        onTitleChange={setTitle}
        saveStatus={saveStatus}
        onPublish={handlePublish}
        onSaveAsDraft={handleSaveAsDraft}
        onClose={onClose}
        publishing={publishing}
        savingDraft={savingDraft}
        isEditing={isEditing}
        isDraft={isDraft}
      />
      <EditorToolbar />
      <EditorContent
        title={title}
        onTitleChange={setTitle}
        body={body}
        onBodyChange={setBody}
      />
      {error && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MODAL / DIALOG COMPONENTS
// =============================================================================

/** Create content modal */
function CreateContentModal({
  isOpen,
  onClose,
  spaces,
  onCreateContent,
}: {
  isOpen: boolean;
  onClose: () => void;
  spaces: Space[];
  onCreateContent: (space: Space, contentType: "page" | "blogpost") => void;
}) {
  const [selectedSpaceKey, setSelectedSpaceKey] = useState<string>("");
  const [contentType, setContentType] = useState<"page" | "blogpost">("page");
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSpaceKey(spaces.length > 0 ? spaces[0].spaceKey : "");
      setContentType("page");
      setError(null);
    }
  }, [isOpen, spaces]);

  const handleCreate = () => {
    if (!selectedSpaceKey) {
      setError("Please select a space");
      return;
    }

    const space = spaces.find((s) => s.spaceKey === selectedSpaceKey);
    if (!space) {
      setError("Selected space not found");
      return;
    }

    onCreateContent(space, contentType);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Create new content</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <Icons.Close />
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setContentType("page")}
            className={`w-full flex items-start gap-3 p-3 text-left rounded-lg border ${
              contentType === "page"
                ? "border-orange-400 bg-amber-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="text-orange-500 mt-0.5">
              <Icons.Document />
            </span>
            <div>
              <div className="font-medium text-gray-900">Blank page</div>
              <div className="text-sm text-gray-500">
                Start from scratch with a blank page
              </div>
            </div>
          </button>
          <button
            onClick={() => setContentType("blogpost")}
            className={`w-full flex items-start gap-3 p-3 text-left rounded-lg border ${
              contentType === "blogpost"
                ? "border-orange-400 bg-amber-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="text-orange-500 mt-0.5">
              <Icons.Blog />
            </span>
            <div>
              <div className="font-medium text-gray-900">Blog post</div>
              <div className="text-sm text-gray-500">
                Share news and updates with your team
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Space <span className="text-red-500">*</span>
            </label>
            {spaces.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                No spaces available. Please create a space first.
              </div>
            ) : (
              <select
                value={selectedSpaceKey}
                onChange={(e) => {
                  setSelectedSpaceKey(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400"
                data-testid="space-select"
              >
                {spaces.map((space) => (
                  <option key={space.spaceKey} value={space.spaceKey}>
                    {space.name} ({space.spaceKey})
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={spaces.length === 0 || !selectedSpaceKey}
            className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="create-content-button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/** Create space modal */
function CreateSpaceModal({
  isOpen,
  onClose,
  onSpaceCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSpaceCreated?: () => void;
}) {
  const api = useBackendAPI("docfluence");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [spaceType, setSpaceType] = useState<"global" | "personal">("global");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !key.trim()) {
      setError("Space name and key are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const toolName =
        spaceType === "personal" ? "create_private_space" : "create_space";
      await api.callTool<Space>(toolName, {
        body: {
          name: name.trim(),
          key: key.trim(),
          description: description.trim(),
        },
      });

      // Reset form and close
      setName("");
      setKey("");
      setDescription("");
      setSpaceType("global");
      onClose();

      // Notify parent to refresh spaces list
      if (onSpaceCreated) {
        onSpaceCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
      console.error("Failed to create space:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6" data-testid="create-space-modal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Create a space</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <Icons.Close />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Space name *
              </label>
              <input
                type="text"
                placeholder="e.g. Marketing"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                disabled={loading}
                data-testid="space-name-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Space key *
              </label>
              <input
                type="text"
                placeholder="e.g. MKT"
                value={key}
                onChange={(e) =>
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                disabled={loading}
                data-testid="space-key-input"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used in page URLs. Cannot be changed later.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                placeholder="What is this space about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none text-gray-900"
                rows={3}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Space type
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="spaceType"
                    value="global"
                    checked={spaceType === "global"}
                    onChange={() => setSpaceType("global")}
                    className="text-orange-500"
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700">
                    Team space (visible to everyone)
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="spaceType"
                    value="personal"
                    checked={spaceType === "personal"}
                    onChange={() => setSpaceType("personal")}
                    className="text-orange-500"
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700">
                    Private space (only you can see)
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              data-testid="create-space-submit"
            >
              {loading ? "Creating..." : "Create space"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Search modal / dialog */
function SearchModal({
  isOpen,
  onClose,
  onSelectContent,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectContent?: (content: Content) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "page" | "blogpost">("all");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setError(null);
      setHasSearched(false);
      setActiveFilter("all");
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const buildCqlQuery = (searchText: string, filter: "all" | "page" | "blogpost"): string => {
    // Check if user entered raw CQL (contains operators)
    const isRawCql = /[=~<>!]/.test(searchText);

    if (isRawCql) {
      // User entered CQL directly, apply filter if not "all"
      if (filter === "all") {
        return searchText;
      }
      return `(${searchText}) AND type='${filter}'`;
    }

    // Build CQL from simple text search
    let cql = "";
    if (searchText.trim()) {
      // Use text~ for searching across title, body, and labels
      cql = `text~'${searchText.trim().replace(/'/g, "\\'")}'`;
    }

    // Apply type filter
    if (filter !== "all") {
      if (cql) {
        cql = `${cql} AND type='${filter}'`;
      } else {
        cql = `type='${filter}'`;
      }
    }

    // Default: search for all current content
    if (!cql) {
      cql = "status='current'";
    }

    return cql;
  };

  const handleSearch = async (searchQuery?: string, filter?: "all" | "page" | "blogpost") => {
    const currentQuery = searchQuery !== undefined ? searchQuery : query;
    const currentFilter = filter !== undefined ? filter : activeFilter;

    // Build CQL query
    const cqlQuery = buildCqlQuery(currentQuery, currentFilter);

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const searchResults = await api.callTool<Content[]>("search_content", {
        query: cqlQuery,
        limit: 50,
      });

      setResults(searchResults || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Search failed";
      setError(errorMessage);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleFilterClick = (filter: "all" | "page" | "blogpost") => {
    setActiveFilter(filter);
    if (hasSearched || query.trim()) {
      handleSearch(query, filter);
    }
  };

  const handleResultClick = (content: Content) => {
    if (onSelectContent) {
      onSelectContent(content);
      onClose();
    }
  };

  const getContentIcon = (type: string): string => {
    switch (type) {
      case "page":
        return "📄";
      case "blogpost":
        return "📝";
      case "comment":
        return "💬";
      case "attachment":
        return "📎";
      default:
        return "📄";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" data-testid="search-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Icons.Search />
          <input
            type="text"
            placeholder={`Search ${APP_NAME} (CQL supported)`}
            className="flex-1 text-lg outline-none bg-transparent"
            style={{ color: "#000000" }}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="search-input"
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
            data-testid="search-button"
          >
            {loading ? "..." : "Search"}
          </button>
          <kbd className="px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Search filters */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => handleFilterClick("all")}
            className={`px-3 py-1.5 text-sm rounded-full ${
              activeFilter === "all"
                ? "bg-amber-100 text-orange-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            data-testid="filter-all"
          >
            All
          </button>
          <button
            onClick={() => handleFilterClick("page")}
            className={`px-3 py-1.5 text-sm rounded-full ${
              activeFilter === "page"
                ? "bg-amber-100 text-orange-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            data-testid="filter-pages"
          >
            Pages
          </button>
          <button
            onClick={() => handleFilterClick("blogpost")}
            className={`px-3 py-1.5 text-sm rounded-full ${
              activeFilter === "blogpost"
                ? "bg-amber-100 text-orange-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            data-testid="filter-blogposts"
          >
            Blog posts
          </button>
        </div>

        {/* Search results / empty state */}
        <div className="p-4 max-h-96 overflow-y-auto" data-testid="search-results">
          {error && (
            <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" data-testid="search-error">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
            </div>
          )}

          {!loading && !hasSearched && (
            <div className="text-center py-8 text-gray-500">
              <p>Enter a search term or CQL query</p>
              <p className="text-xs mt-2">
                Examples: <code className="bg-gray-100 px-1 rounded">title~'meeting'</code>{" "}
                <code className="bg-gray-100 px-1 rounded">type='page' AND spaceKey='DOC'</code>
              </p>
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && !error && (
            <div className="text-center py-8 text-gray-500" data-testid="no-results">
              <p>No results found</p>
              <p className="text-sm mt-1">Try different keywords or adjust filters</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="text-sm text-gray-500 mb-3">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </div>
              <div className="space-y-1">
                {results.map((content) => (
                  <SearchResultItem
                    key={content.id}
                    icon={getContentIcon(content.type)}
                    title={content.title}
                    space={content.spaceKey}
                    type={content.type}
                    status={content.status}
                    contentId={content.id}
                    onClick={() => handleResultClick(content)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* CQL help */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <details className="text-sm">
            <summary className="text-orange-500 hover:underline cursor-pointer">
              CQL Help
            </summary>
            <div className="mt-2 text-gray-600 text-xs space-y-1">
              <p><strong>Fields:</strong> type, title, spaceKey, status, text, label, created</p>
              <p><strong>Operators:</strong> = != ~ !~ {">"} {"<"} {">="} {"<="}</p>
              <p><strong>Logical:</strong> AND OR NOT</p>
              <p><strong>Examples:</strong></p>
              <ul className="list-disc list-inside ml-2">
                <li><code>text~'meeting'</code> - Search in title, body, labels</li>
                <li><code>type='page' AND spaceKey='DOC'</code></li>
                <li><code>title~'project' AND status='current'</code></li>
                <li><code>label='important'</code></li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function SearchResultItem({
  icon,
  title,
  space,
  type,
  status,
  contentId,
  onClick,
}: {
  icon: string;
  title: string;
  space: string;
  type: string;
  status?: string;
  contentId?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg text-left"
      data-testid={`search-result-item`}
    >
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{title}{contentId && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contentId}]</span>}</div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span>{space}</span>
          <span>•</span>
          <span className="capitalize">{type}</span>
          {status && status !== "current" && (
            <>
              <span>•</span>
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                status === "draft" ? "bg-yellow-100 text-yellow-700" :
                status === "trashed" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {status}
              </span>
            </>
          )}
        </div>
      </div>
      <Icons.ChevronRight />
    </button>
  );
}

// =============================================================================
// SIDE PANELS
// =============================================================================

/** Comments panel (slides in from right) */
function CommentsPanel({
  isOpen,
  onClose,
  contentId,
  spaceKey,
}: {
  isOpen: boolean;
  onClose: () => void;
  contentId?: string;
  spaceKey?: string;
}) {
  const api = useBackendAPI("docfluence");
  const [comments, setComments] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (isOpen && contentId) {
      loadComments();
    }
  }, [isOpen, contentId]);

  const loadComments = async () => {
    if (!contentId) return;
    setLoading(true);
    try {
      const result = await api.callTool<{ comment?: { results?: Content[] } }>("get_content_comments", { id: contentId, expand: "body.storage,version,history" });
      setComments(result?.comment?.results || []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!contentId || !newComment.trim()) return;
    setPosting(true);
    try {
      await api.callTool("create_content", {
        body: {
          type: "comment",
          title: "Re: Comment",
          spaceKey: spaceKey || "DEFAULT",
          body: { storage: { value: newComment.trim(), representation: "storage" } },
          ancestors: [contentId],
        },
      });
      setNewComment("");
      await loadComments();
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await api.callTool("delete_content", { id: commentId });
      await loadComments();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Comments</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <Icons.Close />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && !contentId && (
          <div className="text-center py-8 text-gray-500 text-sm">Select content to view comments</div>
        )}
        {!loading && contentId && comments.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">No comments yet</div>
        )}
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              commentId={comment.id}
              author={comment.history?.createdBy?.displayName || comment.history?.createdBy?.username || "Unknown"}
              avatar={(comment.history?.createdBy?.displayName || "U").substring(0, 2).toUpperCase()}
              time={comment.history?.createdDate || comment.version?.when || ""}
              content={comment.body?.storage?.value || comment.title || ""}
              onDelete={() => handleDelete(comment.id)}
            />
          ))}
        </div>
      </div>

      {/* Add comment input */}
      <div className="p-4 border-t border-gray-200">
        <textarea
          placeholder={contentId ? "Add a comment..." : "Select content first"}
          disabled={!contentId}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none disabled:opacity-50"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handlePost}
            disabled={!contentId || !newComment.trim() || posting}
            className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md disabled:opacity-50"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  author,
  avatar,
  time,
  content,
  commentId,
  onDelete,
}: {
  author: string;
  avatar: string;
  time: string;
  content: string;
  commentId?: string;
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-orange-400 rounded-full flex items-center justify-center text-white text-xs font-medium">
          {avatar}
        </div>
        <div>
          <div className="font-medium text-sm text-gray-900">{author}{commentId && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{commentId}]</span>}</div>
          <div className="text-xs text-gray-500">{time}</div>
        </div>
      </div>
      <p className="text-sm text-gray-700 pl-10">{content}</p>
      <div className="flex items-center gap-3 pl-10">
        <button className="text-xs text-gray-500 hover:text-orange-500">
          Reply
        </button>
        <button className="text-xs text-gray-500 hover:text-orange-500">
          Edit
        </button>
        <button onClick={onDelete} className="text-xs text-gray-500 hover:text-red-600">
          Delete
        </button>
      </div>
    </div>
  );
}

/** Attachments panel */
interface AttachmentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contentId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  api: ReturnType<typeof useBackendAPI>;
}

function AttachmentsPanel({
  isOpen,
  onClose,
  contentId,
  attachments,
  onAttachmentsChange,
  api,
}: AttachmentsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadFilePath, setUploadFilePath] = useState("");
  const [uploadComment, setUploadComment] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<Attachment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editComment, setEditComment] = useState("");
  const [updatingData, setUpdatingData] = useState<string | null>(null);
  const [updateFilePath, setUpdateFilePath] = useState("");

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!uploadFilePath.trim()) return;

    setUploading(true);
    try {
      const result = await api.callTool<{ attachmentId: string; fileName: string }>(
        "create_content_attachments",
        {
          id: contentId,
          file: uploadFilePath.trim(),
          minorEdit: false,
          comment: uploadComment.trim() || undefined,
        }
      );

      // Refresh attachments list
      const updated = await api.callTool<{ results?: Attachment[] }>("get_content_attachments", {
        id: contentId,
      });
      onAttachmentsChange(updated?.results || []);

      // Reset form
      setUploadFilePath("");
      setUploadComment("");
      setShowUploadForm(false);
    } catch (err) {
      console.error("Failed to upload attachment:", err);
      alert("Failed to upload attachment. Please check the file path and try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateMetadata = async () => {
    if (!editingAttachment) return;

    try {
      await api.callTool("update_attachment_metadata", {
        id: contentId,
        attachmentId: editingAttachment.id,
        body: {
          title: editTitle.trim() || undefined,
          comment: editComment.trim() || undefined,
        },
      });

      // Refresh attachments list
      const updated = await api.callTool<{ results?: Attachment[] }>("get_content_attachments", {
        id: contentId,
      });
      onAttachmentsChange(updated?.results || []);

      setEditingAttachment(null);
    } catch (err) {
      console.error("Failed to update attachment metadata:", err);
      alert("Failed to update attachment. Please try again.");
    }
  };

  const handleUpdateData = async (attachmentId: string) => {
    if (!updateFilePath.trim()) return;

    try {
      await api.callTool("update_attachment_data", {
        id: contentId,
        attachmentId: attachmentId,
        file: updateFilePath.trim(),
        minorEdit: false,
      });

      // Refresh attachments list
      const updated = await api.callTool<{ results?: Attachment[] }>("get_content_attachments", {
        id: contentId,
      });
      onAttachmentsChange(updated?.results || []);

      setUpdatingData(null);
      setUpdateFilePath("");
    } catch (err) {
      console.error("Failed to update attachment data:", err);
      alert("Failed to update attachment file. Please check the file path and try again.");
    }
  };

  const startEdit = (attachment: Attachment) => {
    setEditingAttachment(attachment);
    setEditTitle(attachment.title);
    setEditComment(attachment.metadata?.comment || "");
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col" data-testid="attachments-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Attachments ({attachments.length})</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" data-testid="close-attachments-panel">
          <Icons.Close />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload area */}
        {!showUploadForm ? (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4 hover:border-orange-300 transition-colors cursor-pointer"
            onClick={() => setShowUploadForm(true)}
            data-testid="upload-attachment-area"
          >
            <Icons.Paperclip />
            <p className="mt-2 text-sm text-gray-900">
              Click to add attachment
            </p>
          </div>
        ) : (
          <div className="border border-gray-300 rounded-lg p-4 mb-4" data-testid="upload-attachment-form">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Upload Attachment</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-900 mb-1">File Path</label>
                <input
                  type="text"
                  value={uploadFilePath}
                  onChange={(e) => setUploadFilePath(e.target.value)}
                  placeholder="e.g., /path/to/file.pdf"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                  data-testid="upload-file-path-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-900 mb-1">Comment (optional)</label>
                <input
                  type="text"
                  value={uploadComment}
                  onChange={(e) => setUploadComment(e.target.value)}
                  placeholder="Description of the file"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                  data-testid="upload-comment-input"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={!uploadFilePath.trim() || uploading}
                  className="flex-1 px-3 py-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded disabled:opacity-50"
                  data-testid="upload-attachment-button"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setUploadFilePath("");
                    setUploadComment("");
                  }}
                  className="px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-100 rounded"
                  data-testid="cancel-upload-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attachment list */}
        <div className="space-y-2" data-testid="attachments-list">
          {attachments.length === 0 ? (
            <p className="text-sm text-gray-900 text-center py-4" data-testid="no-attachments">
              No attachments yet
            </p>
          ) : (
            attachments.map((attachment) => (
              <div key={attachment.id} data-testid={`attachment-item-${attachment.id}`}>
                {editingAttachment?.id === attachment.id ? (
                  // Edit metadata form
                  <div className="p-3 border border-amber-300 rounded-lg bg-amber-50" data-testid={`edit-attachment-form-${attachment.id}`}>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-900 mb-1">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                          data-testid={`edit-attachment-title-${attachment.id}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-900 mb-1">Comment</label>
                        <input
                          type="text"
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                          data-testid={`edit-attachment-comment-${attachment.id}`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateMetadata}
                          className="px-2 py-1 text-xs text-white bg-orange-500 hover:bg-orange-600 rounded"
                          data-testid={`save-attachment-metadata-${attachment.id}`}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingAttachment(null)}
                          className="px-2 py-1 text-xs text-gray-900 hover:bg-gray-200 rounded"
                          data-testid={`cancel-edit-attachment-${attachment.id}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : updatingData === attachment.id ? (
                  // Update file data form
                  <div className="p-3 border border-green-300 rounded-lg bg-green-50" data-testid={`update-data-form-${attachment.id}`}>
                    <div className="space-y-2">
                      <p className="text-xs text-gray-900">Replace file for: <strong>{attachment.title}</strong></p>
                      <div>
                        <label className="block text-xs text-gray-900 mb-1">New File Path</label>
                        <input
                          type="text"
                          value={updateFilePath}
                          onChange={(e) => setUpdateFilePath(e.target.value)}
                          placeholder="e.g., /path/to/new-file.pdf"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
                          data-testid={`update-data-file-path-${attachment.id}`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateData(attachment.id)}
                          disabled={!updateFilePath.trim()}
                          className="px-2 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
                          data-testid={`confirm-update-data-${attachment.id}`}
                        >
                          Update
                        </button>
                        <button
                          onClick={() => {
                            setUpdatingData(null);
                            setUpdateFilePath("");
                          }}
                          className="px-2 py-1 text-xs text-gray-900 hover:bg-gray-200 rounded"
                          data-testid={`cancel-update-data-${attachment.id}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Normal attachment display
                  <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-gray-400 flex-shrink-0">
                        <Icons.Paperclip />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{attachment.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachment.id}]</span></div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(attachment.fileSize)}
                          {attachment.metadata?.comment && (
                            <span className="ml-2 italic">- {attachment.metadata.comment}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Edit metadata"
                        onClick={() => startEdit(attachment)}
                        data-testid={`edit-attachment-button-${attachment.id}`}
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        className="p-1 hover:bg-gray-100 rounded text-green-600"
                        title="Update file"
                        onClick={() => {
                          setUpdatingData(attachment.id);
                          setUpdateFilePath("");
                        }}
                        data-testid={`update-data-button-${attachment.id}`}
                      >
                        <Icons.Upload />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Labels panel */
function LabelsPanel({
  isOpen,
  onClose,
  contentId,
  labels: initialLabels,
  onLabelsChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  contentId?: string;
  labels?: Label[];
  onLabelsChange?: (labels: Label[]) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [labels, setLabels] = useState<Label[]>(initialLabels || []);
  const [newLabelText, setNewLabelText] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingLabel, setRemovingLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && contentId) {
      loadLabels();
    }
  }, [isOpen, contentId]);

  useEffect(() => {
    if (initialLabels) setLabels(initialLabels);
  }, [initialLabels]);

  const loadLabels = async () => {
    if (!contentId) return;
    setLoading(true);
    try {
      const result = await api.callTool<Label[]>("get_content_labels", { id: contentId });
      const newLabels = result || [];
      setLabels(newLabels);
      onLabelsChange?.(newLabels);
    } catch (err) {
      console.error("Failed to load labels:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLabel = async () => {
    if (!newLabelText.trim() || !contentId) return;
    setAdding(true);
    try {
      const result = await api.callTool<Label[]>("add_content_labels", {
        id: contentId,
        labels: [newLabelText.trim()],
      });
      const newLabels = result || [...labels, { id: "", label: newLabelText.trim(), prefix: "global" }];
      setLabels(newLabels);
      onLabelsChange?.(newLabels);
      setNewLabelText("");
    } catch (err) {
      console.error("Failed to add label:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveLabel = async (labelName: string) => {
    if (!contentId) return;
    setRemovingLabel(labelName);
    try {
      await api.callTool("delete_content_labels", { id: contentId, label: labelName });
      const newLabels = labels.filter((l) => l.label !== labelName);
      setLabels(newLabels);
      onLabelsChange?.(newLabels);
    } catch (err) {
      console.error("Failed to remove label:", err);
    } finally {
      setRemovingLabel(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col" data-testid="labels-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Labels</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <Icons.Close />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Add label input */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Add a label..."
              value={newLabelText}
              onChange={(e) => setNewLabelText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); }}
              className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400"
              data-testid="add-label-input"
            />
            <button
              onClick={handleAddLabel}
              disabled={!newLabelText.trim() || adding}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-orange-500 disabled:opacity-50"
              data-testid="add-label-button"
            >
              {adding ? (
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icons.Plus />
              )}
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-4 text-gray-500 text-sm">Loading labels...</div>
        )}

        {/* Current labels */}
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-2">Current labels ({labels.length})</div>
          {labels.length === 0 && !loading ? (
            <p className="text-sm text-gray-400">No labels on this content</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {labels.map((label, idx) => (
                <LabelTag
                  key={`${label.label}-${idx}`}
                  name={label.label}
                  labelId={label.id}
                  onRemove={() => handleRemoveLabel(label.label)}
                  removing={removingLabel === label.label}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelTag({ name, labelId, suggested, onRemove, removing }: { name: string; labelId?: string; suggested?: boolean; onRemove?: () => void; removing?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded-full ${
        suggested
          ? "bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
          : "bg-amber-100 text-orange-600"
      }`}
      data-testid={`label-tag-${name}`}
    >
      {name}{labelId && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{labelId}]</span>}
      {!suggested && onRemove && (
        <button
          onClick={onRemove}
          disabled={removing}
          className="hover:text-stone-700 disabled:opacity-50"
          data-testid={`remove-label-${name}`}
        >
          {removing ? (
            <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icons.Close />
          )}
        </button>
      )}
    </span>
  );
}

/** History/Versions panel */
interface ContentHistory {
  id: string;
  latest: boolean;
  createdBy: {
    type: string;
    username: string;
    displayName: string;
  };
  createdDate: string;
  previousVersion?: {
    number: number;
    when: string;
    by: {
      type: string;
      username: string;
      displayName: string;
    };
    message?: string;
    minorEdit: boolean;
  };
  nextVersion?: {
    number: number;
    when: string;
    by: {
      type: string;
      username: string;
      displayName: string;
    };
    message?: string;
    minorEdit: boolean;
  };
  lastUpdated?: {
    when: string;
    by: {
      type: string;
      username: string;
      displayName: string;
    };
    message?: string;
    version: number;
    minorEdit: boolean;
  };
}

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contentId?: string;
  currentVersion?: number;
}

function HistoryPanel({
  isOpen,
  onClose,
  contentId,
  currentVersion,
}: HistoryPanelProps) {
  const api = useBackendAPI("docfluence");
  const [history, setHistory] = useState<ContentHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompareView, setShowCompareView] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{ from: number; to: number } | null>(null);
  const [compareData, setCompareData] = useState<{ fromBody: string; toBody: string } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    if (isOpen && contentId) {
      loadHistory();
    }
  }, [isOpen, contentId]);

  const loadHistory = async () => {
    if (!contentId) return;

    setLoading(true);
    setError(null);
    try {
      const historyData = await api.callTool<ContentHistory>(
        "get_content_history",
        {
          id: contentId,
          expand: "previousVersion,nextVersion,lastUpdated",
        }
      );
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Build version list from history data
  const buildVersionList = () => {
    if (!history) return [];

    const versions: Array<{
      number: number;
      author: string;
      time: string;
      message?: string;
      isCurrent: boolean;
    }> = [];

    // Add current version - use lastUpdated if available, otherwise createdBy
    if (currentVersion) {
      const currentAuthor = history.lastUpdated?.by?.displayName
        || history.createdBy?.displayName
        || "Unknown";
      const currentTime = history.lastUpdated?.when
        || history.createdDate;
      versions.push({
        number: currentVersion,
        author: currentAuthor,
        time: formatTimeAgo(currentTime),
        message: history.lastUpdated?.message,
        isCurrent: true,
      });
    }

    // Add previous version if exists
    if (history.previousVersion) {
      versions.push({
        number: history.previousVersion.number,
        author: history.previousVersion.by?.displayName || "Unknown",
        time: formatTimeAgo(history.previousVersion.when),
        message: history.previousVersion.message,
        isCurrent: false,
      });
    }

    // Sort by version number descending
    return versions.sort((a, b) => b.number - a.number);
  };

  const versionList = buildVersionList();

  const extractVersionBody = (result: PromiseSettledResult<Content | undefined>) =>
    result.status === "fulfilled"
      ? (result.value?.body?.storage?.value || result.value?.body?.view?.value || "<p>No content</p>")
      : "<p>Unable to load version</p>";

  const handleCompareVersions = async () => {
    if (versionList.length < 2) return;
    const sorted = [...versionList].sort((a, b) => a.number - b.number);
    setCompareVersions({ from: sorted[0].number, to: sorted[sorted.length - 1].number });
    setShowCompareView(true);
    setCompareLoading(true);
    try {
      const [fromResult, toResult] = await Promise.allSettled([
        api.callTool<Content>("get_content_details", { id: contentId, version: sorted[0].number }),
        api.callTool<Content>("get_content_details", { id: contentId, version: sorted[sorted.length - 1].number }),
      ]);
      setCompareData({ fromBody: extractVersionBody(fromResult), toBody: extractVersionBody(toResult) });
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col" data-testid="history-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Page history</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" data-testid="close-history-panel">
          <Icons.Close />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button
              onClick={loadHistory}
              className="text-sm text-orange-500 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !history ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No history available
          </div>
        ) : (
          <>
            {/* Creation info */}
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="text-xs text-gray-500 uppercase mb-1">Created</div>
              <div className="text-sm text-gray-900">
                {history.createdBy?.displayName || "Unknown"}
              </div>
              <div className="text-xs text-gray-500">
                {formatTimeAgo(history.createdDate)}
              </div>
            </div>

            {/* Version list */}
            <div className="divide-y divide-gray-100" data-testid="version-list">
              {versionList.length > 0 ? (
                versionList.map((v) => (
                  <VersionItem
                    key={v.number}
                    version={v.number}
                    author={v.author}
                    time={v.time}
                    message={v.message}
                    isCurrent={v.isCurrent}
                  />
                ))
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">
                  Only one version exists
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Compare versions - disabled if less than 2 versions */}
      <div className="p-4 border-t border-gray-200">
        <button
          className="w-full px-4 py-2 text-sm text-orange-500 border border-orange-500 rounded-md hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={versionList.length < 2}
          onClick={handleCompareVersions}
          data-testid="compare-versions-button"
        >
          Compare versions
        </button>
      </div>

      {/* Version Comparison View */}
      {showCompareView && compareVersions && (
        <div className="absolute inset-0 bg-white z-10 flex flex-col" data-testid="compare-versions-view">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">
              Comparing v{compareVersions.from} → v{compareVersions.to}
            </h3>
            <button
              onClick={() => { setShowCompareView(false); setCompareData(null); }}
              className="p-1 hover:bg-gray-100 rounded"
              data-testid="close-compare-view"
            >
              <Icons.Close />
            </button>
          </div>
          {compareLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : compareData ? (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 divide-x divide-gray-200 h-full">
                <div className="p-4">
                  <div className="text-sm font-medium text-gray-500 mb-2 bg-red-50 px-2 py-1 rounded">
                    Version {compareVersions.from} (older)
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: compareData.fromBody }} />
                </div>
                <div className="p-4">
                  <div className="text-sm font-medium text-gray-500 mb-2 bg-green-50 px-2 py-1 rounded">
                    Version {compareVersions.to} (newer)
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: compareData.toBody }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Unable to load version comparison
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VersionItem({
  version,
  author,
  time,
  message,
  isCurrent,
}: {
  version: number;
  author: string;
  time: string;
  message?: string;
  isCurrent?: boolean;
}) {
  return (
    <button
      className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 text-left"
      data-testid={`version-item-${version}`}
    >
      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
        v{version}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{author}</span>
          {isCurrent && (
            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
              Current
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">{time}</div>
        {message && <div className="text-sm text-gray-600 mt-1">{message}</div>}
      </div>
      <button className="p-1 hover:bg-gray-100 rounded">
        <Icons.MoreHorizontal />
      </button>
    </button>
  );
}

/** Properties panel */
function PropertiesPanel({
  isOpen,
  onClose,
  contentId,
}: {
  isOpen: boolean;
  onClose: () => void;
  contentId?: string;
}) {
  const api = useBackendAPI("docfluence");
  const [properties, setProperties] = useState<ContentProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && contentId) {
      loadProperties();
    }
  }, [isOpen, contentId]);

  const loadProperties = async () => {
    if (!contentId) return;
    setLoading(true);
    try {
      const result = await api.callTool<ContentProperty[] | { results: ContentProperty[] }>("get_content_properties", {
        id: contentId,
        start: 0,
        limit: 50,
      });
      const props = Array.isArray(result) ? result : (result?.results || []);
      setProperties(props);
    } catch (err) {
      console.error("Failed to load properties:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProperty = async () => {
    if (!newKey.trim() || !contentId) return;
    setAdding(true);
    try {
      let parsedValue: unknown;
      try { parsedValue = JSON.parse(newValue); } catch { parsedValue = newValue; }

      const result = await api.callTool<ContentProperty>("create_content_property", {
        id: contentId,
        body: { key: newKey.trim(), value: parsedValue },
      });
      setProperties([...properties, result]);
      setNewKey("");
      setNewValue("");
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to create property:", err);
      // Try create_content_property_for_key as fallback
      try {
        let parsedValue: unknown;
        try { parsedValue = JSON.parse(newValue); } catch { parsedValue = newValue; }
        const result = await api.callTool<ContentProperty>("create_content_property_for_key", {
          id: contentId,
          key: newKey.trim(),
          body: { value: parsedValue },
        });
        setProperties([...properties, result]);
        setNewKey("");
        setNewValue("");
        setShowAddForm(false);
      } catch (err2) {
        console.error("Fallback also failed:", err2);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateProperty = async (key: string) => {
    if (!contentId) return;
    try {
      let parsedValue: unknown;
      try { parsedValue = JSON.parse(editValue); } catch { parsedValue = editValue; }

      const result = await api.callTool<ContentProperty>("update_content_property", {
        id: contentId,
        key,
        body: { value: parsedValue, version: { number: 1 } },
      });
      setProperties(properties.map((p) => (p.key === key ? result : p)));
      setEditingKey(null);
      setEditValue("");
    } catch (err) {
      console.error("Failed to update property:", err);
    }
  };

  const handleDeleteProperty = async (key: string) => {
    if (!contentId) return;
    setDeletingKey(key);
    try {
      await api.callTool("delete_content_property", { id: contentId, key });
      setProperties(properties.filter((p) => p.key !== key));
    } catch (err) {
      console.error("Failed to delete property:", err);
    } finally {
      setDeletingKey(null);
    }
  };

  const handleGetPropertyDetails = async (key: string) => {
    if (!contentId) return;
    try {
      const detail = await api.callTool<ContentProperty>("get_content_property_details", {
        id: contentId,
        key,
      });
      // Update the property in the list with full details
      setProperties(properties.map((p) => (p.key === key ? detail : p)));
    } catch (err) {
      console.error("Failed to get property details:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col" data-testid="properties-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Content properties</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <Icons.Close />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Add property button/form */}
        {showAddForm ? (
          <div className="mb-4 p-3 border border-gray-200 rounded-lg">
            <input
              type="text"
              placeholder="Property key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full px-2 py-1.5 mb-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              data-testid="property-key-input"
            />
            <input
              type="text"
              placeholder="Value (JSON or text)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full px-2 py-1.5 mb-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              data-testid="property-value-input"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddProperty}
                disabled={!newKey.trim() || adding}
                className="px-3 py-1 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded disabled:opacity-50"
                data-testid="save-property-button"
              >
                {adding ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewKey(""); setNewValue(""); }}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center gap-2 p-2 text-sm text-orange-500 hover:bg-amber-50 rounded-md mb-4"
            data-testid="add-property-button"
          >
            <Icons.Plus />
            <span>Add property</span>
          </button>
        )}

        {loading && <div className="text-center py-4 text-gray-500 text-sm">Loading properties...</div>}

        {/* Property list */}
        <div className="space-y-3">
          {properties.map((prop) => (
            <PropertyItem
              key={prop.key}
              property={prop}
              isEditing={editingKey === prop.key}
              editValue={editingKey === prop.key ? editValue : ""}
              onStartEdit={() => {
                setEditingKey(prop.key);
                setEditValue(typeof prop.value === "string" ? prop.value : JSON.stringify(prop.value));
              }}
              onCancelEdit={() => { setEditingKey(null); setEditValue(""); }}
              onSaveEdit={() => handleUpdateProperty(prop.key)}
              onEditValueChange={setEditValue}
              onDelete={() => handleDeleteProperty(prop.key)}
              onViewDetails={() => handleGetPropertyDetails(prop.key)}
              deleting={deletingKey === prop.key}
            />
          ))}
        </div>

        {!loading && properties.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No properties on this content</p>
        )}
      </div>
    </div>
  );
}

function PropertyItem({ property, isEditing, editValue, onStartEdit, onCancelEdit, onSaveEdit, onEditValueChange, onDelete, onViewDetails, deleting }: {
  property: ContentProperty;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditValueChange: (v: string) => void;
  onDelete: () => void;
  onViewDetails: () => void;
  deleting: boolean;
}) {
  const displayValue = typeof property.value === "string" ? property.value : JSON.stringify(property.value);

  return (
    <div className="p-2 bg-gray-50 rounded-lg" data-testid={`property-item-${property.key}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 font-medium cursor-pointer hover:text-orange-500" onClick={onViewDetails}>
          {property.key}{property.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{property.id}]</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onStartEdit} className="p-1 hover:bg-gray-200 rounded" data-testid={`edit-property-${property.key}`}>
            <Icons.Edit />
          </button>
          <button onClick={onDelete} disabled={deleting} className="p-1 hover:bg-gray-200 rounded text-red-500 disabled:opacity-50" data-testid={`delete-property-${property.key}`}>
            {deleting ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <Icons.Trash />}
          </button>
        </div>
      </div>
      {isEditing ? (
        <div className="mt-1">
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            data-testid={`edit-property-value-${property.key}`}
          />
          <div className="flex gap-2 mt-1">
            <button onClick={onSaveEdit} className="px-2 py-0.5 text-xs text-white bg-orange-500 rounded" data-testid={`save-property-edit-${property.key}`}>Save</button>
            <button onClick={onCancelEdit} className="px-2 py-0.5 text-xs text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="text-sm font-medium text-gray-900 mt-1 break-words">{displayValue}</div>
      )}
    </div>
  );
}

// =============================================================================
// SPACE BROWSER COMPONENT
// =============================================================================

/** Space browser view */
function SpaceBrowser({
  onSelectSpace,
  onCreateSpace,
  refreshKey,
}: {
  onSelectSpace: (space: Space) => void;
  onCreateSpace: () => void;
  refreshKey?: number;
}) {
  const api = useBackendAPI("docfluence");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSpaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.callTool<Space[]>("get_spaces", {
        start: 0,
        limit: 100,
      });
      setSpaces(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spaces");
      console.error("Failed to load spaces:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpaces();
  }, [refreshKey]);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading spaces...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadSpaces}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Main content
  return (
    <div className="flex-1 overflow-y-auto bg-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Spaces</h1>
          <button
            onClick={onCreateSpace}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600"
          >
            <Icons.Plus />
            <span>Create space</span>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
          <button className="px-4 py-2 text-sm font-medium text-orange-500 border-b-2 border-orange-500">
            All spaces
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            My spaces
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            Starred
          </button>
        </div>

        {/* Space grid */}
        {spaces.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No spaces found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {spaces.map((space: Space) => (
              <SpaceCard
                key={space.spaceKey}
                name={space.name}
                key_={space.spaceKey}
                description={space.description}
                icon={space.name.charAt(0).toUpperCase()}
                isPersonal={space.spaceKey.startsWith("~")}
                onClick={() => onSelectSpace(space)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpaceCard({
  name,
  key_,
  description,
  icon,
  isPersonal,
  onClick,
}: {
  name: string;
  key_: string;
  description: string;
  icon: string;
  isPersonal?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow text-left cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
            isPersonal ? "bg-orange-500" : "bg-orange-400"
          }`}
        >
          {icon.length <= 2 ? icon : <span className="text-lg">{icon}</span>}
        </div>
        <div>
          <div className="font-medium text-gray-900">{name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{key_}]</span></div>
          <div className="text-xs text-gray-500">{key_}</div>
        </div>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
      <div className="mt-auto pt-3 flex items-center gap-2">
        <button
          className="p-1 hover:bg-gray-100 rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <Icons.Star />
        </button>
        <button
          className="p-1 hover:bg-gray-100 rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <Icons.Settings />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// SPACE CONTENT VIEW
// =============================================================================

function SpaceContentView({
  space,
  onSelectContent,
  onDelete,
  onOpenSettings,
  onEditSpace,
  onCreateBlogPost,
  onCreatePage,
}: {
  space: Space | null;
  onSelectContent: (content: Content) => void;
  onDelete?: () => void;
  onOpenSettings?: () => void;
  onEditSpace?: () => void;
  onCreateBlogPost?: () => void;
  onCreatePage?: () => void;
}) {
  const api = useBackendAPI("docfluence");
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [contentTypeFilter, setContentTypeFilter] = useState<"all" | "page" | "blogpost">("all");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [showEditSpaceModal, setShowEditSpaceModal] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState(space?.name || "");
  const [editSpaceDesc, setEditSpaceDesc] = useState(space?.description || "");
  const [savingSpace, setSavingSpace] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [recentUpdatesLimit, setRecentUpdatesLimit] = useState(5);

  // Sort by last updated - show all content, sort by version time if available
  const allRecentContents = useMemo(() =>
    [...contents]
      .filter((c: Content) => c.type === "page" || c.type === "blogpost")
      .sort((a, b) => {
        const aTime = a.version?.when ? new Date(a.version.when).getTime() : 0;
        const bTime = b.version?.when ? new Date(b.version.when).getTime() : 0;
        return bTime - aTime;
      }),
    [contents]
  );

  const handleDeleteSpace = async () => {
    if (!space || !onDelete) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.callTool("delete_space", { spaceKey: space.spaceKey });
      onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete space");
      console.error("Failed to delete space:", err);
    } finally {
      setDeleting(false);
    }
  };

  const loadContent = async () => {
    if (!space) return;

    setLoading(true);
    setError(null);
    try {
      let result: Content[];
      if (contentTypeFilter !== "all") {
        // Use get_space_content_by_type for filtered results
        result = await api.callTool<Content[]>("get_space_content_by_type", {
          spaceKey: space.spaceKey,
          type: contentTypeFilter,
          start: 0,
          limit: 100,
        }) || [];
      } else {
        result = await api.callTool<Content[]>("get_space_content", {
          spaceKey: space.spaceKey,
          start: 0,
          limit: 100,
        }) || [];
      }
      setContents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
      console.error("Failed to load content:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [space?.spaceKey, contentTypeFilter]);

  if (!space) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <p className="text-gray-500">No space selected</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadContent}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isPersonal = space.spaceKey.startsWith("~");
  const iconBg = isPersonal ? "bg-orange-500" : "bg-orange-400";
  const icon = space.name.charAt(0).toUpperCase();
  const recentContents = allRecentContents.slice(0, recentUpdatesLimit);

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Top header bar */}
      <div className="border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-gray-700">{space.name}</h2>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 ${iconBg} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
              {icon}
            </div>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-1"
                data-testid="space-settings-button"
              >
                <Icons.Settings />
                <span>Settings</span>
              </button>
            )}
            <button
              onClick={onCreatePage}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-1"
              data-testid="space-edit-button"
              title="Create new page"
            >
              <Icons.Edit />
              <span>Edit</span>
            </button>
            <button
              onClick={() => setShowShareDialog(true)}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-1"
              data-testid="space-share-button"
              title="Share space"
            >
              <Icons.Share />
              <span>Share</span>
            </button>
            {onDelete && !showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-1"
                data-testid="delete-space-button"
              >
                <Icons.Trash />
                <span>Delete</span>
              </button>
            )}
            {onDelete && showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Delete this space and all its content?</span>
                <button
                  onClick={handleDeleteSpace}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                  data-testid="confirm-delete-space-button"
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300"
                  data-testid="cancel-delete-space-button"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={() => {
                if (space) {
                  navigator.clipboard.writeText(`${window.location.origin}/space/${space.spaceKey}`);
                  setShowSharePopup(true);
                  setTimeout(() => setShowSharePopup(false), 2000);
                }
              }}
              className="p-1.5 text-gray-700 hover:bg-gray-100 rounded"
              data-testid="space-copy-link-button"
              title="Copy link"
            >
              <Icons.Link />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-1.5 text-gray-700 hover:bg-gray-100 rounded"
                data-testid="space-more-button"
                title="More actions"
              >
                <Icons.MoreHorizontal />
              </button>
              <PopoverMenu
                isOpen={showMoreMenu}
                onClose={() => setShowMoreMenu(false)}
                className="right-0 top-full mt-1 w-48"
                data-testid="space-more-menu"
              >
                <div className="py-1">
                  <PopoverMenuItem
                    icon={<Icons.Settings />}
                    label="Space settings"
                    onClick={() => { setShowMoreMenu(false); onOpenSettings?.(); }}
                    data-testid="space-more-settings"
                  />
                  <PopoverMenuItem
                    icon={<Icons.Edit />}
                    label="Edit space"
                    onClick={() => { setShowMoreMenu(false); setEditSpaceName(space?.name || ""); setEditSpaceDesc(space?.description || ""); setShowEditSpaceModal(true); }}
                    data-testid="space-more-edit"
                  />
                  <PopoverMenuDivider />
                  <PopoverMenuItem
                    icon={<Icons.Trash />}
                    label="Delete space"
                    onClick={() => { setShowMoreMenu(false); setShowDeleteConfirm(true); }}
                    data-testid="space-more-delete"
                  />
                </div>
              </PopoverMenu>
            </div>
          </div>
          {deleteError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {deleteError}
            </div>
          )}
          {showSharePopup && (
            <div className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2" data-testid="share-popup">
              Link copied to clipboard!
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="px-6 py-8">
        {/* Overview header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 ${iconBg} rounded-full flex items-center justify-center text-white text-lg font-bold`}>
            {icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{space.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{space.spaceKey}]</span></h1>
            <p className="text-sm text-gray-500">Space Key: {space.spaceKey}</p>
          </div>
        </div>

        {/* Space Details/Metadata section */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8" data-testid="space-metadata">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Space Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Key:</span>
              <span className="ml-2 text-gray-900 font-mono">{space.spaceKey}</span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>
              <span className="ml-2 text-gray-900">{isPersonal ? "Personal Space" : "Team Space"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500">Description:</span>
              <p className="mt-1 text-gray-900">
                {space.description || "No description provided."}
              </p>
            </div>
          </div>
        </div>

        {/* Space Content section with type filter */}
        <div className="mb-8" data-testid="space-content-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Space Content</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Filter:</span>
              <select
                value={contentTypeFilter}
                onChange={(e) => setContentTypeFilter(e.target.value as "all" | "page" | "blogpost")}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900"
                data-testid="space-content-type-filter"
              >
                <option value="all">All Types</option>
                <option value="page">Pages</option>
                <option value="blogpost">Blog Posts</option>
              </select>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-200" data-testid="space-content-list">
            {contents
              .filter((c) => c.type === "page" || c.type === "blogpost")
              .map((content) => (
                <button
                  key={content.id}
                  onClick={() => onSelectContent(content)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  data-testid={`space-content-item-${content.id}`}
                >
                  <span className="text-lg">
                    {content.type === "page" ? "📄" : "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-900 font-medium truncate">{content.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{content.id}]</span></div>
                    <div className="text-xs text-gray-500">
                      {content.type === "page" ? "Page" : "Blog Post"}
                      {content.version?.when && ` • Updated ${getTimeAgo(content.version.when)}`}
                    </div>
                  </div>
                </button>
              ))}
            {contents.filter((c) => c.type === "page" || c.type === "blogpost").length === 0 && (
              <div className="px-4 py-6 text-center text-gray-500">
                No {contentTypeFilter === "all" ? "content" : contentTypeFilter === "page" ? "pages" : "blog posts"} in this space
              </div>
            )}
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column - Recent updates */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">Recent updates</h3>
            <div className="space-y-3">
              {recentContents.map((content) => {
                const timeAgo = content.version?.when ? getTimeAgo(content.version.when) : "";
                const author = content.version?.by?.displayName || "Unknown";
                const message = content.version?.message || "contributed";
                return (
                  <button
                    key={content.id}
                    onClick={() => onSelectContent(content)}
                    className="w-full text-left hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">
                        {content.type === "page" ? "📄" : "📋"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-stone-900 font-medium hover:underline truncate">
                          {content.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{content.id}]</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {timeAgo} • {message} by {author}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {recentContents.length > 0 && recentContents.length < allRecentContents.length && (
                <button
                  onClick={() => setRecentUpdatesLimit((prev) => prev + 5)}
                  className="text-sm text-orange-500 hover:underline"
                  data-testid="show-more-button"
                >
                  Show More ({allRecentContents.length - recentContents.length} remaining)
                </button>
              )}
            </div>
          </div>

          {/* Right column - Blog stream */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">Blog stream</h3>
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-sm text-gray-600 mb-4">
                Create a blog post to share news and announcements with your team and company.
              </p>
              <button
                onClick={onCreateBlogPost}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium"
                data-testid="create-blog-post-button"
              >
                Create blog post
              </button>
            </div>
          </div>
        </div>

        {/* Get in touch section */}
        <div className="mt-12">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>👋</span>
            <span>Get in touch</span>
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-gray-400">✉️</span>
              <div className="flex-1"></div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-400">💼</span>
              <div className="flex-1"></div>
            </div>
            <p className="text-sm text-gray-700">
              End with a bang! Some options are: "I am so grateful to be here at{" "}
              <span className="text-orange-500">&lt;Insert company name&gt;</span> and very excited to get started!" or
              "Looking forward to meeting all of you!" or "Can't wait to get to know all of you!"
            </p>
          </div>
        </div>
      </div>

      {/* Edit Space Modal */}
      {showEditSpaceModal && space && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="edit-space-modal">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Space</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editSpaceName}
                  onChange={(e) => setEditSpaceName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  data-testid="edit-space-name-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editSpaceDesc}
                  onChange={(e) => setEditSpaceDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  data-testid="edit-space-desc-input"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEditSpaceModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSavingSpace(true);
                  try {
                    await api.callTool("update_space", {
                      spaceKey: space.spaceKey,
                      body: { name: editSpaceName, description: editSpaceDesc },
                    });
                    setShowEditSpaceModal(false);
                    loadContent();
                  } catch (err) {
                    console.error("Failed to update space:", err);
                  } finally {
                    setSavingSpace(false);
                  }
                }}
                disabled={savingSpace}
                className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md disabled:opacity-50"
                data-testid="edit-space-save-button"
              >
                {savingSpace ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Space Dialog */}
      {showShareDialog && space && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="share-space-dialog">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Share Space</h2>
            <p className="text-sm text-gray-600 mb-4">Share &quot;{space.name}&quot; with others by entering their email address.</p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Enter email address..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                data-testid="share-email-input"
              />
              <button
                onClick={() => {
                  if (shareEmail.trim()) {
                    setShareEmail("");
                    alert(`Invitation sent to ${shareEmail.trim()}`);
                  }
                }}
                disabled={!shareEmail.trim()}
                className="px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md disabled:opacity-50"
                data-testid="share-send-button"
              >
                Send
              </button>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/space/${space.spaceKey}`);
                  setShowSharePopup(true);
                  setTimeout(() => setShowSharePopup(false), 2000);
                }}
                className="text-sm text-orange-500 hover:underline flex items-center gap-1"
              >
                <Icons.Link />
                <span>Copy link to share</span>
              </button>
              {showSharePopup && (
                <div className="mt-2 text-sm text-green-700">Link copied!</div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => { setShowShareDialog(false); setShareEmail(""); }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-300"
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

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `about ${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

// =============================================================================
// MAIN SIDEBAR COMPONENT
// =============================================================================

interface SidebarProps {
  spaces: Space[];
  selectedSpace: Space | null;
  onSelectSpace: (space: Space) => void;
  onSelectContent: (content: Content) => void;
  onCreateContent: (parentContent?: Content) => void;
  onCreateSpace?: () => void;
  onViewAllSpaces?: () => void;
  onViewAllContent?: () => void;
  contentRefreshKey?: number;
  onNavigate?: (view: ViewType) => void;
  activeNavItem?: string;
}

function Sidebar({
  spaces,
  selectedSpace,
  onSelectSpace,
  onSelectContent,
  onCreateContent,
  onCreateSpace,
  onViewAllSpaces,
  onViewAllContent,
  contentRefreshKey,
  onNavigate,
  activeNavItem,
}: SidebarProps) {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <SidebarNavigation
        spaces={spaces}
        onSelectSpace={onSelectSpace}
        onCreateSpace={onCreateSpace}
        onViewAllSpaces={onViewAllSpaces}
        onViewAllContent={onViewAllContent}
        onNavigate={onNavigate}
        activeNavItem={activeNavItem}
      />
      <SpaceSelector
        space={selectedSpace}
        onClick={() => {
          if (selectedSpace) {
            onSelectSpace(selectedSpace);
          }
        }}
      />
      <ShortcutsSection onClick={() => onNavigate?.("shortcuts")} isActive={activeNavItem === "shortcuts"} />
      <ContentTreeSection
        selectedSpace={selectedSpace}
        onSelectContent={onSelectContent}
        onCreateContent={onCreateContent}
        refreshKey={contentRefreshKey}
      />
      <SecondarySidebarLinks />
      <ExternalLinksSection />
      <InvitePeopleButton />
    </aside>
  );
}

// =============================================================================
// GLOBAL CONTENT VIEW
// =============================================================================

interface GlobalContentViewProps {
  onSelectContent: (content: Content) => void;
}

function GlobalContentView({ onSelectContent }: GlobalContentViewProps) {
  const api = useBackendAPI("docfluence");
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("current");

  useEffect(() => {
    loadContent();
  }, [typeFilter, statusFilter]);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build CQL query parts
      const queryParts: string[] = ["type!='attachment'", "type!='comment'"];

      // Add type filter
      if (typeFilter !== "all") {
        queryParts.push(`type='${typeFilter}'`);
      }

      // Add status filter
      if (statusFilter !== "all") {
        queryParts.push(`status='${statusFilter}'`);
      }

      const cqlQuery = queryParts.join(" AND ");

      const results = await api.callTool<Content[]>("search_content", {
        query: cqlQuery,
        limit: 50,
      });
      setContent(results || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Failed to load content:", errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getContentIcon = (type: string): string => {
    switch (type) {
      case "page": return "📄";
      case "blogpost": return "📝";
      default: return "📄";
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6" data-testid="global-content-view">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Content</h1>
        <div className="flex items-center gap-4">
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            data-testid="content-type-filter"
          >
            <option value="all">All Types</option>
            <option value="page">Pages</option>
            <option value="blogpost">Blog Posts</option>
          </select>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            data-testid="content-status-filter"
          >
            <option value="current">Current</option>
            <option value="draft">Drafts</option>
            <option value="trashed">Trashed</option>
            <option value="all">All Status</option>
          </select>
        </div>
      </div>

      {/* Content list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Error loading content: {error}
          </div>
        )}

        {!loading && !error && content.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Icons.Document />
            <p className="mt-4">No content found</p>
          </div>
        )}

        {!loading && !error && content.length > 0 && (
          <div className="space-y-2" data-testid="global-content-list">
            {content.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectContent(item)}
                className="w-full flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all text-left"
                data-testid={`global-content-item-${item.id}`}
              >
                <span className="text-2xl">{getContentIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{item.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{item.type}</span>
                    <span>in {item.spaceKey}</span>
                    {item.history?.createdDate && (
                      <>
                        <span>•</span>
                        <span>{formatDate(item.history.createdDate)}</span>
                      </>
                    )}
                    {item.status !== "current" && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        item.status === "draft" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {item.status}
                      </span>
                    )}
                  </div>
                </div>
                <Icons.ChevronRight />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SPACE SETTINGS VIEW (update_space, get_space_details)
// =============================================================================

function SpaceSettingsView({
  space,
  onBack,
  onSpaceUpdated,
}: {
  space: Space;
  onBack: () => void;
  onSpaceUpdated: (space: Space) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [spaceDetails, setSpaceDetails] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState(space.name);
  const [editDescription, setEditDescription] = useState(space.description || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSpaceDetails();
  }, [space.spaceKey]);

  const loadSpaceDetails = async () => {
    setLoading(true);
    try {
      const details = await api.callTool<Space>("get_space_details", { spaceKey: space.spaceKey });
      setSpaceDetails(details);
      setEditName(details.name || space.name);
      setEditDescription(details.description || space.description || "");
    } catch (err) {
      console.error("Failed to load space details:", err);
      setSpaceDetails(space);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await api.callTool<Space>("update_space", {
        spaceKey: space.spaceKey,
        body: { name: editName, description: editDescription },
      });
      setSpaceDetails(result);
      onSpaceUpdated(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update space:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  const isPersonal = space.spaceKey.startsWith("~");

  return (
    <div className="flex-1 overflow-y-auto bg-white p-6" data-testid="space-settings-view">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 mb-6">
          <span>&larr;</span> Back to space
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Space Settings</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Space Key</label>
            <input
              type="text"
              value={space.spaceKey}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Space key cannot be changed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Space Type</label>
            <input
              type="text"
              value={isPersonal ? "Personal Space" : "Team Space"}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              data-testid="space-name-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              data-testid="space-description-input"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600 disabled:opacity-50"
              data-testid="save-space-settings-button"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved successfully!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CQL SEARCH VIEW (search_content_cql)
// =============================================================================

function CqlSearchView({
  onSelectContent,
}: {
  onSelectContent: (content: Content) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [cqlQuery, setCqlQuery] = useState("");
  const [results, setResults] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!cqlQuery.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const result = await api.callTool<{ results?: Content[] } | Content[]>("search_content_cql", {
        cql: cqlQuery.trim(),
        limit: 50,
      });
      const items = Array.isArray(result) ? result : (result?.results || []);
      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 bg-white" data-testid="cql-search-view">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">CQL Search</h1>
      <p className="text-sm text-gray-600 mb-4">
        Search content using {APP_NAME} Query Language (CQL). Examples: <code className="bg-gray-100 px-1 rounded">type='page'</code>, <code className="bg-gray-100 px-1 rounded">space='DEV' AND title~'meeting'</code>
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={cqlQuery}
          onChange={(e) => setCqlQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Enter CQL query..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          data-testid="cql-search-input"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !cqlQuery.trim()}
          className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600 disabled:opacity-50"
          data-testid="cql-search-button"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {hasSearched && !loading && results.length === 0 && !error && (
          <div className="text-center py-8 text-gray-500">No results found</div>
        )}
        <div className="space-y-2" data-testid="cql-search-results">
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectContent(item)}
              className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              data-testid={`cql-result-${item.id}`}
            >
              <span className="text-lg">{item.type === "page" ? "📄" : item.type === "blogpost" ? "📝" : "📄"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{item.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span></div>
                <div className="text-xs text-gray-500">{item.type} in {item.spaceKey}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CONTENT BROWSER VIEW (get_content_list, get_content_children, get_content_children_by_type)
// =============================================================================

function ContentBrowserView({
  onSelectContent,
}: {
  onSelectContent: (content: Content) => void;
}) {
  const api = useBackendAPI("docfluence");
  const [contentList, setContentList] = useState<Content[]>([]);
  const [children, setChildren] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [spaceKeyFilter, setSpaceKeyFilter] = useState<string>("");
  const [titleFilter, setTitleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("current");
  const [activeTab, setActiveTab] = useState<"list" | "children">("list");
  const [parentId, setParentId] = useState<string>("");
  const [childType, setChildType] = useState<string>("");
  const [childrenLoading, setChildrenLoading] = useState(false);

  const handleLoadContentList = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { start: 0, limit: 50 };
      if (typeFilter) params.type = typeFilter;
      if (spaceKeyFilter) params.spaceKey = spaceKeyFilter;
      if (titleFilter) params.title = titleFilter;
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      const result = await api.callTool<Content[] | { results?: Content[] }>("get_content_list", params);
      const items = Array.isArray(result) ? result : (result?.results || []);
      setContentList(items);
    } catch (err) {
      console.error("Failed to load content list:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadChildren = async () => {
    if (!parentId.trim()) return;
    setChildrenLoading(true);
    try {
      let result: Content[] | Record<string, unknown>;
      if (childType) {
        result = await api.callTool<Content[]>("get_content_children_by_type", {
          id: parentId.trim(),
          child_type: childType,
          start: 0,
          limit: 50,
        });
      } else {
        result = await api.callTool<Record<string, unknown>>("get_content_children", {
          id: parentId.trim(),
        });
      }
      // Normalize result
      if (Array.isArray(result)) {
        setChildren(result);
      } else if (result && typeof result === "object") {
        const allChildren: Content[] = [];
        for (const key of ["page", "blogpost", "comment", "attachment"]) {
          const group = (result as Record<string, Content[] | { results?: Content[] }>)[key];
          if (Array.isArray(group)) allChildren.push(...group);
          else if (group?.results) allChildren.push(...group.results);
        }
        setChildren(allChildren);
      }
    } catch (err) {
      console.error("Failed to load children:", err);
    } finally {
      setChildrenLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "list") handleLoadContentList();
  }, [activeTab]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 bg-white" data-testid="content-browser-view">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Content Browser</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("list")}
          className={`pb-2 text-sm font-medium ${activeTab === "list" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500"}`}
        >
          Content List
        </button>
        <button
          onClick={() => setActiveTab("children")}
          className={`pb-2 text-sm font-medium ${activeTab === "children" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500"}`}
        >
          Content Children
        </button>
      </div>

      {activeTab === "list" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">All Types</option>
              <option value="page">Page</option>
              <option value="blogpost">Blog Post</option>
            </select>
            <input type="text" placeholder="Space key" value={spaceKeyFilter} onChange={(e) => setSpaceKeyFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm w-28" />
            <input type="text" placeholder="Title" value={titleFilter} onChange={(e) => setTitleFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm w-36" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="current">Current</option>
              <option value="draft">Draft</option>
              <option value="all">All</option>
            </select>
            <button onClick={handleLoadContentList} disabled={loading} className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 disabled:opacity-50" data-testid="browse-content-button">
              {loading ? "Loading..." : "Browse"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2" data-testid="content-list-results">
            {contentList.map((item) => (
              <button key={item.id} onClick={() => onSelectContent(item)} className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
                <span>{item.type === "page" ? "📄" : item.type === "comment" ? "💬" : item.type === "attachment" ? "📎" : "📝"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{item.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span></div>
                  <div className="text-xs text-gray-500">{item.type} in {item.spaceKey} {item.status !== "current" && `(${item.status})`}</div>
                </div>
              </button>
            ))}
            {!loading && contentList.length === 0 && (
              <div className="text-center py-8 text-gray-500">No content found. Click Browse to load.</div>
            )}
          </div>
        </>
      )}

      {activeTab === "children" && (
        <>
          {/* Children lookup */}
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Parent content ID" value={parentId} onChange={(e) => setParentId(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" data-testid="children-parent-id" />
            <select value={childType} onChange={(e) => setChildType(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">All Types</option>
              <option value="page">Page</option>
              <option value="blogpost">Blog Post</option>
              <option value="comment">Comment</option>
              <option value="attachment">Attachment</option>
            </select>
            <button onClick={handleLoadChildren} disabled={childrenLoading || !parentId.trim()} className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 disabled:opacity-50" data-testid="load-children-button">
              {childrenLoading ? "Loading..." : "Load Children"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2" data-testid="children-results">
            {children.map((item) => (
              <button key={item.id} onClick={() => onSelectContent(item)} className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
                <span>{item.type === "page" ? "📄" : item.type === "comment" ? "💬" : item.type === "attachment" ? "📎" : "📝"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{item.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span></div>
                  <div className="text-xs text-gray-500">{item.type} {item.spaceKey && `in ${item.spaceKey}`}</div>
                </div>
              </button>
            ))}
            {!childrenLoading && children.length === 0 && parentId && (
              <div className="text-center py-8 text-gray-500">No children found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// RESTRICTIONS PANEL (get_content_restrictions_by_operation, get_content_restrictions_for_operation)
// =============================================================================

function RestrictionsPanel({
  isOpen,
  onClose,
  contentId,
}: {
  isOpen: boolean;
  onClose: () => void;
  contentId?: string;
}) {
  const api = useBackendAPI("docfluence");
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [opRestrictions, setOpRestrictions] = useState<Restriction | null>(null);
  const [opLoading, setOpLoading] = useState(false);

  useEffect(() => {
    if (isOpen && contentId) {
      loadRestrictions();
    }
  }, [isOpen, contentId]);

  const loadRestrictions = async () => {
    if (!contentId) return;
    setLoading(true);
    try {
      const result = await api.callTool<Restriction[] | Record<string, unknown>>("get_content_restrictions_by_operation", {
        id: contentId,
      });
      // API returns object keyed by operation: {read: {operation, restrictions}, update: {...}}
      // Convert to array of Restriction objects
      const items = Array.isArray(result) ? result : (
        result && typeof result === "object"
          ? Object.values(result).filter((v): v is Restriction => v != null && typeof v === "object" && "operation" in v)
          : []
      );
      setRestrictions(items);
    } catch (err) {
      console.error("Failed to load restrictions:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadOperationRestrictions = async (operation: string) => {
    if (!contentId) return;
    setSelectedOp(operation);
    setOpLoading(true);
    try {
      const result = await api.callTool<Restriction>("get_content_restrictions_for_operation", {
        id: contentId,
        operationKey: operation,
      });
      setOpRestrictions(result);
    } catch (err) {
      console.error("Failed to load operation restrictions:", err);
    } finally {
      setOpLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col" data-testid="restrictions-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Restrictions</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><Icons.Close /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-center py-4 text-gray-500 text-sm">Loading restrictions...</div>}

        {!loading && restrictions.length === 0 && (
          <p className="text-sm text-gray-500">No restrictions on this content. Anyone with space access can view and edit.</p>
        )}

        {restrictions.map((r, i) => (
          <div key={i} className="mb-3 p-3 bg-gray-50 rounded-lg" data-testid={`restriction-${r.operation}`}>
            <button
              onClick={() => loadOperationRestrictions(r.operation)}
              className="text-sm font-medium text-orange-500 hover:text-orange-600"
            >
              {r.operation}
            </button>
            {r.restrictions?.user?.results && r.restrictions.user.results.length > 0 && (
              <div className="mt-1">
                <div className="text-xs text-gray-500">Users:</div>
                {r.restrictions.user.results.map((u, j) => (
                  <span key={j} className="text-xs text-gray-700 mr-2">{u.displayName || u.username}</span>
                ))}
              </div>
            )}
            {r.restrictions?.group?.results && r.restrictions.group.results.length > 0 && (
              <div className="mt-1">
                <div className="text-xs text-gray-500">Groups:</div>
                {r.restrictions.group.results.map((g, j) => (
                  <span key={j} className="text-xs text-gray-700 mr-2">{g.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Operation-specific detail */}
        {selectedOp && opRestrictions && (
          <div className="mt-4 p-3 border border-amber-200 bg-amber-50 rounded-lg">
            <div className="text-sm font-medium text-orange-600 mb-1">Details: {selectedOp}</div>
            {opLoading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : (
              <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(opRestrictions, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CONTENT BODY CONVERTER (convert_content_body)
// =============================================================================

function ContentBodyConverter({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const api = useBackendAPI("docfluence");
  const [inputBody, setInputBody] = useState("");
  const [fromFormat, setFromFormat] = useState("storage");
  const [toFormat, setToFormat] = useState("view");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    if (!inputBody.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.callTool<{ value?: string; representation?: string } | Record<string, unknown>>("convert_content_body", {
        to: toFormat,
        body: { value: inputBody, type: fromFormat },
      });
      if (response && typeof response === "object" && "value" in response) {
        setResult(String(response.value));
      } else {
        setResult(JSON.stringify(response, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-96 border-l border-gray-200 bg-white flex flex-col" data-testid="body-converter-panel">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Body Converter</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><Icons.Close /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <select value={fromFormat} onChange={(e) => setFromFormat(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="storage">Storage</option>
              <option value="view">View</option>
              <option value="editor">Editor</option>
              <option value="export_view">Export View</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <select value={toFormat} onChange={(e) => setToFormat(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="view">View</option>
              <option value="storage">Storage</option>
              <option value="editor">Editor</option>
              <option value="export_view">Export View</option>
            </select>
          </div>
        </div>

        <textarea
          value={inputBody}
          onChange={(e) => setInputBody(e.target.value)}
          placeholder="Enter content body..."
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
          data-testid="converter-input"
        />

        <button
          onClick={handleConvert}
          disabled={loading || !inputBody.trim()}
          className="w-full px-4 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 disabled:opacity-50 mb-3"
          data-testid="convert-button"
        >
          {loading ? "Converting..." : "Convert"}
        </button>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-3">{error}</div>}

        {result !== null && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Result</label>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-sm whitespace-pre-wrap break-words text-gray-900" data-testid="converter-result">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// LONG TASKS VIEW (get_long_tasks, get_long_task_details)
// =============================================================================

interface LongTask {
  id: string;
  status?: string;
  description?: string;
  name?: string;
  elapsedTime?: number;
  percentageComplete?: number;
  successful?: boolean;
  finished?: boolean;
  messages?: Array<{ translation?: string; args?: unknown[] }>;
}

function LongTasksView() {
  const api = useBackendAPI("docfluence");
  const [tasks, setTasks] = useState<LongTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<LongTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const result = await api.callTool<LongTask[] | { results?: LongTask[] }>("get_long_tasks", { start: 0, limit: 100 });
      const items = Array.isArray(result) ? result : (result?.results || []);
      setTasks(items);
    } catch (err) {
      console.error("Failed to load long tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.callTool<LongTask>("get_long_task_details", { id: taskId });
      setSelectedTask(detail);
    } catch (err) {
      console.error("Failed to load task details:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 bg-white" data-testid="long-tasks-view">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Long-Running Tasks</h1>
        <button onClick={loadTasks} disabled={loading} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md">
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && tasks.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-12 text-gray-500">No long-running tasks found</div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="p-4 border border-gray-200 rounded-lg" data-testid={`long-task-${task.id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-gray-900">{task.description || task.name || `Task ${task.id}`}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{task.id}]</span></div>
              <button
                onClick={() => handleViewDetails(task.id)}
                className="text-xs text-orange-500 hover:text-orange-600"
                data-testid={`view-task-${task.id}`}
              >
                View Details
              </button>
            </div>
            {task.percentageComplete !== undefined && (
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${task.status === "failed" || task.successful === false ? "bg-red-500" : task.status === "completed" || task.finished ? "bg-green-500" : "bg-orange-400"}`}
                  style={{ width: `${task.percentageComplete}%` }}
                />
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {task.status && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  task.status === "completed" ? "bg-green-100 text-green-700" :
                  task.status === "failed" ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-orange-600"
                }`}>
                  {task.status}
                </span>
              )}
              {task.percentageComplete !== undefined && <span>{task.percentageComplete}% complete</span>}
              {!task.status && task.finished !== undefined && <span>{task.finished ? "Finished" : "In Progress"}</span>}
              {!task.status && task.successful !== undefined && task.finished && (
                <span className={task.successful ? "text-green-600" : "text-red-600"}>
                  {task.successful ? "Success" : "Failed"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedTask(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()} data-testid="task-detail-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Task Details</h2>
              <button onClick={() => setSelectedTask(null)} className="p-1 hover:bg-gray-100 rounded"><Icons.Close /></button>
            </div>
            {detailLoading ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : (
              <pre className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap text-gray-900">{JSON.stringify(selectedTask, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FOR YOU / RECENT / STARRED VIEWS
// =============================================================================

function ForYouView({ onSelectContent }: { onSelectContent: (content: Content) => void }) {
  const api = useBackendAPI("docfluence");
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const results = await api.callTool<Content[]>("search_content", {
          query: "type!='attachment' AND type!='comment' AND status='current'",
          limit: 20,
        });
        setContent(results || []);
      } catch (err) {
        console.error("Failed to load content for you:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-white p-8" data-testid="for-you-view">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">For you</h1>
      <p className="text-gray-600 mb-6">Pages and blog posts relevant to you.</p>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : content.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No content found.</div>
      ) : (
        <div className="space-y-2">
          {content.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectContent(c)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 border border-gray-100"
              data-testid={`for-you-item-${c.id}`}
            >
              <span className="text-lg">{c.type === "page" ? "📄" : "📝"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-stone-900 font-medium truncate">{c.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{c.id}]</span></div>
                <div className="text-xs text-gray-500">
                  {c.type === "page" ? "Page" : "Blog Post"} in {c.spaceKey}
                  {c.version?.when && ` • Updated ${getTimeAgo(c.version.when)}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentView({ onSelectContent, recentlyViewedIds }: { onSelectContent: (content: Content) => void; recentlyViewedIds?: string[] }) {
  const api = useBackendAPI("docfluence");
  const [rawContent, setRawContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch content once on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const results = await api.callTool<Content[]>("search_content", {
          query: "type!='attachment' AND type!='comment'",
          limit: 30,
        });
        setRawContent(results || []);
      } catch (err) {
        console.error("Failed to load recent content:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sort client-side whenever viewed order changes
  const content = useMemo(() => {
    const viewed = recentlyViewedIds || [];
    return [...rawContent].sort((a: Content, b: Content) => {
      const aIdx = viewed.indexOf(a.id);
      const bIdx = viewed.indexOf(b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      const aTime = a.version?.when ? new Date(a.version.when).getTime() : 0;
      const bTime = b.version?.when ? new Date(b.version.when).getTime() : 0;
      return bTime - aTime;
    });
  }, [rawContent, recentlyViewedIds]);

  return (
    <div className="flex-1 overflow-y-auto bg-white p-8" data-testid="recent-view">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Recent</h1>
      <p className="text-gray-600 mb-6">Pages and blog posts you have recently viewed or edited.</p>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : content.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No recent content.</div>
      ) : (
        <div className="space-y-2">
          {content.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectContent(c)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 border border-gray-100"
              data-testid={`recent-item-${c.id}`}
            >
              <span className="text-lg">{c.type === "page" ? "📄" : "📝"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-stone-900 font-medium truncate">{c.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{c.id}]</span></div>
                <div className="text-xs text-gray-500">
                  {c.type === "page" ? "Page" : "Blog Post"} in {c.spaceKey}
                  {c.version?.when && ` • ${getTimeAgo(c.version.when)}`}
                  {c.version?.by?.displayName && ` • by ${c.version.by.displayName}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StarredView({ onSelectContent }: { onSelectContent: (content: Content) => void }) {
  const api = useBackendAPI("docfluence");
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Try to find content with "starred" labels
        const results = await api.callTool<Content[]>("search_content", {
          query: "type!='attachment' AND type!='comment' AND label='starred'",
          limit: 30,
        });
        setContent(results || []);
      } catch (err) {
        console.error("Failed to load starred content:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-white p-8" data-testid="starred-view">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Starred</h1>
      <p className="text-gray-600 mb-6">Pages and blog posts you have starred for quick access.</p>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : content.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icons.Star />
          <p className="mt-2">No starred content yet.</p>
          <p className="text-sm mt-1">Star pages and blog posts to find them quickly here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {content.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectContent(c)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 border border-gray-100"
              data-testid={`starred-item-${c.id}`}
            >
              <span className="text-lg">{c.type === "page" ? "📄" : "📝"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-stone-900 font-medium truncate">{c.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{c.id}]</span></div>
                <div className="text-xs text-gray-500">
                  {c.type === "page" ? "Page" : "Blog Post"} in {c.spaceKey}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// VIEW ENUM & VIEW SWITCHER
// =============================================================================

type ViewType =
  | "content"
  | "allContent"
  | "editor"
  | "spaces"
  | "spaceContent"
  | "contentDetail"
  | "spaceSettings"
  | "longTasks"
  | "cqlSearch"
  | "contentBrowser"
  | "forYou"
  | "recent"
  | "starred"
  | "apps"
  | "shortcuts";

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

export default function DocfluenceApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI("docfluence");

  // ============ STATE PLACEHOLDERS ============
  // These are left empty intentionally - to be implemented with actual state management

  // View state
  const [currentView, setCurrentView] = useState<ViewType>("content");
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [parentContent, setParentContent] = useState<Content | null>(null);
  const [editorContentType, setEditorContentType] = useState<"page" | "blogpost">("page");
  const [spacesRefreshKey, setSpacesRefreshKey] = useState(0);
  const [contentRefreshKey, setContentRefreshKey] = useState(0);

  // Spaces data state
  const [spaces, setSpaces] = useState<Space[]>([]);

  // Modal states
  const [showCreateContentModal, setShowCreateContentModal] = useState(false);
  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Panel states
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [showAttachmentsPanel, setShowAttachmentsPanel] = useState(false);
  const [showLabelsPanel, setShowLabelsPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [showRestrictionsPanel, setShowRestrictionsPanel] = useState(false);
  const [showBodyConverter, setShowBodyConverter] = useState(false);

  // Data state for top-level panels
  const [mainAttachments, setMainAttachments] = useState<Attachment[]>([]);
  const [devControlsCollapsed, setDevControlsCollapsed] = useState(true);

  // Track recently viewed content IDs for the Recent view
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  // ============ API METHODS PLACEHOLDERS ============
  // These functions will call the backend API when implemented

  const loadSpaces = async () => {
    try {
      const result = await api.callTool<Space[]>("get_spaces", {
        start: 0,
        limit: 100,
      });
      setSpaces(result || []);
    } catch (err) {
      console.error("Failed to load spaces:", err);
    }
  };

  const loadData = async () => {
    await loadSpaces();
  };

  // Load spaces on mount and when spacesRefreshKey changes
  useEffect(() => {
    loadSpaces();
  }, [spacesRefreshKey]);

  // Register refresh handler
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(() => { loadData(); });
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null);
    };
  }, []);

  // ============ RENDER MAIN CONTENT ============

  const handleSelectSpace = (space: Space) => {
    setSelectedSpace(space);
    setCurrentView("spaceContent");
  };

  const handleSelectContent = (content: Content) => {
    setSelectedContent(content);
    setCurrentView("contentDetail");
    // Track recently viewed content
    setRecentlyViewedIds((prev) => [content.id, ...prev.filter((id) => id !== content.id)].slice(0, 50));
  };

  const handleSearchSelectContent = (content: Content) => {
    setSelectedContent(content);
    // Also set the space for proper navigation context
    const space = spaces.find((s) => s.spaceKey === content.spaceKey);
    if (space) {
      setSelectedSpace(space);
    }
    setCurrentView("contentDetail");
    // Track recently viewed content
    setRecentlyViewedIds((prev) => [content.id, ...prev.filter((id) => id !== content.id)].slice(0, 50));
  };

  const handleNavigateBack = () => {
    if (selectedSpace) {
      setCurrentView("spaceContent");
    } else {
      setCurrentView("content");
    }
  };

  const handleEditContent = (content: Content) => {
    setEditingContent(content);
    setParentContent(null);
    setEditorContentType(content.type === "blogpost" ? "blogpost" : "page");
    setCurrentView("editor");
  };

  const handleCreateContent = (parent?: Content, type?: "page" | "blogpost") => {
    setEditingContent(null);
    setParentContent(parent || null);
    setEditorContentType(type || "page");
    setCurrentView("editor");
  };

  const renderMainContent = () => {
    switch (currentView) {
      case "editor":
        return (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            data-testid="editor-view"
          >
            <EditorView
              initialContent={editingContent}
              parentContent={parentContent}
              selectedSpace={selectedSpace}
              contentType={editorContentType}
              onClose={() => {
                setEditingContent(null);
                setParentContent(null);
                handleNavigateBack();
              }}
              onSuccess={(content) => {
                setEditingContent(null);
                setParentContent(null);
                setSelectedContent(content);
                setCurrentView("contentDetail");
                // Refresh content list in sidebar
                setContentRefreshKey((prev: number) => prev + 1);
              }}
            />
          </div>
        );
      case "spaces":
        return (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            data-testid="spaces-view"
          >
            <SpaceBrowser
              onSelectSpace={handleSelectSpace}
              onCreateSpace={() => setShowCreateSpaceModal(true)}
              refreshKey={spacesRefreshKey}
            />
          </div>
        );
      case "allContent":
        return (
          <GlobalContentView
            onSelectContent={handleSearchSelectContent}
          />
        );
      case "spaceContent":
        return (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            data-testid="space-content-view"
          >
            <SpaceContentView
              space={selectedSpace}
              onSelectContent={handleSelectContent}
              onDelete={() => {
                // After deletion, navigate to spaces list and refresh
                setSelectedSpace(null);
                setCurrentView("spaces");
                setSpacesRefreshKey((prev: number) => prev + 1);
              }}
              onOpenSettings={() => setCurrentView("spaceSettings")}
              onEditSpace={() => setCurrentView("spaceSettings")}
              onCreateBlogPost={() => {
                handleCreateContent(undefined, "blogpost");
              }}
              onCreatePage={() => {
                handleCreateContent(undefined, "page");
              }}
            />
          </div>
        );
      case "contentDetail":
        return selectedContent ? (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            data-testid="content-detail-view"
          >
            <ContentView
              content={selectedContent}
              onNavigateBack={handleNavigateBack}
              onEdit={() => handleEditContent(selectedContent)}
              onDelete={() => {
                // After deletion, navigate back and refresh content
                setSelectedContent(null);
                handleNavigateBack();
                setContentRefreshKey((prev: number) => prev + 1);
              }}
              onPublish={() => {
                // After publishing, refresh content to show updated status
                setContentRefreshKey((prev: number) => prev + 1);
                // Re-fetch the content to update the view
                setSelectedContent({ ...selectedContent, status: "current" });
              }}
              onSelectContent={(descendant) => {
                // Navigate to the selected descendant
                setSelectedContent(descendant);
              }}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <p className="text-gray-500">No content selected</p>
          </div>
        );
      case "spaceSettings":
        return selectedSpace ? (
          <SpaceSettingsView
            space={selectedSpace}
            onBack={() => setCurrentView("spaceContent")}
            onSpaceUpdated={(updatedSpace) => {
              setSelectedSpace(updatedSpace);
              setSpacesRefreshKey((prev: number) => prev + 1);
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <p className="text-gray-500">No space selected</p>
          </div>
        );
      case "longTasks":
        return <LongTasksView />;
      case "cqlSearch":
        return <CqlSearchView onSelectContent={handleSearchSelectContent} />;
      case "contentBrowser":
        return <ContentBrowserView onSelectContent={handleSearchSelectContent} />;
      case "forYou":
        return <ForYouView onSelectContent={handleSearchSelectContent} />;
      case "recent":
        return <RecentView onSelectContent={handleSearchSelectContent} recentlyViewedIds={recentlyViewedIds} />;
      case "starred":
        return <StarredView onSelectContent={handleSearchSelectContent} />;
      case "apps":
        return (
          <div className="flex-1 overflow-y-auto bg-white p-8" data-testid="apps-view">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Apps</h1>
            <p className="text-gray-600 mb-6">Manage and discover apps for your {APP_NAME} instance.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">📊</div>
                <h3 className="font-medium text-gray-900">Analytics</h3>
                <p className="text-sm text-gray-500">Track page views and engagement</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">📅</div>
                <h3 className="font-medium text-gray-900">Team Calendars</h3>
                <p className="text-sm text-gray-500">Shared team scheduling</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">🔧</div>
                <h3 className="font-medium text-gray-900">Macros</h3>
                <p className="text-sm text-gray-500">Extend page functionality</p>
              </div>
            </div>
          </div>
        );
      case "shortcuts":
        return (
          <div className="flex-1 overflow-y-auto bg-white p-8" data-testid="shortcuts-view">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Shortcuts</h1>
            <p className="text-gray-600 mb-6">Quick links to your most used pages and spaces.</p>
            <div className="text-sm text-gray-500">No shortcuts configured yet. Star pages or spaces to add them as shortcuts.</div>
          </div>
        );
      case "content":
      default:
        return (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <Icons.Document />
              <h2 className="text-xl font-semibold text-gray-900 mt-4 mb-2">
                Welcome to {APP_NAME}
              </h2>
              <p className="text-gray-600 mb-4">
                Select a space or content to get started
              </p>
            </div>
          </div>
        );
    }
  };

  // Determine which panel to show (only one at a time)
  const activePanel = showCommentsPanel
    ? "comments"
    : showAttachmentsPanel
    ? "attachments"
    : showLabelsPanel
    ? "labels"
    : showHistoryPanel
    ? "history"
    : showPropertiesPanel
    ? "properties"
    : showRestrictionsPanel
    ? "restrictions"
    : showBodyConverter
    ? "bodyConverter"
    : null;

  return (
    <div
      className="h-full flex flex-col bg-stone-50"
      data-testid="docfluence-app"
    >
      {/* Header */}
      <HeaderBar
        onCreateClick={() => handleCreateContent()}
        onCreateBlog={() => handleCreateContent(undefined, "blogpost")}
        onCreateSpace={() => setShowCreateSpaceModal(true)}
        onSelectContent={handleSearchSelectContent}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <Sidebar
            spaces={spaces}
            selectedSpace={selectedSpace}
            onSelectSpace={handleSelectSpace}
            onSelectContent={handleSelectContent}
            onCreateContent={handleCreateContent}
            onCreateSpace={() => setShowCreateSpaceModal(true)}
            onViewAllSpaces={() => setCurrentView("spaces")}
            onViewAllContent={() => setCurrentView("allContent")}
            contentRefreshKey={contentRefreshKey}
            onNavigate={(view) => setCurrentView(view)}
            activeNavItem={currentView}
          />
        )}

        {/* Main content area */}
        <main
          className="flex-1 flex flex-col overflow-hidden"
          data-testid="main-content"
        >
          {renderMainContent()}
        </main>

        {/* Side panels */}
        <CommentsPanel
          isOpen={activePanel === "comments"}
          onClose={() => setShowCommentsPanel(false)}
          contentId={selectedContent?.id}
          spaceKey={selectedContent?.spaceKey}
        />
        <AttachmentsPanel
          isOpen={activePanel === "attachments"}
          onClose={() => setShowAttachmentsPanel(false)}
          contentId={selectedContent?.id || ""}
          attachments={mainAttachments}
          onAttachmentsChange={setMainAttachments}
          api={api}
        />
        <LabelsPanel
          isOpen={activePanel === "labels"}
          onClose={() => setShowLabelsPanel(false)}
          contentId={selectedContent?.id}
        />
        <HistoryPanel
          isOpen={activePanel === "history"}
          onClose={() => setShowHistoryPanel(false)}
          contentId={selectedContent?.id}
          currentVersion={selectedContent?.version?.number}
        />
        <PropertiesPanel
          isOpen={activePanel === "properties"}
          onClose={() => setShowPropertiesPanel(false)}
          contentId={selectedContent?.id}
        />
        <RestrictionsPanel
          isOpen={activePanel === "restrictions"}
          onClose={() => setShowRestrictionsPanel(false)}
          contentId={selectedContent?.id}
        />
        <ContentBodyConverter
          isOpen={activePanel === "bodyConverter"}
          onClose={() => setShowBodyConverter(false)}
        />
      </div>

      {/* Modals */}
      <CreateContentModal
        isOpen={showCreateContentModal}
        onClose={() => setShowCreateContentModal(false)}
        spaces={spaces}
        onCreateContent={(space, contentType) => {
          setSelectedSpace(space);
          setEditingContent(null);
          setParentContent(null);
          setCurrentView("editor");
        }}
      />
      <CreateSpaceModal
        isOpen={showCreateSpaceModal}
        onClose={() => setShowCreateSpaceModal(false)}
        onSpaceCreated={() => {
          // Navigate to spaces view and trigger refresh to see the newly created space
          setCurrentView("spaces");
          setSpacesRefreshKey((prev: number) => prev + 1);
        }}
      />
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectContent={(content) => {
          // Navigate to content detail view
          setSelectedContent(content);
          // Find and set the space for this content
          const space = spaces.find((s) => s.spaceKey === content.spaceKey);
          if (space) {
            setSelectedSpace(space);
          }
          setCurrentView("contentDetail");
        }}
      />

      {/* 
        ========================================================================
        DEVELOPMENT TOOLBAR - Remove in production
        This toolbar helps test different views and panels during development
        ========================================================================
      */}
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-40 max-w-xs">
        <button
          onClick={() => setDevControlsCollapsed(!devControlsCollapsed)}
          className="text-xs text-gray-500 mb-1 font-medium flex items-center gap-1 hover:text-gray-700 w-full"
        >
          Dev Controls {devControlsCollapsed ? "+" : "-"}
        </button>
        {!devControlsCollapsed && <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentView("content")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "content"
                ? "bg-amber-100 text-orange-600"
                : "bg-gray-100 text-black"
            }`}
          >
            Content
          </button>
          <button
            onClick={() => setCurrentView("editor")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "editor"
                ? "bg-amber-100 text-orange-600"
                : "bg-gray-100 text-black"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setCurrentView("spaces")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "spaces"
                ? "bg-amber-100 text-orange-600"
                : "bg-gray-100 text-black"
            }`}
            data-testid="quick-nav-spaces-button"
          >
            Spaces
          </button>
          <button
            onClick={() => setCurrentView("allContent")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "allContent"
                ? "bg-amber-100 text-orange-600"
                : "bg-gray-100 text-black"
            }`}
          >
            All Content
          </button>
          <button
            onClick={() => setShowSearchModal(true)}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-black"
          >
            Search
          </button>
          <button
            onClick={() => setShowCreateContentModal(true)}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-black"
          >
            + Content
          </button>
          <button
            onClick={() => setShowCommentsPanel(!showCommentsPanel)}
            className={`px-2 py-1 text-xs rounded ${
              showCommentsPanel ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setShowLabelsPanel(!showLabelsPanel)}
            className={`px-2 py-1 text-xs rounded ${
              showLabelsPanel ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Labels
          </button>
          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className={`px-2 py-1 text-xs rounded ${
              showHistoryPanel ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
            data-testid="toggle-history-panel"
          >
            History
          </button>
          <button
            onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
            className={`px-2 py-1 text-xs rounded ${
              showPropertiesPanel ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setShowRestrictionsPanel(!showRestrictionsPanel)}
            className={`px-2 py-1 text-xs rounded ${
              showRestrictionsPanel ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Restrictions
          </button>
          <button
            onClick={() => setShowBodyConverter(!showBodyConverter)}
            className={`px-2 py-1 text-xs rounded ${
              showBodyConverter ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Converter
          </button>
          <button
            onClick={() => setCurrentView("cqlSearch")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "cqlSearch" ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            CQL Search
          </button>
          <button
            onClick={() => setCurrentView("contentBrowser")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "contentBrowser" ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setCurrentView("longTasks")}
            className={`px-2 py-1 text-xs rounded ${
              currentView === "longTasks" ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
            }`}
          >
            Tasks
          </button>
          {selectedSpace && (
            <button
              onClick={() => setCurrentView("spaceSettings")}
              className={`px-2 py-1 text-xs rounded ${
                currentView === "spaceSettings" ? "bg-amber-100 text-orange-600" : "bg-gray-100 text-black"
              }`}
            >
              Space Settings
            </button>
          )}
        </div>}
      </div>
    </div>
  );
}
