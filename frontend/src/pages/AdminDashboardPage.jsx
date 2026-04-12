import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function loadData() {
    setError('');

    try {
      const result = await apiGet('/api/admin/dashboard');
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="content-card">
      <div className="section-header">
        <h2>דשבורד מנהל</h2>
        <button className="secondary-btn small" onClick={loadData}>רענן</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="dashboard-grid">
        <div className="stat-card"><strong>{data?.activeUsers ?? 0}</strong><span>עובדים פעילים</span></div>
        <div className="stat-card"><strong>{data?.todayRecords ?? 0}</strong><span>דיווחים היום</span></div>
        <div className="stat-card"><strong>{data?.pendingApprovals ?? 0}</strong><span>ממתינים לאישור</span></div>
        <div className="stat-card"><strong>{data?.totalRecords ?? 0}</strong><span>סה״כ דיווחים</span></div>
      </div>

      <div className="table-card">
        <div className="section-title">עובדים עם יום סגור</div>
        <table>
          <thead>
            <tr>
              <th>שם עובד</th>
              <th>קוד עובד</th>
            </tr>
          </thead>
          <tbody>
            {(data?.actionRequests || []).map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
              </tr>
            ))}
            {(!data?.actionRequests || data.actionRequests.length === 0) && (
              <tr><td colSpan="2" className="empty-cell">אין עובדים עם יום סגור כרגע</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
