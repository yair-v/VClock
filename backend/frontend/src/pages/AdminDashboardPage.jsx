import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function loadData() {
    try {
      const result = await apiGet('/admin/dashboard');
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="card-page">
      <div className="section-header">
        <h2>דשבורד מנהל</h2>
        <button className="secondary-btn small" onClick={loadData}>רענן</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="dashboard-grid">
        <div className="stat-card"><strong>{data?.totalActiveUsers ?? 0}</strong><span>עובדים פעילים</span></div>
        <div className="stat-card"><strong>{data?.todayRecords ?? 0}</strong><span>דיווחים היום</span></div>
        <div className="stat-card"><strong>{data?.currentlyCheckedIn ?? 0}</strong><span>כרגע בעבודה</span></div>
      </div>

      <div className="table-card">
        <div className="section-title">10 דיווחים אחרונים</div>
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>זמן</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recentRecords || []).map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>{row.work_day_type}</td>
                <td>{new Date(row.record_time).toLocaleString('he-IL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
