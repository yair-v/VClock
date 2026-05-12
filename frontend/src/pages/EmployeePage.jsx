import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../services/api';

const defaultWorkDayOptions = [
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
  'אחר'
];

function normalizeUser(user) {
  if (!user) return {};
  return {
    ...user,
    fullName: user.fullName || user.full_name || '',
    employeeCode: user.employeeCode || user.employee_code || ''
  };
}

function toDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getMinRecordDateTime() {
  return toDateTimeInputValue(new Date(Date.now() - 72 * 60 * 60 * 1000));
}

function getMaxRecordDateTime() {
  return toDateTimeInputValue(new Date());
}

export default function EmployeePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [workDayType, setWorkDayType] = useState('יום רגיל');
  const [recordDateTime, setRecordDateTime] = useState(getMaxRecordDateTime());
  const [now, setNow] = useState(new Date());

  const user = useMemo(() => {
    try {
      return normalizeUser(JSON.parse(localStorage.getItem('vclock_user') || '{}'));
    } catch {
      return {};
    }
  }, []);

  async function loadStatus() {
    setError('');
    try {
      const data = await apiGet('/my-status');
      setStatus(data);

      const options = Array.isArray(data?.workDayTypes) && data.workDayTypes.length
        ? data.workDayTypes
        : defaultWorkDayOptions;

      if (!options.includes(workDayType)) {
        setWorkDayType(options[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function submitRecord(recordType) {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const data = await apiPost('/attendance', {
        recordType,
        workDayType,
        recordDateTime,
        note: '',
        latitude: '',
        longitude: '',
        location_status: 'manual'
      });

      setMessage(data.message || 'הדיווח נשמר בהצלחה');
      setRecordDateTime(getMaxRecordDateTime());
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isCheckedIn = status?.lastRecord?.record_type === 'in';
  const workDayOptions = status?.workDayTypes?.length ? status.workDayTypes : defaultWorkDayOptions;
  const minDateTime = getMinRecordDateTime();
  const maxDateTime = getMaxRecordDateTime();

  return (
    <div className="employee-page">
      <div className="phone-card simple-attendance-card">
        <div className="section-title">דיווח נוכחות</div>

        <div className="info-grid">
          <div className="info-box"><strong>שם עובד</strong><span>{user.fullName || '-'}</span></div>
          <div className="info-box"><strong>קוד עובד</strong><span>{user.employeeCode || '-'}</span></div>
          <div className="info-box full"><strong>שעה נוכחית</strong><span>{now.toLocaleString('he-IL')}</span></div>
          <div className="info-box full"><strong>סטטוס נוכחי</strong><span>{isCheckedIn ? 'נמצא בעבודה' : 'לא נמצא בעבודה'}</span></div>
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
            <span>תאריך ושעת הדיווח</span>
            <input
              type="datetime-local"
              value={recordDateTime}
              min={minDateTime}
              max={maxDateTime}
              onChange={(e) => setRecordDateTime(e.target.value)}
            />
            <small>ניתן לבחור תאריך ושעה עד 72 שעות אחורה בלבד.</small>
          </label>

          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}

          <div className="attendance-action-grid">
            <button className="primary-btn big-attendance-btn" disabled={loading} onClick={() => submitRecord('in')}>
              כניסה
            </button>
            <button className="secondary-btn big-attendance-btn" disabled={loading} onClick={() => submitRecord('out')}>
              יציאה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
