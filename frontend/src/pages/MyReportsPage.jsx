import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

function formatDateTime(value) {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) return `${match[4]}:${match[5]}:${match[6] || '00'} ${match[3]}/${match[2]}/${match[1]}`;
  return text;
}

export default function MyReportsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadRows() {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/my-records');
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
    <div className="card-page">
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
              <th>הזמן שהוזן ידנית</th>
              <th>חותמת זמן ביצוע הפעולה</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>הערה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.record_time)}</td>
                <td>{formatDateTime(row.created_at)}</td>
                <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>{row.work_day_type}</td>
                <td>{row.note || '-'}</td>
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
