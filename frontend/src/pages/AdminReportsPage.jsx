import { useEffect, useState } from 'react';
import { apiGet, apiPut, exportExcel } from '../services/api';

const workDayOptions = [
  'יום רגיל',
  'שישי',
  'שישי בתשלום',
  'שבת',
  'חג',
  'חופשה',
  'מחלה',
  'מחלת משפחה',
  'מילואים',
  'עבודה מהבית',
  'ארוחה',
  'אחר'
];

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('he-IL');
  } catch {
    return value;
  }
}

function formatForDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function AdminReportsPage() {
  const [filters, setFilters] = useState({
    employeeCode: '',
    dateFrom: '',
    dateTo: ''
  });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    work_day_type: '',
    note: '',
    manager_note: '',
    approval_status: 'approved',
    record_type: 'in',
    record_time: ''
  });

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

  function startEdit(row) {
    setMessage('');
    setError('');
    setEditingId(row.id);
    setEditForm({
      work_day_type: row.work_day_type || 'יום רגיל',
      note: row.note || '',
      manager_note: row.manager_note || '',
      approval_status: row.approval_status || 'approved',
      record_type: row.record_type || 'in',
      record_time: formatForDateTimeLocal(row.record_time)
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      work_day_type: '',
      note: '',
      manager_note: '',
      approval_status: 'approved',
      record_type: 'in',
      record_time: ''
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await apiPut(`/admin/reports/${id}`, {
        work_day_type: editForm.work_day_type,
        note: editForm.note,
        manager_note: editForm.manager_note,
        approval_status: editForm.approval_status,
        record_type: editForm.record_type,
        record_time: editForm.record_time
          ? new Date(editForm.record_time).toISOString()
          : null
      });

      setMessage('הדיווח עודכן בהצלחה');
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-page">
      <div className="section-header">
        <h2>כל הדיווחים</h2>
        <div className="inline-actions">
          <button className="secondary-btn small" type="button" onClick={loadData}>
            חיפוש
          </button>
          <button
            className="primary-btn small"
            type="button"
            onClick={() => exportExcel(`/admin/export${queryString()}`)}
          >
            ייצוא לאקסל
          </button>
        </div>
      </div>

      <div className="filter-grid">
        <input
          placeholder="קוד עובד או שם עובד"
          value={filters.employeeCode}
          onChange={(e) => setFilters({ ...filters, employeeCode: e.target.value })}
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        />
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>הערה</th>
              <th>הערת מנהל</th>
              <th>סטטוס</th>
              <th>תאריך ושעה</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const wasEdited = Boolean(row.is_edited);

              return (
                <tr
                  key={row.id}
                  style={wasEdited ? { background: 'rgba(255, 248, 220, 0.65)' } : undefined}
                >
                  <td>
                    {row.full_name} {wasEdited ? '★' : ''}
                  </td>
                  <td>{row.employee_code}</td>

                  <td>
                    {isEditing ? (
                      <select
                        value={editForm.record_type}
                        onChange={(e) => setEditForm({ ...editForm, record_type: e.target.value })}
                      >
                        <option value="in">כניסה</option>
                        <option value="out">יציאה</option>
                      </select>
                    ) : row.record_type === 'in' ? (
                      'כניסה'
                    ) : (
                      'יציאה'
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <select
                        value={editForm.work_day_type}
                        onChange={(e) => setEditForm({ ...editForm, work_day_type: e.target.value })}
                      >
                        {workDayOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.work_day_type
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={editForm.note}
                        onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      />
                    ) : (
                      row.note || '-'
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={editForm.manager_note}
                        onChange={(e) => setEditForm({ ...editForm, manager_note: e.target.value })}
                      />
                    ) : (
                      row.manager_note || '-'
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <select
                        value={editForm.approval_status}
                        onChange={(e) => setEditForm({ ...editForm, approval_status: e.target.value })}
                      >
                        <option value="approved">מאושר</option>
                        <option value="pending">ממתין</option>
                        <option value="rejected">נדחה</option>
                      </select>
                    ) : row.approval_status === 'approved' ? (
                      'מאושר'
                    ) : row.approval_status === 'pending' ? (
                      'ממתין'
                    ) : row.approval_status === 'rejected' ? (
                      'נדחה'
                    ) : (
                      row.approval_status || '-'
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        type="datetime-local"
                        value={editForm.record_time}
                        onChange={(e) => setEditForm({ ...editForm, record_time: e.target.value })}
                      />
                    ) : (
                      formatDateTime(row.record_time)
                    )}
                  </td>

                  <td>
                    <div className="action-buttons">
                      {isEditing ? (
                        <>
                          <button
                            className="primary-btn small"
                            type="button"
                            disabled={saving}
                            onClick={() => saveEdit(row.id)}
                          >
                            {saving ? 'שומר...' : 'שמור'}
                          </button>
                          <button
                            className="secondary-btn small"
                            type="button"
                            disabled={saving}
                            onClick={cancelEdit}
                          >
                            בטל
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary-btn small"
                          type="button"
                          onClick={() => startEdit(row)}
                        >
                          ערוך
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan="9" className="empty-cell">אין נתונים</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}