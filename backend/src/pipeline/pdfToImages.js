// backend/src/pipeline/pdfToImages.js
//
// Converts an uploaded PDF into one PNG per page at 300 DPI, using the
// `pdftoppm` binary (part of poppler-utils). This closes the gap left open
// in earlier steps -- ocrPipeline.processPage() needs page IMAGES, not a
// PDF, and nothing so far actually produced them.
//
// Requires poppler-utils installed in your backend container. Add this line
// to backend/Dockerfile, near wherever else you install system packages:
//
//   RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*
//
// Then rebuild: docker compose up -d --build

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp'; // already added in a previous step for imageCrop.js

const execAsync = promisify(exec);

/**
 * @param {string} pdfPath - path to the uploaded PDF on disk
 * @param {string} outputDir - directory to write page images into (created if missing)
 * @returns {Promise<Array<{pageNumber: number, imagePath: string, imageBase64: string, width: number, height: number}>>}
 */
async function pdfToPageImages(pdfPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });

  const outputPrefix = path.join(outputDir, 'page');
  // -r 300: 300 DPI, high enough for OCR on dense Tamil ligatures without
  // being unreasonably slow. -png: PNG output (lossless, unlike JPEG, which
  // matters for OCR accuracy on fine text).
  await execAsync(`pdftoppm -r 300 -png "${pdfPath}" "${outputPrefix}"`);

  const files = (await fs.readdir(outputDir))
    .filter((f) => f.startsWith('page') && f.endsWith('.png'))
    .sort(); // pdftoppm names them page-1.png, page-2.png, ... which sorts correctly up to 9 pages;
             // for papers over 9 pages, sort numerically instead:
  files.sort((a, b) => {
    const numA = parseInt(a.match(/(\d+)/)[1], 10);
    const numB = parseInt(b.match(/(\d+)/)[1], 10);
    return numA - numB;
  });

  const pages = [];
  for (let i = 0; i < files.length; i++) {
    const imagePath = path.join(outputDir, files[i]);
    const buffer = await fs.readFile(imagePath);
    const metadata = await sharp(buffer).metadata();

    pages.push({
      pageNumber: i + 1,
      imagePath,
      imageBase64: buffer.toString('base64'),
      width: metadata.width,
      height: metadata.height,
    });
  }

  return pages;
}

export { pdfToPageImages };
