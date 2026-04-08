export interface CreateLivestreamInput {
  title: string;
}

export interface LivestreamHost {
  id: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  userType: string;
}

export interface LivestreamResponse {
  id: string;
  title: string;
  status: string;
  viewerCount: number;
  startedAt: Date;
  endedAt: Date | null;
  User: LivestreamHost;
  token?: string;
  livekitUrl?: string;
}