import { Request, Response, NextFunction } from "express";
import * as postsService from "./posts.service";

// POST /api/v1/posts - Create a new post
export const createPostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const post = await postsService.createPost(userId, req.body);
    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/posts - Get feed (paginated)
export const getFeedHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { cursor, limit } = req.query;
    const feed = await postsService.getFeed(userId, {
      cursor: cursor as string,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.status(200).json({
      success: true,
      ...feed,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/posts/:id - Get single post
export const getPostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    const post = await postsService.getPostById(postId, userId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }
    res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/posts/:id - Delete a post
export const deletePostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    await postsService.deletePost(postId, userId);
    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/posts/:id/like - Like a post
export const likePostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    const result = await postsService.likePost(postId, userId);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/posts/:id/like - Unlike a post
export const unlikePostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    const result = await postsService.unlikePost(postId, userId);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/posts/:id/comments - Add comment
export const createCommentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    const comment = await postsService.createComment(
      postId,
      userId,
      req.body
    );
    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/posts/:id/comments - Get comments (paginated)
export const getCommentsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const postId = req.params.id as string;
    const { cursor, limit } = req.query;
    const result = await postsService.getComments(
      postId,
      cursor as string,
      limit ? parseInt(limit as string, 10) : 20
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/posts/comments/:commentId - Delete comment
export const deleteCommentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const commentId = req.params.commentId as string;
    await postsService.deleteComment(commentId, userId);
    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/posts/:id/repost - Repost (with optional quote)
export const repostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    const repost = await postsService.createRepost(
      postId,
      userId,
      req.body?.repostComment
    );
    res.status(201).json({
      success: true,
      message: "Reposted successfully",
      post: repost,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/posts/:id/repost - Undo repost
export const deleteRepostHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const postId = req.params.id as string;
    await postsService.deleteRepost(postId, userId);
    res.status(200).json({
      success: true,
      message: "Repost removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/posts/user/:userId - Get user's posts
export const getUserPostsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUserId = req.user!.id;
    const profileUserId = req.params.userId as string;
    const { cursor, limit } = req.query;
    const result = await postsService.getUserPosts(
      profileUserId,
      currentUserId,
      cursor as string,
      limit ? parseInt(limit as string, 10) : 20
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};