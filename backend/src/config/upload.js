import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_ROOT = path.resolve('uploads');
for (const sub of ['logos', 'ocr-source']) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, subfolder)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) return cb(new Error('UNSUPPORTED_FILE_TYPE'));
  cb(null, true);
}

// OCR source accepts images (existing screenshot flow) PLUS PDF and DOCX
// documents (multi-page import). Legacy .doc (pre-2007 binary Word format)
// is intentionally not supported — there's no reliable pure-JS parser for
// it; "Save As .docx" in Word is the practical path if you have old .doc
// files.
function ocrSourceFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype) && !ALLOWED_DOCUMENT_MIME.has(file.mimetype)) {
    return cb(new Error('UNSUPPORTED_FILE_TYPE'));
  }
  cb(null, true);
}

export const uploadLogo = multer({
  storage: makeStorage('logos'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

export const uploadOcrSource = multer({
  storage: makeStorage('ocr-source'),
  fileFilter: ocrSourceFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — multi-page PDFs/DOCX can be much larger than a screenshot
});

export const UPLOAD_ROOT_DIR = UPLOAD_ROOT;
