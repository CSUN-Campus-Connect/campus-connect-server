import prisma from "@/utils/prisma";
import logger from "@/utils/logger";
import {
  AnnouncementChannel,
  AnnouncementDeliveryStatus,
  AnnouncementSeverity,
} from "@prisma/client";
import {
  CreateCriticalInput,
  TransitionInput,
  EndAnnouncementInput,
  RATE_LIMITS,
  CRITICAL_CONFIRMATION_PHRASE,
  CRITICAL_SEND_WHITELIST_EMAILS,
  isCriticalSendAuthorized,
  RateLimitError,
  ConfirmationError,
  ActiveAnnouncementExistsError,
  AnnouncementNotFoundError,
  InvalidTransitionError,
  UnauthorizedError,
} from "./announcement.types";

// Fetch the currently active critical alert (if any)
export const getActiveCriticalAnnouncement = async (userId?: string) => {
  const active = await prisma.announcement.findFirst({
    where: {
      isActive: true,
      severity: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!active) return null;

  // Hide if GREEN already expired
  if (active.expiresAt && active.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Respect per-user dismissal
  if (userId) {
    const dismissed = await prisma.announcementDismissal.findUnique({
      where: { announcementId_userId: { announcementId: active.id, userId } },
    });
    if (dismissed) {
      return { ...active, dismissedForUser: true };
    }
  }

  return { ...active, dismissedForUser: false };
};

export const listAnnouncements = async (
  filter: "active" | "history" | "all",
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  const where =
    filter === "active"
      ? { isActive: true }
      : filter === "history"
        ? { isActive: false }
        : {};

  const [rows, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.announcement.count({ where }),
  ]);

  return { rows, total, pages: Math.ceil(total / limit) };
};

export const getAnnouncementDetail = async (id: string) => {
  const a = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
      endedBy: { select: { id: true, firstName: true, lastName: true } },
      parentAnnouncement: { select: { id: true, severity: true, createdAt: true } },
      childAnnouncements: {
        select: { id: true, severity: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!a) throw new AnnouncementNotFoundError(id);
  return a;
};

// Walk the parent chain up to the root, return oldest -> newest
export const getAnnouncementTimeline = async (id: string) => {
  const chain: any[] = [];
  let current = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, severity: true, title: true, createdAt: true, parentAnnouncementId: true, endedAt: true },
  });
  while (current) {
    chain.unshift(current);
    if (!current.parentAnnouncementId) break;
    current = await prisma.announcement.findUnique({
      where: { id: current.parentAnnouncementId },
      select: { id: true, severity: true, title: true, createdAt: true, parentAnnouncementId: true, endedAt: true },
    });
  }
  return chain;
};

export const getDeliveryStats = async (announcementId: string) => {
  const rows = await prisma.announcementDelivery.groupBy({
    by: ["channel", "status"],
    where: { announcementId },
    _count: true,
  });

  const stats: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    stats[r.channel] = stats[r.channel] || {};
    stats[r.channel][r.status] = r._count;
  }
  return stats;
};

// Create a new CRITICAL_RED alert
export const createCriticalAnnouncement = async (
  actor: { id: string; email: string },
  input: CreateCriticalInput & { overrideRateLimit?: boolean },
) => {
  if (!isCriticalSendAuthorized(actor.email)) {
    throw new UnauthorizedError();
  }

  if (input.confirmation !== CRITICAL_CONFIRMATION_PHRASE) {
    throw new ConfirmationError();
  }

  if (input.severity !== "CRITICAL_RED") {
    throw new InvalidTransitionError("<none>", input.severity);
  }

  if (!input.overrideRateLimit) {
    await assertRateLimits(actor.id);
  }

  // Only one active critical allowed at a time
  const existing = await prisma.announcement.findFirst({
    where: { isActive: true, severity: { not: null } },
    select: { id: true },
  });
  if (existing) throw new ActiveAnnouncementExistsError();

  // Create announcement + audit log in one transaction
  const created = await prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        type: "CRITICAL",
        severity: "CRITICAL_RED",
        channels: input.channels,
        location: input.location ?? null,
        testMode: input.testMode,
        authorId: actor.id,
        audience: "ALL",
        startsAt: new Date(),
        isActive: true,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: "announcement.critical.create",
        target: `announcement:${announcement.id}`,
        metadata: {
          title: input.title,
          channels: input.channels,
          testMode: input.testMode,
        },
      },
    });

    return announcement;
  });

  return created;
};

