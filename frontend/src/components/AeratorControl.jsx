import { useEffect, useState } from 'react';
import { Wind, Power } from 'lucide-react';
import { getAerator, setAerator } from '../services/api';
import { useCan } from '../context/AuthContext';

export default function AeratorControl({ pondId }) {
  const { canWrite } = useCan();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { try { setCfg(await getAerator(pondId)); } catch (e) { /* */ } }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [pondId]);

  if (!cfg) return null;
  const on = cfg.aerator_on;
  const mode = cfg.aerator_mode || 'auto';

  async function save(patch) {
    const body = {
      mode: patch.mode ?? cfg.aerator_mode ?? 'auto',
      do_on: patch.do_on ?? cfg.aerator_do_on,
      do_off: patch.do_off ?? cfg.aerator_do_off,
      manual_on: patch.manual_on ?? cfg.aerator_manual_on,
    };
    setBusy(true);
    try { await setAerator(pondId, body); await load(); }
    catch (e) { alert('Gagal: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title"><Wind size={18} /> Aerator (Kendali DO)</div>
        <span className="badge" style={{ background: on ? '#d1fae5' : '#f3f4f6', color: on ? '#047857' : '#6b7280' }}>
          <span className="badge-dot" style={{ background: on ? '#10b981' : '#94a3b8' }} />
          {on == null ? '—' : on ? 'MENYALA' : 'MATI'}
        </span>
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        Aerator otomatis menyala saat oksigen (DO) rendah. Logika berjalan di perangkat — tetap aman walau internet putus.
      </p>

      {!canWrite ? (
        <div className="text-xs text-muted">Mode lihat — pengaturan aerator hanya untuk operator.</div>
      ) : (
        <>
          <div className="form-group" style={{ maxWidth: 260 }}>
            <label className="form-label">Mode</label>
            <select className="form-select" value={mode} disabled={busy} onChange={e => save({ mode: e.target.value })}>
              <option value="auto">Auto (ikuti DO)</option>
              <option value="manual">Manual</option>
              <option value="off">Nonaktif</option>
            </select>
          </div>

          {mode === 'auto' && (
            <div className="form-row" style={{ maxWidth: 440 }}>
              <div className="form-group">
                <label className="form-label">Nyala bila DO ≤ (mg/L)</label>
                <input className="form-input" type="number" step="0.1" defaultValue={cfg.aerator_do_on}
                  onBlur={e => save({ do_on: parseFloat(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mati bila DO ≥ (mg/L)</label>
                <input className="form-input" type="number" step="0.1" defaultValue={cfg.aerator_do_off}
                  onBlur={e => save({ do_off: parseFloat(e.target.value) })} />
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div className="flex gap-2">
              <button className="btn btn-success" disabled={busy} onClick={() => save({ manual_on: true })}><Power size={15} /> Nyalakan</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => save({ manual_on: false })}><Power size={15} /> Matikan</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
