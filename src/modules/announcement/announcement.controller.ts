import { Request, Response } from "express";
import { Server as SocketIOServer } from "socket.io";
import logger from "@/utils/logger";
import * as service from "./announcement.service";
import {
  AnnouncementNotFoundError,
  ActiveAnnouncementExistsError,
  ConfirmationError,
  InvalidTransitionError,
  RateLimitError,
  UnauthorizedError,
  SOCKET_EVENTS,
} from "./announcement.types";
import { enqueueDeliveriesForAnnouncement } from "./announcement.service";

// Socket.io handle, set once at startup
let io: SocketIOServer | null = null;
export const setIo = (ioInstance: SocketIOServer) => {
  io = ioInstance;
};

const broadcastToAll = (event: string, payload: unknown) => {
  if (!io) {
    logger.warn({ event }, "Cannot broadcast: socket.io not initialized");
    return;
  }
  io.emit(event, payload);
};

// Turn custom errors into HTTP responses
const mapErrorToStatus = (err: unknown): { status: number; body: Record<string, unknown> } => {
  if (err instanceof AnnouncementNotFoundError) {
    return { status: 404, body: { error: "not_found", message: err.message } };
  }
  if (err instanceof UnauthorizedError) {
    return { status: 403, body: { error: "unauthorized", message: err.message } };
  }
  if (err instanceof ActiveAnnouncementExistsError) {
    return { status: 409, body: { error: "active_exists", message: err.message } };
  }
  if (err instanceof ConfirmationError) {
    return { status: 400, body: { error: "confirmation", message: err.message } };
  }
  if (err instanceof InvalidTransitionError) {
    return { status: 400, body: { error: "invalid_transition", message: err.message } };
  }
  if (err instanceof RateLimitError) {
    return { status: 429, body: { error: "rate_limit", message: err.message } };
  }
  logger.error({ err }, "Unhandled announcement error");
  return { status: 500, body: { error: "internal", message: "Internal server error" } };
};

export const getActive = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const active = await service.getActiveCriticalAnnouncement(userId);
    res.json({ active });
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const dismiss = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    await service.dismissBanner(userId, id);
    res.json({ success: true });
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const list = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter = (req.query.filter as "active" | "history" | "all") ?? "all";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await service.listAnnouncements(filter, page, limit);
    res.json({
      announcements: data.rows,
      pagination: { page, limit, total: data.total, pages: data.pages },
    });
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const detail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const data = await service.getAnnouncementDetail(id);
    res.json(data);
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const timeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const data = await service.getAnnouncementTimeline(id);
    res.json({ timeline: data });
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const stats = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const data = await service.getDeliveryStats(id);
    res.json({ stats: data });
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const createCritical = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = { id: req.user!.id, email: req.user!.email };
    const announcement = await service.createCriticalAnnouncement(actor, {
      title: req.body.title,
      body: req.body.body,
      location: req.body.location ?? null,
      channels: req.body.channels ?? ["BANNER"],
      severity: "CRITICAL_RED",
      testMode: !!req.body.testMode,
      confirmation: req.body.confirmation,
    });

    // Blast the banner to all connected sockets, then mark the broadcast timestamp
    broadcastToAll(SOCKET_EVENTS.ANNOUNCEMENT_CREATED, announcement);
    service.markBannerBroadcast(announcement.id).catch((e) =>
      logger.error({ e, announcementId: announcement.id }, "markBannerBroadcast failed"),
    );

    // Fire off delivery enqueue in the background so this response stays fast
    enqueueDeliveriesForAnnouncement(announcement.id).catch((e) =>
      logger.error({ e, announcementId: announcement.id }, "enqueueDeliveries failed"),
    );

    res.status(201).json(announcement);
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};

export const transition = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = { id: req.user!.id, email: req.user!.email };
    const id = req.params.id as string;
    const next = await service.transitionAnnouncement(actor, id, {
      targetSeverity: req.body.targetSeverity,
      title: req.body.title,
      body: req.body.body,
      channels: req.body.channels ?? ["BANNER"],
      expiresInMinutes: req.body.expiresInMinutes ?? null,
    });

    broadcastToAll(SOCKET_EVENTS.ANNOUNCEMENT_TRANSITIONED, next);
    service.markBannerBroadcast(next.id).catch((e) =>
      logger.error({ e, announcementId: next.id }, "markBannerBroadcast failed"),
    );
    enqueueDeliveriesForAnnouncement(next.id).catch((e) =>
      logger.error({ e, announcementId: next.id }, "enqueueDeliveries failed"),
    );

    res.json(next);
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};
export const end = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = { id: req.user!.id, email: req.user!.email };
    const id = req.params.id as string;
    const ended = await service.endAnnouncement(actor, id, {
      reason: req.body.reason,
    });
    broadcastToAll(SOCKET_EVENTS.ANNOUNCEMENT_ENDED, { id: ended.id });
    res.json(ended);
  } catch (err) {
    const { status, body } = mapErrorToStatus(err);
    res.status(status).json(body);
  }
};