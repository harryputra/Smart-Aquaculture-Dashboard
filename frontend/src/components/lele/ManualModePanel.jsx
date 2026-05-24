import { useState, useEffect } from 'react';
import { Fish, Scale, Clock, Calculator, Save, Plus, Trash2, CheckCircle, History, Info } from 'lucide-react';

const STORAGE_KEY = 'lele_manual_data';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const DEFAULT = {
  fishCount: 1000,
  avgWeightG: 50,
  feedingPerDay: 2,
  feedingRatePercent: 0,
  schedules: ['07:00', '17:00'],
  feedingLog: [],
  samplingLog: [],
};

function calcRate(avgG) {
  if (avgG <= 20) return 7.0;
  if (avgG <= 50) return 7.0 + (5.0 - 7.0) * (avgG - 20) / (50 - 20);
  if (avgG <= 100) return 5.0 + (3.5 - 5.0) * (avgG - 50) / (100 - 50);
  if (avgG <= 300) return 3.5 + (2.8 - 3.5) * (avgG - 100) / (300 - 100);
  if (avgG <= 700) return 2.8 + (2.0 - 2.8) * (avgG - 300) / (700 - 300);
  if (avgG <= 1000) return 2.0 + (1.5 - 2.0) * (avgG - 700) / (1000 - 700);
  return 1.5;
}

