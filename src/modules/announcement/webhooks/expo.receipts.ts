import prisma from "@/utils/prisma";
import logger from "@/utils/logger";

// Expo doesn't have push webhooks — you poll for receipts instead.
// This runs from the worker's maintenance tick.
// https://docs.expo.dev/push-notifications/sending-notifications/#push-receipts
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN;
const BATCH_SIZE = 100; // Expo accepts up to 1000 but keep it small to reduce blast radius

export const pollExpoReceipts = async (): Promise<void> => {
  // Find sent push deliveries that haven't been confirmed yet
  const unconfirmed = await prisma.announcementDelivery.findMany({
    where: {
      channel: "PUSH",
      status: "SENT",
      providerMessageId: { not: null },
      providerReceiptId: null,
    },
    take: BATCH_SIZE,
    orderBy: { sentAt: "asc" },
  });

  if (unconfirmed.length === 0) return;

  const receiptIds = unconfirmed.map((d) => d.providerMessageId!).filter(Boolean);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (EXPO_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }

  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: receiptIds }),
  });

  if (!res.ok) {
    logger.error({ status: res.status }, "Expo receipts API request failed");
    return;
  }

  const result = (await res.json()) as { data?: Record<string, { status: string; message?: string; details?: { error?: string } }> };
  const receipts = result.data ?? {};

  for (const delivery of unconfirmed) {
    const receipt = receipts[delivery.providerMessageId!];
    if (!receipt) continue; // receipt not ready yet — next tick

    if (receipt.status === "ok") {
      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          providerReceiptId: delivery.providerMessageId,
          deliveredAt: new Date(),
          finalizedAt: new Date(),
        },
      });
    } else if (receipt.status === "error") {
      const errCode = receipt.details?.error;
      const isStaleToken = errCode === "DeviceNotRegistered";

      await prisma.announcementDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "PERMANENT_FAIL",
          failReason: receipt.message ?? errCode ?? "unknown",
          finalizedAt: new Date(),
        },
      });

      // Clear stale token so future sends don't waste attempts
      if (isStaleToken) {
        await prisma.user.updateMany({
          where: { id: delivery.userId },
          data: { expoPushToken: null, expoPushTokenUpdatedAt: new Date() },
        });
      }
    }
  }
};