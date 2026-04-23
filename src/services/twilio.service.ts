import twilio from "twilio";
import logger from "@/utils/logger";
import { Announcement } from "@prisma/client";

// SMS is feature-flagged — set TWILIO_ENABLED=true to turn on sending
const SMS_ENABLED = process.env.TWILIO_ENABLED === "true";
const MAX_MPS = parseInt(process.env.TWILIO_MAX_MPS ?? "5", 10); // messages per second cap

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;

let client: ReturnType<typeof twilio> | null = null;
if (SMS_ENABLED && accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else if (SMS_ENABLED) {
  logger.warn("TWILIO_ENABLED=true but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing");
}

// Simple token bucket for throttling
let lastSendMs = 0;
const minIntervalMs = 1000 / MAX_MPS;

interface SendSmsInput {
  to: string;
  announcement: Announcement;
  deliveryRowId: string;
}

export const sendSms = async (input: SendSmsInput): Promise<string> => {
  if (!SMS_ENABLED) {
    throw new Error("SMS sending is disabled (TWILIO_ENABLED=false)");
  }
  if (!client || !fromNumber) {
    throw new Error("Twilio client not configured");
  }

  // Throttle to stay under the MPS cap
  const now = Date.now();
  const wait = Math.max(0, lastSendMs + minIntervalMs - now);
  if (wait > 0) await sleep(wait);
  lastSendMs = Date.now();

  const body = buildSmsBody(input.announcement);

  const message = await client.messages.create({
    to: input.to,
    from: fromNumber,
    body,
    statusCallback: statusCallbackUrl
      ? `${statusCallbackUrl}?deliveryRowId=${input.deliveryRowId}`
      : undefined,
  });

  return message.sid;
};

const buildSmsBody = (a: Announcement): string => {
  const prefix =
    a.severity === "CRITICAL_RED" ? "CSUN ALERT: "
    : a.severity === "CRITICAL_BLUE" ? "CSUN UPDATE: "
    : a.severity === "ALL_CLEAR_GREEN" ? "CSUN ALL CLEAR: "
    : "CSUN: ";
  const locationSuffix = a.location ? ` at ${a.location}` : "";
  // Keep under 160 chars to stay within one SMS segment when possible
  const available = 160 - prefix.length - locationSuffix.length - 5; // - 5 for ellipsis buffer
  const content = a.body.length > available ? a.body.slice(0, available - 1) + "…" : a.body;
  return `${prefix}${content}${locationSuffix}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));