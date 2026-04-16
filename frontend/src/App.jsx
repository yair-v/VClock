import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import EmployeePage from './pages/EmployeePage';
import MyReportsPage from './pages/MyReportsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminMonthlyPage from './pages/AdminMonthlyPage';
import AdminDepartmentsPage from './pages/AdminDepartmentsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
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

function MenuLink({ to, children, onNavigate, className = '' }) {
  return (
    <Link
      to={to}
      className={className || 'menu-link'}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

function Layout({ children }) {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/';

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setSettingsOpen(false);
  }, [location.pathname]);

  function logout() {
    localStorage.removeItem('vclock_token');
    localStorage.removeItem('vclock_user');
    sessionStorage.removeItem('vclock_2fa_pending');
    setMenuOpen(false);
    setSettingsOpen(false);
    navigate('/');
  }

  function toggleMenu() {
    setMenuOpen((prev) => !prev);
  }

  function toggleSettings() {
    setSettingsOpen((prev) => !prev);
  }

  function closeMenu() {
    setMenuOpen(false);
    setSettingsOpen(false);
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
        <>
          <header className="topbar">
            <div>
              <div className="brand">VClock</div>
              <div className="sub-brand">{user.fullName} | {user.employeeCode}</div>
            </div>

            <div className="topbar-actions">
              <button
                type="button"
                className="nav-btn"
                onClick={toggleMenu}
                aria-label="פתח תפריט"
                aria-expanded={menuOpen}
              >
                ☰
              </button>
            </div>
          </header>

          {menuOpen && (
            <>
              <div
                onClick={closeMenu}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.28)',
                  zIndex: 998
                }}
              />

              <aside
                style={{
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  width: 'min(88vw, 340px)',
                  height: '100vh',
                  background: '#ffffff',
                  boxShadow: '0 0 28px rgba(0,0,0,0.18)',
                  zIndex: 999,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '18px 16px',
                  overflowY: 'auto'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20 }}>תפריט</div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>{user.fullName}</div>
                  </div>

                  <button
                    type="button"
                    className="nav-btn"
                    onClick={closeMenu}
                    aria-label="סגור תפריט"
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {user.role === 'employee' && (
                    <>
                      <MenuLink to="/employee" onNavigate={closeMenu}>
                        דיווח
                      </MenuLink>

                      <MenuLink to="/my-reports" onNavigate={closeMenu}>
                        הדיווחים שלי
                      </MenuLink>

                      <button
                        type="button"
                        className="menu-link menu-button"
                        onClick={toggleSettings}
                      >
                        הגדרות {settingsOpen ? '▾' : '▸'}
                      </button>

                      {settingsOpen && (
                        <div style={{ display: 'grid', gap: 8, paddingRight: 12 }}>
                          <MenuLink to="/security" onNavigate={closeMenu} className="menu-link sub-menu-link">
                            אבטחה
                          </MenuLink>
                        </div>
                      )}
                    </>
                  )}

                  {user.role === 'admin' && (
                    <>
                      <MenuLink to="/admin/dashboard" onNavigate={closeMenu}>
                        דשבורד
                      </MenuLink>

                      <MenuLink to="/admin/reports" onNavigate={closeMenu}>
                        דיווחים
                      </MenuLink>

                      <MenuLink to="/admin/monthly" onNavigate={closeMenu}>
                        חודשי
                      </MenuLink>

                      <button
                        type="button"
                        className="menu-link menu-button"
                        onClick={toggleSettings}
                      >
                        הגדרות {settingsOpen ? '▾' : '▸'}
                      </button>

                      {settingsOpen && (
                        <div style={{ display: 'grid', gap: 8, paddingRight: 12 }}>
                          <MenuLink to="/admin/settings" onNavigate={closeMenu} className="menu-link sub-menu-link">
                            הגדרות כלליות
                          </MenuLink>

                          <MenuLink to="/security" onNavigate={closeMenu} className="menu-link sub-menu-link">
                            אבטחה
                          </MenuLink>

                          <MenuLink to="/admin/departments" onNavigate={closeMenu} className="menu-link sub-menu-link">
                            מחלקות
                          </MenuLink>

                          <MenuLink to="/admin/users" onNavigate={closeMenu} className="menu-link sub-menu-link">
                            משתמשים
                          </MenuLink>
                        </div>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="menu-link menu-button danger"
                    onClick={logout}
                  >
                    התנתק
                  </button>
                </div>
              </aside>
            </>
          )}
        </>
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
        <Route path="/security" element={<ProtectedRoute><TwoFactorSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute adminOnly><AdminReportsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/monthly" element={<ProtectedRoute adminOnly><AdminMonthlyPage /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute adminOnly><AdminDepartmentsPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute adminOnly><AdminSettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}