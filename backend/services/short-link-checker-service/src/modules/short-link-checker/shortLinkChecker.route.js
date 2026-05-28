const express = require("express");
const {
  clearCheckImages,
  checkAllLinks,
  checkLink,
  createLink,
  deleteAllLinks,
  deleteLink,
  getCheckImage,
  getSchedule,
  getStatus,
  getTelegram,
  importLinks,
  listLinks,
  toggleSchedule,
  updateLink,
  updateSchedule,
  updateTelegram,
} = require("./shortLinkChecker.controller");

const router = express.Router();

router.get("/links", listLinks);
router.post("/links", createLink);
router.delete("/links", deleteAllLinks);
router.post("/links/import", importLinks);
router.put("/links/:linkId", updateLink);
router.delete("/links/:linkId", deleteLink);
router.post("/links/:linkId/check", checkLink);
router.post("/checks/run", checkAllLinks);
router.get("/checks/:checkId/image", getCheckImage);
router.post("/checks/images/clear", clearCheckImages);
router.get("/status", getStatus);
router.get("/schedule", getSchedule);
router.put("/schedule", updateSchedule);
router.post("/schedule/toggle", toggleSchedule);
router.get("/telegram", getTelegram);
router.put("/telegram", updateTelegram);

module.exports = router;
