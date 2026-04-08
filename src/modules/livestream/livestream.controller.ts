import { Request, Response, NextFunction } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import * as livestreamService from "./livestream.service";

const webhookReceiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY || "",
  process.env.LIVEKIT_API_SECRET || ""
);

// POST /api/v1/livestreams - Start a livestream
export const startLivestreamHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const result = await livestreamService.startLivestream(userId, req.body);
    res.status(201).json({
      success: true,
      message: "Livestream started successfully",
      livestream: result,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/livestreams - Get all active livestreams
export const getActiveLivestreamsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const livestreams = await livestreamService.getActiveLivestreams();
    res.status(200).json({
      success: true,
      livestreams,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/livestreams/:id - Get single livestream
export const getLivestreamHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const livestreamId = req.params.id as string;
    const livestream = await livestreamService.getLivestreamById(livestreamId);
    res.status(200).json({
      success: true,
      livestream,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/livestreams/:id/join - Join as viewer
export const joinLivestreamHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const livestreamId = req.params.id as string;
    const result = await livestreamService.joinLivestream(livestreamId, userId);
    res.status(200).json({
      success: true,
      livestream: result,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/livestreams/:id/end - End a livestream
export const endLivestreamHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const livestreamId = req.params.id as string;
    const result = await livestreamService.endLivestream(livestreamId, userId);
    res.status(200).json({
      success: true,
      message: "Livestream ended",
      livestream: result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/livestreams/webhook - LiveKit webhook receiver
export const webhookHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const event = await webhookReceiver.receive(
      req.body,
      req.get("Authorization") || ""
    );
    await livestreamService.handleWebhookEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(400).json({ error: "Invalid webhook" });
  }
};