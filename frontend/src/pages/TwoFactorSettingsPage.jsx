import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../services/api';

export default function TwoFactorSettingsPage() {
  const [status, setStatus] = useState({ enabled: false, hasSecret: false });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setError('');

    try {
      const data = await apiGet('/2fa/status');
      setStatus({
        enabled: Boolean(data.enabled),
        hasSecret: Boolean(data.hasSecret)
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleCreateSetup() {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const data = await apiGet('/2fa/setup');
      setQrCodeDataUrl(data.qrCodeDataUrl || '');
      setSecret(data.secret || '');
      setStatus({ enabled: false, hasSecret: true });
      setMessage('נוצר קוד QR חדש. סרוק אותו באפליקציית Google Authenticator או Microsoft Authenticator.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const data = await apiPost('/2fa/enable', { token: code });
      setMessage(data.message || 'האימות הדו-שלבי הופעל');
      setCode('');
      setQrCodeDataUrl('');
      setSecret('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const data = await apiPost('/2fa/disable', { token: disableCode });
      setMessage(data.message || 'האימות הדו-שלבי בוטל');
      setDisableCode('');
      setQrCodeDataUrl('');
      setSecret('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-page">
      <div className="table-card">
        <div className="section-header">
          <h2>אימות דו-שלבי</h2>
          <button className="secondary-btn small" onClick={loadStatus} disabled={loading || busy}>
            רענן
          </button>
        </div>

        {message && <div className="alert success" style={{ marginTop: 16 }}>{message}</div>}
        {error && <div className="alert error" style={{ marginTop: 16 }}>{error}</div>}

        <div className="helper-box" style={{ marginTop: 18 }}>
          <strong>מצב נוכחי:</strong> {loading ? 'טוען...' : status.enabled ? 'מופעל' : 'כבוי'}
          <div style={{ marginTop: 10 }}>
            לאחר הפעלה, כל התחברות תדרוש גם קוד מאפליקציית אימות.
          </div>
        </div>
      </div>

      {!status.enabled && (
        <div className="users-layout">
          <div className="table-card">
            <div className="section-title">שלב 1 - יצירת קוד QR</div>
            <div className="helper-box" style={{ marginTop: 16 }}>
              לחץ על הכפתור, סרוק באפליקציה, ואז הזן את הקוד בן 6 הספרות שקיבלת.
            </div>

            <div style={{ marginTop: 16 }}>
              <button className="primary-btn" onClick={handleCreateSetup} disabled={busy}>
                צור קוד QR
              </button>
            </div>

            {qrCodeDataUrl && (
              <div style={{ marginTop: 22, textAlign: 'center' }}>
                <img src={qrCodeDataUrl} alt="QR Code" style={{ width: 240, maxWidth: '100%', borderRadius: 20, background: '#fff', padding: 12 }} />
                <div className="helper-box" style={{ marginTop: 16, wordBreak: 'break-all' }}>
                  <strong>מפתח ידני:</strong>
                  <div style={{ marginTop: 8, fontSize: 18, letterSpacing: 1 }}>{secret}</div>
                </div>
              </div>
            )}
          </div>

          <div className="table-card">
            <div className="section-title">שלב 2 - הפעלה</div>
            <form className="form-grid" onSubmit={handleEnable} style={{ marginTop: 16 }}>
              <label>
                <span>קוד אימות בן 6 ספרות</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                />
              </label>

              <button className="primary-btn" disabled={busy || code.length !== 6 || !status.hasSecret}>
                הפעל 2FA
              </button>
            </form>
          </div>
        </div>
      )}

      {status.enabled && (
        <div className="table-card">
          <div className="section-title">ביטול אימות דו-שלבי</div>
          <form className="form-grid" onSubmit={handleDisable} style={{ marginTop: 16, maxWidth: 420 }}>
            <label>
              <span>קוד אימות נוכחי</span>
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
              />
            </label>

            <button className="nav-btn danger" disabled={busy || disableCode.length !== 6}>
              בטל 2FA
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
