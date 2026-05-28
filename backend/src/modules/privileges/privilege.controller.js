import {
  createPrivilegeService,
  deletePrivilegeService,
  getAllPrivilegesService,
  updatePrivilegeService,
} from "./privilege.service.js";

export const getAllPrivileges = async (req, res) => {
  try {
    const privileges = await getAllPrivilegesService();

    return res.json({
      success: true,
      data: privileges,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createPrivilege = async (req, res) => {
  try {
    const privilege = await createPrivilegeService(req.body);

    return res.status(201).json({
      success: true,
      message: "Privilege created successfully",
      data: privilege,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updatePrivilege = async (req, res) => {
  try {
    const privilege = await updatePrivilegeService(req.params.id, req.body);

    return res.json({
      success: true,
      message: "Privilege updated successfully",
      data: privilege,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deletePrivilege = async (req, res) => {
  try {
    await deletePrivilegeService(req.params.id);

    return res.json({
      success: true,
      message: "Privilege deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
