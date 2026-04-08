import { randomUUID } from "crypto";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import prisma from "../../utils/prisma";
import { CreateLivestreamInput } from "./livestream.types";

const livekitHost = process.env.LIVEKIT_URL || "wss://localhost:7880";
const apiKey = process.env.LIVEKIT_API_KEY || "";
const apiSecret = process.env.LIVEKIT_API_SECRET || "";

// Initialize LiveKit Room Service Client
const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  userType: true,
};

const livestreamInclude = {
  User: { select: userSelect },
};

// Generate a LiveKit access token
const generateToken = async (
  roomName: string,
  participantIdentity: string,
  participantName: string,
  isHost: boolean
) => {
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: isHost,
    canPublishData: isHost,
    canSubscribe: true,
    // Host can share screen, viewers can only watch
    canPublishSources: isHost
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [],
  });

  return await at.toJwt();
};

// Start a new livestream
export const startLivestream = async (
  userId: string,
  data: CreateLivestreamInput
) => {
  // Check if user already has an active livestream
  const existingStream = await prisma.livestream.findFirst({
    where: { userId, status: "LIVE" },
  });

  if (existingStream) {
    throw new Error("You already have an active livestream");
  }

  const streamId = randomUUID();
  const roomName = `livestream-${streamId}`;

  // Create LiveKit room
  await roomService.createRoom({
    name: roomName,
    emptyTimeout: 5 * 60, // Close room 5 min after empty
    maxParticipants: 500,
  });

  // Get user info for token name
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });

  const participantName = user
    ? `${user.firstName} ${user.lastName}`
    : "Host";

  // Generate host token with publish permissions
  const token = await generateToken(
    roomName,
    userId,
    participantName,
    true
  );

  // Save to database
  const livestream = await prisma.livestream.create({
    data: {
      id: streamId,
      userId,
      title: data.title,
      status: "LIVE",
    },
    include: livestreamInclude,
  });

  return {
    ...livestream,
    token,
    livekitUrl: livekitHost,
    roomName,
  };
};

// Join a livestream as a viewer
export const joinLivestream = async (
  livestreamId: string,
  userId: string
) => {
  const livestream = await prisma.livestream.findUnique({
    where: { id: livestreamId },
    include: livestreamInclude,
  });

  if (!livestream) {
    throw new Error("Livestream not found");
  }

  if (livestream.status !== "LIVE") {
    throw new Error("Livestream has ended");
  }

  const roomName = `livestream-${livestreamId}`;

  // Get user info for token name
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });

  const participantName = user
    ? `${user.firstName} ${user.lastName}`
    : "Viewer";

  // Check if this user is the host
  const isHost = livestream.userId === userId;

  // Generate viewer token (subscribe-only unless host is rejoining)
  const token = await generateToken(
    roomName,
    userId,
    participantName,
    isHost
  );

  // Increment viewer count
  await prisma.livestream.update({
    where: { id: livestreamId },
    data: { viewerCount: { increment: 1 } },
  });

  return {
    ...livestream,
    token,
    livekitUrl: livekitHost,
    roomName,
  };
};

// End a livestream (only host can end)
export const endLivestream = async (
  livestreamId: string,
  userId: string
) => {
  const livestream = await prisma.livestream.findUnique({
    where: { id: livestreamId },
    select: { userId: true, status: true },
  });

  if (!livestream) {
    throw new Error("Livestream not found");
  }

  if (livestream.userId !== userId) {
    throw new Error("Not authorized to end this livestream");
  }

  if (livestream.status === "ENDED") {
    throw new Error("Livestream has already ended");
  }

  const roomName = `livestream-${livestreamId}`;

  // Delete the LiveKit room (kicks all participants)
  try {
    await roomService.deleteRoom(roomName);
  } catch (error) {
    // Room might already be gone if everyone left
    console.error("Error deleting LiveKit room:", error);
  }

  // Update database
  const updated = await prisma.livestream.update({
    where: { id: livestreamId },
    data: {
      status: "ENDED",
      endedAt: new Date(),
    },
    include: livestreamInclude,
  });

  return updated;
};

// Get all active livestreams
export const getActiveLivestreams = async () => {
  const livestreams = await prisma.livestream.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    include: livestreamInclude,
  });

  return livestreams;
};

// Get a single livestream by ID
export const getLivestreamById = async (livestreamId: string) => {
  const livestream = await prisma.livestream.findUnique({
    where: { id: livestreamId },
    include: livestreamInclude,
  });

  if (!livestream) {
    throw new Error("Livestream not found");
  }

  return livestream;
};

// Handle LiveKit webhook events
export const handleWebhookEvent = async (event: any) => {
  const { event: eventType, room, participant } = event;

  if (!room?.name?.startsWith("livestream-")) return;

  const livestreamId = room.name.replace("livestream-", "");

  switch (eventType) {
    case "participant_joined":
      await prisma.livestream.update({
        where: { id: livestreamId },
        data: { viewerCount: { increment: 1 } },
      }).catch(() => {});
      break;

    case "participant_left":
      await prisma.livestream.update({
        where: { id: livestreamId },
        data: { viewerCount: { decrement: 1 } },
      }).catch(() => {});
      break;

    case "room_finished":
      await prisma.livestream.update({
        where: { id: livestreamId },
        data: {
          status: "ENDED",
          endedAt: new Date(),
          viewerCount: 0,
        },
      }).catch(() => {});
      break;
  }
};