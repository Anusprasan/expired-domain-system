import express from "express";
import {
  changeMyPassword,
  getProfile,
  login,
  me,
  updateProfile,
} from "./auth.controller.js";
import {
  addMyTelegramBot,
  deleteMyTelegramBot,
  testMyTelegramBot,
  updateMyTelegramBot,
} from "./auth.telegram.controller.js";
import { requireAuth } from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", requireAuth, me);
router.get("/profile", requireAuth, getProfile);
router.patch("/profile", requireAuth, updateProfile);
router.patch("/profile/password", requireAuth, changeMyPassword);
router.post("/profile/telegram-bots", requireAuth, addMyTelegramBot);
router.patch("/profile/telegram-bots/:botId", requireAuth, updateMyTelegramBot);
router.delete("/profile/telegram-bots/:botId", requireAuth, deleteMyTelegramBot);
router.post("/profile/telegram-bots/:botId/test", requireAuth, testMyTelegramBot);

export default router;
