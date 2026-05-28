import "../app/config/env.js";
import mongoose from "mongoose";

import Group from "../modules/groups/group.model.js";
import Privilege from "../modules/privileges/privilege.model.js";
import { syncSystemPrivileges } from "../modules/privileges/privilege.sync.js";

const RANK_CHECKER_PRIVILEGE_KEYS = [
  "SHOW_RANK_CHECKER",
  "RANK_CHECKER_ADD_DOMAINS",
  "RANK_CHECKER_MANUAL_CHECKER",
  "RANK_CHECKER_BULK_CHECKER",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_LOGS",
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const syncResult = await syncSystemPrivileges();
    const adminPrivilege = await Privilege.findOne({ key: "ADMIN_ACCESS" }).select("_id");
    const rankCheckerPrivileges = await Privilege.find({
      key: { $in: RANK_CHECKER_PRIVILEGE_KEYS },
    }).select("_id key");

    if (!rankCheckerPrivileges.length) {
      throw new Error("Rank Checker privileges were not found after sync");
    }

    const targetGroups = await Group.find({
      $or: [
        { isProtected: true },
        { name: { $in: ["Admin", "admin", "System administrators"] } },
        ...(adminPrivilege ? [{ privilegeIds: adminPrivilege._id }] : []),
      ],
    }).select("_id name privilegeIds");

    if (!targetGroups.length) {
      console.log("Privileges synced, but no admin groups were found to update.");
      console.log(`Synced system privileges: ${syncResult.syncedCount}`);
      return;
    }

    const rankCheckerPrivilegeIds = rankCheckerPrivileges.map((privilege) => privilege._id);
    let updatedGroups = 0;

    for (const group of targetGroups) {
      const existingIds = new Set(group.privilegeIds.map((item) => String(item)));
      const missingIds = rankCheckerPrivilegeIds.filter((id) => !existingIds.has(String(id)));

      if (!missingIds.length) {
        continue;
      }

      await Group.updateOne(
        { _id: group._id },
        {
          $addToSet: {
            privilegeIds: {
              $each: missingIds,
            },
          },
        }
      );
      updatedGroups += 1;
    }

    console.log(`Synced system privileges: ${syncResult.syncedCount}`);
    console.log(`Rank Checker privileges available: ${rankCheckerPrivileges.length}`);
    console.log(`Admin groups updated: ${updatedGroups}/${targetGroups.length}`);
  } catch (error) {
    console.error("Failed to seed Rank Checker privileges:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
