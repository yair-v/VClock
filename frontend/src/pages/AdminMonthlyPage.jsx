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

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatWorkDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('he-IL');
  } catch {
    return value;
  }
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

export default function AdminMonthlyPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  async function loadData(selectedMonth = month) {
    setError('');
    try {
      const data = await apiGet(`/admin/monthly-summary?month=${selectedMonth}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData(month);
  }, []);

  return (
    <div className="card-page">
      <div className="section-header">
        <h2>דוח שעות חודשי</h2>
        <div className="inline-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="primary-btn small" onClick={() => loadData(month)}>טען דוח</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>עובד</th>
              <th>קוד</th>
              <th>כניסה ראשונה</th>
              <th>יציאה אחרונה</th>
              <th>סה"כ שעות</th>
              <th>בוקר</th>
              <th>צהריים</th>
              <th>ערב</th>
              <th>סה"כ ארוחות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.employee_code}_${row.work_date}_${index}`}>
                <td>{formatWorkDate(row.work_date)}</td>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.first_in ? formatLocalDateTime(row.first_in).split(', ')[1] : '-'}</td>
                <td>{row.last_out ? formatLocalDateTime(row.last_out).split(', ')[1] : '-'}</td>
                <td>{row.totalHours || '-'}</td>
                <td>{row.breakfast_count || 0} / ₪{formatMoney(row.breakfast_total)}</td>
                <td>{row.lunch_count || 0} / ₪{formatMoney(row.lunch_total)}</td>
                <td>{row.dinner_count || 0} / ₪{formatMoney(row.dinner_total)}</td>
                <td>₪{formatMoney(row.meals_total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="10" className="empty-cell">אין נתונים לחודש הזה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
