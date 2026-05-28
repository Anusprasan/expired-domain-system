import {
  createGroupService,
  deleteGroupService,
  getAllGroupsService,
  getGroupByIdService,
  updateGroupService,
} from "./group.service.js";

export const createGroup = async (req, res) => {
  try {
    const group = await createGroupService(req.body);

    return res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: group,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getGroups = async (req, res) => {
  const groups = await getAllGroupsService();
  return res.json({ success: true, data: groups });
};

export const getGroup = async (req, res) => {
  try {
    const group = await getGroupByIdService(req.params.id);
    return res.json({ success: true, data: group });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const group = await updateGroupService(req.params.id, req.body);
    return res.json({
      success: true,
      message: "Group updated successfully",
      data: group,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    await deleteGroupService(req.params.id, req.body.targetGroupId);
    return res.json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
