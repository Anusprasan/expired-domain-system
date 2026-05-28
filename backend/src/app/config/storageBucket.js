import crypto from "crypto";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucketName =
  process.env.STORAGE_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  process.env.S3_BUCKET ||
  process.env.DO_SPACES_BUCKET ||
  "";

const region =
  process.env.STORAGE_BUCKET_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  process.env.DO_SPACES_REGION ||
  "us-east-1";

const endpoint =
  process.env.STORAGE_BUCKET_ENDPOINT ||
  process.env.AWS_S3_ENDPOINT ||
  process.env.S3_ENDPOINT ||
  process.env.DO_SPACES_ENDPOINT ||
  "";

const publicBaseUrl =
  process.env.STORAGE_BUCKET_PUBLIC_URL ||
  process.env.AWS_S3_PUBLIC_URL ||
  process.env.S3_PUBLIC_URL ||
  process.env.DO_SPACES_CDN ||
  "";

const accessKeyId =
  process.env.STORAGE_BUCKET_ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.DO_SPACES_KEY ||
  "";

const secretAccessKey =
  process.env.STORAGE_BUCKET_SECRET_ACCESS_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  process.env.DO_SPACES_SECRET ||
  "";

const forcePathStyle = String(
  process.env.STORAGE_BUCKET_FORCE_PATH_STYLE ||
  process.env.AWS_S3_FORCE_PATH_STYLE ||
  ""
).toLowerCase() === "true";

const s3Client = new S3Client({
  region,
  ...(endpoint ? { endpoint } : {}),
  ...(accessKeyId && secretAccessKey
    ? { credentials: { accessKeyId, secretAccessKey } }
    : {}),
  forcePathStyle,
});

function assertBucketConfigured() {
  if (!bucketName) {
    throw new Error("Storage bucket is not configured. Set STORAGE_BUCKET_NAME or AWS_S3_BUCKET.");
  }
}

function sanitizeFileName(fileName = "evidence") {
  const parsed = path.parse(String(fileName));
  const base = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "evidence";
  const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base}${ext}`;
}

function buildPublicUrl(key) {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  if (endpoint) {
    const cleanEndpoint = endpoint.replace(/\/+$/, "");
    return forcePathStyle
      ? `${cleanEndpoint}/${bucketName}/${key}`
      : `${cleanEndpoint}/${key}`;
  }

  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
}

export async function uploadEvidenceImageToBucket(file, { taskId, userId, evidenceType }) {
  assertBucketConfigured();

  const safeName = sanitizeFileName(file.originalname);
  const key = [
    "reporting-tasks",
    String(taskId),
    evidenceType,
    String(userId),
    `${Date.now()}-${crypto.randomUUID()}-${safeName}`,
  ].join("/");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
    })
  );

  return {
    key,
    url: buildPublicUrl(key),
    bucket: bucketName,
    storageProvider: "s3",
  };
}

export async function deleteEvidenceImageFromBucket(image) {
  if (!image?.key || !bucketName) return;

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: image.bucket || bucketName,
      Key: image.key,
    })
  );
}

export async function getEvidenceImageFromBucket(image) {
  assertBucketConfigured();

  if (!image?.key) {
    throw new Error("Evidence image is missing a storage key");
  }

  return s3Client.send(
    new GetObjectCommand({
      Bucket: image.bucket || bucketName,
      Key: image.key,
    })
  );
}
