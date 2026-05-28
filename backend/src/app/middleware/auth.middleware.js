import User from "../../modules/users/user.model.js";
import { verifyToken } from "../utils/jwt.js";

const getUserPrivilegeKeys = (user) => {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
};

const hasAdminAccessForUser = (user) => {
  const groupName = user?.groupId?.name?.toLowerCase();
  const userPrivileges = getUserPrivilegeKeys(user);

  return groupName === "admin" || userPrivileges.includes("ADMIN_ACCESS");
};

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).populate({
      path: "groupId",
      populate: { path: "privilegeIds" },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    req.user = user;
    if (!req.user._id && user.id) {
      req.user._id = user.id;
    }
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const requireAuthFromHeaderOrQuery = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : String(req.query.token || "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).populate({
      path: "groupId",
      populate: { path: "privilegeIds" },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const requirePrivilege = (privilegeKey) => {
  return (req, res, next) => {
    const userPrivileges = getUserPrivilegeKeys(req.user);

    if (hasAdminAccessForUser(req.user)) {
      return next();
    }

    if (!userPrivileges.includes(privilegeKey)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

export const requireAnyPrivilege = (privilegeKeys = []) => {
  return (req, res, next) => {
    const userPrivileges = getUserPrivilegeKeys(req.user);

    if (hasAdminAccessForUser(req.user)) {
      return next();
    }

    if (!privilegeKeys.some((privilegeKey) => userPrivileges.includes(privilegeKey))) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

export const requireAdminAccess = (req, res, next) => {
  if (hasAdminAccessForUser(req.user)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Administrator access is required",
  });
};
