const ACTION_ORDER = [
  "read",
  "create",
  "import",
  "generate",
  "update",
  "export",
  "delete",
  "assign",
  "do",
  "send",
  "progress",
  "stats",
  "approve",
  "configure",
  "track",
  "manage",
  "ddos",
  "admin",
  "other",
];

const ACTION_LABELS = {
  read: "Read",
  create: "Create",
  import: "Import",
  generate: "Generate",
  update: "Update",
  export: "Export",
  delete: "Delete",
  assign: "Assign",
  do: "Do",
  send: "Send",
  progress: "Progress",
  stats: "Stats",
  approve: "Approve",
  configure: "Configure",
  track: "Track",
  manage: "Manage",
  ddos: "DDoS",
  admin: "Admin",
  other: "Other",
};

const MODULE_LABEL_OVERRIDES = {
  "article-pool": "Content Pool",
};

const PRIVILEGE_COPY_OVERRIDES = {
  READ_ARTICLE_POOL: {
    name: "Read Content Pool",
    description: "View content pool records and creator details.",
  },
  CREATE_ARTICLE_POOL: {
    name: "Create Content Pool",
    description: "Create content pool records with brand, title, description, content body, and resource links.",
  },
  EDIT_ARTICLE_POOL: {
    name: "Update Content Pool",
    description: "Update content pool records when this privilege is assigned.",
  },
  DELETE_ARTICLE_POOL: {
    name: "Delete Content Pool",
    description: "Delete content pool records when this privilege is assigned.",
  },
  IMPORT_ARTICLE_POOL: {
    name: "Import Content Pool",
    description: "Preview and import content pool records from CSV files.",
  },
  EXPORT_ARTICLE_POOL: {
    name: "Export Content Pool",
    description: "Export content pool records to CSV files.",
  },
  VIEW_LP_SERVERS_DETAILS: {
    name: "View LP Servers Details",
    description: "View hosting configuration and related details.",
  },
  CREATE_LP_SERVERS_DETAILS: {
    name: "Create LP Servers Details",
    description: "Create new hosting configurations and related details.",
  },
  EDIT_LP_SERVERS_DETAILS: {
    name: "Edit LP Servers Details",
    description: "Edit existing hosting configurations and related details.",
  },
  DELETE_LP_SERVERS_DETAILS: {
    name: "Delete LP Servers Details",
    description: "Delete hosting configurations and related details that are no longer needed.",
  },
  IMPORT_LP_SERVERS_DETAILS: {
    name: "Import LP Servers Details",
    description: "Preview and import LP server records from CSV files.",
  },
  EXPORT_LP_SERVERS_DETAILS: {
    name: "Export LP Servers Details",
    description: "Export LP server records and credentials to CSV files.",
  },
};

function toTitleCase(value = "") {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPrivilegeAction(privilege) {
  if (privilege?.key === "TRACK_REPORTING_TASKS") return "track";
  if (privilege?.key === "DO_DDOS_REPORTING_TASKS") return "ddos";

  const source = `${privilege.key || ""} ${privilege.name || ""}`.toUpperCase();

  if (/\b(DELETE|REMOVE)\b/.test(source)) return "delete";
  if (/\b(CREATE|ADD)\b/.test(source)) return "create";
  if (/\b(IMPORT)\b/.test(source)) return "import";
  if (/\b(GENERATE)\b/.test(source)) return "generate";
  if (/\b(UPDATE|EDIT|CHANGE|RESET)\b/.test(source)) return "update";
  if (/\b(EXPORT)\b/.test(source)) return "export";
  if (/\b(SEND)\b/.test(source)) return "send";
  if (/\b(READ|VIEW|ACCESS|LIST|CHECKER|FIXER|SHOW)\b/.test(source)) return "read";
  if (/\b(ASSIGN)\b/.test(source)) return "assign";
  if (/\b(DO|DOING)\b/.test(source)) return "do";
  if (/\b(PROGRESS)\b/.test(source)) return "progress";
  if (/\b(STATS|STATISTICS)\b/.test(source)) return "stats";
  if (/\b(APPROVAL|APPROVE)\b/.test(source)) return "approve";
  if (/\b(CONFIG|CONFIGURATION|SETTING)\b/.test(source)) return "configure";
  if (/\b(TRACK)\b/.test(source)) return "track";
  if (/\b(ADMIN)\b/.test(source)) return "admin";
  if (/\b(MANAGEMENT|MANAGE|TASKS)\b/.test(source)) return "manage";

  return "other";
}

export function getPrivilegeActionLabel(privilege) {
  if (privilege?.key === "VIEW_REPORTING_ADMIN_REVIEW") {
    return "Admin Review";
  }
  if (privilege?.key === "TRACK_REPORTING_TASKS") {
    return "Track";
  }
  if (privilege?.key === "DO_DDOS_REPORTING_TASKS") {
    return "DDoS";
  }

  return ACTION_LABELS[getPrivilegeAction(privilege)] || ACTION_LABELS.other;
}

export function getModuleLabel(module) {
  return MODULE_LABEL_OVERRIDES[module] || toTitleCase(module || "general");
}

export function getPrivilegeDisplayName(privilege) {
  return PRIVILEGE_COPY_OVERRIDES[privilege?.key]?.name || privilege?.name || "";
}

export function getPrivilegeDisplayDescription(privilege) {
  return PRIVILEGE_COPY_OVERRIDES[privilege?.key]?.description || privilege?.description || "";
}

export function buildPrivilegeMatrix(privileges = []) {
  const groups = privileges.reduce((accumulator, privilege) => {
    const moduleKey = privilege.module || "general";

    if (!accumulator[moduleKey]) {
      accumulator[moduleKey] = {
        key: moduleKey,
        label: getModuleLabel(moduleKey),
        privileges: [],
      };
    }

    accumulator[moduleKey].privileges.push(privilege);
    return accumulator;
  }, {});

  return Object.values(groups)
    .map((group) => ({
      ...group,
      privileges: [...group.privileges].sort((left, right) => {
        const actionDelta =
          ACTION_ORDER.indexOf(getPrivilegeAction(left)) -
          ACTION_ORDER.indexOf(getPrivilegeAction(right));

        if (actionDelta !== 0) {
          return actionDelta;
        }

        return getPrivilegeDisplayName(left).localeCompare(getPrivilegeDisplayName(right));
      }),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
