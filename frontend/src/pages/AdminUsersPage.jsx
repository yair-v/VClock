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
      const data = await apiGet('/users');
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
      const result = await apiPost('/users', form);
      setMessage(result.message || 'העובד נוצר בהצלחה');
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
      const result = await apiPut(`/users/${user.id}`, {
        isActive: !user.is_active
      });

      setMessage(result.message || 'הסטטוס עודכן');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`למחוק את ${user.full_name}?`)) return;

    setMessage('');
    setError('');

    try {
      const result = await apiDelete(`/users/${user.id}`);
      setMessage(result.message || 'המשתמש נמחק');
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
                <td>{user.is_active ? 'פעיל' : 'לא פעיל'}</td>

                <td className="action-buttons">
                  <button
                    className="secondary-btn small"
                    onClick={() => toggleUser(user)}
                  >
                    {user.is_active ? 'השבת' : 'הפעל'}
                  </button>

                  <button
                    className="danger-btn small"
                    onClick={() => deleteUser(user)}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-cell">
                  אין עובדים להצגה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-card">
        <div className="section-title">הוספת עובד</div>

        <form onSubmit={createUser} className="form-grid">
          <input
            placeholder="קוד עובד"
            value={form.employeeCode}
            onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
          />

          <input
            placeholder="שם מלא"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />

          <input
            type="password"
            placeholder="סיסמה"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="employee">עובד</option>
            <option value="admin">מנהל</option>
          </select>

          <button className="primary-btn">הוסף עובד</button>
        </form>
      </div>
    </div>
  );
}