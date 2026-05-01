import prisma from "@/utils/prisma";

export const getPermissionsForUser = async (userId: string) => {
  const { getUserPermissions, getUserDepartmentScopes } = await import("@/middleware/permission.middleware");
  const permissions = await getUserPermissions(userId);
  const scopes = await getUserDepartmentScopes(userId);

  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { id: true, name: true } } },
  });

  return { permissions, scopes, roles };
};

export const getAllRoles = async () => {
  return prisma.role.findMany({
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
};

export const createNewRole = async (name: string, description: string | null, permissions: string[]) => {
  return prisma.role.create({
    data: {
      name,
      description,
      permissions: { create: permissions.map((p: string) => ({ permission: p })) },
    },
    include: { permissions: { select: { permission: true } } },
  });
};

export const updateExistingRole = async (id: string, name?: string, description?: string, permissions?: string[]) => {
  await prisma.$transaction(async (tx) => {
    if (permissions && Array.isArray(permissions)) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissions.map((p: string) => ({ roleId: id, permission: p })),
      });
    }
    await tx.role.update({
      where: { id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
    });
  });

  return prisma.role.findUnique({
    where: { id },
    include: { permissions: { select: { permission: true } } },
  });
};

export const findRoleById = async (id: string) => {
  return prisma.role.findUnique({ where: { id } });
};

export const findRoleByName = async (name: string) => {
  return prisma.role.findUnique({ where: { name } });
};

export const deleteRoleById = async (id: string) => {
  return prisma.role.delete({ where: { id } });
};

export const getUsers = async (search: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        userType: true, isVerified: true, profilePicture: true,
        createdAt: true, lastActiveAt: true,
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
};

export const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      userType: true, isVerified: true, profilePicture: true,
      bio: true, city: true, createdAt: true, lastActiveAt: true,
      roles: { include: { role: { select: { id: true, name: true } } } },
      student: true, faculty: true, alumni: true,
      _count: { select: { Post: true, clubMemberships: true, marketplaceListings: true } },
    },
  });

  if (!user) return null;

  const violations = await prisma.userViolation.findMany({
    where: { userId: id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return { ...user, violations };
};

export const assignRoleToUser = async (userId: string, roleId: string, grantedById: string, departmentScope?: string, expiresAt?: string) => {
  return prisma.userRole.create({
    data: {
      userId,
      roleId,
      departmentScope: departmentScope || null,
      grantedById,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
};

export const findUserRole = async (userId: string, roleId: string, departmentScope?: string) => {
  return prisma.userRole.findFirst({
    where: { userId, roleId, departmentScope: departmentScope || null },
  });
};

export const revokeUserRole = async (userRoleId: string) => {
  return prisma.userRole.delete({ where: { id: userRoleId } });
};

export const findUserRoleWithName = async (userId: string, roleId: string) => {
  return prisma.userRole.findFirst({
    where: { userId, roleId },
    include: { role: { select: { name: true } } },
  });
};

export const createSuspension = async (userId: string, issuedById: string, reason: string, durationDays?: number) => {
  const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
  return prisma.userViolation.create({
    data: {
      userId,
      type: expiresAt ? "TEMPORARY_SUSPENSION" : "PERMANENT_BAN",
      reason,
      issuedById,
      expiresAt,
    },
  });
};

export const liftSuspension = async (userId: string) => {
  return prisma.userViolation.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
};

export const getAuditLogs = async (action: string | undefined, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where = action ? { action: { contains: action } } : {};

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { logs, total };
};

// PATCH: replace getAnalytics in src/services/admin.service.ts (or wherever it lives)
// Only this function changes — everything else in the file stays the same.

export const getAnalytics = async (from?: string, to?: string) => {
  const now = new Date();
  const rangeStart = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rangeEnd = to ? new Date(to) : now;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dateFilter = { createdAt: { gte: rangeStart, lte: rangeEnd } };

  const [
    totalUsers,
    verifiedUsers,
    nonVerifiedUsers,
    newUsersInRange,
    newUsersWeek,
    totalPosts,
    totalClubs,
    totalListings,
    activeListings,
    totalEvents,
    usersByType,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isVerified: true } }),
    prisma.user.count({ where: { isVerified: false } }),
    prisma.user.count({ where: dateFilter }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.post.count(),
    prisma.club.count(),
    prisma.marketplaceListing.count(),
    prisma.marketplaceListing.count({ where: { status: "active" } }),
    prisma.event.count(),
    prisma.user.groupBy({ by: ["userType"], _count: true }),
  ]);

  return {
    users: {
      total: totalUsers,
      verified: verifiedUsers,
      nonVerified: nonVerifiedUsers,
      newInRange: newUsersInRange,
      newThisWeek: newUsersWeek,
      // keep newThisMonth for backwards compat with dashboard page
      newThisMonth: newUsersInRange,
      byType: Object.fromEntries(usersByType.map((u) => [u.userType, u._count])),
    },
    content: { posts: totalPosts, clubs: totalClubs, events: totalEvents },
    marketplace: { totalListings, activeListings },
    range: { from: rangeStart.toISOString(), to: rangeEnd.toISOString() },
  };
};

export const getBugs = async () => {
  return prisma.bugReport.findMany({
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
};

export const getClubs = async (search: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
  const [clubs, total] = await Promise.all([
    prisma.club.findMany({
      where,
      include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }, _count: { select: { members: true, events: true, joinRequests: true } } },
      orderBy: { createdAt: "desc" }, skip, take: limit,
    }),
    prisma.club.count({ where }),
  ]);
  return { clubs, total };
};

export const deleteClub = async (id: string) => {
  return prisma.club.delete({ where: { id } });
};

export const getListings = async (search: string, status: string | undefined, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  if (status) where.status = status;
  if (search) where.title = { contains: search, mode: "insensitive" };
  const [listings, total] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where,
      include: { seller: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" }, skip, take: limit,
    }),
    prisma.marketplaceListing.count({ where }),
  ]);
  return { listings, total };
};

