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

const LEAVE_TYPES = ['חופשה', 'מחלה', 'מחלת משפחה', 'מילואים'];

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

function ChartShell({ title, children }) {
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
          d={describeArc(180, 180, 80, 0, endAngle)}
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
            <span style={{ color: '#5c7797', fontWeight: 700 }}>{row.type} · {row.count}</span>
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

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(formatToday());
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [dashboard, setDashboard] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRecords: 0,
    todayRecords: 0,
    pendingApprovals: 0,
    actionRequests: []
  });
  const [sortDirection, setSortDirection] = useState('asc');
  const { visible, toggle } = usePersistedVisible();

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [dashboardData, usersData, reportsData, departmentsData] = await Promise.all([
        apiGet('/admin/dashboard'),
        apiGet('/admin/users'),
        apiGet(`/admin/reports?fromDate=${date}&toDate=${date}`),
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
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת נתוני הדשבורד');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [date]);

  const filteredUsers = useMemo(() => {
    if (!departmentId) return users;
    return users.filter((u) => String(u.department_id || '') === String(departmentId));
  }, [users, departmentId]);

  const filteredReports = useMemo(() => {
    if (!departmentId) return reports;
    const allowedIds = new Set(filteredUsers.map((u) => u.id));
    return reports.filter((r) => allowedIds.has(r.user_id));
  }, [reports, filteredUsers, departmentId]);

  const inOut = useMemo(() => {
    const inCount = filteredReports.filter((r) => r.record_type === 'in').length;
    const outCount = filteredReports.filter((r) => r.record_type === 'out').length;
    return { inCount, outCount };
  }, [filteredReports]);

  const deptGauge = useMemo(() => {
    const total = filteredUsers.filter((u) => Number(u.is_active) === 1).length;
    const activeIds = new Set(filteredReports.filter((r) => r.record_type === 'in').map((r) => r.user_id));
    return { total, activeCount: activeIds.size };
  }, [filteredUsers, filteredReports]);

  const rankingRows = useMemo(() => {
    const latest = buildLatestPerUser(filteredReports);
    const rows = latest.map((r) => ({
      label: r.full_name || r.employee_code || `#${r.user_id}`,
      type: r.work_day_type || 'לא ידוע',
      count: 1
    }));

    rows.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const typeCmp = a.type.localeCompare(b.type, 'he');
      if (typeCmp !== 0) return typeCmp * dir;
      return a.label.localeCompare(b.label, 'he') * dir;
    });

    return rows;
  }, [filteredReports, sortDirection]);

  const leaveRows = useMemo(() => {
    const counts = {};
    filteredReports.forEach((r) => {
      const type = r.work_day_type;
      if (!LEAVE_TYPES.includes(type)) return;
      counts[type] = (counts[type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const selectedDepartmentName = useMemo(() => {
    if (!departmentId) return 'כלל המחלקות';
    const dep = departments.find((d) => String(d.id) === String(departmentId));
    return dep?.name || 'מחלקה';
  }, [departmentId, departments]);

  return (
    <div className="card-page" style={{ display: 'grid', gap: 18 }}>
      <div className="section-header">
        <h2>דשבורד מנהל</h2>
        <button className="secondary-btn small" onClick={loadData} type="button">
          רענן
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>הגדרות גרפים</div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label>
              <span>תאריך</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <label>
              <span>מחלקה</span>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">כל המחלקות</option>
                {departments.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>מיון גרף 3</span>
              <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)}>
                <option value="asc">עולה</option>
                <option value="desc">יורד</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              [CHART_KEYS.inOut, 'גרף 1 · כניסות מול יציאות'],
              [CHART_KEYS.activeDept, 'גרף 2 · פעילים מתוך מחלקה'],
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

          <div style={{ color: '#5c7797', fontWeight: 700 }}>
            תאריך נבחר: <strong>{date}</strong> · מחלקה: <strong>{selectedDepartmentName}</strong>
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
        <div style={cardStyle()}>טוען נתוני גרפים...</div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {visible[CHART_KEYS.inOut] && (
            <ChartShell title="1. כמות יציאות מול כניסות ביום נבחר">
              <InOutBarChart inCount={inOut.inCount} outCount={inOut.outCount} />
            </ChartShell>
          )}

          {visible[CHART_KEYS.activeDept] && (
            <ChartShell title="2. עובדים פעילים מתוך כמות העובדים הרשומים במחלקה">
              <SemiGauge activeCount={deptGauge.activeCount} totalCount={deptGauge.total} label={selectedDepartmentName} />
            </ChartShell>
          )}

          {visible[CHART_KEYS.dayTypeRanking] && (
            <ChartShell title="3. עובדים לפי סטטוס סוג יום">
              {rankingRows.length ? (
                <HorizontalRanking rows={rankingRows} />
              ) : (
                <EmptyState text="אין נתונים להצגה בגרף זה בתאריך שנבחר." />
              )}
            </ChartShell>
          )}

          {visible[CHART_KEYS.vacations] && (
            <ChartShell title="4. ימי חופש שנרשמו במערכת">
              {leaveRows.length ? (
                <LeaveBars rows={leaveRows} />
              ) : (
                <EmptyState text="לא נמצאו רישומי חופשה/מחלה/מילואים לתאריך שנבחר." />
              )}
            </ChartShell>
          )}
        </div>
      )}
    </div>
  );
}
