const app = document.getElementById('app');

const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const state = {
  token: localStorage.getItem('vclock_token') || '',
  user: JSON.parse(localStorage.getItem('vclock_user') || 'null'),
  currentTab: 'dashboard',
  employeeStatus: null,
  selectedReportIds: [],
  modal: null
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWeekDays(days) {
  const source = Array.isArray(days) ? days : [];
  return WEEK_DAYS.filter((day) => source.includes(day));
}

function formatWeekDays(days) {
  const normalized = normalizeWeekDays(days);
  return normalized.length ? normalized.join(', ') : 'לא הוגדר';
}

function renderWeekdayCheckboxes(name, selectedDays = [], prefix = '') {
  const normalized = normalizeWeekDays(selectedDays);
  return `
    <div class="weekdays-grid">
      ${WEEK_DAYS.map((day, index) => `
        <label class="weekday-chip">
          <input type="checkbox" name="${name}" value="${day}" ${normalized.includes(day) ? 'checked' : ''} data-day-index="${index}" ${prefix ? `data-prefix="${prefix}"` : ''} />
          <span>${day}</span>
        </label>
      `).join('')}
    </div>
  `;
}

function getCheckedWeekDays(scope) {
  return WEEK_DAYS.filter((day) => {
    const input = scope.querySelector(`input[type="checkbox"][value="${day}"]`);
    return !!input?.checked;
  });
}

async function renderDashboardCharts() {
  const data = await api('/api/admin/dashboard-stats');

  renderDailyChart(data.daily);
  renderInOutChart(data.inOut);
  renderAbsenceChart(data.absences);
  renderHeatmap(data.heatmap);
}
function renderDailyChart(data) {
  const ctx = document.getElementById('chartDaily');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: 'עובדים ביום',
        data: data.map(d => d.count),
        tension: 0.3
      }]
    }
  });
}
function renderInOutChart(data) {
  const ctx = document.getElementById('chartInOut');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [
        {
          label: 'כניסות',
          data: data.map(d => d.ins)
        },
        {
          label: 'יציאות',
          data: data.map(d => d.outs)
        }
      ]
    }
  });
}
function renderAbsenceChart(data) {
  const ctx = document.getElementById('chartAbsence');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.full_name),
      datasets: [{
        label: 'ימי חיסור',
        data: data.map(d => d.absences)
      }]
    }
  });
}
function renderHeatmap(data) {
  const container = document.getElementById('heatmap');

  container.innerHTML = '';

  data.forEach(d => {
    const div = document.createElement('div');
    div.style.width = '12px';
    div.style.height = '12px';
    div.style.margin = '2px';

    const intensity = Math.min(d.value / 5, 1);

    div.style.background = `rgba(34,197,94,${intensity})`;

    container.appendChild(div);
  });
}
function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('vclock_token', token);
  localStorage.setItem('vclock_user', JSON.stringify(user));
}

function clearAuth() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('vclock_token');
  localStorage.removeItem('vclock_user');
}

async function api(url, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers['Authorization'] = 'Bearer ' + state.token;
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const data = contentType.includes('application/json')
        ? await res.json()
        : await res.text();
      msg = data.error || data.details || data || msg;
    } catch { }
    throw new Error(msg);
  }

  if (contentType.includes('application/json')) {
    return res.json();
  }

  return res;
}

function fmtDateTime(val) {
  if (!val) return '';
  return new Date(val).toLocaleString('he-IL');
}


function approvalStatusLabel(status) {
  if (status === 'approved') return 'אושר';
  if (status === 'rejected') return 'נדחה';
  if (status === 'pending') return 'ממתין';
  return status || '';
}

function approvalStatusClass(status) {
  if (status === 'approved') return 'status-approved';
  if (status === 'rejected') return 'status-rejected';
  if (status === 'pending') return 'status-pending';
  return 'status-neutral';
}

function boolText(value) {
  return value ? 'כן' : 'לא';
}


function classifyTomorrowLabel(calendar) {
  if (!calendar) return 'מחר: יום עבודה רגיל';
  return calendar.tomorrow_summary || 'מחר: יום עבודה רגיל';
}

function rowFlagBadges(record) {
  const badges = [];
  if (record.requires_admin_approval) badges.push('<span class="mini-badge status-pending">דורש אישור</span>');
  if (record.auto_closed) badges.push('<span class="mini-badge status-neutral">סגירה אוטומטית</span>');
  if (record.exception_reason) badges.push('<span class="mini-badge status-rejected">חריגה</span>');
  return badges.join(' ');
}

function getTodayWeekDayName() {
  const dayIndex = new Date().getDay();
  return WEEK_DAYS[dayIndex] || 'ראשון';
}

function chooseAutomaticWorkDayType(status, options) {
  const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  const todayWeekDay = getTodayWeekDayName();

  const calendarDefault =
    status?.calendar_holiday?.default_work_day_type ||
    status?.holiday?.default_work_day_type ||
    status?.todayHoliday?.default_work_day_type ||
    '';

  const holidayName =
    status?.calendar_holiday?.holiday_name ||
    status?.holiday?.holiday_name ||
    status?.todayHoliday?.holiday_name ||
    '';

  if (calendarDefault && normalizedOptions.includes(calendarDefault)) {
    return {
      value: calendarDefault,
      reason: holidayName ? `נבחר אוטומטית לפי חג/מועד: ${holidayName}` : 'נבחר אוטומטית לפי חג/מועד'
    };
  }

  if (todayWeekDay === 'שבת' && normalizedOptions.includes('שבת')) {
    return {
      value: 'שבת',
      reason: 'נבחר אוטומטית כי היום שבת'
    };
  }

  if (todayWeekDay === 'שישי') {
    if (status?.schedule?.friday_allowed_today && normalizedOptions.includes('שישי')) {
      return {
        value: 'שישי',
        reason: 'נבחר אוטומטית לפי שישי מאושר לעבודה רגילה'
      };
    }

    if (status?.schedule?.friday_allowed_today === false && normalizedOptions.includes('שישי בתשלום')) {
      return {
        value: 'שישי בתשלום',
        reason: 'נבחר אוטומטית לפי שישי לא מאושר לעבודה רגילה'
      };
    }

    if (normalizedOptions.includes('שישי')) {
      return {
        value: 'שישי',
        reason: 'נבחר אוטומטית כי היום שישי'
      };
    }
  }

  if (normalizedOptions.includes('יום רגיל')) {
    return {
      value: 'יום רגיל',
      reason: 'נבחר אוטומטית כברירת מחדל'
    };
  }

  return {
    value: normalizedOptions[0] || '',
    reason: normalizedOptions[0] ? 'נבחר אוטומטית לפי האפשרות הראשונה הזמינה' : ''
  };
}

function render() {
  if (!state.user) return renderLogin();
  if (state.user.role === 'admin') return renderAdmin();
  return renderEmployee();
}

function showMessage(type, text) {
  const box = document.getElementById('msgBox');
  if (!box) return;
  box.className = type;
  box.textContent = text;
  box.classList.remove('hidden');
}

