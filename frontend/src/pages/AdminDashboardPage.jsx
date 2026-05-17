import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

function formatToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(value) {
  if (!value) return '-';
  const text = String(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[4]}:${m[5]}:${m[6] || '00'}` : text;
}

export default function AdminDashboardPage() {
  const [date, setDate] = useState(formatToday());
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [inactiveEmployees, setInactiveEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadData(nextDate = date) {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet(`/admin/dashboard?date=${encodeURIComponent(nextDate)}`);
      setActiveEmployees(Array.isArray(data?.activeEmployees) ? data.activeEmployees : []);
      setInactiveEmployees(Array.isArray(data?.inactiveEmployees) ? data.inactiveEmployees : []);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הדשבורד');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="page-card">
      <div className="page-header-row">
        <div>
          <h1>דשבורד</h1>
          <p>רשימת עובדים תחת המשתמש: נמצאים בעבודה / לא נמצאים בעבודה.</p>
        </div>

        <button className="secondary-btn" type="button" onClick={() => loadData()} disabled={loading}>
          רענן
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="filters-row" style={{ marginBottom: 18 }}>
        <label>
          <span>תאריך להצגה</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadData(e.target.value);
            }}
          />
        </label>
      </div>

      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card"><span>נמצאים בעבודה</span><strong>{activeEmployees.length}</strong></div>
        <div className="stat-card"><span>לא נמצאים בעבודה</span><strong>{inactiveEmployees.length}</strong></div>
        <div className="stat-card"><span>סה״כ עובדים להצגה</span><strong>{activeEmployees.length + inactiveEmployees.length}</strong></div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <h3>עובדים פעילים — נמצאים בעבודה</h3>
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד עובד</th>
              <th>מחלקה</th>
              <th>שעת כניסה אחרונה</th>
              <th>סוג יום</th>
            </tr>
          </thead>
          <tbody>
            {activeEmployees.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.department_name || '-'}</td>
                <td>{formatTime(row.last_record_time)}</td>
                <td>{row.work_day_type || '-'}</td>
              </tr>
            ))}
            {!activeEmployees.length && !loading && (
              <tr><td colSpan="5" className="empty-cell">אין עובדים פעילים כרגע</td></tr>
            )}
            {loading && <tr><td colSpan="5" className="empty-cell">טוען...</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <h3>עובדים לא פעילים היום — לא נמצאים בעבודה</h3>
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד עובד</th>
              <th>מחלקה</th>
              <th>סטטוס אחרון היום</th>
              <th>שעת פעולה אחרונה</th>
            </tr>
          </thead>
          <tbody>
            {inactiveEmployees.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.department_name || '-'}</td>
                <td>{row.last_record_type === 'out' ? 'יצא' : 'ללא כניסה היום'}</td>
                <td>{formatTime(row.last_record_time)}</td>
              </tr>
            ))}
            {!inactiveEmployees.length && !loading && (
              <tr><td colSpan="5" className="empty-cell">אין עובדים לא פעילים להצגה</td></tr>
            )}
            {loading && <tr><td colSpan="5" className="empty-cell">טוען...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
