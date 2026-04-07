import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../services/api';

const defaultForm = {
  employeeCode: '',
  fullName: '',
  password: '',
  role: 'employee',
  isActive: true,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadUsers() {
    try {
      const data = await apiGet('/users');
      setUsers(data);
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
      setMessage(result.message);
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
      const result = await apiPut(`/users/${user.id}`, { isActive: !user.is_active });
      setMessage(result.message);
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
              <th>פעולה</th>
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
                  <button className="secondary-btn small" onClick={() => toggleUser(user)}>
                    {user.is_active ? 'חסום' : 'הפעל'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <div className="section-title">הוספת עובד</div>
        <form className="form-grid" onSubmit={createUser}>
          <label>
            <span>קוד עובד</span>
            <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
          </label>
          <label>
            <span>שם עובד</span>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </label>
          <label>
            <span>סיסמה</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label>
            <span>תפקיד</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">employee</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>משתמש פעיל</span>
          </label>
          <button className="primary-btn">שמור עובד</button>
        </form>
      </div>
    </div>
  );
}
