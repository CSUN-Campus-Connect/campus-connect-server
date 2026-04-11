import { Request, Response, NextFunction } from "express";
import prisma from "@/utils/prisma";

export const getUserPermissions = async (userId: string): Promise<string[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
    },
  });

  const permissions = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      permissions.add(rp.permission);
    }
  }
  return Array.from(permissions);
};

export const getUserDepartmentScopes = async (userId: string): Promise<(string | null)[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: { departmentScope: true },
  });
  return userRoles.map((ur) => ur.departmentScope);
};

export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const permissions = await getUserPermissions(user.id);

      const hasPermission = requiredPermissions.some((p) => permissions.includes(p));
      if (!hasPermission) {
        res.status(403).json({
          error: "Insufficient permissions",
          required: requiredPermissions,
        });
        return;
      }

      (req as any).permissions = permissions;
      next();
    } catch (error) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
};

export const requireAnyPermission = requirePermission;

export const requireAllPermissions = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const permissions = await getUserPermissions(user.id);

      const hasAll = requiredPermissions.every((p) => permissions.includes(p));
      if (!hasAll) {
        res.status(403).json({
          error: "Insufficient permissions",
          required: requiredPermissions,
          missing: requiredPermissions.filter((p) => !permissions.includes(p)),
        });
        return;
      }

      (req as any).permissions = permissions;
      next();
    } catch (error) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const permissions = await getUserPermissions(user.id);
    if (permissions.length === 0) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    (req as any).permissions = permissions;
    next();
  } catch (error) {
    res.status(500).json({ error: "Permission check failed" });
  }
};