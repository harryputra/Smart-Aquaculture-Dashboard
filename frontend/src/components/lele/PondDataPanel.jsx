import { useEffect, useState } from 'react';
import { Save, Database, Calculator, Info } from 'lucide-react';
import { getLeleConfig, updateLeleConfig, getLeleBiomassSummary } from '../../services/leleApi';

export default function PondDataPanel({ deviceId }) {
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [c, sm] = await Promise.all([
        getLeleConfig(deviceId),
        getLeleBiomassSummary(deviceId),
      ]);
      setConfig(c);
      setSummary(sm[0] || null);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [deviceId]);

  async function save() {
    setSaving(true);
    try {
      await updateLeleConfig(deviceId, {
        fish_count: +config.fish_count,
        feeding_rate_percent: +config.feeding_rate_percent,
        feeding_per_day: +config.feeding_per_day,
        min_sample_count: +config.min_sample_count,
      });
      alert('✅ Data kolam disimpan');
    } catch (e) { alert('❌ ' + e.message); }
    setSaving(false);
  }

  if (!config) return <div className="loading"><div className="spinner" /></div>;

  // Live Feed Calculation Preview
  const avgWeight = summary ? parseFloat(summary.average_fish_weight_g) : 0;
  const biomassKg = (avgWeight * config.fish_count) / 1000;
  const dailyFeedG = biomassKg * (parseFloat(config.feeding_rate_percent) / 100) * 1000;
  const perScheduleG = config.feeding_per_day > 0 ? dailyFeedG / config.feeding_per_day : 0;

  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">📋 Data Kolam</div>
            <div className="card-subtitle">Parameter dasar — landasan perhitungan pakan adaptif</div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Jumlah Ikan (ekor) *</label>
            <input type="number" min="1" className="form-input" value={config.fish_count}
              onChange={e => setConfig({ ...config, fish_count: e.target.value })} />
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>Populasi ikan saat ini di kolam</div>
          </div>
          <div className="form-group">
            <label className="form-label">Feeding Rate (% biomassa/hari) *</label>
            <input type="number" step="0.1" min="0.1" max="20" className="form-input" value={config.feeding_rate_percent}
              onChange={e => setConfig({ ...config, feeding_rate_percent: e.target.value })} />
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>Lele umumnya 3-5%, sesuaikan dengan fase grow-out</div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Frekuensi Pakan/Hari *</label>
            <select className="form-select" value={config.feeding_per_day}
              onChange={e => setConfig({ ...config, feeding_per_day: e.target.value })}>
              <option value="1">1x sehari</option>
              <option value="2">2x sehari (pagi + sore)</option>
              <option value="3">3x sehari</option>
              <option value="4">4x sehari</option>
            </select>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>Menentukan jumlah pakan per jadwal</div>
          </div>
          <div className="form-group">
            <label className="form-label">Min Sampel Biomassa (ekor)</label>
            <input type="number" min="3" max="50" className="form-input" value={config.min_sample_count}
              onChange={e => setConfig({ ...config, min_sample_count: e.target.value })} />
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>Rekomendasi: 10 untuk 1000-3000 ekor</div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Data Kolam'}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">🧮 Feed Calculation Preview</div>
            <div className="card-subtitle">Perhitungan adaptif berdasarkan data kolam saat ini</div>
          </div>
        </div>

        {!summary ? (
          <div className="alert alert-info">
            <Info size={18} />
            <div>
              Belum ada data biomassa. Lakukan sampling biomassa dulu untuk melihat preview perhitungan pakan adaptif.
            </div>
          </div>
        ) : (
          <>
            <div className="alert alert-info">
              <Calculator size={18} />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                Biomassa = avg ({avgWeight.toFixed(1)}g) × ikan ({config.fish_count}) / 1000 = <strong>{biomassKg.toFixed(2)} kg</strong><br/>
                Pakan/Hari = {biomassKg.toFixed(2)} × {config.feeding_rate_percent}% = <strong>{Math.round(dailyFeedG)} g</strong><br/>
                Pakan/Jadwal = {Math.round(dailyFeedG)} / {config.feeding_per_day} = <strong>{Math.round(perScheduleG)} g</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <div className="text-xs text-muted">Total Biomassa</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent-primary)', fontFamily: "'Outfit', sans-serif" }}>
                  {biomassKg.toFixed(2)}
                </div>
                <div className="text-xs text-muted">kilogram</div>
              </div>
              <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <div className="text-xs text-muted">Pakan Harian</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                  {Math.round(dailyFeedG)}
                </div>
                <div className="text-xs text-muted">gram/hari</div>
              </div>
              <div style={{ padding: 16, background: 'var(--success-light)', borderRadius: 10, border: '2px solid var(--success)' }}>
                <div className="text-xs" style={{ color: 'var(--success-dark)', fontWeight: 600 }}>Pakan per Jadwal</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: 'var(--success-dark)' }}>
                  {Math.round(perScheduleG)}
                </div>
                <div className="text-xs" style={{ color: 'var(--success-dark)' }}>gram/feeding</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
