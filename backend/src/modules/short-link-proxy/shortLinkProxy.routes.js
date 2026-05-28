import express from "express";
import { requireAuth } from "../../app/middleware/auth.middleware.js";
import { proxyShortLinkRequest } from "./shortLinkProxy.controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(proxyShortLinkRequest);

export default router;
