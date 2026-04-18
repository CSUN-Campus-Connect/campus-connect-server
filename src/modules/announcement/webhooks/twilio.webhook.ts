import { Request, Response } from "express";
import twilio from "twilio";
import prisma from "@/utils/prisma";
import logger from "@/utils/logger";

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Twilio status callback — sent as application/x-www-form-urlencoded
// We enabled this when sending the SMS via statusCallback param
export const twilioWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify the request actually came from Twilio
    if (AUTH_TOKEN) {
      const signature = req.headers["x-twilio-signature"] as string;
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const valid = twilio.validateRequest(AUTH_TOKEN, signature, url, req.body);
      if (!valid) {
        logger.warn("Twilio webhook signature verification failed");
        res.status(401).send("invalid_signature");
        return;
      }
    } else {
      logger.warn("TWILIO_AUTH_TOKEN not set — skipping signature verification");
    }

    // Delivery row ID passed via query string on the status callback URL
    const deliveryRowId = req.query.deliveryRowId as string | undefined;
    const messageStatus = req.body.MessageStatus as string | undefined;
    const errorCode = req.body.ErrorCode as string | undefined;

    if (!deliveryRowId || !messageStatus) {
      res.status(200).send("ok"); // still 200 so Twilio doesn't retry
      return;
    }

    const status = mapTwilioStatusToInternal(messageStatus);
    if (!status) {
      res.status(200).send("ok");
      return;
    }

    const data: any = { status };
    if (status === "DELIVERED") {
      data.deliveredAt = new Date();
      data.finalizedAt = new Date();
    } else if (status === "PERMANENT_FAIL") {
      data.failReason = errorCode ? `twilio error ${errorCode}` : messageStatus;
      data.finalizedAt = new Date();
    }

    try {
      await prisma.announcementDelivery.update({
        where: { id: deliveryRowId },
        data,
      });
    } catch (err) {
      logger.debug({ deliveryRowId, err }, "Twilio event update skipped");
    }

    res.status(200).send("ok");
  } catch (err) {
    logger.error({ err }, "Twilio webhook processing failed");
    res.status(500).send("internal");
  }
};

const mapTwilioStatusToInternal = (status: string): "DELIVERED" | "PERMANENT_FAIL" | null => {
  switch (status) {
    case "delivered": return "DELIVERED";
    case "undelivered":
    case "failed": return "PERMANENT_FAIL";
    // "queued", "sending", "sent" — not terminal
    default: return null;
  }
};