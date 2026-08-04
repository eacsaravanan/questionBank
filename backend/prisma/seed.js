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
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      description: 'Full system access — configures roles, approves final papers, schedules exams.',
      isSystem: true,
      permissions: { create: Object.values(permissionRecords).map((p) => ({ permissionId: p.id })) },
    },
  });

  await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Question Preparator — builds question banks and assembles papers.',
      permissions: {
        create: ['content.read', 'question.create', 'question.read', 'question.update', 'paper.create', 'paper.read']
          .map((code) => ({ permissionId: permissionRecords[code].id })),
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'SME' },
    update: {},
    create: {
      name: 'SME',
      description: 'Subject Matter Expert — reviews and approves questions for their assigned subject(s).',
      permissions: {
        create: ['content.read', 'question.read', 'question.review']
          .map((code) => ({ permissionId: permissionRecords[code].id })),
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'Paper Approver' },
    update: {},
    create: {
      name: 'Paper Approver',
      description: 'Approves assembled question papers (SME stage of the paper workflow).',
      permissions: {
        create: ['paper.read', 'paper.approve'].map((code) => ({ permissionId: permissionRecords[code].id })),
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'Aspirant' },
    update: {},
    create: {
      name: 'Aspirant',
      description: 'End-user candidate taking exams.',
      permissions: { create: [] },
    },
  });

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
