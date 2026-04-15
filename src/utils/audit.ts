import prisma from "@/utils/prisma";
import { Request } from "express";

export const logAdminAction = async (
  req: Request,
  action: string,
  target?: string,
  metadata?: Record<string, any>,
) => {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: req.user!.id,
        action,
        target,
        metadata: metadata ?? undefined,
        ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null,
      },
    });
  } catch (error) {
    console.error("Failed to log admin action:", error);
  }
};