export default function ManualModePanel() {
  const [tab, setTab] = useState('biomassa');
  const [data, setData] = useState(() => loadData() || DEFAULT);
  const [saved, setSaved] = useState(false);

  useEffect(() => { saveData(data); }, [data]);

  function upd(key, val) {
    setData(prev => {
      const next = { ...prev, [key]: val };
      if (key === 'avgWeightG') next.feedingRatePercent = parseFloat(calcRate(+val).toFixed(2));
      return next;
    });
  }

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 1500); }

  const biomassKg = (data.avgWeightG * data.fishCount) / 1000;
  const dailyFeedG = biomassKg * (data.feedingRatePercent / 100) * 1000;
  const perScheduleG = data.feedingPerDay > 0 ? dailyFeedG / data.feedingPerDay : 0;

  const TABS = [
    { id: 'biomassa', label: '🐟 Biomassa', },
    { id: 'pakan',    label: '🍽️ Kalkulasi Pakan', },
    { id: 'jadwal',   label: '⏰ Jadwal', },
    { id: 'log',      label: '📋 Catatan Feeding', },
  ];

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <Info size={18} />
        <div>
          <strong>Mode Manual</strong> — tidak terhubung ke hardware. Semua data disimpan di browser secara lokal.
          Cocok untuk perencanaan, simulasi, atau saat ESP32 sedang offline.
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB BIOMASSA ── */}
      {tab === 'biomassa' && (
        <>
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-card-icon"><Fish size={22} /></div>
              <div className="stat-card-label">Jumlah Ikan</div>
              <div className="stat-card-value">{data.fishCount.toLocaleString()}</div>
              <div className="stat-card-subtext">ekor</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Scale size={22} /></div>
              <div className="stat-card-label">Rata² Berat</div>
              <div className="stat-card-value">{data.avgWeightG}</div>
              <div className="stat-card-subtext">gram/ekor</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#d1fae5', color: '#047857' }}>📊</div>
              <div className="stat-card-label">Biomassa Total</div>
              <div className="stat-card-value">{biomassKg.toFixed(2)}</div>
              <div className="stat-card-subtext">kg</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>📈</div>
              <div className="stat-card-label">Feeding Rate</div>
              <div className="stat-card-value">{data.feedingRatePercent.toFixed(1)}<span style={{ fontSize: 16 }}>%</span></div>
              <div className="stat-card-subtext">auto dari kurva</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 20 }}>Input Data Biomassa</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Jumlah Ikan (ekor)</label>
                <input type="number" min="1" className="form-input" value={data.fishCount}
                  onChange={e => upd('fishCount', +e.target.value)} />
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>Atur step: +/- 500 ekor</div>
                <div className="flex gap-2" style={{ marginTop: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => upd('fishCount', Math.max(1, data.fishCount - 500))}>− 500</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => upd('fishCount', data.fishCount + 500)}>+ 500</button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Rata-rata Berat Ikan (gram)</label>
                <input type="number" min="1" max="2000" className="form-input" value={data.avgWeightG}
                  onChange={e => upd('avgWeightG', +e.target.value)} />
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                  Feeding rate otomatis: <strong>{calcRate(data.avgWeightG).toFixed(1)}%/hari</strong>
                </div>
              </div>
            </div>

            <div className="alert alert-info" style={{ marginTop: 16 }}>
              <Calculator size={18} />
              <div className="text-xs">
                <strong>Kurva Feeding Rate:</strong> ≤20g → 7% | 50g → 5% | 100g → 3.5% | 300g → 2.8% | 700g → 2% | 1000g → 1.5%
              </div>
            </div>

            {/* Tabel sampling manual */}
            <div style={{ marginTop: 20 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>Catat Hasil Sampling Manual</div>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  const w = parseFloat(prompt('Berat ikan (gram):') || '0');
                  if (w > 0) {
                    const logs = [...data.samplingLog, { g: w, time: new Date().toLocaleString('id-ID') }];
                    const avg = logs.reduce((s, x) => s + x.g, 0) / logs.length;
                    setData(prev => ({
                      ...prev,
                      samplingLog: logs,
                      avgWeightG: parseFloat(avg.toFixed(1)),
                      feedingRatePercent: parseFloat(calcRate(avg).toFixed(2)),
                    }));
                  }
                }}>
                  <Plus size={14} /> Tambah Sample
                </button>
              </div>
              {data.samplingLog.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}><p>Belum ada data sampling. Klik + Tambah Sample.</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Berat (g)</th><th>Waktu</th><th></th></tr></thead>
                    <tbody>
                      {data.samplingLog.map((s, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{s.g} g</td>
                          <td className="text-xs text-muted">{s.time}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                              const logs = data.samplingLog.filter((_, j) => j !== i);
                              const avg = logs.length ? logs.reduce((s, x) => s + x.g, 0) / logs.length : data.avgWeightG;
                              setData(prev => ({
                                ...prev,
                                samplingLog: logs,
                                avgWeightG: parseFloat(avg.toFixed(1)),
                                feedingRatePercent: parseFloat(calcRate(avg).toFixed(2)),
                              }));
                            }}><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--success-light)', fontWeight: 700 }}>
                        <td colSpan={2}>RATA-RATA: {(data.samplingLog.reduce((s, x) => s + x.g, 0) / data.samplingLog.length).toFixed(1)} g</td>
                        <td colSpan={2}>{data.samplingLog.length} ikan</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TAB KALKULASI PAKAN ── */}
      {tab === 'pakan' && (
        <>
          <div className="card mb-6">
            <div className="card-title" style={{ marginBottom: 20 }}>Parameter Pakan</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Frekuensi Pakan / Hari</label>
                <input type="number" min="1" max="6" className="form-input" value={data.feedingPerDay}
                  onChange={e => upd('feedingPerDay', +e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Feeding Rate (% biomassa/hari)</label>
                <input type="number" min="0.5" max="10" step="0.1" className="form-input"
                  value={data.feedingRatePercent}
                  onChange={e => upd('feedingRatePercent', +e.target.value)} />
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>Auto dari berat ikan, atau ubah manual</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            <ResultCard label="Biomassa Total" value={`${biomassKg.toFixed(2)} kg`} color="var(--success)" />
            <ResultCard label="Pakan / Hari" value={`${Math.round(dailyFeedG)} g`} color="var(--accent-primary)" />
            <ResultCard label="Pakan / Jadwal" value={`${Math.round(perScheduleG)} g`} color="#f59e0b" big />
            <ResultCard label="Batch (max 100g)" value={`${Math.ceil(perScheduleG / 100)} batch`} color="#8b5cf6" />
          </div>

          <div className="card" style={{ background: 'linear-gradient(135deg, #0f2438, #1e3a5f)', color: 'white', border: 'none' }}>
            <div className="card-title" style={{ color: 'white', marginBottom: 12 }}>📊 Rekapitulasi</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 2 }}>
              <div>Jumlah ikan  : <strong style={{ color: '#7dd3fc' }}>{data.fishCount.toLocaleString()} ekor</strong></div>
              <div>Avg berat    : <strong style={{ color: '#7dd3fc' }}>{data.avgWeightG} g/ekor</strong></div>
              <div>Biomassa     : <strong style={{ color: '#7dd3fc' }}>{biomassKg.toFixed(2)} kg</strong></div>
              <div>Feeding rate : <strong style={{ color: '#7dd3fc' }}>{data.feedingRatePercent.toFixed(1)}%/hari</strong></div>
              <div>Pakan/hari   : <strong style={{ color: '#86efac' }}>{Math.round(dailyFeedG)} g/hari</strong></div>
              <div>Jadwal/hari  : <strong style={{ color: '#86efac' }}>{data.feedingPerDay}x → {Math.round(perScheduleG)} g/sesi</strong></div>
              <div>Batch/sesi   : <strong style={{ color: '#fcd34d' }}>{Math.ceil(perScheduleG / 100)} batch @ max 100g</strong></div>
            </div>
          </div>
        </>
      )}

      {/* ── TAB JADWAL ── */}
      {tab === 'jadwal' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">⏰ Jadwal Pakan Manual</div>
              <div className="card-subtitle">Catatan jadwal untuk diprogram ke ESP32 atau pengingat manual</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const t = prompt('Tambah jadwal (format HH:MM, contoh 12:00):');
              if (t && /^\d{2}:\d{2}$/.test(t)) upd('schedules', [...data.schedules, t].sort());
              else if (t) alert('Format salah. Gunakan HH:MM, contoh: 08:30');
            }}>
              <Plus size={14} /> Tambah Jadwal
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {data.schedules.map((s, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--success-light)', borderRadius: 12, border: '2px solid var(--success)', textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--success-dark)' }}>{s}</div>
                <div className="text-xs" style={{ color: 'var(--success-dark)', marginTop: 4 }}>
                  Target: <strong>{Math.round(perScheduleG)} g</strong>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  ≈ {Math.ceil(perScheduleG / 100)} batch
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => upd('schedules', data.schedules.filter((_, j) => j !== i))}
                  style={{ marginTop: 8, width: '100%' }}>
                  <Trash2 size={12} /> Hapus
                </button>
              </div>
            ))}
          </div>

          <div className="alert alert-info">
            <Info size={18} />
            <div className="text-xs">
              Jadwal ini hanya catatan di browser. Untuk set jadwal ke ESP32, gunakan tab <strong>Jadwal Pakan</strong> di <strong>Mode Live (ESP32)</strong>.
            </div>
          </div>
        </div>
      )}

      {/* ── TAB LOG ── */}
      {tab === 'log' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📋 Log Feeding Manual</div>
              <div className="card-subtitle">Catat realisasi pakan harian</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={() => {
                const gram = parseFloat(prompt(`Target sekarang: ${Math.round(perScheduleG)}g\nMasukkan gram aktual yang diberikan:`) || '0');
                if (gram > 0) {
                  upd('feedingLog', [{
                    time: new Date().toLocaleString('id-ID'),
                    target: Math.round(perScheduleG),
                    actual: gram,
                    note: '',
                  }, ...data.feedingLog].slice(0, 50));
                }
              }}>
                <Plus size={14} /> Catat Feeding
              </button>
              {data.feedingLog.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  if (confirm('Hapus semua log feeding?')) upd('feedingLog', []);
                }}>
                  <Trash2 size={14} /> Hapus Semua
                </button>
              )}
            </div>
          </div>

          {data.feedingLog.length === 0 ? (
            <div className="empty-state"><p>Belum ada log feeding. Klik + Catat Feeding.</p></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                  <div className="text-xs text-muted">Total Feeding</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{data.feedingLog.length}x</div>
                </div>
                <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                  <div className="text-xs text-muted">Total Diberikan</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{data.feedingLog.reduce((s, x) => s + x.actual, 0).toFixed(0)} g</div>
                </div>
                <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                  <div className="text-xs text-muted">Rata² / Sesi</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {(data.feedingLog.reduce((s, x) => s + x.actual, 0) / data.feedingLog.length).toFixed(0)} g
                  </div>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>Waktu</th><th>Target (g)</th><th>Aktual (g)</th><th>Selisih</th><th></th></tr></thead>
                  <tbody>
                    {data.feedingLog.map((log, i) => {
                      const diff = log.actual - log.target;
                      return (
                        <tr key={i}>
                          <td className="text-xs">{log.time}</td>
                          <td>{log.target}</td>
                          <td style={{ fontWeight: 700 }}>{log.actual}</td>
                          <td style={{ color: diff >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(0)}
                          </td>
                          <td>
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => upd('feedingLog', data.feedingLog.filter((_, j) => j !== i))}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tombol reset data */}
      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          if (confirm('Reset semua data manual? (data browser akan dihapus)')) {
            setData(DEFAULT);
            localStorage.removeItem(STORAGE_KEY);
          }
        }}>
          🗑️ Reset Semua Data Manual
        </button>
      </div>
    </div>
  );
}

function ResultCard({ label, value, color, big }) {
  return (
    <div style={{
      padding: 18, borderRadius: 12,
      background: 'var(--bg-secondary)',
      border: `2px solid ${color}`,
      textAlign: 'center',
    }}>
      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: big ? 28 : 22,
        fontWeight: 800,
        fontFamily: "'Outfit', sans-serif",
        color,
      }}>{value}</div>
    </div>
  );
}
