import "../app/config/env.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Brand from "../modules/brands/brand.model.js";
import Group from "../modules/groups/group.model.js";
import Privilege from "../modules/privileges/privilege.model.js";
import { privilegeCatalog } from "../modules/privileges/privilege.catalog.js";
import User from "../modules/users/user.model.js";

const SYSTEM_GROUP_NAME = "System administrators";
const SYSTEM_GROUP_DESCRIPTION = "Protected administrator group with the full system privilege set.";
const SYSTEM_BRANDS = [
  {
    brandName: "A200M",
    cssClassName: "brand-A200M",
    backgroundCss: "linear-gradient(to right, #02bca2 0%, #039984 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#02bca2 0%", "#039984 100%"],
    gradientColors: ["#02bca2", "#039984"],
    textColor: "#FFF",
  },
  {
    brandName: "B200M",
    cssClassName: "brand-B200M",
    backgroundCss: "linear-gradient(to right, #4582b4 0%, #305d82 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#4582b4 0%", "#305d82 100%"],
    gradientColors: ["#4582b4", "#305d82"],
    textColor: "#FFF",
  },
  {
    brandName: "C200M",
    cssClassName: "brand-C200M",
    backgroundCss: "#67c700",
    backgroundStyle: "solid",
    backgroundColor: "#67c700",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "D200M",
    cssClassName: "brand-D200M",
    backgroundCss: "#00ff83",
    backgroundStyle: "solid",
    backgroundColor: "#00ff83",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "E200M",
    cssClassName: "brand-E200M",
    backgroundCss: "linear-gradient(to bottom, #0053cb 0%, #fc7e03 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to bottom",
    gradientPosition: null,
    gradientStops: ["#0053cb 0%", "#fc7e03 100%"],
    gradientColors: ["#0053cb", "#fc7e03"],
    textColor: "#FFF",
  },
  {
    brandName: "F200M",
    cssClassName: "brand-F200M",
    backgroundCss: "#fede9d",
    backgroundStyle: "solid",
    backgroundColor: "#fede9d",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "G200M",
    cssClassName: "brand-G200M",
    backgroundCss: "#f60002",
    backgroundStyle: "solid",
    backgroundColor: "#f60002",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#FFF",
  },
  {
    brandName: "K200M",
    cssClassName: "brand-K200M",
    backgroundCss: "#00e0ba",
    backgroundStyle: "solid",
    backgroundColor: "#00e0ba",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "P200M",
    cssClassName: "brand-P200M",
    backgroundCss: "#01ddff",
    backgroundStyle: "solid",
    backgroundColor: "#01ddff",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "J200M",
    cssClassName: "brand-J200M",
    backgroundCss: "linear-gradient(rgb(129, 219, 1), rgb(52, 136, 3))",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "180deg",
    gradientPosition: null,
    gradientStops: ["rgb(129, 219, 1)", "rgb(52, 136, 3)"],
    gradientColors: ["rgb(129, 219, 1)", "rgb(52, 136, 3)"],
    textColor: "#FFF",
  },
  {
    brandName: "Y200M",
    cssClassName: "brand-Y200M",
    backgroundCss: "radial-gradient(farthest-corner at 20% 0, #7500b8 0%, #260040 50%)",
    backgroundStyle: "radial-gradient",
    backgroundColor: null,
    gradientType: "radial",
    gradientDirection: null,
    gradientPosition: "farthest-corner at 20% 0",
    gradientStops: ["#7500b8 0%", "#260040 50%"],
    gradientColors: ["#7500b8", "#260040"],
    textColor: "#FFF",
  },
  {
    brandName: "PASTI200M",
    cssClassName: "brand-PASTI200M",
    backgroundCss: "linear-gradient(to bottom, #fa06ba 0%, #b40586 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to bottom",
    gradientPosition: null,
    gradientStops: ["#fa06ba 0%", "#b40586 100%"],
    gradientColors: ["#fa06ba", "#b40586"],
    textColor: "#FFF",
  },
  {
    brandName: "SGCWIN",
    cssClassName: "brand-SGCWIN",
    backgroundCss: "linear-gradient(to bottom, #02bca2 0%, #039984 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to bottom",
    gradientPosition: null,
    gradientStops: ["#02bca2 0%", "#039984 100%"],
    gradientColors: ["#02bca2", "#039984"],
    textColor: "#FFF",
  },
  {
    brandName: "SGCWIN77",
    cssClassName: "brand-SGCWIN77",
    backgroundCss: "linear-gradient(270deg, #2b8cbb, #499dc6 50.31%, #2b8cbb 100.35%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "270deg",
    gradientPosition: null,
    gradientStops: ["#2b8cbb", "#499dc6 50.31%", "#2b8cbb 100.35%"],
    gradientColors: ["#2b8cbb", "#499dc6", "#2b8cbb"],
    textColor: "#FFF",
  },
  {
    brandName: "SGCWIN88",
    cssClassName: "brand-SGCWIN88",
    backgroundCss: "linear-gradient(1turn, #7f6426, #fbf59f 50.13%, #8a7132)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "1turn",
    gradientPosition: null,
    gradientStops: ["#7f6426", "#fbf59f 50.13%", "#8a7132"],
    gradientColors: ["#7f6426", "#fbf59f", "#8a7132"],
    textColor: "#000",
  },
  {
    brandName: "SGCPLAY",
    cssClassName: "brand-SGCPLAY",
    backgroundCss: "linear-gradient(1turn, #b7870c, #f4e303 43.57%, #97640e)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "1turn",
    gradientPosition: null,
    gradientStops: ["#b7870c", "#f4e303 43.57%", "#97640e"],
    gradientColors: ["#b7870c", "#f4e303", "#97640e"],
    textColor: "#000",
  },
  {
    brandName: "SGCVIP",
    cssClassName: "brand-SGCVIP",
    backgroundCss: "linear-gradient(270deg, #008262, #44af8b 50.31%, #008262 100.35%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "270deg",
    gradientPosition: null,
    gradientStops: ["#008262", "#44af8b 50.31%", "#008262 100.35%"],
    gradientColors: ["#008262", "#44af8b", "#008262"],
    textColor: "#FFF",
  },
  {
    brandName: "ASIA100",
    cssClassName: "brand-ASIA100",
    backgroundCss: "linear-gradient(180deg, #fd5858 0%, #ff7f7d 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "180deg",
    gradientPosition: null,
    gradientStops: ["#fd5858 0%", "#ff7f7d 100%"],
    gradientColors: ["#fd5858", "#ff7f7d"],
    textColor: "#FFF",
  },
  {
    brandName: "ASIA200",
    cssClassName: "brand-ASIA200",
    backgroundCss: "linear-gradient(180deg, #ffc325 0%, #ffc95c 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "180deg",
    gradientPosition: null,
    gradientStops: ["#ffc325 0%", "#ffc95c 100%"],
    gradientColors: ["#ffc325", "#ffc95c"],
    textColor: "#000",
  },
  {
    brandName: "ASIA300",
    cssClassName: "brand-ASIA300",
    backgroundCss: "linear-gradient(120deg, #ffb100, #fe3bff, #bc5fe5)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "120deg",
    gradientPosition: null,
    gradientStops: ["#ffb100", "#fe3bff", "#bc5fe5"],
    gradientColors: ["#ffb100", "#fe3bff", "#bc5fe5"],
    textColor: "#FFF",
  },
  {
    brandName: "TIKET100",
    cssClassName: "brand-TIKET100",
    backgroundCss: "#d6b851",
    backgroundStyle: "solid",
    backgroundColor: "#d6b851",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "TIKET200",
    cssClassName: "brand-TIKET200",
    backgroundCss: "#63fe4c",
    backgroundStyle: "solid",
    backgroundColor: "#63fe4c",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "TIKET300",
    cssClassName: "brand-TIKET300",
    backgroundCss: "linear-gradient(180deg, #579dff 0%, #85b8ff 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "180deg",
    gradientPosition: null,
    gradientStops: ["#579dff 0%", "#85b8ff 100%"],
    gradientColors: ["#579dff", "#85b8ff"],
    textColor: "#FFF",
  },
  {
    brandName: "SUPER89",
    cssClassName: "brand-SUPER89",
    backgroundCss: "linear-gradient(to right, #ffd700, #ff0000)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#ffd700", "#ff0000"],
    gradientColors: ["#ffd700", "#ff0000"],
    textColor: "#FFF",
  },
  {
    brandName: "RAJA100",
    cssClassName: "brand-RAJA100",
    backgroundCss: "#2dbdfa",
    backgroundStyle: "solid",
    backgroundColor: "#2dbdfa",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "TOP111",
    cssClassName: "brand-TOP111",
    backgroundCss: "#fede9d",
    backgroundStyle: "solid",
    backgroundColor: "#fede9d",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "PADUKA500",
    cssClassName: "brand-PADUKA500",
    backgroundCss: "linear-gradient(to right, #02bca2 0%, #039984 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#02bca2 0%", "#039984 100%"],
    gradientColors: ["#02bca2", "#039984"],
    textColor: "#FFF",
  },
  {
    brandName: "AUTOQRIS77",
    cssClassName: "brand-AUTOQRIS77",
    backgroundCss: "#00ff83",
    backgroundStyle: "solid",
    backgroundColor: "#00ff83",
    gradientType: null,
    gradientDirection: null,
    gradientPosition: null,
    gradientStops: [],
    gradientColors: [],
    textColor: "#000",
  },
  {
    brandName: "FUFUSLOT",
    cssClassName: "brand-FUFUSLOT",
    backgroundCss: "linear-gradient(to right, #f7a103 0%, #ff6c00 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#f7a103 0%", "#ff6c00 100%"],
    gradientColors: ["#f7a103", "#ff6c00"],
    textColor: "#FFF",
  },
  {
    brandName: "JOS007",
    cssClassName: "brand-JOS007",
    backgroundCss: "radial-gradient(farthest-corner at 20% 0, #41760c 0%, #0d3200 50%)",
    backgroundStyle: "radial-gradient",
    backgroundColor: null,
    gradientType: "radial",
    gradientDirection: null,
    gradientPosition: "farthest-corner at 20% 0",
    gradientStops: ["#41760c 0%", "#0d3200 50%"],
    gradientColors: ["#41760c", "#0d3200"],
    textColor: "#FFF",
  },
  {
    brandName: "DEPO89",
    cssClassName: "brand-DEPO89",
    backgroundCss: "linear-gradient(to bottom, #fa06ba 0%, #b40586 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to bottom",
    gradientPosition: null,
    gradientStops: ["#fa06ba 0%", "#b40586 100%"],
    gradientColors: ["#fa06ba", "#b40586"],
    textColor: "#FFF",
  },
  {
    brandName: "BONASLOT",
    cssClassName: "brand-BONASLOT",
    backgroundCss: "linear-gradient(to right, #4582b4 0%, #305d82 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to right",
    gradientPosition: null,
    gradientStops: ["#4582b4 0%", "#305d82 100%"],
    gradientColors: ["#4582b4", "#305d82"],
    textColor: "#FFF",
  },
  {
    brandName: "MADURA88",
    cssClassName: "brand-MADURA88",
    backgroundCss: "radial-gradient(farthest-corner at 20% 0, #b80000 0%, #400000 50%)",
    backgroundStyle: "radial-gradient",
    backgroundColor: null,
    gradientType: "radial",
    gradientDirection: null,
    gradientPosition: "farthest-corner at 20% 0",
    gradientStops: ["#b80000 0%", "#400000 50%"],
    gradientColors: ["#b80000", "#400000"],
    textColor: "#FFF",
  },
  {
    brandName: "NUSA211",
    cssClassName: "brand-NUSA211",
    backgroundCss: "linear-gradient(to bottom, #fbeb8c 0%, #9d7e39 100%)",
    backgroundStyle: "linear-gradient",
    backgroundColor: null,
    gradientType: "linear",
    gradientDirection: "to bottom",
    gradientPosition: null,
    gradientStops: ["#fbeb8c 0%", "#9d7e39 100%"],
    gradientColors: ["#fbeb8c", "#9d7e39"],
    textColor: "#000",
  },
];

