import { Request, Response, NextFunction } from "express";
import * as messagingService from "./messaging.service";
import { CreateConversationData, EditMessageData } from "./messaging.types";
import { uploadMessageAttachment } from "./messaging.upload.service";

// Conversations

export const createConversationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const data: CreateConversationData = req.body;

    if (data.participantIds.includes(req.user.id)) {
      res.status(400).json({ message: "Cannot add yourself as a participant" });
      return;
    }

    const conversation = await messagingService.createConversation(req.user.id, data);
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const getConversationsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    };

    const conversations = await messagingService.getUserConversations(req.user.id, options);
    res.status(200).json(conversations);
  } catch (error) {
    next(error);
  }
};

export const getConversationByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const conversation = await messagingService.getConversationById(
      req.params.id as string,
      req.user.id
    );

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    res.status(200).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const updateConversationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const conversation = await messagingService.getConversationById(
      req.params.id as string,
      req.user.id
    );

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    if (!conversation.isGroup) {
      res.status(400).json({ message: "Cannot update a direct message" });
      return;
    }

    const admin = await messagingService.isAdmin(req.params.id as string, req.user.id);
    if (!admin) {
      res.status(403).json({ message: "Only admins can update the conversation" });
      return;
    }

    const updated = await messagingService.updateConversation(
      req.params.id as string,
      req.body.name,
      req.body.groupPictureUrl
    );
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const leaveConversationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const isParticipant = await messagingService.isParticipant(req.params.id as string, req.user.id);
    if (!isParticipant) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const result = await messagingService.leaveConversation(req.params.id as string, req.user.id);

    if (result.deleted) {
      res.status(200).json({ message: "Conversation deleted" });
    } else {
      res.status(200).json({ message: "Left conversation" });
    }
  } catch (error) {
    next(error);
  }
};

// Messages

export const getMessagesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const isParticipant = await messagingService.isParticipant(req.params.id as string, req.user.id);
    if (!isParticipant) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    };

    const messages = await messagingService.getMessages(req.params.id as string, options);
    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

export const sendMessageHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const isParticipant = await messagingService.isParticipant(req.params.id as string, req.user.id);
    if (!isParticipant) {
      res.status(403).json({ message: "Not a participant in this conversation" });
      return;
    }

    // Block check
    const blocked = await messagingService.isBlockedBy(req.user.id, req.params.id as string);
    if (blocked) {
      res.status(403).json({ message: "You cannot send messages to this conversation" });
      return;
    }

    const message = await messagingService.sendMessage({
      conversationId: req.params.id as string,
      senderId: req.user.id,
      content: req.body.content,
      attachments: req.body.attachments,
    });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
};



export const editMessageHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const message = await messagingService.getMessageById(req.params.messageId as string);

    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    if (message.senderId !== req.user.id) {
      res.status(403).json({ message: "Can only edit your own messages" });
      return;
    }

    if (message.isDeleted) {
      res.status(400).json({ message: "Cannot edit a deleted message" });
      return;
    }

    const data: EditMessageData = { content: req.body.content };
    const updated = await messagingService.editMessage(req.params.messageId as string, data);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteMessageHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const message = await messagingService.getMessageById(req.params.messageId as string);

    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    if (message.senderId !== req.user.id) {
      res.status(403).json({ message: "Can only delete your own messages" });
      return;
    }

    await messagingService.deleteMessage(req.params.messageId as string);
    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    next(error);
  }
};

// Participants

export const addParticipantHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const conversation = await messagingService.getConversationById(
      req.params.id as string,
      req.user.id
    );

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    if (!conversation.isGroup) {
      res.status(400).json({ message: "Can only add participants to group conversations" });
      return;
    }

    const admin = await messagingService.isAdmin(req.params.id as string, req.user.id);
    if (!admin) {
      res.status(403).json({ message: "Only admins can add participants" });
      return;
    }

    const alreadyIn = await messagingService.isParticipant(req.params.id as string, req.body.userId);
    if (alreadyIn) {
      res.status(400).json({ message: "User is already a participant" });
      return;
    }

    const count = await messagingService.getParticipantCount(req.params.id as string);
    if (count >= 50) {
      res.status(400).json({ message: "Group is full (max 50 participants)" });
      return;
    }

    const participant = await messagingService.addParticipant(req.params.id as string, req.body.userId);
    res.status(200).json(participant);
  } catch (error) {
    next(error);
  }
};

export const removeParticipantHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const conversation = await messagingService.getConversationById(
      req.params.id as string,
      req.user.id
    );

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    if (!conversation.isGroup) {
      res.status(400).json({ message: "Cannot remove participants from DMs" });
      return;
    }

    const admin = await messagingService.isAdmin(req.params.id as string, req.user.id);
    if (!admin) {
      res.status(403).json({ message: "Only admins can remove participants" });
      return;
    }

    if (req.params.userId as string === conversation.createdById) {
      res.status(400).json({ message: "Cannot remove the conversation creator" });
      return;
    }

    const targetIsParticipant = await messagingService.isParticipant(
      req.params.id as string,
      req.params.userId as string
    );
    if (!targetIsParticipant) {
      res.status(404).json({ message: "User is not a participant" });
      return;
    }

    await messagingService.removeParticipant(req.params.id as string, req.params.userId as string);
    res.status(200).json({ message: "Participant removed" });
  } catch (error) {
    next(error);
  }
};

// Reactions

export const addReactionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const message = await messagingService.getMessageById(req.params.messageId as string);

    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const isParticipant = await messagingService.isParticipant(
      message.conversationId,
      req.user.id
    );
    if (!isParticipant) {
      res.status(403).json({ message: "Not a participant in this conversation" });
      return;
    }

    const result = await messagingService.toggleReaction(
      req.params.messageId as string,
      req.user.id,
      req.body.emoji
    );

    res.status(200).json({ success: true, action: result.action });
  } catch (error) {
    next(error);
  }
};

export const removeReactionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const removed = await messagingService.removeReaction(
      req.params.messageId as string,
      req.user.id,
      decodeURIComponent(req.params.emoji as string)
    );

    if (!removed) {
      res.status(404).json({ message: "Reaction not found" });
      return;
    }

    res.status(200).json({ message: "Reaction removed" });
  } catch (error) {
    next(error);
  }
};

export const uploadAttachmentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No file provided" });
      return;
    }

    const isParticipant = await messagingService.isParticipant(req.params.id as string, req.user.id);
    if (!isParticipant) {
      res.status(403).json({ message: "Not a participant in this conversation" });
      return;
    }

    const result = await uploadMessageAttachment(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.params.id as string
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};