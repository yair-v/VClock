import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import EmployeePage from './pages/EmployeePage';
import MyReportsPage from './pages/MyReportsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminMonthlyPage from './pages/AdminMonthlyPage';
import BrandLogo from './components/BrandLogo';

function getCurrentUser() {
  const raw = localStorage.getItem('vclock_user');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ProtectedRoute({ children, adminOnly = false }) {
  const user = getCurrentUser();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/employee" replace />;
  }

  return children;
}

function Layout({ children }) {
  const user = getCurrentUser();
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('vclock_token');
    localStorage.removeItem('vclock_user');
    navigate('/');
  }

  return (
    <div className="app-shell">
      {user && (
        <header className="topbar">
          <div className="brand-cluster">
            <div className="brand-logo-box">
              <BrandLogo size={56} />
            </div>
            <div>
              <div className="brand">VClock</div>
              <div className="sub-brand">{user.fullName} | {user.employeeCode}</div>
            </div>
          </div>
          <div className="topbar-actions">
            {user.role === 'employee' && (
              <>
                <Link className="nav-btn" to="/employee">דיווח</Link>
                <Link className="nav-btn" to="/my-reports">הדיווחים שלי</Link>
              </>
            )}
            {user.role === 'admin' && (
              <>
                <Link className="nav-btn" to="/admin/dashboard">דשבורד</Link>
                <Link className="nav-btn" to="/admin/reports">דיווחים</Link>
                <Link className="nav-btn" to="/admin/monthly">חודשי</Link>
                <Link className="nav-btn" to="/admin/users">משתמשים</Link>
              </>
            )}
            <button className="nav-btn danger" onClick={logout}>התנתק</button>
          </div>
        </header>
      )}
      <main className="page-wrap">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/employee" element={<ProtectedRoute><EmployeePage /></ProtectedRoute>} />
        <Route path="/my-reports" element={<ProtectedRoute><MyReportsPage /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute adminOnly><AdminReportsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/monthly" element={<ProtectedRoute adminOnly><AdminMonthlyPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
