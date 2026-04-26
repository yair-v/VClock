import { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../services/api';

const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DEFAULT_WORK_DAY_TYPES = ['יום רגיל', 'שישי', 'שישי בתשלום', 'שבת', 'חג', 'ערב חג', 'חול המועד', 'חופשה', 'מחלה', 'מחלת משפחה', 'מילואים', 'עבודה מהבית', 'ארוחה', 'אחר'];

const defaultForm = {
  rule_name: '',
  department_id: '',
  week_day: 'all',
  record_type: 'all',
  work_day_type: 'all',
  time_from: '',
  time_to: '',
  rule_action: 'warning',
  message: '',
  is_active: true
};

function actionLabel(action) {
  if (action === 'block') return 'חסימה';
  if (action === 'require_approval') return 'דרוש אישור מנהל';
  return 'אזהרה בלבד';
}

function recordTypeLabel(value) {
  if (value === 'in') return 'כניסה';
  if (value === 'out') return 'יציאה';
  return 'כל פעולה';
}

export default function AdminRulesPage() {
  const [rules, setRules] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const workDayTypes = useMemo(() => {
    const list = Array.isArray(settings?.work_day_types) ? settings.work_day_types : DEFAULT_WORK_DAY_TYPES;
    return list.filter(Boolean);
  }, [settings]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [rulesData, departmentsData, settingsData] = await Promise.all([
        apiGet('/admin/rules'),
        apiGet('/admin/departments'),
        apiGet('/admin/settings')
      ]);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
      setSettings(settingsData || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
  }

  function startEdit(rule) {
    setEditingId(rule.id);
    setForm({
      rule_name: rule.rule_name || '',
      department_id: rule.department_id || '',
      week_day: rule.week_day || 'all',
      record_type: rule.record_type || 'all',
      work_day_type: rule.work_day_type || 'all',
      time_from: rule.time_from || '',
      time_to: rule.time_to || '',
      rule_action: rule.rule_action || 'warning',
      message: rule.message || '',
      is_active: Boolean(Number(rule.is_active ?? 1))
    });
    setMessage('');
    setError('');
  }

  async function saveRule(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        ...form,
        department_id: form.department_id || null
      };

      if (editingId) {
        await apiPut(`/admin/rules/${editingId}`, payload);
        setMessage('החוק עודכן בהצלחה');
      } else {
        await apiPost('/admin/rules', payload);
        setMessage('החוק נוסף בהצלחה');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(rule) {
    const ok = window.confirm(`למחוק את החוק "${rule.rule_name}"?`);
    if (!ok) return;

    setMessage('');
    setError('');

    try {
      await apiDelete(`/admin/rules/${rule.id}`);
      setMessage('החוק נמחק בהצלחה');
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card-page users-layout">
      <div className="table-card">
        <div className="section-title">חוקי מערכת</div>
        <div className="muted-text">
          כאן מגדירים חוקים שמופעלים בזמן דיווח כניסה או יציאה. אפשר לחסום פעולה, לדרוש אישור מנהל או להציג אזהרה בלבד.
        </div>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}
        {loading && <div className="alert">טוען...</div>}

        <table>
          <thead>
            <tr>
              <th>שם חוק</th>
              <th>מחלקה</th>
              <th>יום</th>
              <th>פעולה</th>
              <th>סוג יום</th>
              <th>שעות</th>
              <th>תוצאה</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.rule_name}</td>
                <td>{rule.department_name || 'כל המחלקות'}</td>
                <td>{rule.week_day === 'all' ? 'כל הימים' : rule.week_day}</td>
                <td>{recordTypeLabel(rule.record_type)}</td>
                <td>{rule.work_day_type === 'all' ? 'כל סוגי היום' : rule.work_day_type}</td>
                <td>{rule.time_from || rule.time_to ? `${rule.time_from || '00:00'} - ${rule.time_to || '23:59'}` : 'כל היום'}</td>
                <td>{actionLabel(rule.rule_action)}</td>
                <td>{Number(rule.is_active) ? 'פעיל' : 'כבוי'}</td>
                <td>
                  <div className="action-buttons">
                    <button className="secondary-btn small" type="button" onClick={() => startEdit(rule)}>ערוך</button>
                    <button className="danger-btn small" type="button" onClick={() => removeRule(rule)}>מחק</button>
                  </div>
                </td>
              </tr>
            ))}

            {rules.length === 0 && !loading && (
              <tr>
                <td colSpan="9" className="empty-cell">עדיין לא הוגדרו חוקים</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <div className="section-title">{editingId ? 'עריכת חוק' : 'הוספת חוק חדש'}</div>

        <form className="form-grid" onSubmit={saveRule}>
          <label>
            <span>שם החוק</span>
            <input
              value={form.rule_name}
              placeholder="לדוגמה: מחלקת שירות לא עובדת בשבת"
              onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
            />
          </label>

          <label>
            <span>מחלקה</span>
            <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">כל המחלקות</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>יום בשבוע</span>
            <select value={form.week_day} onChange={(e) => setForm({ ...form, week_day: e.target.value })}>
              <option value="all">כל הימים</option>
              {WEEK_DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>

          <label>
            <span>סוג פעולה</span>
            <select value={form.record_type} onChange={(e) => setForm({ ...form, record_type: e.target.value })}>
              <option value="all">כל פעולה</option>
              <option value="in">כניסה</option>
              <option value="out">יציאה</option>
            </select>
          </label>

          <label>
            <span>סוג יום עבודה</span>
            <select value={form.work_day_type} onChange={(e) => setForm({ ...form, work_day_type: e.target.value })}>
              <option value="all">כל סוגי היום</option>
              {workDayTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <label>
            <span>משעה</span>
            <input type="time" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} />
          </label>

          <label>
            <span>עד שעה</span>
            <input type="time" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} />
          </label>

          <label>
            <span>מה לעשות כשהחוק מתקיים</span>
            <select value={form.rule_action} onChange={(e) => setForm({ ...form, rule_action: e.target.value })}>
              <option value="warning">אזהרה בלבד</option>
              <option value="require_approval">דרוש אישור מנהל</option>
              <option value="block">חסום פעולה</option>
            </select>
          </label>

          <label className="full-span">
            <span>הודעה לעובד / למנהל</span>
            <textarea
              rows="3"
              value={form.message}
              placeholder="לדוגמה: עבודה ביום זה דורשת אישור מנהל"
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>חוק פעיל</span>
          </label>

          <div className="action-buttons full-span">
            <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'שומר...' : editingId ? 'שמור שינויים' : 'הוסף חוק'}</button>
            {editingId && <button className="secondary-btn" type="button" onClick={resetForm}>בטל עריכה</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
