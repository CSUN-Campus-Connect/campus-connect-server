import { Request, Response } from "express";
import { EventWebhook } from "@sendgrid/eventwebhook";
import prisma from "@/utils/prisma";
import logger from "@/utils/logger";

const PUBLIC_KEY = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;

interface SendGridEvent {
  email: string;
  event: string;           // "delivered", "bounce", "dropped", "deferred", "processed", etc.
  sg_message_id?: string;
  timestamp?: number;
  reason?: string;
  response?: string;
  delivery_row_id?: string; // custom arg set when we sent
  announcement_id?: string;
}

// SendGrid sends a POST with an array of events. Body arrives as raw JSON
// because we need the raw bytes to verify the ECDSA signature.
export const sendgridWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify signature if public key is configured
    if (PUBLIC_KEY) {
      const signature = req.headers["x-twilio-email-event-webhook-signature"] as string;
      const timestamp = req.headers["x-twilio-email-event-webhook-timestamp"] as string;
      const rawBody = (req as any).rawBody?.toString() ?? JSON.stringify(req.body);

      const ew = new EventWebhook();
      const ecdsaPublicKey = ew.convertPublicKeyToECDSA(PUBLIC_KEY);
      const verified = ew.verifySignature(ecdsaPublicKey, rawBody, signature, timestamp);

      if (!verified) {
        logger.warn("SendGrid webhook signature verification failed");
        res.status(401).json({ error: "invalid_signature" });
        return;
      }
    } else {
      logger.warn("SENDGRID_WEBHOOK_PUBLIC_KEY not set — skipping signature verification");
    }

    const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      await processEvent(event);
    }

    res.status(200).json({ received: events.length });
  } catch (err) {
    logger.error({ err }, "SendGrid webhook processing failed");
    res.status(500).json({ error: "internal" });
  }
};

const processEvent = async (event: SendGridEvent): Promise<void> => {
  const deliveryId = event.delivery_row_id;
  if (!deliveryId) return; // unrelated event

  const status = mapSendGridEventToStatus(event.event);
  if (!status) return; // event we don't care about

  const data: any = { status };
  if (status === "DELIVERED") {
    data.deliveredAt = new Date((event.timestamp ?? Date.now() / 1000) * 1000);
    data.finalizedAt = new Date();
  } else if (status === "PERMANENT_FAIL") {
    data.failReason = event.reason ?? event.response ?? event.event;
    data.finalizedAt = new Date();
  }

  try {
    await prisma.announcementDelivery.update({
      where: { id: deliveryId },
      data,
    });
  } catch (err) {
    // Delivery row may have been deleted or already finalized — log and move on
    logger.debug({ deliveryId, err }, "SendGrid event update skipped");
  }
};

const mapSendGridEventToStatus = (event: string): "DELIVERED" | "PERMANENT_FAIL" | null => {
  switch (event) {
    case "delivered": return "DELIVERED";
    case "bounce":
    case "dropped":
    case "blocked": return "PERMANENT_FAIL";
    // "processed", "deferred", "open", "click" — not terminal, ignore
    default: return null;
  }
};