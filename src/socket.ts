import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import authConfig from "./modules/auth/auth.config";
import { JWTPayload } from "./middleware/auth.middleware";
import * as messagingService from "./modules/messaging/messaging.service";
import { setupAnnouncementSocket } from "./modules/announcement/announcement.socket";
import logger from "./utils/logger";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export const setupSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL
        ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
        : "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // JWT auth on connection
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, authConfig.jwt_secret as string) as JWTPayload;
      socket.userId = decoded.id;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.info({ userId, socketId: socket.id }, "Socket connected");

    // Update lastActiveAt on connect
    try {
      await messagingService.updateLastActive(userId);
    } catch (error) {
      logger.error({ userId, error }, "Failed to update lastActiveAt on connect");
    }

    // Wire announcement events (banner sync, dismiss, initial state push)
    try {
      await setupAnnouncementSocket(io, socket);
    } catch (error) {
      logger.error({ userId, error }, "Failed to setup announcement socket");
    }

    // Join user to all their conversation rooms
    try {
      const conversations = await messagingService.getUserConversations(userId);
      conversations.forEach((conv) => {
        socket.join(`conversation:${conv.id}`);
      });
      logger.info({ userId, roomCount: conversations.length }, "Joined conversation rooms");
    } catch (error) {
      logger.error({ userId, error }, "Failed to join conversation rooms");
    }

    // message:send — client sends a message
    socket.on("message:send", async (data: { conversationId: string; content: string; attachments?: { type: string; fileName: string; fileUrl: string; fileSize?: number }[] }) => {
      try {
        const isParticipant = await messagingService.isParticipant(data.conversationId, userId);
        if (!isParticipant) return;

        // Block check — if recipient has blocked sender, silently drop
        const blocked = await messagingService.isBlockedBy(userId, data.conversationId);
        if (blocked) {
          socket.emit("message:blocked", { conversationId: data.conversationId });
          return;
        }

        const hasContent = data.content && data.content.trim().length > 0;
        const hasAttachments = data.attachments && data.attachments.length > 0;
        if (!hasContent && !hasAttachments) return;
        if (data.content && data.content.length > 1000) return;

        const message = await messagingService.sendMessage({
          conversationId: data.conversationId,
          senderId: userId,
          content: data.content?.trim() || "",
          attachments: data.attachments,
        });

        io.to(`conversation:${data.conversationId}`).emit("message:new", message);
      } catch (error) {
        logger.error({ userId, error }, "Failed to send message via socket");
      }
    });

    // message:edit — client edits a message
    socket.on("message:edit", async (data: { messageId: string; content: string }) => {
      try {
        const message = await messagingService.getMessageById(data.messageId);
        if (!message || message.senderId !== userId) return;
        if (message.isDeleted) return;
        if (!data.content || data.content.trim().length === 0 || data.content.length > 1000) return;

        const updated = await messagingService.editMessage(data.messageId, {
          content: data.content.trim(),
        });

        io.to(`conversation:${message.conversationId}`).emit("message:edited", updated);
      } catch (error) {
        logger.error({ userId, error }, "Failed to edit message via socket");
      }
    });

    // message:delete — client deletes a message
    socket.on("message:delete", async (data: { messageId: string }) => {
      try {
        const message = await messagingService.getMessageById(data.messageId);
        if (!message || message.senderId !== userId) return;

        await messagingService.deleteMessage(data.messageId);

        io.to(`conversation:${message.conversationId}`).emit("message:deleted", {
          messageId: data.messageId,
          conversationId: message.conversationId,
        });
      } catch (error) {
        logger.error({ userId, error }, "Failed to delete message via socket");
      }
    });

    // message:react — client reacts to a message
    socket.on("message:react", async (data: { messageId: string; emoji: string }) => {
      try {
        const message = await messagingService.getMessageById(data.messageId);
        if (!message) return;

        const isParticipant = await messagingService.isParticipant(message.conversationId, userId);
        if (!isParticipant) return;

        if (!data.emoji || data.emoji.length > 4) return;

        const result = await messagingService.toggleReaction(data.messageId, userId, data.emoji);

        io.to(`conversation:${message.conversationId}`).emit("message:reaction", {
          messageId: data.messageId,
          userId,
          emoji: data.emoji,
          action: result.action,
        });
      } catch (error) {
        logger.error({ userId, error }, "Failed to react via socket");
      }
    });

    // typing:start — client started typing
    socket.on("typing:start", async (data: { conversationId: string }) => {
      try {
        const isParticipant = await messagingService.isParticipant(data.conversationId, userId);
        if (!isParticipant) return;

        socket.to(`conversation:${data.conversationId}`).emit("typing:indicator", {
          conversationId: data.conversationId,
          userId,
          isTyping: true,
        });
      } catch (error) {
        logger.error({ userId, error }, "Failed to emit typing start");
      }
    });

    // typing:stop — client stopped typing
    socket.on("typing:stop", async (data: { conversationId: string }) => {
      try {
        const isParticipant = await messagingService.isParticipant(data.conversationId, userId);
        if (!isParticipant) return;

        socket.to(`conversation:${data.conversationId}`).emit("typing:indicator", {
          conversationId: data.conversationId,
          userId,
          isTyping: false,
        });
      } catch (error) {
        logger.error({ userId, error }, "Failed to emit typing stop");
      }
    });

    // message:read — client marks messages as read
    socket.on("message:read", async (data: { conversationId: string; messageId: string }) => {
      try {
        const isParticipant = await messagingService.isParticipant(data.conversationId, userId);
        if (!isParticipant) return;

        await messagingService.markAsRead(data.conversationId, userId, data.messageId);

        socket.to(`conversation:${data.conversationId}`).emit("message:read_receipt", {
          conversationId: data.conversationId,
          userId,
          messageId: data.messageId,
        });
      } catch (error) {
        logger.error({ userId, error }, "Failed to mark as read");
      }
    });
    

    // Handle joining new conversation rooms
    socket.on("conversation:join", (data: { conversationId: string }) => {
      socket.join(`conversation:${data.conversationId}`);
    });

    socket.on("disconnect", async () => {
      logger.info({ userId, socketId: socket.id }, "Socket disconnected");

      // Update lastActiveAt on disconnect
      try {
        await messagingService.updateLastActive(userId);
      } catch (error) {
        logger.error({ userId, error }, "Failed to update lastActiveAt on disconnect");
      }
    });
  });

  return io;
};