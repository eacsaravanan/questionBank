// backend/src/services/ocrSettingsService.js
//
// Backs GET/POST /api/admin/ocr-settings, using your existing SystemConfig
// table instead of a new one. isSecret stays false because this JSON only
// ever holds env-var NAMES (e.g. "MISTRAL_API_KEY"), never actual key values
// -- actual secrets live in your .env / container secrets, matching the
// pattern your Document AI planning notes already established.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CONFIG_KEY = 'ocr_settings';

const DEFAULT_SETTINGS = {
  engine: 'custom_api',
  secondaryEngine: 'google_cloud_vision',
  mathEngine: 'mathpix',
  providers: {},
};

async function getOcrSettings() {
  const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
  return row ? row.value : DEFAULT_SETTINGS;
}

async function saveOcrSettings(settings) {
  return prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: settings, isSecret: false },
    update: { value: settings },
  });
}

export { getOcrSettings, saveOcrSettings, CONFIG_KEY };
