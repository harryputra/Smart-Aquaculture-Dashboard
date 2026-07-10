import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Waves, Zap, Shield, Crown, Wrench, Eye, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth, ROLE_LABEL } from '../context/AuthContext';
import { getQuickLoginPublic } from '../services/api';

const ROLE_STYLE = {
  superadmin: { icon: Shield, bg: '#ede9fe', fg: '#6d28d9' },
  pemilik: { icon: Crown, bg: '#dbeafe', fg: '#1d4ed8' },
  pekerja: { icon: Wrench, bg: '#d1fae5', fg: '#047857' },
  pengamat: { icon: Eye, bg: '#f1f5f9', fg: '#475569' },
};

const CSS = `
.ql-wrap{min-height:100vh;display:grid;place-items:center;padding:20px;
  background:linear-gradient(135deg,#0e7490 0%,#0891b2 45%,#06b6d4 100%);}
.ql-card{width:100%;max-width:416px;background:#fff;border-radius:22px;padding:30px 28px;
  box-shadow:0 18px 50px rgba(2,32,54,.22),0 3px 10px rgba(2,32,54,.10);}
.ql-brand{display:flex;align-items:center;gap:11px;margin-bottom:20px;}
.ql-logo{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;
  background:linear-gradient(135deg,#0891b2,#06b6d4);box-shadow:0 6px 16px rgba(8,145,178,.35);}
.ql-brand h1{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#0f172a;}
.ql-brand p{margin:0;font-size:12px;color:#64748b;}
.ql-kicker{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;color:#0891b2;margin-bottom:4px;}
.ql-title{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 3px;letter-spacing:-.01em;}
.ql-sub{font-size:13px;color:#64748b;margin:0 0 18px;}
.ql-row{width:100%;display:flex;align-items:center;gap:13px;padding:11px 13px;margin-bottom:9px;
  background:#fff;border:1px solid #e2e8f0;border-radius:14px;cursor:pointer;text-align:left;
  transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease;
  animation:qlIn .3s ease both;}
.ql-row:hover{border-color:#22c3dd;background:#f0fdff;transform:translateY(-1px);
  box-shadow:0 8px 20px rgba(6,182,212,.14);}
.ql-row:active{transform:translateY(0) scale(.99);}
.ql-row:focus-visible{outline:none;border-color:#06b6d4;box-shadow:0 0 0 3px rgba(6,182,212,.22);}
.ql-row:disabled{opacity:.55;cursor:default;transform:none;box-shadow:none;}
.ql-av{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;}
.ql-meta{display:flex;flex-direction:column;min-width:0;flex:1;}
.ql-role{font-weight:700;font-size:14.5px;color:#0f172a;line-height:1.25;}
.ql-name{font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ql-chev{color:#cbd5e1;flex-shrink:0;transition:color .16s ease,transform .16s ease;}
.ql-row:hover .ql-chev{color:#06b6d4;transform:translateX(2px);}
.ql-foot{margin-top:10px;text-align:center;}
.ql-link{font-size:13px;color:#64748b;text-decoration:none;display:inline-flex;align-items:center;gap:6px;
  padding:8px 12px;border-radius:9px;transition:color .16s,background .16s;}
.ql-link:hover{color:#0891b2;background:#f1f5f9;}
.ql-pp{width:100%;border:1px solid #e2e8f0;border-radius:11px;padding:11px 13px;font-size:14px;
  margin-bottom:12px;outline:none;transition:border-color .16s,box-shadow .16s;}
.ql-pp:focus{border-color:#06b6d4;box-shadow:0 0 0 3px rgba(6,182,212,.15);}
.ql-alert{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:11px;
  padding:10px 12px;font-size:13px;margin-bottom:14px;}
@keyframes qlIn{from{opacity:0;transform:translateY(7px);}to{opacity:1;transform:translateY(0);}}
@media (prefers-reduced-motion:reduce){.ql-row{animation:none;}.ql-row:hover{transform:none;}}
`;

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

  const accounts = data?.accounts || [];

  return (
    <div className="ql-wrap">
      <style>{CSS}</style>
      <div className="ql-card">
        <div className="ql-brand">
          <div className="ql-logo"><Waves size={24} /></div>
          <div><h1>AquaSmart</h1><p>Smart Aquaculture System</p></div>
        </div>

        {state === 'loading' && <p className="ql-sub" style={{ margin: 0 }}>Memeriksa tautan…</p>}

        {state === 'invalid' && (
          <>
            <div className="ql-alert">Tautan quick-login tidak valid, kedaluwarsa, atau fitur sedang nonaktif.</div>
            <div className="ql-foot"><Link to="/" className="ql-link"><ArrowLeft size={15} /> Ke halaman login</Link></div>
          </>
        )}

        {state === 'ready' && (
          <>
            <span className="ql-kicker"><Zap size={13} /> Quick Login</span>
            <h2 className="ql-title">Masuk cepat</h2>
            <p className="ql-sub">Pilih akun untuk langsung masuk ke dashboard.</p>

            {err && <div className="ql-alert">{err}</div>}
            {data.passphrase_required && (
              <input className="ql-pp" type="password" value={pp} onChange={e => setPp(e.target.value)} placeholder="Passphrase" />
            )}

            {accounts.map((a, i) => {
              const rs = ROLE_STYLE[a.role] || ROLE_STYLE.pengamat;
              const Icon = rs.icon;
              return (
                <button key={a.user_id} className="ql-row" disabled={busy} onClick={() => pick(a)}
                  style={{ animationDelay: `${i * 45}ms` }}>
                  <span className="ql-av" style={{ background: rs.bg, color: rs.fg }}><Icon size={19} /></span>
                  <span className="ql-meta">
                    <span className="ql-role">{ROLE_LABEL[a.role] || a.role}</span>
                    <span className="ql-name">{a.name || a.email}</span>
                  </span>
                  <ChevronRight size={19} className="ql-chev" />
                </button>
              );
            })}
            {accounts.length === 0 && <p className="ql-sub">Belum ada akun quick-login yang ditandai.</p>}

            <div className="ql-foot"><Link to="/" className="ql-link"><ArrowLeft size={14} /> Login biasa</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
