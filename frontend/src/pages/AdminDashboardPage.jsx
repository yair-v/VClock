import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../services/api';

const CHART_KEYS = {
  inOut: 'inOut',
  activeDept: 'activeDept',
  dayTypeRanking: 'dayTypeRanking',
  vacations: 'vacations'
};

const DEFAULT_VISIBLE = {
  [CHART_KEYS.inOut]: true,
  [CHART_KEYS.activeDept]: true,
  [CHART_KEYS.dayTypeRanking]: true,
  [CHART_KEYS.vacations]: true
};

const DAY_TYPE_OPTIONS = [
  'הכל',
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

const VACATION_TYPES = ['חופשה', 'מחלה', 'מחלת משפחה', 'מילואים'];

function formatToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStoredVisible() {
  try {
    const raw = localStorage.getItem('vclock_dashboard_visible_charts');
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VISIBLE, ...parsed };
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function usePersistedVisible() {
  const [visible, setVisible] = useState(getStoredVisible());

  useEffect(() => {
    localStorage.setItem('vclock_dashboard_visible_charts', JSON.stringify(visible));
  }, [visible]);

  function toggle(key) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return { visible, toggle };
}

function cardStyle() {
  return {
    background: 'linear-gradient(180deg, rgba(249,252,255,0.98) 0%, rgba(236,245,253,0.98) 100%)',
    border: '1px solid rgba(210,226,243,0.9)',
    borderRadius: 24,
    boxShadow: '0 24px 60px rgba(3,17,41,0.18)',
    padding: 20,
    color: '#17365c'
  };
}

function EmptyState({ text }) {
  return <div style={{ color: '#5c7797', fontWeight: 700 }}>{text}</div>;
}

function SectionCard({ title, children }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function InOutBarChart({ inCount, outCount }) {
  const max = Math.max(inCount, outCount, 1);
  const bars = [
    { label: 'כניסות', value: inCount, color: '#1976ff' },
    { label: 'יציאות', value: outCount, color: '#ef4444' }
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 26, height: 220, padding: '10px 20px 0' }}>
      {bars.map((bar) => (
        <div key={bar.label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{bar.value}</div>
          <div
            style={{
              width: '100%',
              maxWidth: 140,
              margin: '0 auto',
              height: `${Math.max((bar.value / max) * 160, 8)}px`,
              borderRadius: 16,
              background: bar.color,
              boxShadow: '0 8px 20px rgba(0,0,0,0.12)'
            }}
          />
          <div style={{ marginTop: 10, fontWeight: 700 }}>{bar.label}</div>
        </div>
      ))}
    </div>
  );
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  }

  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

function SemiGauge({ activeCount, totalCount, label }) {
  const pct = totalCount > 0 ? Math.min(activeCount / totalCount, 1) : 0;
  const endAngle = 180 * pct;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 240 150" style={{ width: '100%', maxWidth: 360 }}>
        <path
          d={describeArc(120, 120, 80, 0, 180)}
          stroke="#dbeafe"
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={describeArc(120, 120, 80, 0, endAngle)}
          stroke="#22c55e"
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
        />
        <text x="120" y="96" textAnchor="middle" fontSize="28" fontWeight="900" fill="#17365c">
          {activeCount}/{totalCount}
        </text>
        <text x="120" y="124" textAnchor="middle" fontSize="14" fontWeight="700" fill="#5c7797">
          {label}
        </text>
      </svg>
    </div>
  );
}

function HorizontalRanking({ rows }) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row) => (
        <div key={`${row.label}-${row.type}`} style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <strong>{row.label}</strong>
            <span style={{ color: '#5c7797', fontWeight: 700 }}>
              {row.type} · {row.count}
            </span>
          </div>
          <div style={{ height: 12, background: '#eaf3fd', borderRadius: 999 }}>
            <div
              style={{
                width: `${Math.max((row.count / max) * 100, 4)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #1976ff 0%, #125dd0 100%)',
                borderRadius: 999
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaveBars({ rows }) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map((row) => (
        <div key={row.type} style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{row.type}</strong>
            <span style={{ fontWeight: 800 }}>{row.count}</span>
          </div>
          <div style={{ height: 16, background: '#f1f5f9', borderRadius: 999 }}>
            <div
              style={{
                width: `${Math.max((row.count / max) * 100, row.count ? 8 : 0)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)',
                borderRadius: 999
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildQuery(paramsObj) {
  const params = new URLSearchParams();

  Object.entries(paramsObj).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      params.append(key, value);
    }
  });

  return params.toString() ? `?${params.toString()}` : '';
}

