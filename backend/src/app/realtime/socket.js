import http from "http";
import { Server } from "socket.io";
import User from "../../modules/users/user.model.js";
import { verifyToken } from "../utils/jwt.js";
import { bulkUpdateMoneySiteStatusesService } from "../../modules/money-sites/moneySite.service.js";
import { sendMoneySiteBlockedPushNotifications } from "../../modules/money-sites/moneySitePush.service.js";
import { MONEY_SITE_ACCESS_PRIVILEGES } from "../../modules/money-sites/moneySite.constants.js";

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasMoneySiteAccess(user) {
  const privilegeKeys = getPrivilegeKeys(user);
  return MONEY_SITE_ACCESS_PRIVILEGES.some((privilegeKey) => privilegeKeys.includes(privilegeKey));
}

async function emitMoneySiteEventToAuthorizedSockets(io, eventName, payload) {
  const moneySiteNamespace = io.of("/money-sites");
  const sockets = [...moneySiteNamespace.sockets.values()];

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
      .filter((user) => hasMoneySiteAccess(user))
      .map((user) => String(user._id))
  );

  sockets.forEach((socket) => {
    const socketUserId = String(socket?.data?.user?.id || "").trim();

    if (!socketUserId) {
      socket.disconnect(true);
      return;
    }

    if (!authorizedUserIds.has(socketUserId)) {
      socket.emit("money-sites:forbidden", {
        message: "You do not have permission to receive money-site live updates.",
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

async function authenticateAppSocket(socket, next) {
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

    if (!hasMoneySiteAccess(user)) {
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
  const checkerNamespace = io.of("/money-sites-checker");
  const emitAuthorizedMoneySiteEvent = async (eventName, payload) => {
    await emitMoneySiteEventToAuthorizedSockets(io, eventName, payload);
  };

  moneySiteNamespace.use(authenticateAppSocket);
  moneySiteNamespace.on("connection", (socket) => {
    socket.emit("money-sites:connected", {
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
  return io;
}