// Move the active alert to the next severity (RED -> BLUE, BLUE -> GREEN)
export const transitionAnnouncement = async (
  actor: { id: string; email: string },
  currentId: string,
  input: TransitionInput,
) => {
  if (!isCriticalSendAuthorized(actor.email)) {
    throw new UnauthorizedError();
  }

  const current = await prisma.announcement.findUnique({ where: { id: currentId } });
  if (!current) throw new AnnouncementNotFoundError(currentId);
  if (!current.severity || !current.isActive) {
    throw new InvalidTransitionError("inactive/non-critical", input.targetSeverity);
  }

  // Enforce the state machine
  const validTransitions: Record<AnnouncementSeverity, AnnouncementSeverity[]> = {
    CRITICAL_RED: ["CRITICAL_BLUE"],
    CRITICAL_BLUE: ["ALL_CLEAR_GREEN"],
    ALL_CLEAR_GREEN: [],
  };
  if (!validTransitions[current.severity].includes(input.targetSeverity)) {
    throw new InvalidTransitionError(current.severity, input.targetSeverity);
  }

  const expiresAt =
    input.targetSeverity === "ALL_CLEAR_GREEN" && input.expiresInMinutes
      ? new Date(Date.now() + input.expiresInMinutes * 60 * 1000)
      : null;

  const result = await prisma.$transaction(async (tx) => {
    // End the current one
    await tx.announcement.update({
      where: { id: currentId },
      data: { isActive: false, endedAt: new Date(), endedById: actor.id },
    });

    // Create the next one, linked to this one
    const next = await tx.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        type: "CRITICAL",
        severity: input.targetSeverity,
        channels: input.channels,
        testMode: current.testMode, // inherit test mode from parent
        location: current.location,
        authorId: actor.id,
        audience: "ALL",
        startsAt: new Date(),
        isActive: true,
        parentAnnouncementId: currentId,
        expiresAt,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: "announcement.critical.transition",
        target: `announcement:${next.id}`,
        metadata: {
          from: current.severity,
          to: input.targetSeverity,
          parent: currentId,
        },
      },
    });

    return next;
  });

  return result;
};

// End an active alert (admin chose to stop it entirely)
export const endAnnouncement = async (
  actor: { id: string; email: string },
  id: string,
  input: EndAnnouncementInput,
) => {
  if (!isCriticalSendAuthorized(actor.email)) {
    throw new UnauthorizedError();
  }

  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw new AnnouncementNotFoundError(id);
  if (!a.isActive) return a; // already ended, no-op

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.announcement.update({
      where: { id },
      data: {
        isActive: false,
        endedAt: new Date(),
        endedById: actor.id,
        endReason: input.reason ?? null,
      },
    });

    // Skip any pending deliveries for this announcement
    await tx.announcementDelivery.updateMany({
      where: {
        announcementId: id,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: AnnouncementDeliveryStatus.SKIPPED,
        failReason: "announcement ended before delivery",
        finalizedAt: new Date(),
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: "announcement.critical.end",
        target: `announcement:${id}`,
        metadata: { reason: input.reason ?? null },
      },
    });

    return result;
  });

  return updated;
};

// User dismisses the banner for themselves
export const dismissBanner = async (userId: string, announcementId: string) => {
  await prisma.announcementDismissal.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    update: {},
    create: { announcementId, userId },
  });
};

// Called by controller right after the socket broadcast
export const markBannerBroadcast = async (announcementId: string) => {
  await prisma.announcement.update({
    where: { id: announcementId },
    data: { bannerBroadcastAt: new Date() },
  });
};

