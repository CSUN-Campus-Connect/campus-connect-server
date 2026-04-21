import { Server as SocketIOServer, Socket } from "socket.io";
import logger from "@/utils/logger";
import * as service from "./announcement.service";
import { SOCKET_EVENTS } from "./announcement.types";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

// Wire announcement events onto a connected socket.
// Called from socket.ts inside the io.on("connection") handler.
export const setupAnnouncementSocket = async (
  io: SocketIOServer,
  socket: AuthenticatedSocket,
) => {
  const userId = socket.userId!;

  // Sync: client requests the currently active banner (e.g. after reconnecting)
  socket.on(SOCKET_EVENTS.ANNOUNCEMENT_SYNC, async () => {
    try {
      const active = await service.getActiveCriticalAnnouncement(userId);
      socket.emit(SOCKET_EVENTS.ANNOUNCEMENT_SYNC, { active });
    } catch (error) {
      logger.error({ userId, error }, "announcement:sync failed");
    }
  });

  // Dismiss: user clicks X on the banner
  socket.on(SOCKET_EVENTS.ANNOUNCEMENT_DISMISS, async (data: { announcementId: string }) => {
    try {
      if (!data?.announcementId) return;
      await service.dismissBanner(userId, data.announcementId);
    } catch (error) {
      logger.error({ userId, error }, "announcement:dismiss failed");
    }
  });

  // On connect, push the currently active banner (if any) so late-joiners see it
  try {
    const active = await service.getActiveCriticalAnnouncement(userId);
    if (active && !active.dismissedForUser) {
      socket.emit(SOCKET_EVENTS.ANNOUNCEMENT_CREATED, active);
    }
  } catch (error) {
    logger.error({ userId, error }, "failed to send initial announcement state");
  }
};