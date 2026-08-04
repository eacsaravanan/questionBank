import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_ROOT = path.resolve('uploads');
for (const sub of ['logos', 'ocr-source']) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, subfolder)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('UNSUPPORTED_FILE_TYPE'));
  }
  cb(null, true);
}

export const uploadLogo = multer({
  storage: makeStorage('logos'),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

export const uploadOcrSource = multer({
  storage: makeStorage('ocr-source'),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — full-page scans can be larger
});

export const UPLOAD_ROOT_DIR = UPLOAD_ROOT;
