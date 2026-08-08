import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RoleGuard from './components/RoleGuard.jsx';

import Login from './pages/auth/Login.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import Profile from './pages/account/Profile.jsx';

import SuperAdminDashboard from './pages/superadmin/Dashboard.jsx';
import UserManagement from './pages/superadmin/UserManagement.jsx';
import ContentManagement from './pages/superadmin/ContentManagement.jsx';
import PaperAssembly from './pages/superadmin/PaperAssembly.jsx';
import ExamScheduling from './pages/superadmin/ExamScheduling.jsx';
import BrandingSettings from './pages/superadmin/BrandingSettings.jsx';
import OcrSettings from './pages/superadmin/OcrSettings.jsx';
import AuditLogViewer from './pages/superadmin/AuditLogViewer.jsx';
import SmtpSettings from './pages/superadmin/SmtpSettings.jsx';
import SystemSettings from './pages/superadmin/SystemSettings.jsx';

import QuestionBuilder from './pages/admin/QuestionBuilder.jsx';
import AdminPapers from './pages/admin/AdminPapers.jsx';
import MyQuestions from './pages/admin/MyQuestions.jsx';
import ReviewQueue from './pages/sme/ReviewQueue.jsx';
import ExamGate from './pages/student/ExamGate.jsx';
import ExamRoom from './pages/student/ExamRoom.jsx';

function guarded(roles, element) {
  return <RoleGuard roles={roles}>{element}</RoleGuard>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* No roles restriction — any authenticated user (every role) can
          reach their own profile / change their own password. */}
      <Route path="/profile" element={guarded(undefined, <Profile />)} />

      <Route path="/super-admin" element={guarded(['Super Admin'], <SuperAdminDashboard />)} />
      <Route path="/super-admin/users" element={guarded(['Super Admin'], <UserManagement />)} />
      <Route path="/super-admin/content" element={guarded(['Super Admin'], <ContentManagement />)} />
      <Route path="/super-admin/papers" element={guarded(['Super Admin'], <PaperAssembly />)} />
      <Route path="/super-admin/schedule" element={guarded(['Super Admin'], <ExamScheduling />)} />
      <Route path="/super-admin/branding" element={guarded(['Super Admin'], <BrandingSettings />)} />
      <Route path="/super-admin/ocr" element={guarded(['Super Admin'], <OcrSettings />)} />
      <Route path="/super-admin/audit" element={guarded(['Super Admin'], <AuditLogViewer />)} />
      <Route path="/super-admin/smtp" element={guarded(['Super Admin'], <SmtpSettings />)} />
      <Route path="/super-admin/settings" element={guarded(['Super Admin'], <SystemSettings />)} />

      <Route path="/admin" element={guarded(['Admin', 'Super Admin'], <QuestionBuilder />)} />
      <Route path="/admin/questions" element={guarded(['Admin', 'Super Admin'], <QuestionBuilder />)} />
      <Route path="/admin/my-questions" element={guarded(['Admin', 'Super Admin'], <MyQuestions />)} />
      <Route path="/admin/papers" element={guarded(['Admin', 'Super Admin'], <AdminPapers />)} />
      <Route path="/sme/*" element={guarded(['SME', 'Paper Approver', 'Super Admin'], <ReviewQueue />)} />

      <Route path="/exam/:examCode" element={<ExamGate />} />
      <Route path="/exam/:examCode/room" element={<ExamRoom />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
