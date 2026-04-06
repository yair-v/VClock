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
    try {
      const data = await apiGet(`/admin/monthly-report?month=${selectedMonth}`);
      setRows(data);
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.userId}_${row.date}_${index}`}>
                <td>{row.date}</td>
                <td>{row.fullName}</td>
                <td>{row.employeeCode}</td>
                <td>{row.firstIn ? new Date(row.firstIn).toLocaleTimeString('he-IL') : '-'}</td>
                <td>{row.lastOut ? new Date(row.lastOut).toLocaleTimeString('he-IL') : '-'}</td>
                <td>{row.totalHours}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="6" className="empty-cell">אין נתונים לחודש הזה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
