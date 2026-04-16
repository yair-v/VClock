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
  'ארוחה',
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

function MealCheckbox({ label, value, selectedValue, onChange }) {
  const checked = selectedValue === value;

  return (
    <label className="checkbox-row" style={{ minWidth: 140 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(checked ? '' : value)}
      />
      <span>{label}</span>
    </label>
  );
}

export default function EmployeePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [workDayType, setWorkDayType] = useState('יום רגיל');
  const [note, setNote] = useState('');
  const [mealType, setMealType] = useState('');
  const [now, setNow] = useState(new Date());
  const [locationLoading, setLocationLoading] = useState(false);

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
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: '', longitude: '', location_status: 'unsupported' });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: String(position.coords.latitude || ''),
            longitude: String(position.coords.longitude || ''),
            location_status: 'ok'
          });
        },
        () => {
          resolve({ latitude: '', longitude: '', location_status: 'denied' });
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        }
      );
    });
  }

  async function submitRecord(recordType) {
    setError('');
    setMessage('');
    setLoading(true);
    setLocationLoading(true);

    try {
      const location = await getLocation();
      const data = await apiPost('/attendance', {
        recordType,
        workDayType,
        note,
        meal_type: mealType,
        latitude: location.latitude,
        longitude: location.longitude,
        location_status: location.location_status
      });

      let successMessage = data.message || 'הדיווח נשמר בהצלחה';
      if (mealType && data.meal_city) {
        const mealLabel = mealType === 'breakfast'
          ? 'ארוחת בוקר'
          : mealType === 'lunch'
            ? 'ארוחת צהריים'
            : 'ארוחת ערב';
        successMessage = `${successMessage} | ${mealLabel}${data.meal_city ? ` (${data.meal_city})` : ''}`;
      }

      setMessage(successMessage);
      setNote('');
      setMealType('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLocationLoading(false);
    }
  }

  const isCheckedIn = status?.lastRecord?.record_type === 'in';
  const workDayOptions = status?.workDayTypes?.length ? status.workDayTypes : defaultWorkDayOptions;

  return (
    <div className="employee-page">
      <div className="phone-card">
        <div className="section-title">דיווח נוכחות</div>

        <div className="info-grid">
          <div className="info-box"><strong>שם עובד</strong><span>{user.fullName || '-'}</span></div>
          <div className="info-box"><strong>קוד עובד</strong><span>{user.employeeCode || '-'}</span></div>
          <div className="info-box full"><strong>תאריך ושעה</strong><span>{now.toLocaleString('he-IL')}</span></div>
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

          <div>
            <span style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>ארוחה</span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MealCheckbox label="ארוחת בוקר" value="breakfast" selectedValue={mealType} onChange={setMealType} />
              <MealCheckbox label="ארוחת צהריים" value="lunch" selectedValue={mealType} onChange={setMealType} />
              <MealCheckbox label="ארוחת ערב" value="dinner" selectedValue={mealType} onChange={setMealType} />
            </div>
          </div>

          <label>
            <span>הערה</span>
            <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה חופשית" />
          </label>

          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}
          {locationLoading && <div className="alert">מנסה לקבל מיקום מהמכשיר...</div>}

          <div className="action-row">
            <button className="primary-btn" disabled={loading} onClick={() => submitRecord('in')}>כניסה לעבודה</button>
            <button className="secondary-btn" disabled={loading} onClick={() => submitRecord('out')}>יציאה מהעבודה</button>
          </div>
        </div>
      </div>
    </div>
  );
}
