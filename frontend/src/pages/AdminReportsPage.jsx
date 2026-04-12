import { useEffect, useState } from 'react';
import { apiGet, exportExcel } from '../services/api';

export default function AdminReportsPage() {
  const [filters, setFilters] = useState({
    employeeCode: '',
    fromDate: '',
    toDate: '',
    approvalStatus: ''
  });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  function queryString() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    return params.toString() ? `?${params.toString()}` : '';
  }

  async function loadData() {
    setError('');

    try {
      const data = await apiGet(`/api/admin/reports${queryString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="content-card">
      <div className="section-header">
        <h2>כל הדיווחים</h2>
        <div className="inline-actions">
          <button className="secondary-btn small" onClick={loadData}>חיפוש</button>
          <button className="primary-btn small" onClick={() => exportExcel(`/api/admin/export${queryString()}`, 'vclock-attendance.xlsx')}>
            ייצוא לאקסל
          </button>
        </div>
      </div>

      <div className="filter-grid">
        <input placeholder="קוד או שם עובד" value={filters.employeeCode} onChange={(e) => setFilters({ ...filters, employeeCode: e.target.value })} />
        <select value={filters.approvalStatus} onChange={(e) => setFilters({ ...filters, approvalStatus: e.target.value })}>
          <option value="">כל הסטטוסים</option>
          <option value="approved">approved</option>
          <option value="pending">pending</option>
          <option value="rejected">rejected</option>
        </select>
        <input type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} />
        <input type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} />
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>הערה</th>
              <th>אישור</th>
              <th>תאריך ושעה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>{row.work_day_type || '-'}</td>
                <td>{row.note || '-'}</td>
                <td>{row.approval_status || '-'}</td>
                <td>{new Date(row.record_time).toLocaleString('he-IL')}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="7" className="empty-cell">אין נתונים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
