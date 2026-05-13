import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return text;
}

function formatDateTime(value) {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) return `${match[4]}:${match[5]} ${match[3]}/${match[2]}/${match[1]}`;
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return text;
  }
}

function recordTypeLabel(type) {
  if (type === 'in') return 'כניסה';
  if (type === 'out') return 'יציאה';
  return 'לא דיווח היום';
}

function EmployeeTable({ title, rows, emptyText }) {
  return (
    <div className="dashboard-section" style={{ marginTop: 18 }}>
      <div className="page-header-row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="badge">{rows.length}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד עובד</th>
              <th>מחלקה</th>
              <th>סטטוס אחרון היום</th>
              <th>זמן דיווח ידני</th>
              <th>סוג יום</th>
              <th>סטטוס אישור</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name || '-'}</td>
                <td>{row.employee_code || '-'}</td>
                <td>{row.department_name || '-'}</td>
                <td>{recordTypeLabel(row.last_record_type)}</td>
                <td>{formatDateTime(row.last_record_time)}</td>
                <td>{row.work_day_type || '-'}</td>
                <td>{row.approval_status || '-'}</td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td colSpan="7" className="empty-cell">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [activeRows, setActiveRows] = useState([]);
  const [inactiveRows, setInactiveRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadData(dateValue = selectedDate) {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet(`/admin/dashboard?date=${encodeURIComponent(dateValue)}`);
      setActiveRows(Array.isArray(data?.active) ? data.active : []);
      setInactiveRows(Array.isArray(data?.inactive) ? data.inactive : []);
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
          <h1>דשבורד עובדים</h1>
          <p>רשימת העובדים תחת המשתמש: מי נמצא בעבודה ומי לא נמצא בעבודה באותו היום.</p>
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
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              loadData(e.target.value);
            }}
          />
        </label>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <span>נמצאים בעבודה</span>
          <strong>{activeRows.length}</strong>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <span>לא נמצאים בעבודה</span>
          <strong>{inactiveRows.length}</strong>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <span>תאריך</span>
          <strong>{formatDate(selectedDate)}</strong>
        </div>
      </div>

      {loading && <div className="empty-cell">טוען...</div>}

      <EmployeeTable
        title="עובדים פעילים / נמצאים בעבודה"
        rows={activeRows}
        emptyText="אין עובדים שנמצאים בעבודה בתאריך זה"
      />

      <EmployeeTable
        title="עובדים לא פעילים / לא נמצאים בעבודה היום"
        rows={inactiveRows}
        emptyText="אין עובדים לא פעילים בתאריך זה"
      />
    </div>
  );
}
