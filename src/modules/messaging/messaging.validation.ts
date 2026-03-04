import { z } from "zod";

export const createConversationSchema = z.object({
  body: z.object({
    isGroup: z.boolean({ message: "isGroup is required" }),

    name: z
      .string()
      .min(1, { message: "Group name cannot be empty" })
      .max(100, { message: "Group name must not exceed 100 characters" })
      .trim()
      .optional()
      .nullable(),

    participantIds: z
      .array(z.string().uuid({ message: "Each participant ID must be a valid UUID" }))
      .min(1, { message: "At least one participant is required" })
      .max(49, { message: "Maximum 49 participants can be added (50 including you)" }),
  }).refine(
    (data) => {
      if (!data.isGroup && data.participantIds.length !== 1) {
        return false;
      }
      return true;
    },
    { message: "DMs must have exactly one other participant" }
  ).refine(
    (data) => {
      if (data.isGroup && (!data.name || data.name.trim().length === 0)) {
        return false;
      }
      return true;
    },
    { message: "Group conversations require a name" }
  ),
});

export const updateConversationSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Name is required" })
      .min(1, { message: "Group name cannot be empty" })
      .max(100, { message: "Group name must not exceed 100 characters" })
      .trim(),
  }),
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
  }),
});

export const conversationIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    content: z
      .string({ message: "Message content is required" })
      .min(1, { message: "Message cannot be empty" })
      .max(1000, { message: "Message must not exceed 1000 characters" })
      .trim(),
  }),
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
  }),
  query: z.object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    cursor: z.string().optional(),
  }),
});

export const editMessageSchema = z.object({
  body: z.object({
    content: z
      .string({ message: "Message content is required" })
      .min(1, { message: "Message cannot be empty" })
      .max(1000, { message: "Message must not exceed 1000 characters" })
      .trim(),
  }),
  params: z.object({
    messageId: z.string({ message: "Message ID is required" }),
  }),
});

export const messageIdSchema = z.object({
  params: z.object({
    messageId: z.string({ message: "Message ID is required" }),
  }),
});

export const addParticipantSchema = z.object({
  body: z.object({
    userId: z
      .string({ message: "User ID is required" })
      .uuid({ message: "User ID must be a valid UUID" }),
  }),
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
  }),
});

export const removeParticipantSchema = z.object({
  params: z.object({
    id: z.string({ message: "Conversation ID is required" }),
    userId: z.string({ message: "User ID is required" }),
  }),
});

export const addReactionSchema = z.object({
  body: z.object({
    emoji: z
      .string({ message: "Emoji is required" })
      .min(1, { message: "Emoji cannot be empty" })
      .max(4, { message: "Emoji must not exceed 4 characters" }),
  }),
  params: z.object({
    messageId: z.string({ message: "Message ID is required" }),
  }),
});

export const removeReactionSchema = z.object({
  params: z.object({
    messageId: z.string({ message: "Message ID is required" }),
    emoji: z.string({ message: "Emoji is required" }),
  }),
});

export const getConversationsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    cursor: z.string().optional(),
  }),
});