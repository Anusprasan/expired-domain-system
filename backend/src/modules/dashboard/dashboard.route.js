import express from "express";
import { requireAuth } from "../../app/middleware/auth.middleware.js";
import { getDashboard } from "./dashboard.controller.js";

const router = express.Router();

router.use(requireAuth);
router.get("/", getDashboard);

export default router;
