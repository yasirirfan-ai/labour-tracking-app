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

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'manager' | 'employee' }) => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'manager' ? '/' : '/worker-portal'} replace />;
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
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
