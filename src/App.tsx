import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { OperationsPage } from './pages/OperationsPage';
import { WorkersPage } from './pages/WorkersPage';
import { ManufacturingOrdersPage } from './pages/ManufacturingOrdersPage';
import { ControlMatrixPage } from './pages/ControlMatrixPage';
import { ControlTablePage } from './pages/ControlTablePage';
import { EmployeeActivityPage } from './pages/EmployeeActivityPage';
import { HireWorkerPage } from './pages/HireWorkerPage';
import { WorkerPortalPage } from './pages/WorkerPortalPage';
import { LeaveRequestsPage } from './pages/LeaveRequestsPage';
import { EmployeeDetailView } from './pages/EmployeeDetailView';
import { DisciplineAdminPage } from './pages/DisciplineAdminPage';
import { NfcManagementPage } from './pages/NfcManagementPage';
import { WorkerSelectPage } from './pages/WorkerSelectPage';
import { ReportsPage } from './pages/ReportsPage';
import { FuturePlanningPage } from './pages/FuturePlanningPage';

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'manager' | 'employee' }) => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Admin and Manager share the same dashboard for now, so a 'manager' route
  // requirement is satisfied by either role.
  const hasRequiredRole = !role || user.role === role || (role === 'manager' && user.role === 'admin');
  if (!hasRequiredRole) {
    return <Navigate to={(user.role === 'manager' || user.role === 'admin') ? '/' : '/worker-portal'} replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/worker-select" element={<WorkerSelectPage />} />

          <Route path="/worker-portal" element={
            <ProtectedRoute role="employee">
              <WorkerPortalPage />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute role="manager">
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="workers" element={<WorkersPage />} />
            <Route path="workers/hire" element={<HireWorkerPage />} />
            <Route path="workers/edit/:id" element={<HireWorkerPage />} />
            <Route path="workers/:id" element={<EmployeeDetailView />} />
            <Route path="manufacturing-orders" element={<ManufacturingOrdersPage />} />
            <Route path="control-matrix" element={<ControlMatrixPage />} />
            <Route path="control-table" element={<ControlTablePage />} />
            <Route path="employee-activity" element={<EmployeeActivityPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="discipline" element={<DisciplineAdminPage />} />
            <Route path="leave-requests" element={<LeaveRequestsPage />} />
            <Route path="nfc" element={<NfcManagementPage />} />
            <Route path="future-planning" element={<FuturePlanningPage />} />
          </Route>
        </Routes>
        <StagingIndicator />
      </AuthProvider>
    </Router>
  );
}

const StagingIndicator = () => {
  const isStaging = import.meta.env.VITE_SUPABASE_URL?.includes('shmrlavsryzorpbrdqcn');
  if (!isStaging) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      background: 'rgba(239, 68, 68, 0.95)',
      color: 'white',
      padding: '0.6rem 1.2rem',
      borderRadius: '30px',
      fontSize: '0.8rem',
      fontWeight: 800,
      zIndex: 99999,
      boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      pointerEvents: 'none',
      fontFamily: "'Inter', sans-serif",
      userSelect: 'none'
    }}>
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        background: 'white',
        borderRadius: '50%',
        animation: 'pulseStaging 1.5s infinite'
      }}></span>
      Staging Database Active
      <style>{`
        @keyframes pulseStaging {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default App;
