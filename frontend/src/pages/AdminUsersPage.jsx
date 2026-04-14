import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../services/api';

const defaultForm = {
  employeeCode: '',
  fullName: '',
  password: '',
  role: 'employee',
  isActive: true,
  department_id: ''
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingActionId, setLoadingActionId] = useState(null);

  async function loadUsers() {
    setError('');
    try {
      const data = await apiGet('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDepartments() {
    try {
      const data = await apiGet('/admin/departments');
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    }
  }

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, []);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  async function saveUser(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      const payload = {
        employee_code: form.employeeCode,
        full_name: form.fullName,
        password: form.password,
        role: form.role,
        is_active: form.isActive,
        department_id: form.department_id ? Number(form.department_id) : null
      };

      if (editingId) {
        await apiPut(`/admin/users/${editingId}`, payload);
        setMessage('המשתמש עודכן בהצלחה');
      } else {
        await apiPost('/admin/users', payload);
        setMessage('המשתמש נוצר בהצלחה');
      }

      resetForm();
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setForm({
      employeeCode: user.employee_code || '',
      fullName: user.full_name || '',
      password: '',
      role: user.role || 'employee',
      isActive: Boolean(user.is_active),
      department_id: user.department_id || ''
    });
    setMessage('');
    setError('');
  }

  async function toggleUser(user) {
    setMessage('');
    setError('');
    setLoadingActionId(user.id);

    try {
      await apiPut(`/admin/users/${user.id}`, {
        is_active: !user.is_active
      });

      setMessage('הסטטוס עודכן');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingActionId(null);
    }
  }

  async function reopenDay(user) {
    const ok = window.confirm(`לשחרר את ${user.full_name} לפתיחה מחדש של היום?`);
    if (!ok) return;

    setMessage('');
    setError('');
    setLoadingActionId(user.id);

    try {
      await apiPost(`/admin/users/${user.id}/reopen-day`, {});
      setMessage(`יום העבודה של ${user.full_name} שוחרר בהצלחה`);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingActionId(null);
    }
  }

  async function deleteUser(user) {
    const ok = window.confirm(`למחוק את המשתמש ${user.full_name}?`);
    if (!ok) return;

    setMessage('');
    setError('');
    setLoadingActionId(user.id);

    try {
      await apiDelete(`/admin/users/${user.id}`);
      setMessage('המשתמש נמחק בהצלחה');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingActionId(null);
    }
  }

  return (
    <div className="card-page users-layout">
      <div className="table-card">
        <div className="section-title">ניהול עובדים</div>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}

        <table>
          <thead>
            <tr>
              <th>קוד</th>
              <th>שם</th>
              <th>תפקיד</th>
              <th>מחלקה</th>
              <th>סטטוס</th>
              <th>יום סגור</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.employee_code}</td>
                <td>{user.full_name}</td>
                <td>{user.role}</td>
                <td>{user.department_name || '-'}</td>
                <td>{user.is_active ? 'פעיל' : 'חסום'}</td>
                <td>{user.day_closed ? 'כן' : 'לא'}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="secondary-btn small"
                      onClick={() => startEdit(user)}
                      type="button"
                      disabled={loadingActionId === user.id}
                    >
                      ערוך
                    </button>

                    <button
                      className="secondary-btn small"
                      onClick={() => toggleUser(user)}
                      type="button"
                      disabled={loadingActionId === user.id}
                    >
                      {loadingActionId === user.id
                        ? 'טוען...'
                        : user.is_active
                          ? 'חסום'
                          : 'הפעל'}
                    </button>

                    {Boolean(user.day_closed) && (
                      <button
                        className="primary-btn small"
                        onClick={() => reopenDay(user)}
                        type="button"
                        disabled={loadingActionId === user.id}
                      >
                        {loadingActionId === user.id ? 'משחרר...' : 'שחרר'}
                      </button>
                    )}

                    <button
                      className="danger-btn small"
                      onClick={() => deleteUser(user)}
                      type="button"
                      disabled={loadingActionId === user.id}
                    >
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-cell">אין עובדים להצגה</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <div className="section-title">
          {editingId ? 'עריכת עובד' : 'הוספת עובד'}
        </div>

        <form className="form-grid" onSubmit={saveUser}>
          <label>
            <span>קוד עובד</span>
            <input
              value={form.employeeCode}
              onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
            />
          </label>

          <label>
            <span>שם עובד</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>

          <label>
            <span>סיסמה</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editingId ? 'השאר ריק כדי לא לשנות' : ''}
            />
          </label>

          <label>
            <span>תפקיד</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="employee">עובד</option>
              <option value="admin">מנהל</option>
            </select>
          </label>

          <label>
            <span>מחלקה</span>
            <select
              value={form.department_id}
              onChange={(e) => setForm({ ...form, department_id: e.target.value })}
            >
              <option value="">ללא מחלקה</option>
              {departments
                .filter((dep) => dep.is_active)
                .map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span>משתמש פעיל</span>
          </label>

          <div className="action-buttons">
            <button className="primary-btn" type="submit">
              {editingId ? 'שמור שינויים' : 'שמור עובד'}
            </button>

            {editingId && (
              <button
                className="secondary-btn"
                type="button"
                onClick={resetForm}
              >
                בטל
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}