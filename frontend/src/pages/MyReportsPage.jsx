import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

export default function MyReportsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadRows() {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet('/api/my-records');
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  return (
    <div className="content-card">
      <div className="section-header">
        <h2>הדיווחים שלי</h2>
        <button className="secondary-btn small" onClick={loadRows}>רענן</button>
      </div>

      {loading && <div className="alert">טוען...</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>תאריך ושעה</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>הערה</th>
              <th>אישור</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.record_time).toLocaleString('he-IL')}</td>
                <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>{row.work_day_type || '-'}</td>
                <td>{row.note || '-'}</td>
                <td>{row.approval_status || '-'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan="5" className="empty-cell">אין דיווחים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
