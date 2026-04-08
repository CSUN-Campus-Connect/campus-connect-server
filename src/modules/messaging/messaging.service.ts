import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import {
  CreateConversationData,
  SendMessageData,
  EditMessageData,
  MessageQueryOptions,
  ConversationQueryOptions,
  PublicConversation,
  PublicMessage,
} from "./messaging.types";

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  userType: true,
  lastActiveAt: true,
};

const senderSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
};

const messageInclude = {
  Sender: { select: senderSelect },
  Reactions: {
    include: {
      User: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  Attachments: true,
};

const conversationInclude = {
  Participants: {
    include: {
      User: { select: userSelect },
    },
  },
  Messages: {
    take: 1,
    orderBy: { createdAt: "desc" as const },
    include: messageInclude,
  },
  _count: {
    select: { Messages: true },
  },
};

// Conversations

export const createConversation = async (
  creatorId: string,
  data: CreateConversationData
): Promise<PublicConversation> => {
  const { isGroup, name, participantIds, groupPictureUrl } = data;

  if (!isGroup) {
    const existingDm = await findExistingDm(creatorId, participantIds[0]);
    if (existingDm) {
      logger.info({ creatorId, otherUserId: participantIds[0] }, "Returning existing DM");
      return existingDm as PublicConversation;
    }
  }

  const now = new Date();
  const allParticipantIds = [creatorId, ...participantIds];

  const conversation = await prisma.conversation.create({
    data: {
      id: crypto.randomUUID(),
      isGroup,
      name: isGroup ? name : null,
      groupPictureUrl: isGroup ? groupPictureUrl : null,
      createdById: creatorId,
      updatedAt: now,
      Participants: {
        create: allParticipantIds.map((userId) => ({
          id: crypto.randomUUID(),
          userId,
          isAdmin: userId === creatorId,
        })),
      },
    },
    include: conversationInclude,
  });

  logger.info({ creatorId, isGroup, participantCount: allParticipantIds.length }, "Conversation created");
  return conversation as PublicConversation;
};

const findExistingDm = async (
  userId1: string,
  userId2: string
): Promise<PublicConversation | null> => {
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { Participants: { some: { userId: userId1 } } },
        { Participants: { some: { userId: userId2 } } },
      ],
    },
    include: conversationInclude,
  });

  return existing as PublicConversation | null;
};

export const getUserConversations = async (
  userId: string,
  options: ConversationQueryOptions = {}
): Promise<PublicConversation[]> => {
  const { limit = 20, cursor } = options;

  const conversations = await prisma.conversation.findMany({
    where: {
      Participants: { some: { userId } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
    include: conversationInclude,
  });

  return conversations as PublicConversation[];
};

export const getConversationById = async (
  conversationId: string,
  userId: string
): Promise<PublicConversation | null> => {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      Participants: { some: { userId } },
    },
    include: conversationInclude,
  });

  return conversation as PublicConversation | null;
};

export const updateConversation = async (
  conversationId: string,
  name?: string,
  groupPictureUrl?: string
): Promise<PublicConversation> => {
  const data: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined) data.name = name;
  if (groupPictureUrl !== undefined) data.groupPictureUrl = groupPictureUrl;

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data,
    include: conversationInclude,
  });

  logger.info({ conversationId, name, groupPictureUrl }, "Conversation updated");
  return updated as PublicConversation;
};

export const leaveConversation = async (
  conversationId: string,
  userId: string
): Promise<{ deleted: boolean }> => {
  const participantCount = await prisma.conversationParticipant.count({
    where: { conversationId },
  });

  if (participantCount <= 1) {
    await prisma.conversation.delete({
      where: { id: conversationId },
    });
    logger.info({ conversationId, userId }, "Last participant left, conversation deleted");
    return { deleted: true };
  }

  await prisma.conversationParticipant.delete({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  logger.info({ conversationId, userId }, "User left conversation");
  return { deleted: false };
};

// Messages

export const getMessages = async (
  conversationId: string,
  options: MessageQueryOptions = {}
): Promise<PublicMessage[]> => {
  const { limit = 30, cursor } = options;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
    include: messageInclude,
  });

  return messages.map((msg: any) => ({
    ...msg,
    content: msg.isDeleted ? "" : msg.content,
  })) as PublicMessage[];
};

export const sendMessage = async (
  data: SendMessageData
): Promise<PublicMessage> => {
  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.content,
        updatedAt: now,
        ...(data.attachments && data.attachments.length > 0
          ? {
              Attachments: {
                create: data.attachments.map((att) => ({
                  id: crypto.randomUUID(),
                  type: att.type,
                  fileName: att.fileName,
                  fileUrl: att.fileUrl,
                  fileSize: att.fileSize ?? null,
                })),
              },
            }
          : {}),
      },
      include: messageInclude,
    }),
    prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: now },
    }),
  ]);

  logger.info({ conversationId: data.conversationId, senderId: data.senderId, attachmentCount: data.attachments?.length ?? 0 }, "Message sent");
  return message as PublicMessage;
};

export const editMessage = async (
  messageId: string,
  data: EditMessageData
): Promise<PublicMessage> => {
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: data.content,
      isEdited: true,
      updatedAt: new Date(),
    },
    include: messageInclude,
  });

  logger.info({ messageId }, "Message edited");
  return updated as PublicMessage;
};

export const deleteMessage = async (
  messageId: string
): Promise<void> => {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      updatedAt: new Date(),
    },
  });

  logger.info({ messageId }, "Message soft deleted");
};

export const getMessageById = async (messageId: string) => {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      Conversation: {
        include: {
          Participants: true,
        },
      },
    },
  });
};

// Participants

export const addParticipant = async (
  conversationId: string,
  userId: string
): Promise<any> => {
  const participant = await prisma.conversationParticipant.create({
    data: {
      id: crypto.randomUUID(),
      conversationId,
      userId,
    },
    include: {
      User: { select: userSelect },
    },
  });

  logger.info({ conversationId, userId }, "Participant added");
  return participant;
};

export const removeParticipant = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  await prisma.conversationParticipant.delete({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  logger.info({ conversationId, userId }, "Participant removed");
};

export const isParticipant = async (
  conversationId: string,
  userId: string
): Promise<boolean> => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  return !!participant;
};

export const isAdmin = async (
  conversationId: string,
  userId: string
): Promise<boolean> => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  return participant?.isAdmin ?? false;
};

export const getParticipantCount = async (
  conversationId: string
): Promise<number> => {
  return prisma.conversationParticipant.count({
    where: { conversationId },
  });
};

// Reactions

export const toggleReaction = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<{ action: "added" | "removed" }> => {
  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji,
      },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({
      where: { id: existing.id },
    });
    return { action: "removed" };
  }

  await prisma.messageReaction.create({
    data: {
      id: crypto.randomUUID(),
      messageId,
      userId,
      emoji,
    },
  });
  return { action: "added" };
};

export const removeReaction = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<boolean> => {
  try {
    await prisma.messageReaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });
    return true;
  } catch (error) {
    return false;
  }
};

// Read receipts

export const markAsRead = async (
  conversationId: string,
  userId: string,
  messageId: string
): Promise<void> => {
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadMessageId: messageId,
    },
  });
};

// User presence

export const updateLastActive = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() },
  });
};