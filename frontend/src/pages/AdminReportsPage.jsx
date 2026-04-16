import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../services/api';

function formatForInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadData() {
    try {
      const data = await apiGet('/admin/reports');
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setEditData({
      work_day_type: row.work_day_type,
      note: row.note || '',
      record_time: formatForInput(row.record_time)
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  async function saveEdit(id) {
    try {
      await apiPut(`/admin/reports/${id}`, {
        ...editData,
        record_time: new Date(editData.record_time).toISOString()
      });

      setMessage('✔ נשמר בהצלחה');
      setEditingId(null);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card-page">
      <h2>דיווחי עובדים</h2>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>עובד</th>
              <th>קוד</th>
              <th>סוג</th>
              <th>סוג יום</th>
              <th>הערה</th>
              <th>תאריך ושעה</th>
              <th>פעולות</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;

              return (
                <tr
                  key={row.id}
                  style={row.is_edited ? { background: '#fff3cd' } : {}}
                >
                  <td>
                    {row.full_name} {row.is_edited && '⭐'}
                  </td>

                  <td>{row.employee_code}</td>

                  <td>{row.record_type === 'in' ? 'כניסה' : 'יציאה'}</td>

                  <td>
                    {isEditing ? (
                      <select
                        value={editData.work_day_type}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            work_day_type: e.target.value
                          })
                        }
                      >
                        <option>יום רגיל</option>
                        <option>שישי</option>
                        <option>שישי בתשלום</option>
                        <option>שבת</option>
                        <option>חג</option>
                        <option>חופשה</option>
                        <option>מחלה</option>
                        <option>מילואים</option>
                        <option>עבודה מהבית</option>
                        <option>אחר</option>
                      </select>
                    ) : (
                      row.work_day_type
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={editData.note}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            note: e.target.value
                          })
                        }
                      />
                    ) : (
                      row.note || '-'
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        type="datetime-local"
                        value={editData.record_time}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            record_time: e.target.value
                          })
                        }
                      />
                    ) : (
                      new Date(row.record_time).toLocaleString('he-IL')
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(row.id)}>שמור</button>
                        <button onClick={cancelEdit}>ביטול</button>
                      </>
                    ) : (
                      <button onClick={() => startEdit(row)}>ערוך</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}