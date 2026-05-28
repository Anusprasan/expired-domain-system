import crypto from "crypto";

const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY; // store in .env
const iv = crypto.randomBytes(16);

export const encrypt = (text) => {
  const iv = crypto.randomBytes(16); // ✅ MOVE HERE

  const cipher = crypto.createCipheriv(
    algorithm,
    Buffer.from(secretKey, "hex"),
    iv
  );

  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
};
export const decrypt = (text) => {
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = Buffer.from(parts[1], "hex");

  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey, "hex"),
    iv
  );

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
};