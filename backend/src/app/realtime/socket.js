import http from "http";
import { Server } from "socket.io";
import User from "../../modules/users/user.model.js";
import { verifyToken } from "../utils/jwt.js";
import { bulkUpdateMoneySiteStatusesService } from "../../modules/money-sites/moneySite.service.js";
import { sendMoneySiteBlockedPushNotifications } from "../../modules/money-sites/moneySitePush.service.js";
import { MONEY_SITE_ACCESS_PRIVILEGES } from "../../modules/money-sites/moneySite.constants.js";
import { EXPIRED_DOMAIN_ACCESS_PRIVILEGES } from "../../modules/expired-domains/expiredDomain.constants.js";
import { WAYBACK_CHECKER_ACCESS_PRIVILEGES } from "../../modules/wayback-checker/waybackChecker.constants.js";

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasAnyAccessPrivilege(user, accessPrivileges = []) {
  const groupName = user?.groupId?.name?.toLowerCase();
  const privilegeKeys = getPrivilegeKeys(user);

  return groupName === "admin"
    || privilegeKeys.includes("ADMIN_ACCESS")
    || accessPrivileges.some((privilegeKey) => privilegeKeys.includes(privilegeKey));
}

async function emitEventToAuthorizedSockets({
  io,
  namespaceName,
  eventName,
  payload,
  accessPrivileges,
  forbiddenEventName,
  forbiddenMessage,
}) {
  const namespace = io.of(namespaceName);
  const sockets = [...namespace.sockets.values()];

  if (!sockets.length) {
    return;
  }

  const userIds = [...new Set(
    sockets
      .map((socket) => String(socket?.data?.user?.id || "").trim())
      .filter(Boolean)
  )];

  if (!userIds.length) {
    return;
  }

  const users = await User.find({
    _id: { $in: userIds },
    status: "active",
  }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  const authorizedUserIds = new Set(
    users
      .filter((user) => hasAnyAccessPrivilege(user, accessPrivileges))
      .map((user) => String(user._id))
  );

  sockets.forEach((socket) => {
    const socketUserId = String(socket?.data?.user?.id || "").trim();

    if (!socketUserId) {
      socket.disconnect(true);
      return;
    }

    if (!authorizedUserIds.has(socketUserId)) {
      socket.emit(forbiddenEventName, {
        message: forbiddenMessage,
      });
      socket.disconnect(true);
      return;
    }

    socket.emit(eventName, payload);
  });
}

function getSocketToken(socket) {
  const authToken = String(socket.handshake.auth?.token || "").trim();

  if (authToken) {
    return authToken.replace(/^Bearer\s+/i, "").trim();
  }

  const authorizationHeader = String(socket.handshake.headers?.authorization || "").trim();

  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return "";
}

function authenticateAppSocket(accessPrivileges = []) {
  return async function authenticateNamespaceSocket(socket, next) {
    try {
      const token = getSocketToken(socket);

      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).populate({
        path: "groupId",
        populate: { path: "privilegeIds" },
      });

      if (!user || user.status !== "active") {
        next(new Error("Unauthorized"));
        return;
      }

      if (!hasAnyAccessPrivilege(user, accessPrivileges)) {
        next(new Error("Forbidden"));
        return;
      }

      socket.data.user = {
        id: String(user._id),
        email: user.email,
      };

      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  };
}

async function emitMoneySiteEventToAuthorizedSockets(io, eventName, payload) {
  await emitEventToAuthorizedSockets({
    io,
    namespaceName: "/money-sites",
    eventName,
    payload,
    accessPrivileges: MONEY_SITE_ACCESS_PRIVILEGES,
    forbiddenEventName: "money-sites:forbidden",
    forbiddenMessage: "You do not have permission to receive money-site live updates.",
  });
}

async function emitExpiredDomainEventToAuthorizedSockets(io, eventName, payload) {
  await emitEventToAuthorizedSockets({
    io,
    namespaceName: "/expired-domains",
    eventName,
    payload,
    accessPrivileges: EXPIRED_DOMAIN_ACCESS_PRIVILEGES,
    forbiddenEventName: "expired-domains:forbidden",
    forbiddenMessage: "You do not have permission to receive expired-domain live updates.",
  });
}

async function emitWaybackCheckerEventToAuthorizedSockets(io, eventName, payload) {
  await emitEventToAuthorizedSockets({
    io,
    namespaceName: "/wayback-checker",
    eventName,
    payload,
    accessPrivileges: WAYBACK_CHECKER_ACCESS_PRIVILEGES,
    forbiddenEventName: "wayback-checker:forbidden",
    forbiddenMessage: "You do not have permission to receive WayBack checker live updates.",
  });
}

function authenticateCheckerSocket(socket, next) {
  const expectedApiKey = String(process.env.CHECKER_API_KEY || "-").trim();
  const receivedApiKey = String(
    socket.handshake.auth?.apiKey
    || socket.handshake.headers?.["x-api-key"]
    || ""
  ).trim();

  if (!receivedApiKey || receivedApiKey !== expectedApiKey) {
    next(new Error("Unauthorized"));
    return;
  }

  next();
}

export function createRealtimeHttpServer(app) {
  return http.createServer(app);
}

export function attachRealtimeServer(server, app) {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  const moneySiteNamespace = io.of("/money-sites");
  const expiredDomainNamespace = io.of("/expired-domains");
  const waybackCheckerNamespace = io.of("/wayback-checker");
  const checkerNamespace = io.of("/money-sites-checker");
  const emitAuthorizedMoneySiteEvent = async (eventName, payload) => {
    await emitMoneySiteEventToAuthorizedSockets(io, eventName, payload);
  };
  const emitAuthorizedExpiredDomainEvent = async (eventName, payload) => {
    await emitExpiredDomainEventToAuthorizedSockets(io, eventName, payload);
  };
  const emitAuthorizedWaybackCheckerEvent = async (eventName, payload) => {
    await emitWaybackCheckerEventToAuthorizedSockets(io, eventName, payload);
  };

  moneySiteNamespace.use(authenticateAppSocket(MONEY_SITE_ACCESS_PRIVILEGES));
  moneySiteNamespace.on("connection", (socket) => {
    socket.emit("money-sites:connected", {
      connectedAt: new Date().toISOString(),
    });
  });

  expiredDomainNamespace.use(authenticateAppSocket(EXPIRED_DOMAIN_ACCESS_PRIVILEGES));
  expiredDomainNamespace.on("connection", (socket) => {
    socket.emit("expired-domains:connected", {
      connectedAt: new Date().toISOString(),
    });
  });

  waybackCheckerNamespace.use(authenticateAppSocket(WAYBACK_CHECKER_ACCESS_PRIVILEGES));
  waybackCheckerNamespace.on("connection", (socket) => {
    socket.emit("wayback-checker:connected", {
      connectedAt: new Date().toISOString(),
    });
  });

  checkerNamespace.use(authenticateCheckerSocket);
  checkerNamespace.on("connection", (socket) => {
    socket.emit("checker:connected", {
      connectedAt: new Date().toISOString(),
    });

    socket.on("money-sites:bulk-update", async (payload = {}, callback) => {
      try {
        const result = await bulkUpdateMoneySiteStatusesService(payload);
        const eventPayload = {
          updatedIds: result.updatedIds,
          newlyBlockedDomains: result.newlyBlockedDomains,
          success: result.success,
          failed: result.failed,
          source: "socket",
          scanId: result.scanId,
          batchId: result.batchId,
          batchNumber: result.batchNumber,
          totalBatches: result.totalBatches,
          isComplete: result.isComplete,
          summary: result.summary,
          totalDomains: result.totalDomains,
          blockedDomains: result.blockedDomains,
        };

        await emitAuthorizedMoneySiteEvent("money-sites:status-updated", eventPayload);
        if (result.newlyBlockedDomains.length) {
          void sendMoneySiteBlockedPushNotifications(result.newlyBlockedDomains);
        }

        if (result.isComplete) {
          await emitAuthorizedMoneySiteEvent("money-sites:bulk-check-complete", eventPayload);
        }

        if (typeof callback === "function") {
          callback({
            success: true,
            message: result.isComplete ? "Bulk update completed" : "Batch update processed",
            data: result,
          });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            success: false,
            message: error.message || "Failed to process bulk update",
          });
        }
      }
    });
  });

  app.set("io", io);
  app.set("emitMoneySiteRealtimeEvent", emitAuthorizedMoneySiteEvent);
  app.set("emitExpiredDomainRealtimeEvent", emitAuthorizedExpiredDomainEvent);
  app.set("emitWaybackCheckerRealtimeEvent", emitAuthorizedWaybackCheckerEvent);
  return io;
}
