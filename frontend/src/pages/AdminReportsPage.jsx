import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, exportExcel } from '../services/api';

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

function defaultNewReport() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);

  return {
    user_id: '',
    record_type: 'in',
    work_day_type: 'יום רגיל',
    note: '',
    manager_note: 'נוצר ידנית על ידי מנהל',
    record_time: local.toISOString().slice(0, 16)
  };
}

export default function AdminReportsPage() {
  const [filters, setFilters] = useState({
    employeeCode: '',
    dateFrom: '',
    dateTo: ''
  });
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newReport, setNewReport] = useState(defaultNewReport());
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

  async function loadUsers() {
    try {
      const data = await apiGet('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
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
    loadUsers();
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

  async function createReport(e) {
    e.preventDefault();
    setCreating(true);
    setMessage('');
    setError('');

    try {
      await apiPost('/admin/reports/manual', {
        user_id: Number(newReport.user_id),
        record_type: newReport.record_type,
        work_day_type: newReport.work_day_type,
        note: newReport.note,
        manager_note: newReport.manager_note,
        record_time: newReport.record_time
          ? new Date(newReport.record_time).toISOString()
          : null
      });

      setMessage('הדיווח נוצר בהצלחה');
      setNewReport(defaultNewReport());
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card-page">
      <div className="table-card" style={{ marginBottom: 18 }}>
        <div className="section-title">הוספת דיווח לעובד על ידי מנהל</div>

        <form className="form-grid" onSubmit={createReport}>
          <label>
            <span>עובד</span>
            <select
              value={newReport.user_id}
              onChange={(e) => setNewReport({ ...newReport, user_id: e.target.value })}
            >
              <option value="">בחר עובד</option>
              {users
                .filter((u) => u.role === 'employee')
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.employee_code})
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span>סוג דיווח</span>
            <select
              value={newReport.record_type}
              onChange={(e) => setNewReport({ ...newReport, record_type: e.target.value })}
            >
              <option value="in">כניסה</option>
              <option value="out">יציאה</option>
            </select>
          </label>

          <label>
            <span>סוג יום</span>
            <select
              value={newReport.work_day_type}
              onChange={(e) => setNewReport({ ...newReport, work_day_type: e.target.value })}
            >
              {workDayOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>תאריך ושעה</span>
            <input
              type="datetime-local"
              value={newReport.record_time}
              onChange={(e) => setNewReport({ ...newReport, record_time: e.target.value })}
            />
          </label>

          <label>
            <span>הערה</span>
            <input
              value={newReport.note}
              onChange={(e) => setNewReport({ ...newReport, note: e.target.value })}
            />
          </label>

          <label>
            <span>הערת מנהל</span>
            <input
              value={newReport.manager_note}
              onChange={(e) => setNewReport({ ...newReport, manager_note: e.target.value })}
            />
          </label>

          <div className="action-buttons">
            <button
              className="primary-btn"
              type="submit"
              disabled={creating || !newReport.user_id || !newReport.record_time}
            >
              {creating ? 'יוצר...' : 'הוסף דיווח'}
            </button>
          </div>
        </form>
      </div>

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