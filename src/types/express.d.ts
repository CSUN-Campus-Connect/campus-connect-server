// Typescript definition for user (authentication)

import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, "passwordHashed"> & { sessionId?: string };
    }
  }
}

export {};