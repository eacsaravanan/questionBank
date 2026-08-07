import {
  LayoutDashboard, Users, BookOpen, FileCheck2, CalendarClock, ScrollText, Settings, Mail, Palette, ScanText,
} from 'lucide-react';

export const SUPER_ADMIN_NAV = [
  { to: '/super-admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/super-admin/users', label: 'Employees & Roles', icon: Users },
  { to: '/super-admin/content', label: 'Exams & Subjects', icon: BookOpen },
  { to: '/super-admin/papers', label: 'Question Papers', icon: FileCheck2 },
  { to: '/super-admin/schedule', label: 'Exam Scheduling', icon: CalendarClock },
  { to: '/super-admin/branding', label: 'White-labeling', icon: Palette },
  { to: '/super-admin/ocr', label: 'OCR Engine', icon: ScanText },
  { to: '/super-admin/audit', label: 'Audit Logs', icon: ScrollText },
  { to: '/super-admin/smtp', label: 'SMTP / Email Setup', icon: Mail },
  { to: '/super-admin/settings', label: 'System Configuration', icon: Settings },
];
