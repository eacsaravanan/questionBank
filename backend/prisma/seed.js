import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  ['user.create', 'User Management'], ['user.read', 'User Management'],
  ['user.update', 'User Management'], ['user.delete', 'User Management'],
  ['role.create', 'User Management'], ['role.read', 'User Management'],
  ['content.manage', 'Content Hierarchy'], ['content.read', 'Content Hierarchy'],
  ['question.create', 'Question Bank'], ['question.read', 'Question Bank'],
  ['question.update', 'Question Bank'], ['question.delete', 'Question Bank'],
  ['question.review', 'Question Bank'], ['question.approve', 'Question Bank'],
  ['paper.create', 'Question Papers'], ['paper.read', 'Question Papers'],
  ['paper.approve', 'Question Papers'],
  ['exam.configure', 'Exam Scheduling'], ['exam.schedule', 'Exam Scheduling'],
  ['audit.read', 'Audit & Compliance'], ['audit.export', 'Audit & Compliance'],
  ['system.configure', 'System Configuration'],
  ['branding.manage', 'White-labeling'],
  ['ocr.configure', 'System Configuration'],
];

const EXAMS = [
  ['TNPSC', 'Tamil Nadu Public Service Commission'],
  ['UPSC', 'Union Public Service Commission'],
  ['SSC', 'Staff Selection Commission'],
  ['RRB', 'Railway Recruitment Board'],
  ['BANKING', 'Banking Exams (IBPS/SBI/RBI)'],
  ['NEET', 'National Eligibility cum Entrance Test'],
  ['JEE', 'IIT Joint Entrance Examination'],
  ['ENGINEERING', 'Engineering Entrance Exams'],
  ['TNUSRB', 'Tamil Nadu Uniformed Services Recruitment Board'],
  ['CLAT', 'Common Law Admission Test'],
];

async function main() {
  console.log('Seeding permissions...');
  const permissionRecords = {};
  for (const [code, module] of PERMISSIONS) {
    permissionRecords[code] = await prisma.permission.upsert({
      where: { code }, update: {}, create: { code, module },
    });
  }

  console.log('Seeding system roles...');

  // Upserts the role itself, then SYNCS its permission set to exactly the
  // list given — including on re-runs. Without this, re-running `npm run
  // seed` after a permissions change (like this one) would silently leave
  // existing roles with their old, stale permission set forever, since
  // Prisma's upsert `update: {}` only touches the role's own fields, not
  // its relations.
  async function syncRole(name, description, permissionCodes, isSystem = false) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description },
      create: { name, description, isSystem },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionCodes.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionCodes.map((code) => ({ roleId: role.id, permissionId: permissionRecords[code].id })),
      });
    }
    return role;
  }

  const superAdminRole = await syncRole(
    'Super Admin',
    'Full system access — configures roles, approves final papers, schedules exams.',
    Object.keys(permissionRecords),
    true
  );

  await syncRole(
    'Admin',
    'Question Preparator — builds question banks and assembles papers.',
    ['content.read', 'question.create', 'question.read', 'question.update', 'question.delete', 'paper.create', 'paper.read']
  );

  await syncRole(
    'SME',
    'Subject Matter Expert — reviews and approves questions for their assigned subject(s).',
    ['content.read', 'question.read', 'question.review']
  );

  await syncRole(
    'Paper Approver',
    'Approves assembled question papers (SME stage of the paper workflow).',
    ['paper.read', 'paper.approve']
  );

  await syncRole('Aspirant', 'End-user candidate taking exams.', []);

  console.log('Seeding exams...');
  for (const [code, name] of EXAMS) {
    await prisma.exam.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  console.log('Seeding default branding profile...');
  await prisma.brandingProfile.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      label: 'Default',
      instituteName: 'Your Institute Name',
      isDefault: true,
      logoDisplayMode: 'FIRST_PAGE_ONLY',
      headerTemplate: '<div style="text-align:center">{{logo}}<h3>{{instituteName}}</h3><p>{{address}}</p><hr/><b>{{examName}}</b> — Paper Code: {{paperCode}}</div>',
      footerTemplate: '<div style="display:flex;justify-content:space-between"><span>{{confidentialNotice}}</span><span>Page {{pageNumber}} of {{totalPages}}</span></div>',
    },
  });

  console.log('Seeding initial Super Admin user (CHANGE THIS PASSWORD IMMEDIATELY)...');
  const passwordHash = await argon2.hash('ChangeMe@FirstLogin123', { type: argon2.argon2id });
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'superadmin@example.com',
      fullName: 'System Super Administrator',
      passwordHash,
      mustResetPassword: true,
      roles: { create: [{ roleId: superAdminRole.id }] },
    },
  });

  console.log(`Done. Login as "superadmin" / "ChangeMe@FirstLogin123" (user id ${superAdmin.id}) and change the password immediately.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
