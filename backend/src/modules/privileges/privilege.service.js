import Group from "../groups/group.model.js";
import Privilege from "./privilege.model.js";
import { privilegeCatalog } from "./privilege.catalog.js";

const SYSTEM_PRIVILEGE_KEYS = new Set(privilegeCatalog.map((privilege) => privilege.key));

const formatPrivilegeKey = (key) => key.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
const formatPrivilegeName = (name) => name.trim().replace(/\s+/g, " ");
const formatPrivilegeModule = (module) => module.trim().replace(/\s+/g, " ").toLowerCase();

const ensurePrivilegePayload = ({ key, name, module }) => {
  if (!formatPrivilegeKey(key)) {
    throw new Error("Privilege key is required");
  }

  if (!formatPrivilegeName(name)) {
    throw new Error("Privilege name is required");
  }

  if (!formatPrivilegeModule(module)) {
    throw new Error("Privilege module is required");
  }
};

const enrichPrivilege = async (privilege) => {
  const assignedGroups = await Group.countDocuments({ privilegeIds: privilege._id });

  return {
    ...privilege.toObject(),
    isSystem: Boolean(privilege.isSystem) || SYSTEM_PRIVILEGE_KEYS.has(privilege.key),
    assignedGroupCount: assignedGroups,
  };
};

export const getAllPrivilegesService = async () => {
  const privileges = await Privilege.find().sort({ key: 1 });
  return Promise.all(privileges.map((privilege) => enrichPrivilege(privilege)));
};

export const createPrivilegeService = async ({ key, name, description, module }) => {
  ensurePrivilegePayload({ key, name, module });

  const formattedKey = formatPrivilegeKey(key);
  const existingPrivilege = await Privilege.findOne({ key: formattedKey });

  if (existingPrivilege) {
    throw new Error("Privilege key already exists");
  }

  const privilege = await Privilege.create({
    key: formattedKey,
    name: formatPrivilegeName(name),
    description: description?.trim() || "",
    module: formatPrivilegeModule(module),
    isSystem: false,
  });

  return enrichPrivilege(privilege);
};

export const updatePrivilegeService = async (id, payload) => {
  const privilege = await Privilege.findById(id);

  if (!privilege) {
    throw new Error("Privilege not found");
  }

  if (Boolean(privilege.isSystem) || SYSTEM_PRIVILEGE_KEYS.has(privilege.key)) {
    throw new Error("System privileges cannot be edited");
  }

  ensurePrivilegePayload(payload);

  const formattedKey = formatPrivilegeKey(payload.key);
  const existingPrivilege = await Privilege.findOne({
    key: formattedKey,
    _id: { $ne: id },
  });

  if (existingPrivilege) {
    throw new Error("Privilege key already exists");
  }

  privilege.key = formattedKey;
  privilege.name = formatPrivilegeName(payload.name);
  privilege.description = payload.description?.trim() || "";
  privilege.module = formatPrivilegeModule(payload.module);

  await privilege.save();
  return enrichPrivilege(privilege);
};

export const deletePrivilegeService = async (id) => {
  const privilege = await Privilege.findById(id);

  if (!privilege) {
    throw new Error("Privilege not found");
  }

  if (Boolean(privilege.isSystem) || SYSTEM_PRIVILEGE_KEYS.has(privilege.key)) {
    throw new Error("System privileges cannot be deleted");
  }

  const assignedGroups = await Group.countDocuments({ privilegeIds: id });

  if (assignedGroups > 0) {
    throw new Error("Remove this privilege from assigned groups before deleting it");
  }

  await privilege.deleteOne();
};
