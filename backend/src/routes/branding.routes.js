import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadLogo } from '../config/upload.js';

const router = Router();
router.use(authenticate);

// GET /api/branding-profiles
router.get('/', requirePermission('branding.manage'), async (req, res, next) => {
  try {
    const profiles = await prisma.brandingProfile.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(profiles);
  } catch (err) { next(err); }
});

// POST /api/branding-profiles
// { label, instituteName, address, contactNumber, contactEmail, website,
//   logoDisplayMode, confidentialMode, headerTemplate, footerTemplate, isDefault }
router.post('/', requirePermission('branding.manage'), async (req, res, next) => {
  try {
    const data = req.body;

    // Confidential mode is a hard override: strip identity fields at write
    // time too (not just at render time) so a confidential profile never
    // even stores the data an operator might have pasted in by mistake
    // before toggling the switch.
    if (data.confidentialMode) {
      data.instituteName = null;
      data.address = null;
      data.contactNumber = null;
      data.contactEmail = null;
      data.website = null;
      data.logoUrl = null;
    }

    if (data.isDefault) {
      await prisma.brandingProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const profile = await prisma.brandingProfile.create({ data });
    await req.audit('BRANDING_PROFILE_CREATE', 'BrandingProfile', profile.id, { label: profile.label, confidentialMode: profile.confidentialMode });
    res.status(201).json(profile);
  } catch (err) { next(err); }
});

// PATCH /api/branding-profiles/:id
router.patch('/:id', requirePermission('branding.manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };

    if (data.confidentialMode) {
      data.instituteName = null;
      data.address = null;
      data.contactNumber = null;
      data.contactEmail = null;
      data.website = null;
      data.logoUrl = null;
    }
    if (data.isDefault) {
      await prisma.brandingProfile.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    }

    const profile = await prisma.brandingProfile.update({ where: { id }, data });
    await req.audit('BRANDING_PROFILE_UPDATE', 'BrandingProfile', id);
    res.json(profile);
  } catch (err) { next(err); }
});

// POST /api/branding-profiles/:id/logo  (multipart/form-data, field name "logo")
router.post('/:id/logo', requirePermission('branding.manage'), uploadLogo.single('logo'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.brandingProfile.findUnique({ where: { id } });
    if (existing?.confidentialMode) {
      return res.status(400).json({
        error: 'CONFIDENTIAL_PROFILE',
        message: 'This profile is set to confidential mode — turn that off before uploading a logo.',
      });
    }
    if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const profile = await prisma.brandingProfile.update({ where: { id }, data: { logoUrl } });
    await req.audit('BRANDING_LOGO_UPLOAD', 'BrandingProfile', id);
    res.json(profile);
  } catch (err) { next(err); }
});

// DELETE /api/branding-profiles/:id
router.delete('/:id', requirePermission('branding.manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.brandingProfile.delete({ where: { id } });
    await req.audit('BRANDING_PROFILE_DELETE', 'BrandingProfile', id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
