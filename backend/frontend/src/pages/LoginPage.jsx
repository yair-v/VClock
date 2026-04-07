import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('vclock_user');
    if (raw) {
      const user = JSON.parse(raw);
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/employee');
    }
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiPost('/auth/login', { employeeCode, password });
      localStorage.setItem('vclock_token', data.token);
      localStorage.setItem('vclock_user', JSON.stringify(data.user));
      navigate(data.user.role === 'admin' ? '/admin/dashboard' : '/employee');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="phone-card login-card">
        <div className="login-logo">VClock</div>
        <div className="login-subtitle">מערכת שעון נוכחות</div>

        <form onSubmit={handleLogin} className="form-grid">
          <label>
            <span>קוד עובד</span>
            <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="הכנס קוד עובד" />
          </label>

          <label>
            <span>סיסמה</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="הכנס סיסמה" />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary-btn" disabled={loading}>
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>

        <div className="helper-box">
          <strong>משתמשי הדגמה</strong>
          <div>מנהל: admin / 1234</div>
          <div>עובד: 1001 / 1234</div>
        </div>
      </div>
    </div>
  );
}
