import { useState } from 'react';
import { Waves, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email.trim(), password); }
    catch (e2) { setErr(e2.message || 'Login gagal. Coba lagi.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20,
      background: 'linear-gradient(135deg,#0e7490 0%,#0891b2 45%,#06b6d4 100%)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 410, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center',
            color: 'white', background: 'linear-gradient(135deg,#0891b2,#06b6d4)',
          }}><Waves size={26} /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>AquaSmart</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>Smart Aquaculture System</p>
          </div>
        </div>

        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Masuk ke Akun</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--text-secondary)' }}>
          Silakan login untuk mengakses dashboard.
        </p>

        {err && <div className="alert alert-error" style={{ marginBottom: 14 }}>{err}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@contoh.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={show ? 'text' : 'password'} required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" style={{ paddingRight: 42 }} />
              <button type="button" onClick={() => setShow(s => !s)} aria-label="Tampilkan password"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                  display: 'grid', placeItems: 'center', padding: 4,
                }}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            <LogIn size={16} /> {busy ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
          © Smart Aquaculture · POLMAN Bandung
        </p>
      </div>
    </div>
  );
}
