import { createActivityLog } from "../activity-logs/activityLog.service.js";
import {
  addAuthenticatedUserTelegramBot,
  deleteAuthenticatedUserTelegramBot,
  testAuthenticatedUserTelegramBot,
  updateAuthenticatedUserTelegramBot,
} from "./auth.telegram.service.js";

export const addMyTelegramBot = async (req, res) => {
  try {
    const bot = await addAuthenticatedUserTelegramBot({
      userId: req.user._id,
      payload: req.body,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.add-telegram-bot",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: `Added Telegram bot: ${bot.name}`,
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Telegram bot added successfully",
      data: bot,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateMyTelegramBot = async (req, res) => {
  try {
    const bot = await updateAuthenticatedUserTelegramBot({
      userId: req.user._id,
      botId: req.params.botId,
      payload: req.body,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.update-telegram-bot",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: `Updated Telegram bot: ${bot.name}`,
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Telegram bot updated successfully",
      data: bot,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteMyTelegramBot = async (req, res) => {
  try {
    const bot = await deleteAuthenticatedUserTelegramBot({
      userId: req.user._id,
      botId: req.params.botId,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.delete-telegram-bot",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: `Deleted Telegram bot: ${bot.name}`,
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Telegram bot deleted successfully",
      data: bot,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const testMyTelegramBot = async (req, res) => {
  try {
    const bot = await testAuthenticatedUserTelegramBot({
      userId: req.user._id,
      botId: req.params.botId,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.test-telegram-bot",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: `Sent Telegram bot test: ${bot.name}`,
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Telegram test message sent",
      data: bot,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
