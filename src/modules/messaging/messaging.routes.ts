import { Router } from "express";
import * as messagingController from "./messaging.controller";
import { validate } from "../../middleware/validateRequest";
import { authenticateToken } from "../../middleware/auth.middleware";
import {
  createConversationSchema,
  updateConversationSchema,
  conversationIdSchema,
  getConversationsSchema,
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  messageIdSchema,
  addParticipantSchema,
  removeParticipantSchema,
  addReactionSchema,
  removeReactionSchema,
} from "./messaging.validation";

const router = Router();

// Conversations
router.get(
  "/conversations",
  authenticateToken,
  validate(getConversationsSchema),
  messagingController.getConversationsHandler
);

router.post(
  "/conversations",
  authenticateToken,
  validate(createConversationSchema),
  messagingController.createConversationHandler
);

router.get(
  "/conversations/:id",
  authenticateToken,
  validate(conversationIdSchema),
  messagingController.getConversationByIdHandler
);

router.patch(
  "/conversations/:id",
  authenticateToken,
  validate(updateConversationSchema),
  messagingController.updateConversationHandler
);

router.delete(
  "/conversations/:id",
  authenticateToken,
  validate(conversationIdSchema),
  messagingController.leaveConversationHandler
);

// Messages
router.get(
  "/conversations/:id/messages",
  authenticateToken,
  validate(getMessagesSchema),
  messagingController.getMessagesHandler
);

router.post(
  "/conversations/:id/messages",
  authenticateToken,
  validate(sendMessageSchema),
  messagingController.sendMessageHandler
);

router.patch(
  "/:messageId",
  authenticateToken,
  validate(editMessageSchema),
  messagingController.editMessageHandler
);

router.delete(
  "/:messageId",
  authenticateToken,
  validate(messageIdSchema),
  messagingController.deleteMessageHandler
);

// Participants
router.post(
  "/conversations/:id/participants",
  authenticateToken,
  validate(addParticipantSchema),
  messagingController.addParticipantHandler
);

router.delete(
  "/conversations/:id/participants/:userId",
  authenticateToken,
  validate(removeParticipantSchema),
  messagingController.removeParticipantHandler
);

// Reactions
router.post(
  "/:messageId/reactions",
  authenticateToken,
  validate(addReactionSchema),
  messagingController.addReactionHandler
);

router.delete(
  "/:messageId/reactions/:emoji",
  authenticateToken,
  validate(removeReactionSchema),
  messagingController.removeReactionHandler
);

export default router;