// Create per-user delivery rows for non-banner channels (email/SMS/push)
// This runs in the background so the admin's send request returns fast.
export const enqueueDeliveriesForAnnouncement = async (announcementId: string) => {
  const a = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!a) return;

  const nonBannerChannels = a.channels.filter((c) => c !== "BANNER");
  if (nonBannerChannels.length === 0) return;

  // In test mode, only the whitelist gets delivered to
  const userFilter = a.testMode
    ? { email: { in: CRITICAL_SEND_WHITELIST_EMAILS as unknown as string[] } }
    : {};

  const PAGE_SIZE = 2000;
  let cursor: string | null = null;
  let total = 0;

  while (true) {
    const users: { id: string; email: string; phoneNumber: string | null; expoPushToken: string | null; emergencyAlertsOptIn: boolean }[] =
      await prisma.user.findMany({
        where: userFilter,
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          expoPushToken: true,
          emergencyAlertsOptIn: true,
        },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      });

    if (users.length === 0) break;

    const deliveriesToCreate: any[] = [];

    for (const u of users) {
      for (const channel of nonBannerChannels) {
        const eligible = isEligible(channel, u);
        if (!eligible.ok) {
          // Record a SKIPPED row so the admin can see why users weren't reached
          deliveriesToCreate.push({
            announcementId: a.id,
            userId: u.id,
            channel,
            status: AnnouncementDeliveryStatus.SKIPPED,
            failReason: eligible.reason,
            finalizedAt: new Date(),
          });
        } else {
          deliveriesToCreate.push({
            announcementId: a.id,
            userId: u.id,
            channel,
            status: AnnouncementDeliveryStatus.PENDING,
          });
        }
      }
    }

    // Insert in chunks so we don't blow up on huge audiences
    const CHUNK = 1000;
    for (let i = 0; i < deliveriesToCreate.length; i += CHUNK) {
      await prisma.announcementDelivery.createMany({
        data: deliveriesToCreate.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
    total += deliveriesToCreate.length;

    if (users.length < PAGE_SIZE) break;
    cursor = users[users.length - 1].id;
  }

  logger.info({ announcementId, total }, "Announcement deliveries enqueued");
};

const isEligible = (
  channel: AnnouncementChannel,
  user: { email: string; phoneNumber: string | null; expoPushToken: string | null; emergencyAlertsOptIn: boolean },
): { ok: boolean; reason?: string } => {
  if (channel === "EMAIL") return { ok: true };
  if (channel === "SMS") {
    if (!user.phoneNumber) return { ok: false, reason: "no phone number on file" };
    if (!user.emergencyAlertsOptIn) return { ok: false, reason: "opted out of SMS alerts" };
    return { ok: true };
  }
  if (channel === "PUSH") {
    if (!user.expoPushToken) return { ok: false, reason: "no push token registered" };
    return { ok: true };
  }
  return { ok: false, reason: "unknown channel" };
};

// If the server crashed between creating an announcement and enqueueing deliveries,
// this backfills them. Runs from the worker's maintenance tick.
export const recoverMissingEnqueues = async () => {
  const candidates = await prisma.announcement.findMany({
    where: { isActive: true, severity: { not: null } },
    select: { id: true, channels: true, createdAt: true },
  });

  for (const a of candidates) {
    const nonBanner = a.channels.filter((c) => c !== "BANNER");
    if (nonBanner.length === 0) continue;

    const existing = await prisma.announcementDelivery.count({ where: { announcementId: a.id } });
    // If 0 rows exist and it's more than 30s old, something went wrong during enqueue
    const ageMs = Date.now() - a.createdAt.getTime();
    if (existing === 0 && ageMs > 30 * 1000) {
      logger.warn({ announcementId: a.id }, "Backfilling missing delivery rows");
      await enqueueDeliveriesForAnnouncement(a.id);
    }
  }
};

// Auto-expire GREEN announcements past their expiresAt time
export const expireStaleGreenAnnouncements = async () => {
  const now = new Date();
  const updated = await prisma.announcement.updateMany({
    where: {
      isActive: true,
      severity: "ALL_CLEAR_GREEN",
      expiresAt: { lte: now },
    },
    data: {
      isActive: false,
      endedAt: now,
      endReason: "auto-expired",
    },
  });
  if (updated.count > 0) {
    logger.info({ count: updated.count }, "Expired GREEN announcements");
  }
  return updated.count;
};

async function assertRateLimits(actorId: string): Promise<void> {
  const perAdminCutoff = new Date(Date.now() - RATE_LIMITS.PER_ADMIN_WINDOW_MS);
  const globalCutoff = new Date(Date.now() - RATE_LIMITS.GLOBAL_WINDOW_MS);

  const [perAdminCount, globalCount] = await Promise.all([
    prisma.announcement.count({
      where: {
        authorId: actorId,
        severity: "CRITICAL_RED",
        createdAt: { gte: perAdminCutoff },
      },
    }),
    prisma.announcement.count({
      where: {
        severity: "CRITICAL_RED",
        createdAt: { gte: globalCutoff },
        testMode: false, // test sends don't count toward the global limit
      },
    }),
  ]);

  if (perAdminCount >= 1) {
    throw new RateLimitError(
      `You have sent a critical announcement in the last ${RATE_LIMITS.PER_ADMIN_WINDOW_MS / 60000} minutes`,
    );
  }
  if (globalCount >= RATE_LIMITS.GLOBAL_MAX_COUNT) {
    throw new RateLimitError(
      `Global rate limit reached (${RATE_LIMITS.GLOBAL_MAX_COUNT} per 24 hours)`,
    );
  }
}