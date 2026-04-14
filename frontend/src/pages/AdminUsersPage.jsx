
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../services/api';

const defaultForm = {
  employeeCode: '',
  fullName: '',
  password: '',
  role: 'employee',
  isActive: true
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadUsers() {
    setError('');
    try {
      const data = await apiGet('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      await apiPost('/admin/users', {
        employeeCode: form.employeeCode,
        fullName: form.fullName,
        password: form.password,
        role: form.role,
        isActive: form.isActive
      });

      setMessage('העובד נוצר בהצלחה');
      setForm(defaultForm);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleUser(user) {
    setMessage('');
    setError('');

    try {
      await apiPut(`/admin/users/${user.id}`, {
        isActive: !user.is_active
      });

      setMessage('הסטטוס עודכן');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(user) {
    const ok = window.confirm(`למחוק את המשתמש ${user.full_name}?`);
    if (!ok) return;

    setMessage('');
    setError('');

    try {
      await apiDelete(`/admin/users/${user.id}`);
      setMessage('המשתמש נמחק בהצלחה');
      await loadUsers();
    } catch (err) {
      setError(err.message);
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
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.employee_code}</td>
                <td>{user.full_name}</td>
                <td>{user.role}</td>
                <td>{user.is_active ? 'פעיל' : 'חסום'}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="secondary-btn small"
                      onClick={() => toggleUser(user)}
                      type="button"
                    >
                      {user.is_active ? 'חסום' : 'הפעל'}
                    </button>

                    <button
                      className="danger-btn small"
                      onClick={() => deleteUser(user)}
                      type="button"
                    >
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-cell">אין עובדים להצגה</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <div className="section-title">הוספת עובד</div>

        <form className="form-grid" onSubmit={createUser}>
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

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span>משתמש פעיל</span>
          </label>

          <button className="primary-btn" type="submit">שמור עובד</button>
        </form>
      </div>
    </div>
  );
}