import dotenv from "dotenv";
import { fileURLToPath } from "url";

const backendEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));
const rootEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

dotenv.config({ path: backendEnvPath });
dotenv.config({ path: rootEnvPath });
