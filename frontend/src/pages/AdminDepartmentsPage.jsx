import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../services/api';

const defaultForm = {
  name: '',
  description: '',
  is_active: true
};

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadDepartments() {
    setError('');
    try {
      const data = await apiGet('/admin/departments');
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  async function saveDepartment(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      if (editingId) {
        await apiPut(`/admin/departments/${editingId}`, form);
        setMessage('המחלקה עודכנה בהצלחה');
      } else {
        await apiPost('/admin/departments', form);
        setMessage('המחלקה נוספה בהצלחה');
      }

      resetForm();
      await loadDepartments();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(dep) {
    setEditingId(dep.id);
    setForm({
      name: dep.name || '',
      description: dep.description || '',
      is_active: Boolean(dep.is_active)
    });
    setMessage('');
    setError('');
  }

  async function deleteDepartment(dep) {
    const ok = window.confirm(`למחוק את המחלקה ${dep.name}?`);
    if (!ok) return;

    setMessage('');
    setError('');

    try {
      await apiDelete(`/admin/departments/${dep.id}`);
      setMessage('המחלקה נמחקה בהצלחה');
      await loadDepartments();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card-page users-layout">
      <div className="table-card">
        <div className="section-title">ניהול מחלקות</div>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}

        <table>
          <thead>
            <tr>
              <th>שם מחלקה</th>
              <th>תיאור</th>
              <th>סטטוס</th>
              <th>עובדים</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {departments.map((dep) => (
              <tr key={dep.id}>
                <td>{dep.name}</td>
                <td>{dep.description || '-'}</td>
                <td>{dep.is_active ? 'פעילה' : 'לא פעילה'}</td>
                <td>{dep.users_count ?? 0}</td>
                <td>
                  <div className="action-buttons">
                    <button className="secondary-btn small" type="button" onClick={() => startEdit(dep)}>
                      ערוך
                    </button>
                    <button className="danger-btn small" type="button" onClick={() => deleteDepartment(dep)}>
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {departments.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-cell">אין מחלקות להצגה</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <div className="section-title">{editingId ? 'עריכת מחלקה' : 'הוספת מחלקה'}</div>

        <form className="form-grid" onSubmit={saveDepartment}>
          <label>
            <span>שם מחלקה</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            <span>תיאור</span>
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>מחלקה פעילה</span>
          </label>

          <div className="action-buttons">
            <button className="primary-btn" type="submit">
              {editingId ? 'שמור שינויים' : 'הוסף מחלקה'}
            </button>

            {editingId && (
              <button className="secondary-btn" type="button" onClick={resetForm}>
                בטל
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
