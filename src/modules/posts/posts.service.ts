import { randomUUID } from "crypto";
import prisma from "../../utils/prisma";
import {
  CreatePostInput,
  CreateCommentInput,
  FeedQueryParams,
} from "./posts.types";

// Generate a cuid-like ID (using randomUUID since schema has no @default)
const generateId = (): string => randomUUID();

// User fields to include in responses
const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  userType: true,
};

// Standard post include for queries
// Official schema relation names: User, Post (originalPost), other_Post (reposts), Like, Comment
const postInclude = {
  User: { select: userSelect },
  Post: {
    include: {
      User: { select: userSelect },
      _count: { select: { Like: true, Comment: true, other_Post: true } },
    },
  },
  _count: { select: { Like: true, Comment: true, other_Post: true } },
};

// Create a new post
export const createPost = async (userId: string, data: CreatePostInput) => {
  const now = new Date();
  const post = await prisma.post.create({
    data: {
      id: generateId(),
      userId,
      content: data.content,
      images: data.images || [],
      updatedAt: now,
    },
    include: postInclude,
  });
  return post;
};

// Get feed (all posts, reverse chronological, paginated)
export const getFeed = async (userId: string, params: FeedQueryParams) => {
  const limit = params.limit || 20;

  const posts = await prisma.post.findMany({
    take: limit + 1,
    ...(params.cursor && {
      cursor: { id: params.cursor },
      skip: 1,
    }),
    orderBy: { createdAt: "desc" },
    include: {
      ...postInclude,
      Like: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  const hasMore = posts.length > limit;
  const feedPosts = hasMore ? posts.slice(0, -1) : posts;

  const postsWithLikeStatus = feedPosts.map((post) => ({
    ...post,
    isLikedByUser: post.Like.length > 0,
    Like: undefined,
  }));

  return {
    posts: postsWithLikeStatus,
    nextCursor: hasMore ? feedPosts[feedPosts.length - 1].id : null,
    hasMore,
  };
};

// Get single post by ID
export const getPostById = async (postId: string, userId: string) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      ...postInclude,
      Like: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  if (!post) return null;

  return {
    ...post,
    isLikedByUser: post.Like.length > 0,
    Like: undefined,
  };
};

// Delete a post (only owner can delete)
export const deletePost = async (postId: string, userId: string) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true },
  });

  if (!post) {
    throw new Error("Post not found");
  }
  if (post.userId !== userId) {
    throw new Error("Not authorized to delete this post");
  }

  await prisma.post.delete({ where: { id: postId } });
  return true;
};

// Like a post
export const likePost = async (postId: string, userId: string) => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw new Error("Post not found");
  }

  const existingLike = await prisma.like.findUnique({
    where: { userId_postId: { userId, postId } },
  });

  if (existingLike) {
    throw new Error("Already liked this post");
  }

  await prisma.like.create({
    data: {
      id: generateId(),
      userId,
      postId,
    },
  });

  const count = await prisma.like.count({ where: { postId } });
  return { liked: true, likeCount: count };
};

// Unlike a post
export const unlikePost = async (postId: string, userId: string) => {
  const existingLike = await prisma.like.findUnique({
    where: { userId_postId: { userId, postId } },
  });

  if (!existingLike) {
    throw new Error("You haven't liked this post");
  }

  await prisma.like.delete({
    where: { userId_postId: { userId, postId } },
  });

  const count = await prisma.like.count({ where: { postId } });
  return { liked: false, likeCount: count };
};

// Create a comment on a post
export const createComment = async (
  postId: string,
  userId: string,
  data: CreateCommentInput
) => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw new Error("Post not found");
  }

  const now = new Date();
  const comment = await prisma.comment.create({
    data: {
      id: generateId(),
      postId,
      userId,
      content: data.content,
      updatedAt: now,
    },
    include: {
      User: { select: userSelect },
    },
  });

  return comment;
};

// Get comments for a post (paginated)
export const getComments = async (
  postId: string,
  cursor?: string,
  limit = 20
) => {
  const comments = await prisma.comment.findMany({
    where: { postId },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: { createdAt: "desc" },
    include: {
      User: { select: userSelect },
    },
  });

  const hasMore = comments.length > limit;
  const feedComments = hasMore ? comments.slice(0, -1) : comments;

  return {
    comments: feedComments,
    nextCursor: hasMore ? feedComments[feedComments.length - 1].id : null,
    hasMore,
  };
};

// Delete a comment (only owner can delete)
export const deleteComment = async (commentId: string, userId: string) => {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { userId: true },
  });

  if (!comment) {
    throw new Error("Comment not found");
  }
  if (comment.userId !== userId) {
    throw new Error("Not authorized to delete this comment");
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return true;
};

// Repost (with optional quote)
export const createRepost = async (
  originalPostId: string,
  userId: string,
  repostComment?: string
) => {
  const originalPost = await prisma.post.findUnique({
    where: { id: originalPostId },
  });
  if (!originalPost) {
    throw new Error("Original post not found");
  }

  const existingRepost = await prisma.post.findFirst({
    where: {
      userId,
      originalPostId,
      isRepost: true,
    },
  });
  if (existingRepost) {
    throw new Error("You already reposted this");
  }

  const now = new Date();
  const repost = await prisma.post.create({
    data: {
      id: generateId(),
      userId,
      content: originalPost.content,
      isRepost: true,
      originalPostId,
      repostComment: repostComment || null,
      updatedAt: now,
    },
    include: postInclude,
  });

  return repost;
};

// Undo a repost
export const deleteRepost = async (originalPostId: string, userId: string) => {
  const repost = await prisma.post.findFirst({
    where: {
      userId,
      originalPostId,
      isRepost: true,
    },
  });

  if (!repost) {
    throw new Error("You haven't reposted this post");
  }

  await prisma.post.delete({ where: { id: repost.id } });
  return true;
};

// Get user's posts (for profile page)
export const getUserPosts = async (
  profileUserId: string,
  currentUserId: string,
  cursor?: string,
  limit = 20
) => {
  const posts = await prisma.post.findMany({
    where: { userId: profileUserId },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: { createdAt: "desc" },
    include: {
      ...postInclude,
      Like: {
        where: { userId: currentUserId },
        select: { id: true },
      },
    },
  });

  const hasMore = posts.length > limit;
  const feedPosts = hasMore ? posts.slice(0, -1) : posts;

  const postsWithLikeStatus = feedPosts.map((post) => ({
    ...post,
    isLikedByUser: post.Like.length > 0,
    Like: undefined,
  }));

  return {
    posts: postsWithLikeStatus,
    nextCursor: hasMore ? feedPosts[feedPosts.length - 1].id : null,
    hasMore,
  };
};