function clearMessage() {
  const box = document.getElementById('msgBox');
  if (!box) return;
  box.className = 'hidden';
  box.textContent = '';
}

function ensureToastWrap() {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

function toast(type, text) {
  const wrap = ensureToastWrap();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

function closeModal() {
  const existing = document.getElementById('globalModal');
  if (existing) existing.remove();
  state.modal = null;
}

function openConfirmModal({ title, text, confirmText = 'אישור', cancelText = 'ביטול', onConfirm }) {
  closeModal();

  const host = document.createElement('div');
  host.id = 'globalModal';
  host.className = 'modal-backdrop';
  host.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${title}</h3>
      <p class="modal-text">${text}</p>
      <div class="row">
        <button class="btn btn-primary" id="modalConfirmBtn">${confirmText}</button>
        <button class="btn btn-light" id="modalCancelBtn">${cancelText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(host);

  document.getElementById('modalCancelBtn').onclick = closeModal;
  document.getElementById('modalConfirmBtn').onclick = async () => {
    closeModal();
    await onConfirm();
  };
}

function renderLogin() {
  app.innerHTML = `
    <div class="mobile-shell">
      <div class="card hero-card center">
        <div class="badge">VClock 2026</div>
        <h1 class="title title-on-light">מערכת שעון נוכחות</h1>
        <p class="subtitle subtitle-on-light">כניסה עם שם עובד/מספר עובד וסיסמה</p>
        <div id="msgBox" class="hidden"></div>

        <div class="grid" style="text-align:right">
          <div>
            <label class="label">שם עובד או מספר עובד</label>
            <input class="input" id="loginEmployeeCode" />
          </div>
          <div>
            <label class="label">סיסמה</label>
            <input class="input" id="loginPassword" type="password" />
          </div>
        </div>

        <div class="hero-login-actions">
                   <button class="btn btn-primary btn-block" id="passwordLoginBtn">כניסה עם סיסמה</button>
        </div>

        <hr class="sep" />
        <div class="small">
        
        </div>
      </div>
    </div>
  `;

  document.getElementById('passwordLoginBtn').onclick = async () => {
    clearMessage();
    try {
      const employeeCode = document.getElementById('loginEmployeeCode').value;
      const password = document.getElementById('loginPassword').value;

      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ employeeCode, password })
      });

      saveAuth(data.token, data.user);
      toast('success', 'התחברת בהצלחה');

      async function deleteHoliday(id) {
        if (!confirm('למחוק את החג?')) return;

        try {
          await api('/api/admin/holidays/' + id, { method: 'DELETE' });
          loadSettings();
        } catch (err) {
          alert(err.message);
        }
      }

      async function setReportApproval(id, approval_status) {
        const manager_note = prompt('הערת מנהל (אפשר להשאיר ריק):', '');
        if (manager_note === null) return;

        try {
          await api('/api/admin/reports/' + id + '/approval', {
            method: 'PUT',
            body: JSON.stringify({ approval_status, manager_note })
          });
          toast('success', 'סטטוס הדיווח עודכן');
          loadReports();
        } catch (err) {
          alert(err.message);
        }
      }

      render();
    } catch (err) {
      showMessage('error', err.message);
    }
  };

}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isMealAllowed(mealType) {
  const minutes = getCurrentMinutes();

  if (mealType === 'morning') {
    return minutes >= (8 * 60 + 30) && minutes <= (11 * 60 + 30);
  }

  if (mealType === 'noon') {
    return minutes >= (12 * 60) && minutes <= (15 * 60);
  }

  if (mealType === 'evening') {
    return minutes >= (19 * 60) && minutes <= (20 * 60 + 30);
  }

  return false;
}

async function requestMealLocationPermission() {
  alert('על מנת לסמן ארוחה עליך לאשר את המיקום לצורך אישור העלות');

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject('NO_GPS');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => reject('NO_PERMISSION'),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  });
}

function setupMealCheckboxes(canUseMeals) {
  const morning = document.getElementById('mealMorning');
  const noon = document.getElementById('mealNoon');
  const evening = document.getElementById('mealEvening');
  const info = document.getElementById('mealInfo');

  if (!morning || !noon || !evening || !info) return;

  function setDisabledState(disabled) {
    morning.disabled = disabled;
    noon.disabled = disabled;
    evening.disabled = disabled;
    if (disabled) {
      morning.checked = false;
      noon.checked = false;
      evening.checked = false;
    }
  }

  function updateMealAvailabilityText() {
    if (!canUseMeals) {
      info.textContent = 'ניתן לבחור ארוחות רק לאחר כניסה לעבודה.';
      setDisabledState(true);
      return;
    }

    setDisabledState(false);

    const parts = [];
    parts.push(`בוקר: ${isMealAllowed('morning') ? 'זמין' : 'לא זמין'}`);
    parts.push(`צהריים: ${isMealAllowed('noon') ? 'זמין' : 'לא זמין'}`);
    parts.push(`ערב: ${isMealAllowed('evening') ? 'זמין' : 'לא זמין'}`);
    info.textContent = parts.join(' | ');
  }

  async function handleMealToggle(event, mealType) {
    const checkbox = event.target;

    if (!checkbox.checked) {
      return;
    }

    if (!canUseMeals) {
      checkbox.checked = false;
      alert('ניתן לסמן ארוחות רק לאחר תחילת עבודה');
      return;
    }

    if (!isMealAllowed(mealType)) {
      checkbox.checked = false;
      alert('הארוחה אינה זמינה בשעה זו');
      return;
    }

    try {
      await requestMealLocationPermission();
    } catch (err) {
      checkbox.checked = false;
    }
  }

  morning.addEventListener('change', (e) => handleMealToggle(e, 'morning'));
  noon.addEventListener('change', (e) => handleMealToggle(e, 'noon'));
  evening.addEventListener('change', (e) => handleMealToggle(e, 'evening'));

  updateMealAvailabilityText();
  setInterval(updateMealAvailabilityText, 60000);
}

