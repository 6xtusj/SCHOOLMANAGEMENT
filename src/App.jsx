import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here
import RoleRedirect from '@/pages/RoleRedirect';
import AccountNotifications from '@/pages/AccountNotifications';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminStudents from '@/pages/AdminStudents';
import AdminStaff from '@/pages/AdminStaff';
import AdminAcademics from '@/pages/AdminAcademics';
import AdminResults from '@/pages/AdminResults';
import AdminAttendance from '@/pages/AdminAttendance';
import AdminStaffAttendance from '@/pages/AdminStaffAttendance';
import AdminFinance from '@/pages/AdminFinance';
import AdminTimetable from '@/pages/AdminTimetable';
import AdminResources from '@/pages/AdminResources';
import AdminSettings from '@/pages/AdminSettings';
import AdminWorkflowDesk from '@/pages/AdminWorkflowDesk';
import AdminHandoverPage from '@/pages/AdminHandoverPage';
import TeacherDashboard from '@/pages/TeacherDashboard';
import TeacherResults from '@/pages/TeacherResults';
import TeacherAttendance from '@/pages/TeacherAttendance';
import TeacherTimetable from '@/pages/TeacherTimetable';
import StudentPortal from '@/pages/StudentPortal';
import ParentPortal from '@/pages/ParentPortal';
import LibraryPortal from '@/pages/LibraryPortal';
import BursaryPortal from '@/pages/BursaryPortal';
import AdminAccounts from '@/pages/AdminAccounts';
import AccountSuspended from '@/pages/AccountSuspended';
import TeacherWorkspace from '@/pages/TeacherWorkspace';
import PrincipalPortal from '@/pages/PrincipalPortal';
import AdminRequests from '@/pages/AdminRequests';
import AccountProfile from '@/pages/AccountProfile';
import StudentRecordProfile from '@/pages/StudentRecordProfile';
import PublicHome from '@/pages/PublicHome';
import AdmissionPortal from '@/pages/AdmissionPortal';
import AdmissionPrint from '@/pages/AdmissionPrint';
import AdminAdmissions from '@/pages/AdminAdmissions';
import PrincipalReceiptApprovals from '@/pages/PrincipalReceiptApprovals';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<PublicHome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admissions" element={<AdmissionPortal />} />
      <Route path="/admissions/print" element={<AdmissionPrint />} />
      <Route path="/account-suspended" element={<AccountSuspended />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/workspace" element={<RoleRedirect />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/admissions" element={<AdminAdmissions />} />
        <Route path="/admin/requests" element={<AdminRequests />} />
        <Route path="/account/profile" element={<AccountProfile />} />
        <Route path="/account/notifications" element={<AccountNotifications />} />
        <Route path="/principal/:section?" element={<PrincipalPortal />} />
        <Route path="/principal/receipt-approvals" element={<PrincipalReceiptApprovals />} />
        <Route path="/school-students/:id" element={<StudentRecordProfile />} />
        <Route path="/admin/students" element={<AdminStudents />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/accounts" element={<AdminAccounts />} />
        <Route path="/admin/academics" element={<AdminAcademics />} />
        <Route path="/admin/results" element={<AdminResults />} />
        <Route path="/admin/attendance" element={<AdminAttendance />} />
        <Route path="/admin/staff-attendance" element={<AdminStaffAttendance />} />
        <Route path="/admin/finance" element={<AdminFinance />} />
        <Route path="/admin/timetable" element={<AdminTimetable />} />
        <Route path="/admin/resources" element={<AdminResources />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/workflows" element={<AdminWorkflowDesk />} />
        <Route path="/admin/handover" element={<AdminHandoverPage />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/:section" element={<TeacherWorkspace />} />
        <Route path="/teacher/results" element={<TeacherResults />} />
        <Route path="/teacher/attendance" element={<TeacherAttendance />} />
        <Route path="/teacher/timetable" element={<TeacherTimetable />} />
        <Route path="/student/:section?" element={<StudentPortal />} />
        <Route path="/parent/:section?" element={<ParentPortal />} />
        <Route path="/library/:tab?" element={<LibraryPortal />} />
        <Route path="/bursary/:tab?" element={<BursaryPortal />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App