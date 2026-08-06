# Tamil font required for PDF export

PDF generation (`pdfExport.routes.js`) needs an actual Tamil-script font
file to render Tamil text in exported papers — PDF libraries embed fonts
directly and can't fall back to whatever fonts happen to be installed on
a viewer's system the way a webpage can.

**Without this file present, PDF exports still work, but any Tamil
question/option text is omitted from the PDF** (with a note printed at
the top of the document) rather than showing as blank boxes.

## Setup (one-time)

1. Download **Noto Sans Tamil** (free, open-source, Google Fonts):
   https://fonts.google.com/noto/specimen/Noto+Sans+Tamil
2. From the downloaded family, take the **Regular** weight `.ttf` file.
3. Rename it to exactly: `NotoSansTamil-Regular.ttf`
4. Place it in this folder (`backend/assets/fonts/`).
5. Rebuild the backend container (`docker compose up -d --build`) so the
   file is included in the image.

No code changes needed — the export route checks for this exact filename
automatically.
