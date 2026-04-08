export interface CreatePostInput {
  content: string;
  images?: string[];
}

export interface CreateRepostInput {
  repostComment?: string;
}

export interface CreateCommentInput {
  content: string;
}

export interface FeedQueryParams {
  cursor?: string;
  limit?: number;
}

export interface PostAuthor {
  id: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  userType: string;
}

export interface PostWithAuthor {
  id: string;
  content: string;
  images: string[];
  isRepost: boolean;
  originalPostId: string | null;
  repostComment: string | null;
  createdAt: Date;
  updatedAt: Date;
  User: PostAuthor;
  Post?: PostWithAuthor | null;
  _count: {
    Like: number;
    Comment: number;
    other_Post: number;
  };
  isLikedByUser?: boolean;
}