import { useEffect } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import EmployeePage from './pages/EmployeePage';
import MyReportsPage from './pages/MyReportsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminMonthlyPage from './pages/AdminMonthlyPage';
import AdminDepartmentsPage from './pages/AdminDepartmentsPage';
import TwoFactorPage from './pages/TwoFactorPage';
import TwoFactorSettingsPage from './pages/TwoFactorSettingsPage';
import BrandLogo from './components/BrandLogo';

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    fullName: user.fullName || user.full_name || '',
    employeeCode: user.employeeCode || user.employee_code || ''
  };
}

function getCurrentUser() {
  const raw = localStorage.getItem('vclock_user');
  if (!raw) return null;

  try {
    return normalizeUser(JSON.parse(raw));
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
  const location = useLocation();
  const isLoginPage = location.pathname === '/' || location.pathname === '/two-factor';

  function logout() {
    localStorage.removeItem('vclock_token');
    localStorage.removeItem('vclock_user');
    sessionStorage.removeItem('vclock_2fa_pending');
    navigate('/');
  }

  return (
    <div className={`app-shell ${user ? 'app-shell-auth' : 'app-shell-guest'}`}>
      <div className={`screen-brand-banner ${isLoginPage ? 'is-login' : ''}`}>
        <div className="screen-brand-inner">
          <BrandLogo className="screen-brand-logo" />
          <div className="screen-brand-text">
            <div className="screen-brand-title">VClock</div>
            <div className="screen-brand-subtitle">מערכת שעון נוכחות</div>
          </div>
        </div>
      </div>

      {user && (
        <header className="topbar">
          <div>
            <div className="brand">VClock</div>
            <div className="sub-brand">{user.fullName} | {user.employeeCode}</div>
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
                <Link className="nav-btn" to="/admin/departments">מחלקות</Link>
              </>
            )}

            <Link className="nav-btn" to="/security/two-factor">אבטחה</Link>
            <button className="nav-btn danger" onClick={logout}>התנתק</button>
          </div>
        </header>
      )}

      <main className="page-wrap">{children}</main>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('vclock-app-ready'));
    }, 900);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/two-factor" element={<TwoFactorPage />} />
        <Route path="/employee" element={<ProtectedRoute><EmployeePage /></ProtectedRoute>} />
        <Route path="/my-reports" element={<ProtectedRoute><MyReportsPage /></ProtectedRoute>} />
        <Route path="/security/two-factor" element={<ProtectedRoute><TwoFactorSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute adminOnly><AdminReportsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/monthly" element={<ProtectedRoute adminOnly><AdminMonthlyPage /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute adminOnly><AdminDepartmentsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
