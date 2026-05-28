const express = require("express");
const {
  assignSite,
  clearCaptureImageStore,
  captureAssigned,
  captureLive,
  getCaptureImage,
  getCaptureImageStorage,
  getScheduleItem,
  getScannerStatusItem,
  listSites,
  removeSite,
  updateScheduleItem,
} = require("./screenshotTaker.controller");

const router = express.Router();

router.get("/sites", listSites);
router.post("/sites", assignSite);
router.delete("/sites/:siteId", removeSite);
router.post("/sites/:siteId/capture", captureAssigned);
router.post("/captures/live", captureLive);
router.get("/captures/images/storage", getCaptureImageStorage);
router.post("/captures/images/clear", clearCaptureImageStore);
router.delete("/captures/images", clearCaptureImageStore);
router.get("/captures/:captureId/image", getCaptureImage);
router.get("/schedule", getScheduleItem);
router.put("/schedule", updateScheduleItem);
router.get("/status", getScannerStatusItem);

module.exports = router;