async function renderEmployee() {
  app.innerHTML = `
    <div class="mobile-shell">
      <div class="topbar">
        <div class="row">
          <button class="btn btn-light" id="exportMyRecordsBtn" style="padding:8px 12px">אקסל</button>
        </div>

        <div style="text-align:right">
          <div class="badge">עובד</div>
            <h1 class="title" style="margin:8px 0 4px">${state.user.full_name}</h1>
          <div class="small">קוד עובד: ${state.user.employee_code}</div>
        </div>

          <div class="row">
            <button class="btn btn-light" id="logoutBtn">התנתק</button>
          </div>
        </div>

      <div class="card">
        <div id="msgBox" class="hidden"></div>
        <div class="grid">
          <div>
            <label class="label">תאריך ושעה</label>
            <input class="input" id="currentDateTime" readonly />
          </div>

          <div>
            <label class="label">סוג יום עבודה</label>
            <select class="select" id="workDayType"></select>
            <div class="small auto-day-type-hint" id="autoWorkDayTypeHint"></div>
          </div>

          <div class="grid-span-2">
            <label class="label">ימי העבודה שלי</label>
            <div class="schedule-box compact-schedule-box" id="employeeScheduleBox">טוען...</div>
          </div>

          <div class="grid-span-2">
            <label class="label">הערה</label>
            <textarea class="textarea" id="note"></textarea>
          </div>

          <div class="grid grid-2 grid-span-2">
            <button class="btn btn-ok btn-block" id="checkInBtn">כניסה לעבודה</button>
            <button class="btn btn-danger btn-block" id="checkOutBtn">יציאה מהעבודה</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">הדיווחים שלי להיום</h2>
        <div id="myRecords">טוען...</div>
      </div>
    </div>
  `;
  document.getElementById('exportMyRecordsBtn').onclick = async () => {
    try {
      const url = window.location.origin + '/api/my-records-export';

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + state.token
        }
      });

      // 🔴 בדיקה אם קיבלנו HTML בטעות
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok || contentType.includes('text/html')) {
        const text = await res.text();
        console.error('Unexpected response:', text);
        throw new Error('השרת לא החזיר קובץ אקסל');
      }

      const blob = await res.blob();

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'VClock_My_Records.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      showMessage('error', err.message);
    }
  };
  document.getElementById('logoutBtn').onclick = () => {
    clearAuth();
    render();
  };

  function updateClock() {
    const el = document.getElementById('currentDateTime');
    if (el) el.value = new Date().toLocaleString('he-IL');
  }

  updateClock();
  setInterval(updateClock, 1000);

  async function loadEmployeeConfig() {
    const status = await api('/api/my-status');
    state.employeeStatus = status;

    const select = document.getElementById('workDayType');
    const options = status.workDayTypes && status.workDayTypes.length
      ? status.workDayTypes
      : ['יום רגיל'];

    select.innerHTML = options
      .map(v => `<option>${v}</option>`)
      .join('');

    const hintEl = document.getElementById('autoWorkDayTypeHint');
    const calendar = status.calendar || {};
    let autoType = 'יום רגיל';
    let hintText = 'נבחר אוטומטית: יום רגיל';

    if (calendar.tomorrow_recommended_type) {
      // no-op for tomorrow; displayed in schedule box only
    }

    if (calendar.today_recommended_type && options.includes(calendar.today_recommended_type)) {
      autoType = calendar.today_recommended_type;
      hintText = `נבחר אוטומטית: ${calendar.today_recommended_type}${calendar.today_holiday_name ? ` (${calendar.today_holiday_name})` : ''}`;
    } else if (calendar.weekday_name === 'שישי' && options.includes(status.schedule?.friday_allowed_today ? 'שישי' : 'שישי בתשלום')) {
      autoType = status.schedule?.friday_allowed_today ? 'שישי' : 'שישי בתשלום';
      hintText = `נבחר אוטומטית: ${autoType}`;
    } else if (calendar.weekday_name === 'שבת' && options.includes('שבת')) {
      autoType = 'שבת';
      hintText = 'נבחר אוטומטית: שבת';
    } else if (options.includes('יום רגיל')) {
      autoType = 'יום רגיל';
      hintText = 'נבחר אוטומטית: יום רגיל';
    }

    select.value = autoType;
    if (hintEl) hintEl.textContent = hintText;

    const autoChoice = chooseAutomaticWorkDayType(status, options);
    if (autoChoice.value && options.includes(autoChoice.value)) {
      select.value = autoChoice.value;
    }

    const autoHint = document.getElementById('autoWorkDayTypeHint');
    if (autoHint) {
      autoHint.textContent = autoChoice.reason || '';
    }

    const scheduleBox = document.getElementById('employeeScheduleBox');
    if (scheduleBox) {
      const tomorrowSummary = status.calendar?.tomorrow_summary || 'מחר: יום עבודה רגיל';
      scheduleBox.innerHTML = `<div class="next-day-summary">${escapeHtml(tomorrowSummary)}</div>`;
    }

    const checkInBtn = document.getElementById('checkInBtn');
    if (status.user.day_closed) {
      checkInBtn.disabled = true;
      checkInBtn.title = 'היום נסגר. יש לפנות למנהל לפתיחה מחדש';
    } else {
      checkInBtn.disabled = false;
      checkInBtn.title = '';
    }
  }

  const workDayTypeSelect = document.getElementById('workDayType');
  if (workDayTypeSelect) {
    workDayTypeSelect.addEventListener('change', () => {
      const autoHint = document.getElementById('autoWorkDayTypeHint');
      if (autoHint) {
        autoHint.textContent = `נבחר ידנית: ${workDayTypeSelect.value}`;
      }
    });
  }

  document.getElementById('checkInBtn').onclick = async () => {
    await submitAttendance('in');
  };

  document.getElementById('checkOutBtn').onclick = async () => {
    try {
      const status = await api('/api/my-status');

      if (!status.lastRecord || status.lastRecord.record_type !== 'in') {
        const employeeName = (state.user?.full_name || 'עובד').trim();
        showMessage(
          'error',
          `שלום ${employeeName}, ניסית לבצע יציאה ללא כניסה, אנא בדוק את הדיווחים בתחתית הדף.`
        );
        return;
      }

      const employeeName = (state.user?.full_name || 'עובד').trim();

      openConfirmModal({
        title: 'סגירת יום עבודה',
        text: `שלום ${employeeName}, האם אתה בטוח שאתה רוצה לסגור את יום העבודה?`,
        confirmText: 'כן, סגור יום',
        cancelText: 'לא',
        onConfirm: async () => {
          await submitAttendance('out');
        }
      });
    } catch (err) {
      showMessage('error', err.message || 'שגיאה בבדיקת סטטוס עובד');
    }
  };

  async function loadMyRecords() {
    try {
      const rows = await api('/api/my-records');

      document.getElementById('myRecords').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>סטטוס</th>
              <th>הערה</th>
              <th>חריגה / הערת מנהל</th>
              <th>תאריך ושעה</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                <td>
                  <div>${r.work_day_type}</div>
                  <div class="row-badges">${rowFlagBadges(r)}</div>
                </td>
                <td><span class="mini-badge ${approvalStatusClass(r.approval_status)}">${approvalStatusLabel(r.approval_status)}</span></td>
                <td>${r.note || ''}</td>
                <td>${[r.exception_reason, r.manager_note].filter(Boolean).join(' | ') || ''}</td>
                <td>${fmtDateTime(r.record_time)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">אין דיווחים להיום</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    } catch (err) {
      document.getElementById('myRecords').innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  async function submitAttendance(recordType) {
    let latitude = '';
    let longitude = '';
    let location_status = 'ok';

    try {
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject('NO_GPS');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          () => reject('NO_PERMISSION'),
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0
          }
        );
      });

      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (err) {
      location_status = 'no_permission';
    }

    try {
      const workDayType = document.getElementById('workDayType').value;
      const noteText = document.getElementById('note').value;
      const note = noteText.trim();

      const result = await api('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          recordType,
          workDayType,
          note,
          latitude,
          longitude,
          location_status
        })
      });

      document.getElementById('note').value = '';
      if (document.getElementById('mealMorning')) document.getElementById('mealMorning').checked = false;
      if (document.getElementById('mealNoon')) document.getElementById('mealNoon').checked = false;
      if (document.getElementById('mealEvening')) document.getElementById('mealEvening').checked = false;

      const approvalText = result.requires_admin_approval
        ? ` | סטטוס: ${approvalStatusLabel(result.approval_status)}${result.exception_reason ? ` | ${result.exception_reason}` : ''}`
        : '';

      showMessage(
        'success',
        `${recordType === 'in' ? 'כניסה' : 'יציאה'} נשמרה בהצלחה: ${fmtDateTime(result.record_time)}${approvalText}${result.message ? ` | ${result.message}` : ''}`
      );

      await loadEmployeeConfig();
      loadMyRecords();
    } catch (err) {
      const employeeName = (state.user?.full_name || 'עובד').trim();
      const serverMsg = err.message || '';

      let msg = serverMsg || 'אירעה שגיאה';

      if (recordType === 'in' && serverMsg.includes('כניסה כפולה')) {
        msg = `שלום ${employeeName}, כבר קיימת כניסה פתוחה. אנא בדוק את הדיווחים בתחתית הדף, אם זאת אינה טעות אנא פנה למנהל המחלקה.`;
      } else if (recordType === 'in' && serverMsg.includes('היום נסגר')) {
        msg = `שלום ${employeeName}, יום העבודה נסגר וכרגע אין אפשרות לבצע כניסה נוספת. מנהל יכול לפתוח עבורך מחדש את אפשרות הכניסה.`;
      } else if (recordType === 'out' && serverMsg.includes('יציאה ללא כניסה')) {
        msg = `שלום ${employeeName}, ניסית לבצע יציאה ללא כניסה, אנא בדוק את הדיווחים בתחתית הדף.`;
      }

      showMessage('error', msg);
    }
  }

  await loadEmployeeConfig();
  loadMyRecords();
}