function buildLatestPerUser(records) {
  const map = new Map();

  records.forEach((r) => {
    const key = r.user_id || r.employee_code || r.full_name;
    const prev = map.get(key);
    const currentTime = new Date(r.record_time).getTime();

    if (!prev || currentTime > new Date(prev.record_time).getTime()) {
      map.set(key, r);
    }
  });

  return Array.from(map.values());
}

function getUserName(user) {
  return user.full_name || user.fullName || '';
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [dashboard, setDashboard] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRecords: 0,
    todayRecords: 0,
    pendingApprovals: 0,
    actionRequests: []
  });

  const [inOutRows, setInOutRows] = useState([]);
  const [activeRows, setActiveRows] = useState([]);
  const [rankingRowsSource, setRankingRowsSource] = useState([]);
  const [vacationRowsSource, setVacationRowsSource] = useState([]);

  const { visible, toggle } = usePersistedVisible();

  const [inOutFilters, setInOutFilters] = useState({
    fromDate: formatToday(),
    toDate: formatToday(),
    employeeCode: ''
  });

  const [activeFilters, setActiveFilters] = useState({
    date: formatToday(),
    departmentId: ''
  });

  const [rankingFilters, setRankingFilters] = useState({
    fromDate: formatToday(),
    toDate: formatToday(),
    employeeCode: '',
    category: 'הכל',
    sortDirection: 'asc'
  });

  const [vacationFilters, setVacationFilters] = useState({
    fromDate: formatToday(),
    toDate: formatToday(),
    employeeCode: '',
    category: 'הכל'
  });

  async function loadBaseData() {
    setLoading(true);
    setError('');

    try {
      const [dashboardData, usersData, departmentsData] = await Promise.all([
        apiGet('/admin/dashboard'),
        apiGet('/admin/users'),
        apiGet('/admin/departments').catch(() => [])
      ]);

      setDashboard({
        totalUsers: dashboardData.totalUsers || 0,
        activeUsers: dashboardData.activeUsers || 0,
        totalRecords: dashboardData.totalRecords || 0,
        todayRecords: dashboardData.todayRecords || 0,
        pendingApprovals: dashboardData.pendingApprovals || 0,
        actionRequests: Array.isArray(dashboardData.actionRequests) ? dashboardData.actionRequests : []
      });

      setUsers(Array.isArray(usersData) ? usersData : []);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת נתוני בסיס');
    } finally {
      setLoading(false);
    }
  }

  async function loadInOutChart() {
    try {
      const data = await apiGet(
        `/admin/reports${buildQuery({
          employeeCode: inOutFilters.employeeCode,
          fromDate: inOutFilters.fromDate,
          toDate: inOutFilters.toDate
        })}`
      );
      setInOutRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadActiveDeptChart() {
    try {
      const data = await apiGet(
        `/admin/reports${buildQuery({
          fromDate: activeFilters.date,
          toDate: activeFilters.date
        })}`
      );
      setActiveRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadRankingChart() {
    try {
      const data = await apiGet(
        `/admin/reports${buildQuery({
          employeeCode: rankingFilters.employeeCode,
          fromDate: rankingFilters.fromDate,
          toDate: rankingFilters.toDate
        })}`
      );
      setRankingRowsSource(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadVacationChart() {
    try {
      const data = await apiGet(
        `/admin/reports${buildQuery({
          employeeCode: vacationFilters.employeeCode,
          fromDate: vacationFilters.fromDate,
          toDate: vacationFilters.toDate
        })}`
      );
      setVacationRowsSource(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    loadInOutChart();
  }, [inOutFilters.fromDate, inOutFilters.toDate, inOutFilters.employeeCode]);

  useEffect(() => {
    loadActiveDeptChart();
  }, [activeFilters.date]);

  useEffect(() => {
    loadRankingChart();
  }, [rankingFilters.fromDate, rankingFilters.toDate, rankingFilters.employeeCode]);

  useEffect(() => {
    loadVacationChart();
  }, [vacationFilters.fromDate, vacationFilters.toDate, vacationFilters.employeeCode]);

  const inOutData = useMemo(() => {
    return {
      inCount: inOutRows.filter((r) => r.record_type === 'in').length,
      outCount: inOutRows.filter((r) => r.record_type === 'out').length
    };
  }, [inOutRows]);

  const activeGaugeData = useMemo(() => {
    const departmentUsers = activeFilters.departmentId
      ? users.filter(
        (u) =>
          String(u.department_id || '') === String(activeFilters.departmentId) &&
          Number(u.is_active) === 1
      )
      : users.filter((u) => Number(u.is_active) === 1);

    const allowedIds = new Set(departmentUsers.map((u) => u.id));
    const reportedIds = new Set(
      activeRows
        .filter((r) => r.record_type === 'in')
        .filter((r) => !activeFilters.departmentId || allowedIds.has(r.user_id))
        .map((r) => r.user_id)
    );

    const dep = departments.find((d) => String(d.id) === String(activeFilters.departmentId));
    const label = activeFilters.departmentId ? dep?.name || 'מחלקה' : 'כלל העובדים';

    return {
      totalCount: departmentUsers.length,
      activeCount: reportedIds.size,
      label
    };
  }, [users, activeRows, departments, activeFilters.departmentId]);

  const rankingRows = useMemo(() => {
    const latest = buildLatestPerUser(rankingRowsSource);

    let rows = latest.map((r) => ({
      label: r.full_name || r.employee_code || `#${r.user_id}`,
      type: r.work_day_type || 'לא ידוע',
      count: 1
    }));

    if (rankingFilters.category !== 'הכל') {
      rows = rows.filter((r) => r.type === rankingFilters.category);
    }

    rows.sort((a, b) => {
      const dir = rankingFilters.sortDirection === 'asc' ? 1 : -1;
      const typeCmp = a.type.localeCompare(b.type, 'he');
      if (typeCmp !== 0) return typeCmp * dir;
      return a.label.localeCompare(b.label, 'he') * dir;
    });

    return rows;
  }, [rankingRowsSource, rankingFilters.category, rankingFilters.sortDirection]);

  const vacationRows = useMemo(() => {
    let source = vacationRowsSource.filter((r) => VACATION_TYPES.includes(r.work_day_type));

    if (vacationFilters.category !== 'הכל') {
      source = source.filter((r) => r.work_day_type === vacationFilters.category);
    }

    const counts = {};
    source.forEach((r) => {
      counts[r.work_day_type] = (counts[r.work_day_type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [vacationRowsSource, vacationFilters.category]);

  return (
    <div className="card-page" style={{ display: 'grid', gap: 18 }}>
      <div className="section-header">
        <h2>דשבורד מנהל</h2>
        <button
          className="secondary-btn small"
          type="button"
          onClick={() => {
            loadBaseData();
            loadInOutChart();
            loadActiveDeptChart();
            loadRankingChart();
            loadVacationChart();
          }}
        >
          רענן
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>הצגת גרפים</div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              [CHART_KEYS.inOut, 'גרף 1 · כניסות מול יציאות'],
              [CHART_KEYS.activeDept, 'גרף 2 · עובדים פעילים מתוך מחלקה'],
              [CHART_KEYS.dayTypeRanking, 'גרף 3 · עובדים לפי סוג יום'],
              [CHART_KEYS.vacations, 'גרף 4 · ימי חופש']
            ].map(([key, label]) => (
              <label key={key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(visible[key])}
                  onChange={() => toggle(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="dashboard-grid">
        <div className="stat-card">
          <strong>{dashboard.totalUsers}</strong>
          <span>סה"כ עובדים</span>
        </div>
        <div className="stat-card">
          <strong>{dashboard.activeUsers}</strong>
          <span>עובדים פעילים</span>
        </div>
        <div className="stat-card">
          <strong>{dashboard.todayRecords}</strong>
          <span>דיווחים היום</span>
        </div>
        <div className="stat-card">
          <strong>{dashboard.pendingApprovals}</strong>
          <span>ממתינים לאישור</span>
        </div>
      </div>

      {loading ? (
        <div style={cardStyle()}>טוען נתוני דשבורד...</div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {visible[CHART_KEYS.inOut] && (
            <SectionCard title="1. כמות יציאות מול כניסות">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <label>
                  <span>מתאריך</span>
                  <input
                    type="date"
                    value={inOutFilters.fromDate}
                    onChange={(e) => setInOutFilters({ ...inOutFilters, fromDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עד תאריך</span>
                  <input
                    type="date"
                    value={inOutFilters.toDate}
                    onChange={(e) => setInOutFilters({ ...inOutFilters, toDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עובד</span>
                  <select
                    value={inOutFilters.employeeCode}
                    onChange={(e) => setInOutFilters({ ...inOutFilters, employeeCode: e.target.value })}
                  >
                    <option value="">כל העובדים</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.employee_code}>
                        {getUserName(u)} ({u.employee_code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <InOutBarChart inCount={inOutData.inCount} outCount={inOutData.outCount} />
            </SectionCard>
          )}

          {visible[CHART_KEYS.activeDept] && (
            <SectionCard title="2. עובדים פעילים מתוך כמות הרשומים">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <label>
                  <span>תאריך</span>
                  <input
                    type="date"
                    value={activeFilters.date}
                    onChange={(e) => setActiveFilters({ ...activeFilters, date: e.target.value })}
                  />
                </label>

                <label>
                  <span>מחלקה</span>
                  <select
                    value={activeFilters.departmentId}
                    onChange={(e) => setActiveFilters({ ...activeFilters, departmentId: e.target.value })}
                  >
                    <option value="">כל המחלקות</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <SemiGauge
                activeCount={activeGaugeData.activeCount}
                totalCount={activeGaugeData.totalCount}
                label={activeGaugeData.label}
              />
            </SectionCard>
          )}

          {visible[CHART_KEYS.dayTypeRanking] && (
            <SectionCard title="3. עובדים לפי סטטוס סוג יום">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <label>
                  <span>מתאריך</span>
                  <input
                    type="date"
                    value={rankingFilters.fromDate}
                    onChange={(e) => setRankingFilters({ ...rankingFilters, fromDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עד תאריך</span>
                  <input
                    type="date"
                    value={rankingFilters.toDate}
                    onChange={(e) => setRankingFilters({ ...rankingFilters, toDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עובד</span>
                  <select
                    value={rankingFilters.employeeCode}
                    onChange={(e) => setRankingFilters({ ...rankingFilters, employeeCode: e.target.value })}
                  >
                    <option value="">כל העובדים</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.employee_code}>
                        {getUserName(u)} ({u.employee_code})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>קטגוריה</span>
                  <select
                    value={rankingFilters.category}
                    onChange={(e) => setRankingFilters({ ...rankingFilters, category: e.target.value })}
                  >
                    {DAY_TYPE_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>סדר</span>
                  <select
                    value={rankingFilters.sortDirection}
                    onChange={(e) => setRankingFilters({ ...rankingFilters, sortDirection: e.target.value })}
                  >
                    <option value="asc">עולה</option>
                    <option value="desc">יורד</option>
                  </select>
                </label>
              </div>

              {rankingRows.length ? (
                <HorizontalRanking rows={rankingRows} />
              ) : (
                <EmptyState text="אין נתונים להצגה בגרף זה." />
              )}
            </SectionCard>
          )}

          {visible[CHART_KEYS.vacations] && (
            <SectionCard title="4. ימי חופש שנרשמו במערכת">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <label>
                  <span>מתאריך</span>
                  <input
                    type="date"
                    value={vacationFilters.fromDate}
                    onChange={(e) => setVacationFilters({ ...vacationFilters, fromDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עד תאריך</span>
                  <input
                    type="date"
                    value={vacationFilters.toDate}
                    onChange={(e) => setVacationFilters({ ...vacationFilters, toDate: e.target.value })}
                  />
                </label>

                <label>
                  <span>עובד</span>
                  <select
                    value={vacationFilters.employeeCode}
                    onChange={(e) => setVacationFilters({ ...vacationFilters, employeeCode: e.target.value })}
                  >
                    <option value="">כל העובדים</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.employee_code}>
                        {getUserName(u)} ({u.employee_code})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>קטגוריה</span>
                  <select
                    value={vacationFilters.category}
                    onChange={(e) => setVacationFilters({ ...vacationFilters, category: e.target.value })}
                  >
                    <option value="הכל">הכל</option>
                    {VACATION_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {vacationRows.length ? (
                <LeaveBars rows={vacationRows} />
              ) : (
                <EmptyState text="לא נמצאו רישומי חופשה/מחלה/מילואים לפי הסינון." />
              )}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}