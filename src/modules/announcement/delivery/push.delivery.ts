import logger from "@/utils/logger";
import { Announcement } from "@prisma/client";

// Uses Expo's HTTP push API directly — no SDK needed
// https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN;

interface SendPushInput {
  pushToken: string;
  announcement: Announcement;
  deliveryRowId: string;
}

export const sendPush = async (input: SendPushInput): Promise<string> => {
  const message = {
    to: input.pushToken,
    title: formatTitle(input.announcement),
    body: input.announcement.body,
    sound: "default",
    priority: "high" as const,
    channelId: "emergency-alerts",
    data: {
      announcementId: input.announcement.id,
      deliveryRowId: input.deliveryRowId,
      severity: input.announcement.severity,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  if (EXPO_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([message]),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push HTTP ${res.status}: ${text}`);
  }

  const result = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> };
  const ticket = result.data?.[0];

  if (!ticket) {
    throw new Error("Expo push response missing ticket");
  }

  if (ticket.status === "error") {
    const errCode = ticket.details?.error;
    // Device is no longer registered — clear the stale token so we stop retrying
    if (errCode === "DeviceNotRegistered") {
      await clearStaleToken(input.pushToken);
    }
    throw new Error(`Expo push error: ${ticket.message ?? errCode ?? "unknown"}`);
  }

  return ticket.id ?? "";
};

// If the device uninstalled the app, clear the token from all users that had it
const clearStaleToken = async (token: string) => {
  try {
    const prisma = (await import("@/utils/prisma")).default;
    await prisma.user.updateMany({
      where: { expoPushToken: token },
      data: { expoPushToken: null, expoPushTokenUpdatedAt: new Date() },
    });
    logger.info({ token: token.slice(0, 12) + "..." }, "Cleared stale push token");
  } catch (err) {
    logger.error({ err }, "Failed to clear stale push token");
  }
};

const formatTitle = (a: Announcement): string => {
  switch (a.severity) {
    case "CRITICAL_RED": return "🚨 CSUN Critical Alert";
    case "CRITICAL_BLUE": return "ℹ️ CSUN Alert Update";
    case "ALL_CLEAR_GREEN": return "✅ CSUN All Clear";
    default: return "CSUN Alert";
  }
};