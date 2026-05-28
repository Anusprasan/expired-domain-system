import Group from "./group.model.js";
import User from "../users/user.model.js";
import Privilege from "../privileges/privilege.model.js";

const formatGroupName = (name) => name.trim().replace(/\s+/g, " ");
const normalizeGroupName = (name) => formatGroupName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
const ensurePrivilegesSelected = (privilegeIds) => {
  if (!Array.isArray(privilegeIds) || privilegeIds.length === 0) {
    throw new Error("At least one privilege must be assigned to a group");
  }
};

const normalizePrivilegeIds = async (privilegeIds) => {
  ensurePrivilegesSelected(privilegeIds);

  const privileges = await Privilege.find({
    _id: { $in: privilegeIds },
  }).select("_id key");

  const adminPrivilege = privileges.find((privilege) => privilege.key === "ADMIN_ACCESS");

  if (!adminPrivilege) {
    return privilegeIds;
  }

  const allPrivileges = await Privilege.find().select("_id");
  return allPrivileges.map((privilege) => privilege._id);
};

const findGroupNameConflict = async (name, excludeId = null) => {
  const normalizedName = normalizeGroupName(name);
  const groups = await Group.find(excludeId ? { _id: { $ne: excludeId } } : {}).select("name");

  return groups.find((group) => normalizeGroupName(group.name) === normalizedName);
};

export const createGroupService = async ({ name, description, privilegeIds }) => {
  const formattedName = formatGroupName(name);
  const exists = await findGroupNameConflict(formattedName);

  if (exists) {
    throw new Error("Group name already exists");
  }

  const normalizedPrivilegeIds = await normalizePrivilegeIds(privilegeIds);

  const group = await Group.create({
    name: formattedName,
    description: description || "",
    privilegeIds: normalizedPrivilegeIds,
  });

  return group;
};

export const getAllGroupsService = async () => {
  return Group.find().populate("privilegeIds").sort({ createdAt: -1 });
};

export const getGroupByIdService = async (id) => {
  const group = await Group.findById(id).populate("privilegeIds");

  if (!group) {
    throw new Error("Group not found");
  }

  return group;
};

export const updateGroupService = async (id, payload) => {
  const group = await Group.findById(id);

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.isProtected) {
    throw new Error("Protected group cannot be edited");
  }

  if (payload.name) {
    const formattedName = formatGroupName(payload.name);
    const conflict = await findGroupNameConflict(formattedName, id);

    if (conflict) {
      throw new Error("Group name already exists");
    }

    group.name = formattedName;
  }

  group.description = payload.description ?? group.description;

  if (payload.privilegeIds !== undefined) {
    group.privilegeIds = await normalizePrivilegeIds(payload.privilegeIds);
  }

  await group.save();
  return group;
};

export const deleteGroupService = async (id, targetGroupId) => {
  const group = await Group.findById(id);

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.isProtected) {
    throw new Error("Protected group cannot be deleted");
  }

  const assignedUsers = await User.countDocuments({ groupId: id });

  if (assignedUsers > 0) {
    if (!targetGroupId) {
      throw new Error("Select a target group to transfer assigned users");
    }

    if (String(targetGroupId) === String(id)) {
      throw new Error("Users must be transferred to a different group");
    }

    const targetGroup = await Group.findById(targetGroupId);

    if (!targetGroup) {
      throw new Error("Target transfer group not found");
    }

    if (targetGroup.isProtected) {
      throw new Error("Users cannot be transferred into the System administrators group");
    }

    await User.updateMany({ groupId: id }, { $set: { groupId: targetGroupId } });
  }

  await group.deleteOne();
};
