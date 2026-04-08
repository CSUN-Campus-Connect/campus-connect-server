import { Router } from "express";
import * as postsController from "./posts.controller";
import { validate } from "../../middleware/validateRequest";
import { authenticateToken } from "../../middleware/auth.middleware";
import {
  createPostSchema,
  createCommentSchema,
  createRepostSchema,
} from "./posts.validation";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// User posts (must be before /:id to avoid conflict)
router.get("/user/:userId", postsController.getUserPostsHandler);

// Feed & Posts
router.get("/", postsController.getFeedHandler);
router.post("/", validate(createPostSchema), postsController.createPostHandler);

// Comment deletion (must be before /:id routes)
router.delete("/comments/:commentId", postsController.deleteCommentHandler);

// Single post operations
router.get("/:id", postsController.getPostHandler);
router.delete("/:id", postsController.deletePostHandler);

// Likes
router.post("/:id/like", postsController.likePostHandler);
router.delete("/:id/like", postsController.unlikePostHandler);

// Comments
router.get("/:id/comments", postsController.getCommentsHandler);
router.post(
  "/:id/comments",
  validate(createCommentSchema),
  postsController.createCommentHandler
);

// Repost
router.post(
  "/:id/repost",
  validate(createRepostSchema),
  postsController.repostHandler
);
router.delete("/:id/repost", postsController.deleteRepostHandler);

export default router;