import { LayoutDashboard, PenSquare, ListChecks, FileStack } from 'lucide-react';

export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/questions', label: 'Question Builder', icon: PenSquare },
  { to: '/admin/my-questions', label: 'My Questions', icon: ListChecks },
  { to: '/admin/papers', label: 'Assemble Papers', icon: FileStack },
];