function getNormalizedNodeEnv() {
  return String(process.env.NODE_ENV || "development").trim().toLowerCase();
}

function assertDevelopmentSeedEnvironment() {
  const nodeEnv = getNormalizedNodeEnv();

  if (nodeEnv === "development" || nodeEnv === "test") {
    return;
  }

  throw new Error(
    "setup:system-admin is only allowed in development or test environments"
  );
}

function getSeedAdminCredentials() {
  const adminName = String(process.env.DEV_SEED_ADMIN_NAME || "").trim();
  const adminEmail = String(process.env.DEV_SEED_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(process.env.DEV_SEED_ADMIN_PASSWORD || "").trim();

  if (!adminName || !adminEmail || !adminPassword) {
    throw new Error(
      "DEV_SEED_ADMIN_NAME, DEV_SEED_ADMIN_EMAIL, and DEV_SEED_ADMIN_PASSWORD are required"
    );
  }

  return {
    adminName,
    adminEmail,
    adminPassword,
  };
}

const syncSystemPrivileges = async () => {
  const systemPrivilegeKeys = privilegeCatalog.map((privilege) => privilege.key);

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
    key: { $nin: systemPrivilegeKeys },
  }).select("_id key");

  if (staleSystemPrivileges.length) {
    const stalePrivilegeIds = staleSystemPrivileges.map((privilege) => privilege._id);

    await Group.updateMany(
      { privilegeIds: { $in: stalePrivilegeIds } },
      { $pull: { privilegeIds: { $in: stalePrivilegeIds } } }
    );

    await Privilege.deleteMany({ _id: { $in: stalePrivilegeIds } });
  }

  return Privilege.find({ key: { $in: systemPrivilegeKeys } }).select("_id key").sort({ key: 1 });
};

