import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../services/api';
import BrandLogo from '../components/BrandLogo';

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    fullName: user.fullName || user.full_name || '',
    employeeCode: user.employeeCode || user.employee_code || ''
  };
}

export default function TwoFactorPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pendingRaw = sessionStorage.getItem('vclock_2fa_pending');
  const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

  useEffect(() => {
    if (!pending?.tempToken) {
      navigate('/', { replace: true });
    }
  }, [navigate, pending]);

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiPost('/2fa/verify-login', {
        tempToken: pending.tempToken,
        token: code
      });

      const user = normalizeUser(data.user);
      localStorage.setItem('vclock_token', data.token);
      localStorage.setItem('vclock_user', JSON.stringify(user));
      sessionStorage.removeItem('vclock_2fa_pending');
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/employee', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="phone-card login-card">
        <div className="login-logo-wrap">
          <BrandLogo className="login-card-logo" />
        </div>
        <div className="login-logo">אימות דו-שלבי</div>
        <div className="login-subtitle">
          הזן קוד בן 6 ספרות מאפליקציית האימות עבור {pending?.employeeCode || 'המשתמש'}
        </div>

        <form onSubmit={handleVerify} className="form-grid">
          <label>
            <span>קוד אימות</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary-btn" disabled={loading || code.length !== 6}>
            {loading ? 'מאמת...' : 'המשך למערכת'}
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              sessionStorage.removeItem('vclock_2fa_pending');
              navigate('/', { replace: true });
            }}
          >
            חזרה להתחברות
          </button>
        </form>
      </div>
    </div>
  );
}
