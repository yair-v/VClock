import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../services/api';

function formatToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('he-IL');
  } catch {
    return value;
  }
}

export default function AdminDashboardPage() {
  const [daysBack, setDaysBack] = useState('14');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        in: acc.in + Number(row.in_count || 0),
        out: acc.out + Number(row.out_count || 0)
      }),
      { in: 0, out: 0 }
    );
  }, [rows]);

  async function loadData(nextDays = daysBack) {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet(`/admin/dashboard?days=${encodeURIComponent(nextDays)}`);
      setRows(Array.isArray(data?.days) ? data.days : []);
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
          <p>סיכום פשוט של כמות כניסות ויציאות בכל יום.</p>
        </div>

        <button className="secondary-btn" type="button" onClick={() => loadData()} disabled={loading}>
          רענן
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <span>סה״כ כניסות בטווח</span>
          <strong>{totals.in}</strong>
        </div>
        <div className="stat-card">
          <span>סה״כ יציאות בטווח</span>
          <strong>{totals.out}</strong>
        </div>
        <div className="stat-card">
          <span>נכון לתאריך</span>
          <strong>{formatDate(formatToday())}</strong>
        </div>
      </div>

      <div className="filters-row" style={{ marginBottom: 18 }}>
        <label>
          <span>טווח ימים להצגה</span>
          <select
            value={daysBack}
            onChange={(e) => {
              setDaysBack(e.target.value);
              loadData(e.target.value);
            }}
          >
            <option value="7">7 ימים</option>
            <option value="14">14 ימים</option>
            <option value="30">30 ימים</option>
            <option value="60">60 ימים</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>כניסות</th>
              <th>יציאות</th>
              <th>מאזן יומי</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const inCount = Number(row.in_count || 0);
              const outCount = Number(row.out_count || 0);
              return (
                <tr key={row.day}>
                  <td>{formatDate(row.day)}</td>
                  <td>{inCount}</td>
                  <td>{outCount}</td>
                  <td>{inCount - outCount}</td>
                </tr>
              );
            })}

            {!rows.length && !loading && (
              <tr>
                <td colSpan="4" className="empty-cell">אין נתונים להצגה</td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan="4" className="empty-cell">טוען...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
