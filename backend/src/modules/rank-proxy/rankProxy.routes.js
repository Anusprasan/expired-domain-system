import express from "express";
import { requireAuth } from "../../app/middleware/auth.middleware.js";
import { proxyRankRequest } from "./rankProxy.controller.js";

const router = express.Router();

router.use(requireAuth);
router.all("/", proxyRankRequest);
router.all("/*", proxyRankRequest);

export default router;
