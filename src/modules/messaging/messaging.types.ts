export interface CreateConversationData {
  isGroup: boolean;
  name?: string;
  participantIds: string[];
  groupPictureUrl?: string;
}

export interface UpdateConversationData {
  name?: string;
  groupPictureUrl?: string;
}

export interface SendMessageData {
  content: string;
  conversationId: string;
  senderId: string;
  attachments?: AttachmentInput[];
}

export interface AttachmentInput {
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
}

export interface EditMessageData {
  content: string;
}

export interface AddParticipantData {
  userId: string;
}

export interface ReactionData {
  emoji: string;
}

export interface MessageQueryOptions {
  limit?: number;
  cursor?: string;
}

export interface ConversationQueryOptions {
  limit?: number;
  cursor?: string;
}

export interface PublicConversation {
  id: string;
  name: string | null;
  isGroup: boolean;
  createdById: string;
  groupPictureUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  Participants: {
    id: string;
    userId: string;
    isAdmin: boolean;
    lastReadMessageId: string | null;
    joinedAt: Date;
    User: {
      id: string;
      firstName: string;
      lastName: string;
      profilePicture: string | null;
      userType: string;
    };
  }[];
  Messages?: PublicMessage[];
  _count?: {
    Messages: number;
  };
}

export interface PublicMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  Sender: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture: string | null;
  };
  Reactions: PublicReaction[];
  Attachments: PublicAttachment[];
}

export interface PublicReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  User: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface PublicAttachment {
  id: string;
  messageId: string;
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  createdAt: Date;
}