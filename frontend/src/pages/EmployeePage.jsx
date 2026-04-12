import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../services/api';

const fallbackWorkDayOptions = [
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

export default function EmployeePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [workDayType, setWorkDayType] = useState('יום רגיל');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(new Date());

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('vclock_user') || '{}');
    } catch {
      return {};
    }
  }, []);

  async function loadStatus() {
    setError('');

    try {
      const data = await apiGet('/api/my-status');
      setStatus(data);

      if (Array.isArray(data.workDayTypes) && data.workDayTypes.length > 0 && !data.workDayTypes.includes(workDayType)) {
        setWorkDayType(data.workDayTypes[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function submitRecord(recordType) {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const data = await apiPost('/api/attendance', {
        recordType,
        workDayType,
        note
      });

      setMessage(data.message || 'הדיווח נשמר בהצלחה');
      setNote('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const currentStatusText = status?.lastRecord?.record_type === 'in' ? 'נמצא בעבודה' : 'לא נמצא בעבודה';
  const workDayOptions = Array.isArray(status?.workDayTypes) && status.workDayTypes.length > 0
    ? status.workDayTypes
    : fallbackWorkDayOptions;

  return (
    <div className="content-card narrow-card">
      <div className="section-title">דיווח נוכחות</div>

      <div className="info-grid">
        <div className="info-box">
          <strong>שם עובד</strong>
          <span>{user.full_name || user.fullName || '-'}</span>
        </div>
        <div className="info-box">
          <strong>קוד עובד</strong>
          <span>{user.employee_code || user.employeeCode || '-'}</span>
        </div>
        <div className="info-box full">
          <strong>תאריך ושעה</strong>
          <span>{now.toLocaleString('he-IL')}</span>
        </div>
        <div className="info-box full">
          <strong>סטטוס נוכחי</strong>
          <span>{currentStatusText}</span>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>סוג יום עבודה</span>
          <select value={workDayType} onChange={(e) => setWorkDayType(e.target.value)}>
            {workDayOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          <span>הערה</span>
          <textarea
            rows="3"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה חופשית"
          />
        </label>

        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}

        <div className="action-row">
          <button className="primary-btn" disabled={loading} onClick={() => submitRecord('in')}>
            כניסה לעבודה
          </button>
          <button className="secondary-btn" disabled={loading} onClick={() => submitRecord('out')}>
            יציאה מהעבודה
          </button>
        </div>
      </div>
    </div>
  );
}
