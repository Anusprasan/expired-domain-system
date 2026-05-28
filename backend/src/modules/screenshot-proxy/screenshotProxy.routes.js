import express from "express";
import { requireAuth } from "../../app/middleware/auth.middleware.js";
import { proxyScreenshotRequest } from "./screenshotProxy.controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(proxyScreenshotRequest);

export default router;
