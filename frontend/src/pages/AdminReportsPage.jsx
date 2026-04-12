import { useEffect, useState } from 'react';
import { apiGet, exportExcel } from '../services/api';

export default function AdminReportsPage() {
  const [filters, setFilters] = useState({ employeeCode: '', dateFrom: '', dateTo: '' });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  function queryString() {
    const params = new URLSearchParams();
    if (filters.employeeCode) params.append('employeeCode', filters.employeeCode);
    if (filters.dateFrom) params.append('fromDate', filters.dateFrom);
    if (filters.dateTo) params.append('toDate', filters.dateTo);
    return params.toString() ? `?${params.toString()}` : '';
  }

  async function loadData() {
    setError('');
    try {
      const data = await apiGet(`/admin/reports${queryString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="card-page">
      <div className="section-header">
        <h2>כל הדיווחים</h2>
        <div className="inline-actions">
          <button className="secondary-btn small" onClick={loadData}>חיפוש</button>
          <button className="primary-btn small" onClick={() => exportExcel(`/admin/export${queryString()}`)}>ייצוא לאקסל</button>
        </div>
      </div>

      <div className="filter-grid">
        <input placeholder="קוד עובד או שם עובד" value={filters.employeeCode} onChange={(e) => setFilters({ ...filters, employeeCode: e.target.value })} />
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
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
              <th>תאריך ושעה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.full_name}</td>
                <td>{row.employee_code}</td>
                <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>{row.work_day_type}</td>
                <td>{row.note || '-'}</td>
                <td>{new Date(row.record_time).toLocaleString('he-IL')}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="6" className="empty-cell">אין נתונים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
