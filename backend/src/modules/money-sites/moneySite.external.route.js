import express from "express";
import {
  bulkUpdateMoneySiteStatuses,
  getMoneySiteUrls,
} from "./moneySite.controller.js";

const router = express.Router();

function requireExternalCheckerKey(req, res, next) {
  const checkerApiKey = process.env.CHECKER_API_KEY || "-";
  const apiKey = req.header("X-API-Key");

  if (!apiKey || apiKey !== checkerApiKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: invalid API key",
    });
  }

  return next();
}

router.get("/", requireExternalCheckerKey, getMoneySiteUrls);
router.post("/bulk-update", requireExternalCheckerKey, bulkUpdateMoneySiteStatuses);

export { requireExternalCheckerKey };
export default router;
