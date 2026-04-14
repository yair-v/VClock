frontend / src / pages / AdminDashboardPage.jsx
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../services/api';

export default function AdminDashboardPage() {
  const [data, setData] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRecords: 0,
    todayRecords: 0,
    pendingApprovals: 0,
    actionRequests: []
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  async function loadDashboard() {
    setError('');
    try {
      const result = await apiGet('/admin/dashboard');
      setData({
        totalUsers: result.totalUsers || 0,
        activeUsers: result.activeUsers || 0,
        totalRecords: result.totalRecords || 0,
        todayRecords: result.todayRecords || 0,
        pendingApprovals: result.pendingApprovals || 0,
        actionRequests: Array.isArray(result.actionRequests) ? result.actionRequests : []
      });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function reopenDay(user) {
    const ok = window.confirm(`לשחרר את ${user.full_name} לפתיחה מחדש של היום?`);
    if (!ok) return;

    setMessage('');
    setError('');
    setLoadingId(user.id);

    try {
      await apiPost(`/admin/users/${user.id}/reopen-day`, {});
      setMessage(`יום העבודה של ${user.full_name} שוחרר בהצלחה`);
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="card-page">
      <div className="section-header">
        <h2>דשבורד מנהל</h2>
        <button className="secondary-btn small" onClick={loadDashboard} type="button">
          רענן
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="dashboard-grid">
        <div className="stat-card">
          <strong>{data.totalUsers}</strong>
          <span>סה"כ עובדים</span>
        </div>

        <div className="stat-card">
          <strong>{data.activeUsers}</strong>
          <span>עובדים פעילים</span>
        </div>

        <div className="stat-card">
          <strong>{data.todayRecords}</strong>
          <span>דיווחים היום</span>
        </div>

        <div className="stat-card">
          <strong>{data.pendingApprovals}</strong>
          <span>ממתינים לאישור</span>
        </div>
      </div>

      <div className="table-card">
        <div className="section-title">בקשות שחרור / פתיחה מחדש</div>

        <table>
          <thead>
            <tr>
              <th>קוד עובד</th>
              <th>שם עובד</th>
              <th>פעולה</th>
            </tr>
          </thead>

          <tbody>
            {data.actionRequests.map((user) => (
              <tr key={user.id}>
                <td>{user.employee_code}</td>
                <td>{user.full_name}</td>
                <td>
                  <button
                    className="primary-btn small"
                    type="button"
                    disabled={loadingId === user.id}
                    onClick={() => reopenDay(user)}
                  >
                    {loadingId === user.id ? 'משחרר...' : 'שחרר'}
                  </button>
                </td>
              </tr>
            ))}

            {data.actionRequests.length === 0 && (
              <tr>
                <td colSpan="3" className="empty-cell">
                  אין עובדים שממתינים לשחרור כרגע
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}