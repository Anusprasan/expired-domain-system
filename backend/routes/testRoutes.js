const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
  "/uploader",
  protect,
  authorizeRoles("uploader"),
  (req, res) => {
    res.json({
      message: "Uploader route accessed",
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }
);

module.exports = router;