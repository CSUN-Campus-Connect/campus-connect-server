import { AnnouncementChannel, AnnouncementSeverity } from "@prisma/client";

// Only these emails can send critical alerts.
// TODO: move to RBAC permission once role hierarchy lands.
export const CRITICAL_SEND_WHITELIST_EMAILS: ReadonlyArray<string> = [
  "ivan.juarez.531@my.csun.edu",
  "test@my.csun.edu",
] as const;

export const isCriticalSendAuthorized = (email: string): boolean => {
  return CRITICAL_SEND_WHITELIST_EMAILS.includes(email.toLowerCase());
};

// Rate limits for critical sends
export const RATE_LIMITS = {
  PER_ADMIN_WINDOW_MS: 15 * 60 * 1000,       // 1 per 15 min per admin
  GLOBAL_WINDOW_MS: 24 * 60 * 60 * 1000,     // 3 per 24 hours total
  GLOBAL_MAX_COUNT: 3,
} as const;

// Retry delays in ms. After the last one, mark PERMANENT_FAIL.
export const CRITICAL_RETRY_SCHEDULE_MS: ReadonlyArray<number> = [
  0,              // immediate
  30 * 1000,      // 30s
  2 * 60 * 1000,  // 2m
  10 * 60 * 1000, // 10m
  30 * 60 * 1000, // 30m
  60 * 60 * 1000, // 1h
];

export const MAX_ATTEMPTS = CRITICAL_RETRY_SCHEDULE_MS.length;

// Socket.io event names
export const SOCKET_EVENTS = {
  ANNOUNCEMENT_CREATED: "announcement:created",
  ANNOUNCEMENT_TRANSITIONED: "announcement:transitioned",
  ANNOUNCEMENT_ENDED: "announcement:ended",
  ANNOUNCEMENT_SYNC: "announcement:sync",
  ANNOUNCEMENT_DISMISS: "announcement:dismiss",
} as const;

// User must type this exact phrase to confirm a critical send
export const CRITICAL_CONFIRMATION_PHRASE = "SEND CRITICAL" as const;

// GREEN auto-expire options shown in the UI (minutes)
export const GREEN_DURATION_PRESETS_MIN = {
  ONE_HOUR: 60,
  FOUR_HOURS: 4 * 60,
  TWELVE_HOURS: 12 * 60,
  TWENTY_FOUR_HOURS: 24 * 60,
} as const;

// Input payloads
export interface CreateCriticalInput {
  title: string;
  body: string;
  location?: string | null;
  channels: AnnouncementChannel[];
  severity: AnnouncementSeverity;
  testMode: boolean;
  confirmation: string;
}

export interface TransitionInput {
  targetSeverity: AnnouncementSeverity;
  title: string;
  body: string;
  channels: AnnouncementChannel[];
  expiresInMinutes?: number | null;
}

export interface EndAnnouncementInput {
  reason?: string;
}

// Custom errors — controller maps each one to the right HTTP status
export class RateLimitError extends Error {
  constructor(message: string) { super(message); this.name = "RateLimitError"; }
}

export class ConfirmationError extends Error {
  constructor() { super("Confirmation phrase did not match"); this.name = "ConfirmationError"; }
}

export class ActiveAnnouncementExistsError extends Error {
  constructor() { super("An active critical announcement already exists"); this.name = "ActiveAnnouncementExistsError"; }
}

export class AnnouncementNotFoundError extends Error {
  constructor(id: string) { super(`Announcement not found: ${id}`); this.name = "AnnouncementNotFoundError"; }
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid severity transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class UnauthorizedError extends Error {
  constructor() { super("Not authorized for critical-send operations"); this.name = "UnauthorizedError"; }
}