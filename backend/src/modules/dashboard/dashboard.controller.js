import { getDashboardOverview } from "./dashboard.service.js";

export const getDashboard = async (req, res) => {
  try {
    const data = await getDashboardOverview(req.user);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to load dashboard",
    });
  }
};
