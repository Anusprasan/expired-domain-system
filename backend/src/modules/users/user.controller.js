import {
  changeUserGroupService,
  changeUserStatusService,
  createUserService,
  deleteUserService,
  getUserByIdService,
  getUsersService,
  updateUserService,
} from "./user.service.js";

export const createUser = async (req, res) => {
  try {
    const user = await createUserService(req.body);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUsers = async (req, res) => {
  const users = await getUsersService();
  return res.json({ success: true, data: users });
};

export const getUser = async (req, res) => {
  try {
    const user = await getUserByIdService(req.params.id);
    return res.json({ success: true, data: user });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const user = await updateUserService(req.params.id, req.body);
    return res.json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const changeUserGroup = async (req, res) => {
  try {
    const user = await changeUserGroupService(req.params.id, req.body.groupId, req.user._id);
    return res.json({
      success: true,
      message: "User group changed successfully",
      data: user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const changeUserStatus = async (req, res) => {
  try {
    const user = await changeUserStatusService(req.params.id, req.body.status, req.user._id);
    return res.json({
      success: true,
      message: "User status updated successfully",
      data: user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    await deleteUserService(req.params.id, req.user._id);
    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
