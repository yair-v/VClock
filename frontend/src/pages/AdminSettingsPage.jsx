import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../services/api';

export default function AdminSettingsPage() {
  const [form, setForm] = useState({
    breakfast_cost: 0,
    lunch_cost: 0,
    dinner_cost: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadSettings() {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet('/admin/settings');
      setForm({
        breakfast_cost: Number(data.breakfast_cost || 0),
        lunch_cost: Number(data.lunch_cost || 0),
        dinner_cost: Number(data.dinner_cost || 0)
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await apiPut('/admin/settings', form);
      setMessage('הגדרות נשמרו בהצלחה');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-page users-layout">
      <div className="table-card">
        <div className="section-title">הגדרות מערכת</div>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}
        {loading && <div className="alert">טוען...</div>}

        <form className="form-grid" onSubmit={saveSettings}>
          <label>
            <span>עלות ארוחת בוקר</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.breakfast_cost}
              onChange={(e) => setForm({ ...form, breakfast_cost: e.target.value })}
            />
          </label>

          <label>
            <span>עלות ארוחת צהריים</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.lunch_cost}
              onChange={(e) => setForm({ ...form, lunch_cost: e.target.value })}
            />
          </label>

          <label>
            <span>עלות ארוחת ערב</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.dinner_cost}
              onChange={(e) => setForm({ ...form, dinner_cost: e.target.value })}
            />
          </label>

          <div className="action-buttons">
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? 'שומר...' : 'שמור הגדרות'}
            </button>
          </div>
        </form>
      </div>

      <div className="table-card">
        <div className="section-title">קיצורי דרך</div>

        <div className="action-buttons" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Link className="nav-btn" to="/security">אבטחה</Link>
          <Link className="nav-btn" to="/admin/departments">מחלקות</Link>
          <Link className="nav-btn" to="/admin/rules">חוקי מערכת</Link>
          <Link className="nav-btn" to="/admin/users">משתמשים</Link>
        </div>
      </div>
    </div>
  );
}
