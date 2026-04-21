import prisma from "@/utils/prisma";
import logger from "@/utils/logger";
import {
  CRITICAL_RETRY_SCHEDULE_MS,
  MAX_ATTEMPTS,
} from "./announcement.types";
import { sendEmail } from "./delivery/email.delivery";
import { sendSms } from "./delivery/sms.delivery";
import { sendPush } from "./delivery/push.delivery";
import {
  recoverMissingEnqueues,
  expireStaleGreenAnnouncements,
} from "./announcement.service";
import { pollExpoReceipts } from "./webhooks/expo.receipts";

const POLL_INTERVAL_MS = 5000;       // check for pending deliveries every 5s
const MAINTENANCE_INTERVAL_MS = 60000; // background maintenance every 60s
const BATCH_SIZE = 50;               // process up to 50 deliveries per poll

let running = false;
let pollTimer: NodeJS.Timeout | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;

export const startDeliveryWorker = () => {
  if (running) {
    logger.warn("Delivery worker already running");
    return;
  }
  running = true;
  logger.info("Delivery worker started");

  // Kick off immediately, then poll on interval
  tick().catch((err) => logger.error({ err }, "initial tick failed"));
  pollTimer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, "poll tick failed"));
  }, POLL_INTERVAL_MS);

  maintenanceTimer = setInterval(() => {
    maintenanceTick().catch((err) =>
      logger.error({ err }, "maintenance tick failed"),
    );
  }, MAINTENANCE_INTERVAL_MS);
};

export const stopDeliveryWorker = () => {
  if (!running) return;
  running = false;
  if (pollTimer) clearInterval(pollTimer);
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  pollTimer = null;
  maintenanceTimer = null;
  logger.info("Delivery worker stopped");
};

// One polling tick: pick up pending deliveries and process them
const tick = async () => {
  const now = new Date();
  const pending = await prisma.announcementDelivery.findMany({
    where: {
      status: "PENDING",
      nextRetryAt: { lte: now },
    },
    include: {
      announcement: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          expoPushToken: true,
        },
      },
    },
    orderBy: { queuedAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return;

  logger.debug({ count: pending.length }, "processing pending deliveries");

  for (const delivery of pending) {
    // Skip if parent announcement is no longer active
    if (!delivery.announcement.isActive) {
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SKIPPED",
          failReason: "announcement no longer active",
          finalizedAt: new Date(),
        },
      });
      continue;
    }

    const nextAttempt = delivery.attempts + 1;

    try {
      let providerMessageId: string | null = null;

      if (delivery.channel === "EMAIL") {
        providerMessageId = await sendEmail({
          to: delivery.user.email,
          firstName: delivery.user.firstName,
          announcement: delivery.announcement,
          deliveryRowId: delivery.id,
        });
      } else if (delivery.channel === "SMS") {
        providerMessageId = await sendSms({
          to: delivery.user.phoneNumber!,
          announcement: delivery.announcement,
          deliveryRowId: delivery.id,
        });
      } else if (delivery.channel === "PUSH") {
        providerMessageId = await sendPush({
          pushToken: delivery.user.expoPushToken!,
          announcement: delivery.announcement,
          deliveryRowId: delivery.id,
        });
      }

      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          attempts: nextAttempt,
          lastAttemptAt: new Date(),
          sentAt: new Date(),
          providerMessageId,
        },
      });
    } catch (error: any) {
      const errMessage = error?.message ?? "unknown error";
      logger.error(
        { deliveryId: delivery.id, channel: delivery.channel, err: errMessage },
        "delivery attempt failed",
      );

      // Check if we're out of retries
      if (nextAttempt >= MAX_ATTEMPTS) {
        await prisma.announcementDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "PERMANENT_FAIL",
            attempts: nextAttempt,
            lastAttemptAt: new Date(),
            finalizedAt: new Date(),
            failReason: errMessage,
          },
        });
        continue;
      }

      // Schedule retry based on the backoff schedule
      const delayMs = CRITICAL_RETRY_SCHEDULE_MS[nextAttempt] ?? 60 * 60 * 1000;
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          attempts: nextAttempt,
          lastAttemptAt: new Date(),
          failReason: errMessage,
          nextRetryAt: new Date(Date.now() + delayMs),
          // Flip back to PENDING so the next tick picks it up
        },
      });

      // Make it pickable again by the next poll
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: { status: "PENDING" },
      });
    }
  }
};

// Runs less frequently — handles cleanup and long-running tasks
const maintenanceTick = async () => {
  try {
    await expireStaleGreenAnnouncements();
  } catch (err) {
    logger.error({ err }, "expireStaleGreenAnnouncements failed");
  }

  try {
    await recoverMissingEnqueues();
  } catch (err) {
    logger.error({ err }, "recoverMissingEnqueues failed");
  }

  try {
    await pollExpoReceipts();
  } catch (err) {
    logger.error({ err }, "pollExpoReceipts failed");
  }
};