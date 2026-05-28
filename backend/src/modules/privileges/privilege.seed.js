import { syncSystemPrivileges } from "./privilege.sync.js";

export const seedPrivileges = async () => {
  const result = await syncSystemPrivileges();
  console.log(
    `Privileges synced. Upserted ${result.syncedCount} system privileges and removed ${result.removedCount} stale system privileges.`
  );
};