async function renderAdmin() {
  app.innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <div>
          <div class="badge">מנהל</div>
          <h1 class="title" style="margin:8px 0 4px">VClock</h1>
          <div class="small">${state.user.full_name}</div>
        </div>
        <div class="row">
          <button class="btn btn-danger" id="shutdownBtn">סגירה מלאה</button>
          <button class="btn btn-light" id="logoutBtn">התנתק</button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${state.currentTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">דשבורד</div>
        <div class="tab ${state.currentTab === 'reports' ? 'active' : ''}" data-tab="reports">דיווחים</div>
        <div class="tab ${state.currentTab === 'monthly' ? 'active' : ''}" data-tab="monthly">דוח חודשי</div>
        <div class="tab ${state.currentTab === 'users' ? 'active' : ''}" data-tab="users">ניהול משתמשים</div>
        <div class="tab ${state.currentTab === 'settings' ? 'active' : ''}" data-tab="settings">הגדרות</div>
      </div>

      <div id="tabContent" class="card">טוען...</div>
    </div>
  `;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      state.currentTab = tab.dataset.tab;
      renderAdmin();
    };
  });

  document.getElementById('logoutBtn').onclick = () => {
    clearAuth();
    render();
  };

  document.getElementById('shutdownBtn').onclick = async () => {
    if (!confirm('לסגור את שרת VClock?')) return;

    try {
      await api('/api/admin/shutdown', {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert('השרת נסגר');
    } catch (err) {
      alert(err.message);
    }
  };

  if (state.currentTab === 'dashboard') return loadDashboard();
  if (state.currentTab === 'reports') return loadReports();
  if (state.currentTab === 'monthly') return loadMonthly();
  if (state.currentTab === 'users') return loadUsers();
  if (state.currentTab === 'settings') return loadSettings();
}

async function loadDashboard() {
  const box = document.getElementById('tabContent');
  try {
    const d = await api('/api/admin/dashboard');

    box.innerHTML = `
      <h2 style="margin-top:0">דשבורד</h2>
      <div class="grid grid-4">
        <div class="kpi"><div>סה"כ עובדים</div><div class="num">${d.totalUsers}</div></div>
        <div class="kpi"><div>עובדים פעילים</div><div class="num">${d.activeUsers}</div></div>
        <div class="kpi"><div>סה"כ דיווחים</div><div class="num">${d.totalRecords}</div></div>
        <div class="kpi"><div>דיווחי היום</div><div class="num">${d.todayRecords}</div></div>
      </div>

      <div class="card" style="margin-top:16px;background:#f8fafc">
        <h3 style="margin-top:0">בקשות עובדים לפעולה</h3>
        ${d.actionRequests && d.actionRequests.length
        ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>קוד עובד</th>
                      <th>שם עובד</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${d.actionRequests.map(r => `
                      <tr>
                        <td>${r.employee_code}</td>
                        <td>${r.full_name}</td>
                        <td>
                          <button class="btn btn-primary" onclick="reopenDay(${r.id})">פתח אפשרות כניסה</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `
        : `<div class="small">אין כרגע בקשות עובדים לפעולה.</div>`
      }
      </div>
    `;
    box.innerHTML += `
  <div class="card">
    <h3>📈 עובדים ביום</h3>
    <canvas id="chartDaily"></canvas>
  </div>

  <div class="card">
    <h3>📊 כניסות / יציאות</h3>
    <canvas id="chartInOut"></canvas>
  </div>

  <div class="card">
    <h3>🔥 הכי הרבה חיסורים</h3>
    <canvas id="chartAbsence"></canvas>
  </div>

  <div class="card">
    <h3>🟩 Heatmap נוכחות</h3>
    <div id="heatmap" style="display:flex;flex-wrap:wrap;max-width:300px"></div>
  </div>
`;
    await renderDashboardCharts();
  } catch (err) {
    box.innerHTML = `<div class="error">${err.message}</div>`;
  }
}


async function loadReports() {
  const box = document.getElementById('tabContent');
  state.selectedReportIds = [];

  box.innerHTML = `
    <h2 style="margin-top:0">כל הדיווחים</h2>
    <div class="grid grid-2">
      <div>
        <label class="label">עובד / קוד</label>
        <input class="input" id="filterEmployee" />
      </div>
      <div>
        <label class="label">סטטוס אישור</label>
        <select class="select" id="approvalStatusFilter">
          <option value="">הכל</option>
          <option value="pending">ממתין</option>
          <option value="approved">אושר</option>
          <option value="rejected">נדחה</option>
        </select>
      </div>
      <div class="row">
        <div style="flex:1">
          <label class="label">מתאריך</label>
          <input class="input" type="date" id="fromDate" />
        </div>
        <div style="flex:1">
          <label class="label">עד תאריך</label>
          <input class="input" type="date" id="toDate" />
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn btn-primary" id="searchBtn">חפש</button>
      <button class="btn btn-light" id="exportBtn">ייצוא לאקסל</button>
      <button class="btn btn-danger" id="deleteSelectedBtn">מחק מסומנים</button>
      <button class="btn btn-danger" id="deleteFilteredBtn">מחק את כל המוצג</button>
    </div>

    <div id="reportsTable" style="margin-top:14px">טוען...</div>

    <div class="card" style="margin-top:16px;background:#f8fafc">
      <h3 style="margin-top:0">לוג פעולות ודיווחים</h3>
      <div class="row" style="margin-bottom:12px">
        <button class="btn btn-light" id="reloadLogsBtn">רענן לוג</button>
      </div>
      <div id="actionLogsTable">טוען...</div>
    </div>
  `;

  document.getElementById('searchBtn').onclick = doSearch;
  document.getElementById('deleteSelectedBtn').onclick = deleteSelectedReports;
  document.getElementById('deleteFilteredBtn').onclick = deleteFilteredReports;
  document.getElementById('reloadLogsBtn').onclick = loadActionLogs;

  document.getElementById('exportBtn').onclick = async () => {
    try {
      const res = await fetch('/api/admin/export', {
        headers: { 'Authorization': 'Bearer ' + state.token }
      });
      if (!res.ok) throw new Error('ייצוא נכשל');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'VClock_Attendance.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  };

  async function doSearch() {
    try {
      state.selectedReportIds = [];

      const qs = new URLSearchParams({
        employeeCode: document.getElementById('filterEmployee').value || '',
        fromDate: document.getElementById('fromDate').value || '',
        toDate: document.getElementById('toDate').value || '',
        approvalStatus: document.getElementById('approvalStatusFilter').value || ''
      });

      const rows = await api('/api/admin/reports?' + qs.toString());

      document.getElementById('reportsTable').innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" id="selectAllReports" /></th>
                <th>קוד</th>
                <th>שם</th>
                <th>סוג</th>
                <th>סוג יום</th>
                <th>סטטוס</th>
                <th>חריגה</th>
                <th>הערת מנהל</th>
                <th>הערה</th>
                <th>מיקום</th>
                <th>תאריך ושעה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                  <tr class="${r.requires_admin_approval ? 'report-row-pending' : ''}">
                    <td>
                      <input
                        type="checkbox"
                        class="report-row-checkbox"
                        value="${r.id}"
                        onchange="toggleReportSelection(${r.id}, this.checked)"
                      />
                    </td>
                    <td>${r.employee_code}</td>
                    <td>${r.full_name}</td>
                    <td>${r.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                    <td>
                      <div>${r.work_day_type}</div>
                      <div class="row-badges">${rowFlagBadges(r)}</div>
                    </td>
                    <td><span class="mini-badge ${approvalStatusClass(r.approval_status)}">${approvalStatusLabel(r.approval_status)}</span></td>
                    <td>${r.exception_reason || ''}</td>
                    <td>${r.manager_note || ''}</td>
                    <td>${r.note || ''}</td>
                    <td>
                      ${r.location_status === 'no_permission'
          ? '<span style="color:#b91c1c;font-weight:700">הרשאות מיקום סגורות</span>'
          : (r.map_link ? `<a href="${r.map_link}" target="_blank">פתח מפה</a>` : '')
        }
                    </td>
                    <td>${fmtDateTime(r.record_time)}</td>
                    <td>
                      <div class="action-stack">
                        <div class="row">
                          <button class="btn btn-light" onclick="editReport(${r.id}, '${String(r.work_day_type || '').replace(/'/g, "\\'")}', '${String(r.note || '').replace(/'/g, "\\'")}', '${String(r.manager_note || '').replace(/'/g, "\\'")}')">ערוך</button>
                          <button class="btn btn-danger" onclick="deleteReport(${r.id})">מחק</button>
                        </div>
                        <div class="row">
                          <button class="btn btn-ok" onclick="setReportApproval(${r.id}, 'approved')">אשר</button>
                          <button class="btn btn-danger" onclick="setReportApproval(${r.id}, 'rejected')">דחה</button>
                          <button class="btn btn-light" onclick="setReportApproval(${r.id}, 'pending')">החזר להמתנה</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="12">אין נתונים</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      const selectAll = document.getElementById('selectAllReports');
      if (selectAll) {
        selectAll.onchange = function () {
          toggleSelectAllReports(this);
        };
      }
    } catch (err) {
      document.getElementById('reportsTable').innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  async function loadActionLogs() {
    try {
      const qs = new URLSearchParams({
        employeeCode: document.getElementById('filterEmployee').value || '',
        fromDate: document.getElementById('fromDate').value || '',
        toDate: document.getElementById('toDate').value || ''
      });

      const rows = await api('/api/admin/action-logs?' + qs.toString());
      document.getElementById('actionLogsTable').innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>תאריך ושעה</th>
                <th>קוד</th>
                <th>שם</th>
                <th>פעולה</th>
                <th>סוג יום</th>
                <th>סטטוס</th>
                <th>פרטים</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${fmtDateTime(r.created_at)}</td>
                  <td>${r.employee_code || ''}</td>
                  <td>${r.full_name || ''}</td>
                  <td>${r.action_title || r.action_type || ''}</td>
                  <td>${r.work_day_type || ''}</td>
                  <td>${r.approval_status ? `<span class="mini-badge ${approvalStatusClass(r.approval_status)}">${approvalStatusLabel(r.approval_status)}</span>` : ''}</td>
                  <td>${r.details || ''}</td>
                </tr>
              `).join('') || '<tr><td colspan="7">אין לוגים</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      document.getElementById('actionLogsTable').innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  await doSearch();
  await loadActionLogs();
}

async function loadMonthly() {
  const box = document.getElementById('tabContent');
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  box.innerHTML = `
    <h2 style="margin-top:0">דוח שעות חודשי</h2>
    <div class="row">
      <div>
        <label class="label">חודש</label>
        <input class="input" id="monthInput" type="month" value="${month}" />
      </div>
      <div style="align-self:flex-end">
        <button class="btn btn-primary" id="loadMonthlyBtn">טען דוח</button>
      </div>
    </div>
    <div id="monthlyTable" style="margin-top:14px">טוען...</div>
  `;

  document.getElementById('loadMonthlyBtn').onclick = loadData;

  async function loadData() {
    try {
      const rows = await api('/api/admin/monthly-summary?month=' + document.getElementById('monthInput').value);
      document.getElementById('monthlyTable').innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>קוד</th>
                <th>שם</th>
                <th>כניסה ראשונה</th>
                <th>יציאה אחרונה</th>
                <th>סה"כ שעות</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.work_date}</td>
                  <td>${r.employee_code}</td>
                  <td>${r.full_name}</td>
                  <td>${r.first_in ? fmtDateTime(r.first_in) : ''}</td>
                  <td>${r.last_out ? fmtDateTime(r.last_out) : ''}</td>
                  <td>${r.totalHours || ''}</td>
                </tr>
              `).join('') || '<tr><td colspan="6">אין נתונים</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      document.getElementById('monthlyTable').innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  loadData();
}


async function editUser(id) {
  try {
    const [users, groups] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/work-groups')
    ]);

    const user = users.find(u => u.id === id);

    if (!user) {
      alert('משתמש לא נמצא');
      return;
    }

    closeModal();

    const host = document.createElement('div');
    host.id = 'globalModal';
    host.className = 'modal-backdrop';
    host.innerHTML = `
      <div class="modal modal-wide">
        <h3 class="modal-title">עריכת משתמש</h3>
        <form id="userEditForm" class="grid grid-2 modal-form">
          <div>
            <label class="label">קוד עובד</label>
            <input class="input" name="employee_code" value="${escapeHtml(user.employee_code || '')}" required />
          </div>

          <div>
            <label class="label">שם מלא</label>
            <input class="input" name="full_name" value="${escapeHtml(user.full_name || '')}" required />
          </div>

          <div>
            <label class="label">סיסמה חדשה</label>
            <input class="input" type="password" name="password" placeholder="השאר ריק אם לא משנים" />
            <div class="field-hint">אם לא תרשום סיסמה חדשה, הסיסמה הקיימת תישאר.</div>
          </div>

          <div>
            <label class="label">תפקיד</label>
            <select class="select" name="role">
              <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>employee</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
            </select>
          </div>

          <div>
            <label class="label">קבוצת עבודה</label>
            <select class="select" name="work_group_id">
              <option value="">ללא קבוצה</option>
              ${groups.map(group => `<option value="${group.id}" ${String(user.work_group_id || '') === String(group.id) ? 'selected' : ''}>${escapeHtml(group.name)}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="label">תאריך עוגן שישי לסירוגין</label>
            <input class="input" type="date" name="friday_rotation_anchor_date" value="${escapeHtml((user.friday_rotation_anchor_date || '').slice(0, 10))}" />
          </div>

          <div class="grid-span-2">
            <label class="label">ימי עבודה אישיים</label>
            ${renderWeekdayCheckboxes('edit_user_work_days', user.allowed_work_days || [], 'edit_user_days')}
          </div>

          <div>
            <label class="checkbox-inline">
              <input type="checkbox" name="friday_rotation_start_allowed" ${user.friday_rotation_start_allowed ? 'checked' : ''} />
              <span>השישי של תאריך העוגן הוא שישי עבודה</span>
            </label>
          </div>

          <div>
            <label class="checkbox-inline">
              <input type="checkbox" name="is_active" ${user.is_active ? 'checked' : ''} />
              <span>משתמש פעיל</span>
            </label>
          </div>

          <div>
            <label class="checkbox-inline">
              <input type="checkbox" name="day_closed" ${user.day_closed ? 'checked' : ''} />
              <span>היום סגור לעובד</span>
            </label>
          </div>

          <div class="grid-span-2 form-actions">
            <button type="submit" class="btn btn-primary">שמור שינויים</button>
            <button type="button" class="btn btn-light" id="cancelUserEditBtn">ביטול</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(host);

    document.getElementById('cancelUserEditBtn').onclick = closeModal;

    document.getElementById('userEditForm').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;

      try {
        await api('/api/admin/users/' + id, {
          method: 'PUT',
          body: JSON.stringify({
            employee_code: form.employee_code.value.trim(),
            full_name: form.full_name.value.trim(),
            password: form.password.value,
            role: form.role.value,
            is_active: form.is_active.checked,
            day_closed: form.day_closed.checked,
            work_group_id: form.work_group_id.value || null,
            allowed_work_days: getCheckedWeekDays(form),
            friday_rotation_anchor_date: form.friday_rotation_anchor_date.value || null,
            friday_rotation_start_allowed: form.friday_rotation_start_allowed.checked
          })
        });

        closeModal();
        toast('success', 'המשתמש עודכן בהצלחה');
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    };
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(id) {
  if (!confirm('האם למחוק את המשתמש?')) return;

  try {
    await api('/api/admin/users/' + id, {
      method: 'DELETE'
    });

    alert('נמחק בהצלחה');
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function reopenDay(id) {
  if (!confirm('האם לפתוח מחדש לעובד את האפשרות לבצע כניסה?')) return;

  try {
    await api('/api/admin/users/' + id + '/reopen-day', {
      method: 'POST',
      body: JSON.stringify({})
    });

    alert('אפשרות הכניסה נפתחה מחדש לעובד');
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}


async function loadUsers() {
  const box = document.getElementById('tabContent');
  const groups = await api('/api/admin/work-groups');
  box.innerHTML = `
    <h2 style="margin-top:0">ניהול משתמשים</h2>
    <div id="usersMsg" class="hidden"></div>

    <div class="card" style="background:#f8fafc">
      <h3 style="margin-top:0">הוספת משתמש</h3>
      <form id="addUserForm" class="grid grid-2">
        <div>
          <label class="label">קוד עובד</label>
          <input class="input" name="employee_code" required />
        </div>
        <div>
          <label class="label">שם מלא</label>
          <input class="input" name="full_name" required />
        </div>
        <div>
          <label class="label">סיסמה</label>
          <input class="input" name="password" required />
        </div>
        <div>
          <label class="label">תפקיד</label>
          <select class="select" name="role">
            <option value="employee">employee</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div>
          <label class="label">קבוצת עבודה</label>
          <select class="select" name="work_group_id">
            <option value="">ללא קבוצה</option>
            ${groups.map(group => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">תאריך עוגן שישי לסירוגין</label>
          <input class="input" type="date" name="friday_rotation_anchor_date" />
        </div>
        <div>
          <label class="label">ימי עבודה אישיים</label>
          ${renderWeekdayCheckboxes('new_user_work_days')}
        </div>
        <div>
          <label class="label">סבב שישי</label>
          <label><input type="checkbox" name="friday_rotation_start_allowed" checked /> בשישי של תאריך העוגן מותר לעבוד רגיל</label>
        </div>
        <div class="row">
          <label><input type="checkbox" name="is_active" checked /> פעיל</label>
        </div>
        <div class="row">
          <button class="btn btn-primary" type="submit">שמור משתמש</button>
        </div>
      </form>
    </div>

    <div id="usersTable">טוען...</div>
  `;

  document.getElementById('addUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          employee_code: fd.get('employee_code'),
          full_name: fd.get('full_name'),
          password: fd.get('password'),
          role: fd.get('role'),
          is_active: fd.get('is_active') === 'on',
          work_group_id: fd.get('work_group_id') || null,
          allowed_work_days: getCheckedWeekDays(e.target),
          friday_rotation_anchor_date: fd.get('friday_rotation_anchor_date') || null,
          friday_rotation_start_allowed: fd.get('friday_rotation_start_allowed') === 'on'
        })
      });

      const msg = document.getElementById('usersMsg');
      msg.className = 'success';
      msg.textContent = 'המשתמש נשמר';
      e.target.reset();
      loadUsers();
    } catch (err) {
      const msg = document.getElementById('usersMsg');
      msg.className = 'error';
      msg.textContent = err.message;
    }
  };

  try {
    const rows = await api('/api/admin/users');

    document.getElementById('usersTable').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>קוד</th>
              <th>שם</th>
              <th>תפקיד</th>
              <th>פעיל</th>
              <th>יום נסגר</th>
              <th>קבוצה</th>
              <th>ימי עבודה</th>
              <th>סבב שישי</th>
              <th>נוצר</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
                <tr>
                  <td>${r.employee_code}</td>
                  <td>${r.full_name}</td>
                  <td>${r.role}</td>
                  <td>${r.is_active ? 'כן' : 'לא'}</td>
                  <td>${r.day_closed ? 'כן' : 'לא'}</td>
                  <td>${r.work_group_name || 'ללא קבוצה'}</td>
                  <td>${formatWeekDays(r.allowed_work_days || [])}</td>
                  <td>
                    <div class="small">עוגן: ${(r.friday_rotation_anchor_date || '').slice(0, 10)}</div>
                    <div class="small">${r.friday_rotation_start_allowed ? 'שישי עובד' : 'שישי לא עובד'}</div>
                  </td>
                  <td>${fmtDateTime(r.created_at)}</td>
                  <td>
                    <div class="action-stack">
                      <div class="row">
                        <button class="btn btn-light" onclick="editUser(${r.id})">ערוך</button>
                        ${r.day_closed ? `<button class="btn btn-primary" onclick="reopenDay(${r.id})">פתח אפשרות כניסה</button>` : ''}
                        <button class="btn btn-danger" onclick="deleteUser(${r.id})">מחק</button>
                      </div>
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="10">אין משתמשים</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('usersTable').innerHTML = `<div class="error">${err.message}</div>`;
  }
}


async function loadSettings() {
  const box = document.getElementById('tabContent');

  try {
    const [s, groups, users, holidays] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/work-groups'),
      api('/api/admin/users'),
      api('/api/admin/holidays')
    ]);

    box.innerHTML = `
      <h2 style="margin-top:0">הגדרות מערכת וקבוצות</h2>
      <div id="settingsMsg" class="hidden"></div>

      <div class="card" style="background:#f8fafc">
        <h3 style="margin-top:0">הגדרות כלליות</h3>
        <div class="grid">
          <label><input type="checkbox" id="preventDouble" ${s.prevent_double_checkin ? 'checked' : ''} /> חסימת כניסה כפולה</label>
          <label><input type="checkbox" id="preventCheckout" ${s.prevent_checkout_without_checkin ? 'checked' : ''} /> חסימת יציאה בלי כניסה</label>
          <label><input type="checkbox" id="allowMultipleSessions" ${s.allow_multiple_sessions_per_day ? 'checked' : ''} /> אפשר מספר סשנים ביום</label>

          <div>
            <label class="label">רשימת סוגי יום עבודה (שורה לכל ערך)</label>
            <textarea class="textarea" id="workDayTypesInput">${(s.work_day_types || []).join('\n')}</textarea>
          </div>

          <div>
            <button class="btn btn-primary" id="saveSettingsBtn">שמור הגדרות</button>
          </div>
        </div>
      </div>

      <div class="card" style="background:#f8fafc">
        <h3 style="margin-top:0">ניהול קבוצות משתמשים</h3>
        <form id="addWorkGroupForm" class="grid">
          <div class="grid grid-2">
            <div>
              <label class="label">שם קבוצה</label>
              <input class="input" name="name" required />
            </div>
            <div>
              <label class="label">תיאור</label>
              <input class="input" name="description" />
            </div>
          </div>

          <div>
            <label class="label">ימי עבודה לקבוצה</label>
            ${renderWeekdayCheckboxes('group_work_days')}
          </div>

          <div>
            <button class="btn btn-primary" type="submit">צור קבוצה</button>
          </div>
        </form>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>שם קבוצה</th>
                <th>תיאור</th>
                <th>ימי עבודה</th>
                <th>משתמשים</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              ${groups.map((group) => `
                <tr>
                  <td>${escapeHtml(group.name)}</td>
                  <td>${escapeHtml(group.description || '')}</td>
                  <td>${escapeHtml(formatWeekDays(group.work_days || []))}</td>
                  <td>${group.users_count || 0}</td>
                  <td>
                    <div class="row">
                      <button class="btn btn-light" type="button" onclick="editWorkGroup(${group.id})">ערוך</button>
                      <button class="btn btn-danger" type="button" onclick="deleteWorkGroup(${group.id})">מחק</button>
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5">אין קבוצות</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="background:#f8fafc">
        <h3 style="margin-top:0">שיוך קבוצות וימי עבודה לעובדים</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>קוד</th>
                <th>שם</th>
                <th>קבוצה</th>
                <th>ימי עבודה אישיים</th>
                <th>שישי לסירוגין</th>
                <th>סיכום</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              ${users.filter((user) => user.role === 'employee').map((user) => `
                <tr class="schedule-row" data-user-id="${user.id}">
                  <td>${escapeHtml(user.employee_code)}</td>
                  <td>${escapeHtml(user.full_name)}</td>
                  <td>
                    <select class="select schedule-group-select">
                      <option value="">ללא קבוצה</option>
                      ${groups.map((group) => `
                        <option value="${group.id}" ${String(user.work_group_id || '') === String(group.id) ? 'selected' : ''}>${escapeHtml(group.name)}</option>
                      `).join('')}
                    </select>
                  </td>
                  <td>${renderWeekdayCheckboxes('user_work_days_' + user.id, user.allowed_work_days || [], 'user_' + user.id)}</td>
                  <td>
                    <div class="grid">
                      <input class="input friday-anchor-input" type="date" value="${(user.friday_rotation_anchor_date || '').slice(0, 10)}" />
                      <label><input type="checkbox" class="friday-start-allowed-input" ${user.friday_rotation_start_allowed ? 'checked' : ''} /> תאריך העוגן הוא שישי עבודה</label>
                    </div>
                  </td>
                  <td>
                    <div class="small"><strong>קבוצה:</strong> ${escapeHtml(user.work_group_name || 'ללא קבוצה')}</div>
                    <div class="small"><strong>ימי קבוצה:</strong> ${escapeHtml(formatWeekDays(user.work_group_days || []))}</div>
                    <div class="small"><strong>ימים אישיים:</strong> ${escapeHtml(formatWeekDays(user.allowed_work_days || []))}</div>
                    <div class="small"><strong>שישי:</strong> ${user.friday_rotation_start_allowed ? 'מתחיל בעבודה' : 'מתחיל בלי עבודה'}</div>
                  </td>
                  <td>
                    <button class="btn btn-primary save-user-schedule-btn" type="button">שמור</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="7">אין עובדים</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>


      <div class="card" style="background:#f8fafc">
        <h3 style="margin-top:0">ניהול חגים</h3>
        <form id="addHolidayForm" class="grid grid-2">
          <div>
            <label class="label">תאריך חג</label>
            <input class="input" type="date" name="holiday_date" required />
          </div>
          <div>
            <label class="label">שם חג</label>
            <input class="input" name="holiday_name" required />
          </div>
          <div class="row">
            <button class="btn btn-primary" type="submit">שמור חג</button>
          </div>
        </form>
        <div class="table-wrap holiday-table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>שם חג</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              ${holidays.map((holiday) => `
                <tr>
                  <td>${holiday.holiday_date}</td>
                  <td>${escapeHtml(holiday.holiday_name)}</td>
                  <td><button class="btn btn-danger" type="button" onclick="deleteHoliday(${holiday.id})">מחק</button></td>
                </tr>
              `).join('') || '<tr><td colspan="3">אין חגים מוגדרים</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('saveSettingsBtn').onclick = async () => {
      try {
        const workDayTypes = document
          .getElementById('workDayTypesInput')
          .value
          .split('\n')
          .map(v => v.trim())
          .filter(Boolean);

        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            prevent_double_checkin: document.getElementById('preventDouble').checked,
            prevent_checkout_without_checkin: document.getElementById('preventCheckout').checked,
            allow_multiple_sessions_per_day: document.getElementById('allowMultipleSessions').checked,
            work_day_types: workDayTypes
          })
        });

        const msg = document.getElementById('settingsMsg');
        msg.className = 'success';
        msg.textContent = 'ההגדרות נשמרו';
      } catch (err) {
        const msg = document.getElementById('settingsMsg');
        msg.className = 'error';
        msg.textContent = err.message;
      }
    };

    document.getElementById('addHolidayForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/holidays', {
          method: 'POST',
          body: JSON.stringify({
            holiday_date: e.target.holiday_date.value,
            holiday_name: e.target.holiday_name.value
          })
        });
        loadSettings();
      } catch (err) {
        const msg = document.getElementById('settingsMsg');
        msg.className = 'error';
        msg.textContent = err.message;
      }
    };

    document.getElementById('addWorkGroupForm').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        await api('/api/admin/work-groups', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.value,
            description: form.description.value,
            work_days: getCheckedWeekDays(form)
          })
        });
        loadSettings();
      } catch (err) {
        const msg = document.getElementById('settingsMsg');
        msg.className = 'error';
        msg.textContent = err.message;
      }
    };

    document.querySelectorAll('.save-user-schedule-btn').forEach((button) => {
      button.onclick = async () => {
        const row = button.closest('.schedule-row');
        const userId = row.dataset.userId;
        const groupSelect = row.querySelector('.schedule-group-select');
        const allowedWorkDays = getCheckedWeekDays(row);
        const fridayRotationAnchorDate = row.querySelector('.friday-anchor-input')?.value || '';
        const fridayRotationStartAllowed = !!row.querySelector('.friday-start-allowed-input')?.checked;

        try {
          await api('/api/admin/users/' + userId + '/work-schedule', {
            method: 'PUT',
            body: JSON.stringify({
              work_group_id: groupSelect.value || null,
              allowed_work_days: allowedWorkDays,
              friday_rotation_anchor_date: fridayRotationAnchorDate,
              friday_rotation_start_allowed: fridayRotationStartAllowed
            })
          });
          const msg = document.getElementById('settingsMsg');
          msg.className = 'success';
          msg.textContent = 'השיבוץ נשמר';
          loadSettings();
        } catch (err) {
          const msg = document.getElementById('settingsMsg');
          msg.className = 'error';
          msg.textContent = err.message;
        }
      };
    });
  } catch (err) {
    box.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function editWorkGroup(id) {
  try {
    const groups = await api('/api/admin/work-groups');
    const group = groups.find((item) => item.id === id);
    if (!group) {
      alert('קבוצה לא נמצאה');
      return;
    }

    const name = prompt('שם קבוצה:', group.name);
    if (name === null) return;
    const description = prompt('תיאור:', group.description || '');
    if (description === null) return;
    const currentDays = formatWeekDays(group.work_days || []);
    const nextDaysText = prompt('ימי עבודה (להפריד בפסיקים, לדוגמה: ראשון,שני,שלישי):', currentDays);
    if (nextDaysText === null) return;
    const workDays = nextDaysText.split(',').map((item) => item.trim()).filter(Boolean);

    await api('/api/admin/work-groups/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        name,
        description,
        work_days: workDays,
        is_active: true
      })
    });

    loadSettings();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteWorkGroup(id) {
  if (!confirm('למחוק את קבוצת העבודה?')) return;

  try {
    await api('/api/admin/work-groups/' + id, {
      method: 'DELETE'
    });
    loadSettings();
  } catch (err) {
    alert(err.message);
  }
}
async function editReport(id, currentType, currentNote, currentManagerNote) {
  const work_day_type = prompt('סוג יום עבודה:', currentType || '');
  if (work_day_type === null) return;

  const note = prompt('הערה:', currentNote || '');
  if (note === null) return;

  const manager_note = prompt('הערת מנהל:', currentManagerNote || '');
  if (manager_note === null) return;

  try {
    await api('/api/admin/reports/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        work_day_type,
        note,
        manager_note
      })
    });

    alert('הדיווח עודכן');
    loadReports();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteReport(id) {
  if (!confirm('האם למחוק את השורה?')) return;

  try {
    await api('/api/admin/reports/' + id, {
      method: 'DELETE'
    });

    alert('השורה נמחקה');
    loadReports();
  } catch (err) {
    alert(err.message);
  }
}
function toggleReportSelection(id, checked) {
  const numId = parseInt(id, 10);

  if (checked) {
    if (!state.selectedReportIds.includes(numId)) {
      state.selectedReportIds.push(numId);
    }
  } else {
    state.selectedReportIds = state.selectedReportIds.filter(x => x !== numId);
  }
}

function toggleSelectAllReports(source) {
  const checkboxes = document.querySelectorAll('.report-row-checkbox');
  state.selectedReportIds = [];

  checkboxes.forEach(cb => {
    cb.checked = source.checked;
    if (source.checked) {
      state.selectedReportIds.push(parseInt(cb.value, 10));
    }
  });
}

async function deleteSelectedReports() {
  if (!state.selectedReportIds.length) {
    alert('לא נבחרו שורות למחיקה');
    return;
  }

  if (!confirm('האם למחוק את כל השורות שסומנו?')) return;

  try {
    await api('/api/admin/reports/delete-many', {
      method: 'POST',
      body: JSON.stringify({
        ids: state.selectedReportIds
      })
    });

    state.selectedReportIds = [];
    alert('השורות נמחקו');
    loadReports();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteFilteredReports() {
  const employeeCode = document.getElementById('filterEmployee')?.value || '';
  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate = document.getElementById('toDate')?.value || '';

  if (!confirm('האם למחוק את כל השורות שמוצגות לפי הסינון הנוכחי?')) return;

  try {
    await api('/api/admin/reports/delete-filtered', {
      method: 'POST',
      body: JSON.stringify({
        employeeCode,
        fromDate,
        toDate
      })
    });

    state.selectedReportIds = [];
    alert('כל השורות המסוננות נמחקו');
    loadReports();
  } catch (err) {
    alert(err.message);
  }
}

render();