import { useEffect, useState } from 'react';

function formatLocalDateTime(value) {
  if (!value) return '-';
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, y, m, d, h, min, sec = '00'] = match;
    return `${Number(d)}.${Number(m)}.${y}, ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  try { return new Date(value).toLocaleString('he-IL'); } catch { return value; }
}

import { apiGet } from '../services/api';

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
                <td>{formatLocalDateTime(row.record_time)}</td>
                <td>{row.created_at ? formatLocalDateTime(row.created_at) : '-'}</td>
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
