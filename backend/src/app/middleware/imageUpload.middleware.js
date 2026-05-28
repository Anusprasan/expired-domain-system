import multer from "multer";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: MAX_IMAGE_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error("Only PNG, JPG and JPEG files are accepted"));
    }
    return cb(null, true);
  },
});

export const reportingEvidenceUpload = upload.array("images", MAX_IMAGE_COUNT);

export function handleUploadError(error, _req, res, next) {
  if (!error) return next();

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each evidence image must be 5 MB or smaller"
        : error.code === "LIMIT_FILE_COUNT"
          ? `You can upload a maximum of ${MAX_IMAGE_COUNT} images`
          : error.message;

    return res.status(400).json({ success: false, message });
  }

  return res.status(400).json({ success: false, message: error.message });
}
