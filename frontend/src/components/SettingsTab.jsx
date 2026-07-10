import { useEffect, useState } from 'react';
import { Save, Zap } from 'lucide-react';
import { updateThreshold } from '../services/api';

export default function SettingsTab({ pondId, threshold, onSaved }) {
  const [t, setT] = useState(threshold || {});

  useEffect(() => { setT(threshold || {}); }, [threshold]);

  async function save() {
    try {
      await updateThreshold(pondId, t);
      alert('Pengaturan berhasil disimpan');
      onSaved();
    } catch (e) { alert(e.message); }
  }

  if (!threshold) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Pengaturan Threshold & Kontrol Otomatis</div>
          <div className="card-subtitle">Atur batas sensor & perilaku auto-drain/refill</div>
        </div>
      </div>

      <h4 style={{ marginTop: 16, marginBottom: 12, fontSize: 13, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        Batas Sensor (Threshold)
      </h4>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Suhu Min (°C)</label>
          <input type="number" step="0.1" className="form-input" value={t.temp_min || ''}
            onChange={e => setT({ ...t, temp_min: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Suhu Max (°C)</label>
          <input type="number" step="0.1" className="form-input" value={t.temp_max || ''}
            onChange={e => setT({ ...t, temp_max: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Kedalaman Min (cm)</label>
          <input type="number" className="form-input" value={t.depth_min || ''}
            onChange={e => setT({ ...t, depth_min: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Kedalaman Max (cm)</label>
          <input type="number" className="form-input" value={t.depth_max || ''}
            onChange={e => setT({ ...t, depth_max: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">DO Min (mg/L)</label>
          <input type="number" step="0.1" className="form-input" value={t.do_min || ''}
            onChange={e => setT({ ...t, do_min: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">DO Max (mg/L)</label>
          <input type="number" step="0.1" className="form-input" value={t.do_max || ''}
            onChange={e => setT({ ...t, do_max: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Kekeruhan Max (NTU)</label>
          <input type="number" className="form-input" value={t.turbidity_max || ''}
            onChange={e => setT({ ...t, turbidity_max: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">pH Min</label>
          <input type="number" step="0.1" className="form-input" value={t.ph_min || ''}
            onChange={e => setT({ ...t, ph_min: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">pH Max</label>
          <input type="number" step="0.1" className="form-input" value={t.ph_max || ''}
            onChange={e => setT({ ...t, ph_max: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Pakan menipis di bawah (cm)</label>
          <input type="number" step="0.5" className="form-input" value={t.feed_level_low_cm ?? ''}
            onChange={e => setT({ ...t, feed_level_low_cm: e.target.value })} />
        </div>
      </div>

      <h4 style={{ marginTop: 24, marginBottom: 12, fontSize: 13, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        Kontrol Otomatis
      </h4>

      <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Auto-Drain saat Bahaya</div>
            <div className="text-xs text-muted">Otomatis kuras air ketika sensor melebihi batas kritis</div>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={!!t.auto_drain_enabled}
            onChange={e => setT({ ...t, auto_drain_enabled: e.target.checked })} />
          <span className="toggle-slider" />
        </label>
      </div>

      <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--info-light)', color: 'var(--info-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Auto-Refill setelah Drain</div>
            <div className="text-xs text-muted">Otomatis isi air bersih setelah pengurasan selesai</div>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={!!t.auto_refill_enabled}
            onChange={e => setT({ ...t, auto_refill_enabled: e.target.checked })} />
          <span className="toggle-slider" />
        </label>
      </div>

      <button className="btn btn-primary" onClick={save}>
        <Save size={16} /> Simpan Pengaturan
      </button>
    </div>
  );
}
