import { useEffect, useState } from 'react';
import { apiGet } from '../services/api';

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminMonthlyPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  async function loadData(selectedMonth = month) {
    setError('');

    try {
      const data = await apiGet(`/api/admin/monthly-summary?month=${selectedMonth}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData(month);
  }, []);

  return (
    <div className="content-card">
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
              <th>סוגי יום</th>
              <th>סה"כ שעות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.employee_code}_${row.work_date}_${index}`}>
                <td>{row.work_date}</td>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.first_in ? new Date(row.first_in).toLocaleTimeString('he-IL') : '-'}</td>
                <td>{row.last_out ? new Date(row.last_out).toLocaleTimeString('he-IL') : '-'}</td>
                <td>{row.work_day_types || '-'}</td>
                <td>{row.totalHours || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="7" className="empty-cell">אין נתונים לחודש הזה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
