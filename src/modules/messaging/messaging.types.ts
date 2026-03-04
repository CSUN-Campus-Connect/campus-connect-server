export interface CreateConversationData {
  isGroup: boolean;
  name?: string;
  participantIds: string[];
}

export interface UpdateConversationData {
  name: string;
}

export interface SendMessageData {
  content: string;
  conversationId: string;
  senderId: string;
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
  createdAt: Date;
  updatedAt: Date;
  Participants: {
    id: string;
    userId: string;
    isAdmin: boolean;
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