const ensureSystemAdministratorGroup = async (privileges) => {
  const privilegeIds = privileges.map((privilege) => privilege._id);

  return Group.findOneAndUpdate(
    { name: SYSTEM_GROUP_NAME },
    {
      $set: {
        description: SYSTEM_GROUP_DESCRIPTION,
        privilegeIds: privilegeIds,
        isProtected: true,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const ensureAdminUser = async (groupId) => {
  const { adminName, adminEmail, adminPassword } = getSeedAdminCredentials();
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  return User.findOneAndUpdate(
    { email: adminEmail },
    {
      $set: {
        fullName: adminName,
        passwordHash,
        status: "active",
        groupId,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const ensureSystemBrands = async () => {
  const existingBrands = await Brand.find({
    brandName: { $in: SYSTEM_BRANDS.map((brand) => brand.brandName) },
  }).select("brandName");

  const existingNames = new Set(existingBrands.map((brand) => brand.brandName));
  const brandsToInsert = SYSTEM_BRANDS.filter((brand) => !existingNames.has(brand.brandName));

  if (brandsToInsert.length) {
    await Brand.insertMany(brandsToInsert, { ordered: false });
  }

  return {
    inserted: brandsToInsert.length,
    skipped: existingNames.size,
  };
};

const run = async () => {
  try {
    assertDevelopmentSeedEnvironment();
    await mongoose.connect(process.env.MONGO_URI);

    const privileges = await syncSystemPrivileges();
    const group = await ensureSystemAdministratorGroup(privileges);
    const user = await ensureAdminUser(group._id);
    const brands = await ensureSystemBrands();

    console.log(`System privileges synced: ${privileges.length}`);
    console.log(`Group ready: ${group.name}`);
    console.log(`Admin user ready: ${user.email}`);
    console.log(`Brands seeded: inserted ${brands.inserted}, skipped ${brands.skipped}`);
  } catch (error) {
    console.error("Failed to set up system administrator:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
