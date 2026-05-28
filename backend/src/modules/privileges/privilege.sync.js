import Group from "../groups/group.model.js";
import { privilegeCatalog } from "./privilege.catalog.js";
import Privilege from "./privilege.model.js";

const SYSTEM_PRIVILEGE_KEYS = privilegeCatalog.map((privilege) => privilege.key);

export const syncSystemPrivileges = async () => {
  for (const privilege of privilegeCatalog) {
    await Privilege.updateOne(
      { key: privilege.key },
      {
        $set: {
          ...privilege,
          isSystem: true,
        },
      },
      { upsert: true }
    );
  }

  const staleSystemPrivileges = await Privilege.find({
    isSystem: true,
    key: { $nin: SYSTEM_PRIVILEGE_KEYS },
  }).select("_id key");

  if (staleSystemPrivileges.length) {
    const stalePrivilegeIds = staleSystemPrivileges.map((privilege) => privilege._id);

    await Group.updateMany(
      { privilegeIds: { $in: stalePrivilegeIds } },
      { $pull: { privilegeIds: { $in: stalePrivilegeIds } } }
    );

    await Privilege.deleteMany({ _id: { $in: stalePrivilegeIds } });
  }

  return {
    syncedCount: privilegeCatalog.length,
    removedCount: staleSystemPrivileges.length,
    removedKeys: staleSystemPrivileges.map((privilege) => privilege.key),
  };
};
