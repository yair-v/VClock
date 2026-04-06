const app = document.getElementById('app');

const state = {
  token: localStorage.getItem('vclock_token') || '',
  user: JSON.parse(localStorage.getItem('vclock_user') || 'null'),
  currentTab: 'dashboard',
  employeeStatus: null,
  selectedReportIds: []
};

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

function renderLogin() {
  app.innerHTML = `
    <div class="mobile-shell">
      <div class="card center">
        <div class="badge">VClock</div>
        <h1 class="title">מערכת שעון נוכחות</h1>
        <p class="subtitle">התחברות עובד / מנהל</p>
        <div id="msgBox" class="hidden"></div>
        <form id="loginForm" class="grid">
          <div>
            <label class="label">שם עובד או מספר עובד</label>
            <input class="input" name="employeeCode" value="" required />
          </div>
          <div>
            <label class="label">סיסמה</label>
            <input class="input" type="password" name="password" value="" required />
          </div>
          <button class="btn btn-primary btn-block" type="submit">התחבר</button>
        </form>
        <hr class="sep" />
        <div class="small">
          משתמשים לדוגמה:<br />
          מנהל: admin / 1234<br />
          עובד: 1001 / 1234
        </div>
      </div>
    </div>
  `;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    clearMessage();
    const fd = new FormData(e.target);

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: fd.get('employeeCode'),
          password: fd.get('password')
        })
      });
      saveAuth(data.token, data.user);
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
        <div>
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
          </div>

          <div>
            <label class="label">הערה</label>
            <textarea class="textarea" id="note"></textarea>
          </div>

          <div>
            <label class="label">ארוחות</label>
            <div class="row" style="margin-top:8px">
              <label><input type="checkbox" id="mealMorning" /> א. בוקר</label>
              <label><input type="checkbox" id="mealNoon" /> א. צהריים</label>
              <label><input type="checkbox" id="mealEvening" /> א. ערב</label>
            </div>
            <div class="small" id="mealInfo" style="margin-top:8px"></div>
          </div>

          <div class="grid grid-2">
            <button class="btn btn-ok btn-block" id="checkInBtn">כניסה לעבודה</button>
            <button class="btn btn-danger btn-block" id="checkOutBtn">יציאה מהעבודה</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">הדיווחים האחרונים שלי</h2>
        <div id="myRecords">טוען...</div>
      </div>
    </div>
  `;

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

    const canUseMeals =
      status.lastRecord &&
      status.lastRecord.record_type === 'in' &&
      !status.user.day_closed;

    setupMealCheckboxes(!!canUseMeals);

    const checkInBtn = document.getElementById('checkInBtn');
    if (status.user.day_closed) {
      checkInBtn.disabled = true;
      checkInBtn.title = 'היום נסגר. יש לפנות למנהל לפתיחה מחדש';
    } else {
      checkInBtn.disabled = false;
      checkInBtn.title = '';
    }
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
      const ok = confirm(`שלום ${employeeName}, האם אתה בטוח שאתה רוצה לסגור את יום העבודה?`);
      if (!ok) return;

      await submitAttendance('out');
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
                <th>הערה</th>
                <th>תאריך ושעה</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>
                  <td>${r.work_day_type}</td>
                  <td>${r.note || ''}</td>
                  <td>${fmtDateTime(r.record_time)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">אין נתונים</td></tr>'}
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

      const selectedMeals = [];
      if (document.getElementById('mealMorning')?.checked) selectedMeals.push('א. בוקר');
      if (document.getElementById('mealNoon')?.checked) selectedMeals.push('א. צהריים');
      if (document.getElementById('mealEvening')?.checked) selectedMeals.push('א. ערב');

      const mealsText = selectedMeals.length ? ` | ארוחות: ${selectedMeals.join(', ')}` : '';
      const note = `${noteText || ''}${mealsText}`.trim();

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

      showMessage(
        'success',
        `${recordType === 'in' ? 'כניסה' : 'יציאה'} נשמרה בהצלחה: ${fmtDateTime(result.record_time)}`
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
  `;

  document.getElementById('searchBtn').onclick = doSearch;
  document.getElementById('deleteSelectedBtn').onclick = deleteSelectedReports;
  document.getElementById('deleteFilteredBtn').onclick = deleteFilteredReports;

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
        toDate: document.getElementById('toDate').value || ''
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
                <th>הערה</th>
                <th>מיקום</th>
                <th>תאריך ושעה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                  <tr>
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
                    <td>${r.work_day_type}</td>
                    <td>${r.note || ''}</td>
                    <td>
                      ${r.location_status === 'no_permission'
          ? '<span style="color:#b91c1c;font-weight:700">הרשאות מיקום סגורות</span>'
          : (r.map_link
            ? `<a href="${r.map_link}" target="_blank">פתח מפה</a>`
            : '')
        }
                    </td>
                    <td>${fmtDateTime(r.record_time)}</td>
                    <td>
                      <div class="row">
                        <button class="btn btn-light" onclick="editReport(${r.id}, '${String(r.work_day_type || '').replace(/'/g, "\\'")}', '${String(r.note || '').replace(/'/g, "\\'")}')">ערוך</button>
                        <button class="btn btn-danger" onclick="deleteReport(${r.id})">מחק</button>
                      </div>
                    </td>
                  </tr>
                `).join('')
        || '<tr><td colspan="9">אין נתונים</td></tr>'
        }
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

  doSearch();
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
    const users = await api('/api/admin/users');
    const user = users.find(u => u.id === id);

    if (!user) {
      alert('משתמש לא נמצא');
      return;
    }

    const full_name = prompt('שם חדש:', user.full_name);
    if (full_name === null) return;

    const password = prompt('סיסמה חדשה (אפשר להשאיר ריק):', '');
    if (password === null) return;

    const role = prompt('תפקיד (admin / employee):', user.role);
    if (role === null) return;

    const is_active = confirm('האם המשתמש יהיה פעיל?');

    await api('/api/admin/users/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        full_name,
        password,
        role,
        is_active,
        day_closed: user.day_closed
      })
    });

    alert('המשתמש עודכן בהצלחה');
    loadUsers();
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
          is_active: fd.get('is_active') === 'on'
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
                  <td>${fmtDateTime(r.created_at)}</td>
                  <td>
                    <div class="row">
                      <button class="btn btn-light" onclick="editUser(${r.id})">ערוך</button>
                     ${r.day_closed ? `<button class="btn btn-primary" onclick="reopenDay(${r.id})">פתח אפשרות כניסה</button>` : ''}
                      <button class="btn btn-danger" onclick="deleteUser(${r.id})">מחק</button>
                    </div>
                  </td>
                </tr>
              `).join('')
      || '<tr><td colspan="7">אין משתמשים</td></tr>'}
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
    const s = await api('/api/admin/settings');

    box.innerHTML = `
      <h2 style="margin-top:0">הגדרות מערכת</h2>
      <div id="settingsMsg" class="hidden"></div>

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
  } catch (err) {
    box.innerHTML = `<div class="error">${err.message}</div>`;
  }
}
async function editReport(id, currentType, currentNote) {
  const work_day_type = prompt('סוג יום עבודה:', currentType || '');
  if (work_day_type === null) return;

  const note = prompt('הערה:', currentNote || '');
  if (note === null) return;

  try {
    await api('/api/admin/reports/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        work_day_type,
        note
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