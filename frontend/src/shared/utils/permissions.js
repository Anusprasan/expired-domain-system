export function getPrivilegeKeys(user) {
  return user?.group?.privileges?.map((privilege) => privilege.key) || [];
}

export function hasAdminAccess(user) {
  const groupName = user?.group?.name?.toLowerCase();
  const privilegeKeys = getPrivilegeKeys(user);

  return groupName === "admin" || privilegeKeys.includes("ADMIN_ACCESS");
}

export function hasPrivilege(user, privilegeKey) {
  if (!privilegeKey) {
    return true;
  }

  if (hasAdminAccess(user)) {
    return true;
  }

  return getPrivilegeKeys(user).includes(privilegeKey);
}

export function hasAnyPrivilege(user, privilegeKeys = []) {
  if (!privilegeKeys.length) {
    return true;
  }

  if (hasAdminAccess(user)) {
    return true;
  }

  const userPrivilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.some((privilegeKey) => userPrivilegeKeys.includes(privilegeKey));
}

export function canAccessNavItem(user, item) {
  if (hasAdminAccess(user)) {
    return true;
  }

  if (item.requiredPrivilege) {
    return hasPrivilege(user, item.requiredPrivilege);
  }

  if (item.requiredAnyPrivileges?.length) {
    return hasAnyPrivilege(user, item.requiredAnyPrivileges);
  }

  return true;
}
