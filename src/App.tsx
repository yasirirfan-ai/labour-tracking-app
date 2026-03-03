import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { OperationsPage } from './pages/OperationsPage';
import { WorkersPage } from './pages/WorkersPage';
import { ManufacturingOrdersPage } from './pages/ManufacturingOrdersPage';
import { ControlMatrixPage } from './pages/ControlMatrixPage';
import { ControlTablePage } from './pages/ControlTablePage';
import { EmployeeActivityPage } from './pages/EmployeeActivityPage';
import { ReportsPage } from './pages/ReportsPage';
import { WorkerPortalPage } from './pages/WorkerPortalPage';
import { DisciplineAdminPage } from './pages/DisciplineAdminPage';
import { NfcManagementPage } from './pages/NfcManagementPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/worker-portal" element={<WorkerPortalPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="control-matrix" element={<ControlMatrixPage />} />
            <Route path="control-table" element={<ControlTablePage />} />
            <Route path="manufacturing-orders" element={<ManufacturingOrdersPage />} />
            <Route path="employee-activity" element={<EmployeeActivityPage />} />
            <Route path="workers" element={<WorkersPage />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="discipline" element={<DisciplineAdminPage />} />
            <Route path="nfc" element={<NfcManagementPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