export const removeListing = async (id: string) => {
  return prisma.marketplaceListing.update({ where: { id }, data: { status: "deleted" } });
};

export const getEvents = async (search: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const where = search ? { title: { contains: search, mode: "insensitive" as const } } : {};
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } }, club: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" }, skip, take: limit,
    }),
    prisma.event.count({ where }),
  ]);
  return { events, total };
};

export const deleteEvent = async (id: string) => {
  return prisma.event.delete({ where: { id } });
};

export const getConfigs = async () => {
  return prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
};

export const setConfig = async (key: string, value: any, updatedBy: string) => {
  return prisma.systemConfig.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy },
  });
};

export const getAllAnnouncements = async () => {
  return prisma.announcement.findMany({
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const createNewAnnouncement = async (data: any, authorId: string) => {
  return prisma.announcement.create({
    data: {
      title: data.title,
      body: data.body,
      type: data.type || "INFO",
      audience: data.audience || "ALL",
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      authorId,
    },
  });
};

export const deleteAnnouncementById = async (id: string) => {
  return prisma.announcement.delete({ where: { id } });
};

export const createNotification = async (userId: string, type: string, title: string, body: string, data?: any) => {
  return prisma.notification.create({
    data: { userId, type: type as any, title, body, data },
  });
};

export const findUser = async (id: string) => {
  return prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
};

export const findRole = async (id: string) => {
  return prisma.role.findUnique({ where: { id }, select: { id: true, name: true } });
};

export const findClub = async (id: string) => {
  return prisma.club.findUnique({ where: { id }, select: { id: true, name: true } });
};

export const findListing = async (id: string) => {
  return prisma.marketplaceListing.findUnique({ where: { id }, select: { id: true, title: true } });
};

export const findEvent = async (id: string) => {
  return prisma.event.findUnique({ where: { id }, select: { id: true, title: true } });
};