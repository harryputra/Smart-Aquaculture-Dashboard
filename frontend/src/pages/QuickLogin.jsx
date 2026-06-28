import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';
import { useAuth, ROLE_LABEL } from '../context/AuthContext';
import { getQuickLoginPublic } from '../services/api';

export default function QuickLogin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { quickLogin } = useAuth();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | invalid
  const [pp, setPp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getQuickLoginPublic(token)
      .then(d => { setData(d); setState('ready'); })
      .catch(() => setState('invalid'));
  }, [token]);

  async function pick(acc) {
    setErr(''); setBusy(true);
    try { await quickLogin({ account: acc.user_id, token, passphrase: pp }); navigate('/', { replace: true }); }
    catch (e) { setErr(e.message || 'Gagal masuk.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20,
      background: 'linear-gradient(135deg,#0e7490 0%,#0891b2 45%,#06b6d4 100%)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 800, fontSize: 18 }}>
          <Zap size={20} /> Quick Login
        </div>

        {state === 'loading' && <p className="text-muted">Memeriksa token…</p>}

        {state === 'invalid' && (
          <>
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              Link quick-login tidak valid, kedaluwarsa, atau fitur sedang nonaktif.
            </div>
            <Link to="/" className="btn btn-secondary"><ArrowLeft size={15} /> Ke halaman login</Link>
          </>
        )}

        {state === 'ready' && (
          <>
            <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13.5, color: 'var(--text-secondary)' }}>
              Pilih akun untuk masuk cepat.
            </p>
            {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
            {data.passphrase_required && (
              <input className="form-input" type="password" value={pp} onChange={e => setPp(e.target.value)}
                placeholder="Passphrase" style={{ marginBottom: 12 }} />
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {(data.accounts || []).map(a => (
                <button key={a.user_id} className="btn btn-primary" disabled={busy} onClick={() => pick(a)}>
                  Masuk sebagai {ROLE_LABEL[a.role] || a.role}
                  <span style={{ opacity: 0.8, fontWeight: 400 }}> · {a.name || a.email}</span>
                </button>
              ))}
              {(!data.accounts || data.accounts.length === 0) &&
                <p className="text-muted">Belum ada akun quick-login yang ditandai.</p>}
            </div>
            <Link to="/" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
              <ArrowLeft size={14} /> Login biasa
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
