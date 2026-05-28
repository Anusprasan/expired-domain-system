import bcrypt from "bcryptjs";
import User from "./user.model.js";
import Group from "../groups/group.model.js";

const isProtectedGroup = (group) => Boolean(group?.isProtected);
const isProtectedGroupUser = (user) => Boolean(user?.groupId?.isProtected);

export const isAdminUser = (user) => {
  const groupName = user?.groupId?.name?.toLowerCase();
  const privilegeKeys = user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];

  return groupName === "admin" || privilegeKeys.includes("ADMIN_ACCESS");
};

const getUserWithGroupPrivileges = async (id) =>
  User.findById(id).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

const getGroupWithPrivileges = async (id) =>
  Group.findById(id).populate("privilegeIds");

const getActiveAdminCount = async () => {
  const users = await User.find({ status: "active" }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  return users.filter((user) => isAdminUser(user)).length;
};

export const createUserService = async ({
  fullName,
  email,
  password,
  groupId,
}) => {
  const exists = await User.findOne({ email: email.toLowerCase() });

  if (exists) {
    throw new Error("Email already exists");
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new Error("Selected group not found");
  }

  if (isProtectedGroup(group)) {
    throw new Error("Users cannot be created in the System administrators group");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    groupId,
  });

  return user;
};

export const getUsersService = async () => {
  return User.find().populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });
};

export const getUserByIdService = async (id) => {
  const user = await getUserWithGroupPrivileges(id);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};

export const updateUserService = async (id, payload) => {
  const user = await getUserWithGroupPrivileges(id);

  if (!user) {
    throw new Error("User not found");
  }

  if (isProtectedGroupUser(user)) {
    throw new Error("Users in the System administrators group cannot be edited");
  }

  if (payload.fullName) user.fullName = payload.fullName;
  if (payload.email) user.email = payload.email.toLowerCase();

  await user.save();
  return user;
};

export const changeUserGroupService = async (id, groupId, currentUserId) => {
  if (id === String(currentUserId)) {
    throw new Error("You cannot change your own group");
  }

  const user = await getUserWithGroupPrivileges(id);
  if (!user) throw new Error("User not found");

  const group = await getGroupWithPrivileges(groupId);
  if (!group) throw new Error("Target group not found");

  if (isProtectedGroupUser(user)) {
    throw new Error("Users in the System administrators group cannot be moved to another group");
  }

  if (isProtectedGroup(group)) {
    throw new Error("Users cannot be assigned to the System administrators group");
  }

  const isLosingAdminAccess = isAdminUser(user) && !isAdminUser({ groupId: group });

  if (isLosingAdminAccess && user.status === "active") {
    const activeAdminCount = await getActiveAdminCount();

    if (activeAdminCount < 2) {
      throw new Error("Admin can't change the group unless there are at least two active admins");
    }
  }

  user.groupId = groupId;
  await user.save();

  return user;
};

export const changeUserStatusService = async (id, status, currentUserId) => {
  if (status === "inactive" && id === String(currentUserId)) {
    throw new Error("You cannot deactivate your own account");
  }

  const user = await getUserWithGroupPrivileges(id);
  if (!user) throw new Error("User not found");

  if (isProtectedGroupUser(user)) {
    throw new Error("Users in the System administrators group cannot have their status changed");
  }

  if (status === "inactive" && isAdminUser(user)) {
    const activeAdminCount = await getActiveAdminCount();

    if (activeAdminCount <= 1 && user.status === "active") {
      throw new Error("You cannot deactivate the only active admin user");
    }
  }

  user.status = status;
  await user.save();

  return user;
};

export const deleteUserService = async (id, currentUserId) => {
  if (id === String(currentUserId)) {
    throw new Error("You cannot delete your own account");
  }

  const user = await getUserWithGroupPrivileges(id);
  if (!user) {
    throw new Error("User not found");
  }

  if (isProtectedGroupUser(user)) {
    throw new Error("Users in the System administrators group cannot be deleted");
  }

  if (isAdminUser(user) && user.status === "active") {
    const activeAdminCount = await getActiveAdminCount();

    if (activeAdminCount <= 1) {
      throw new Error("You cannot delete the only active admin user");
    }
  }

  await user.deleteOne();
};
