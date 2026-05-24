import { useEffect, useState, useRef } from 'react';
import {
  Play, Pause, Send, Thermometer, Ruler, Droplet, Eye, Beaker,
  AlertCircle, Sparkles,
} from 'lucide-react';
import { getFarms, getPonds, sendSimulation } from '../services/api';

const PRESETS = [
  { name: 'Normal', icon: '✅', desc: 'Semua sensor dalam rentang sehat',
    values: { temperature: 27.5, depth: 120, dissolved_oxygen: 6.5, turbidity: 20, ph: 7.2 } },
  { name: 'Suhu Tinggi', icon: '🌡️', desc: 'Overheating, akan trigger auto-drain',
    values: { temperature: 33.5, depth: 120, dissolved_oxygen: 6.0, turbidity: 25, ph: 7.0 } },
  { name: 'DO Rendah', icon: '💨', desc: 'Oksigen rendah, ikan stress',
    values: { temperature: 28, depth: 120, dissolved_oxygen: 3.5, turbidity: 30, ph: 7.0 } },
  { name: 'Air Keruh', icon: '🌫️', desc: 'Kekeruhan tinggi, perlu kuras',
    values: { temperature: 28, depth: 120, dissolved_oxygen: 5.5, turbidity: 75, ph: 7.0 } },
  { name: 'pH Asam', icon: '⚗️', desc: 'pH terlalu rendah',
    values: { temperature: 28, depth: 120, dissolved_oxygen: 6.0, turbidity: 25, ph: 5.5 } },
  { name: 'Kedalaman Rendah', icon: '📉', desc: 'Air menyusut, perlu isi ulang',
    values: { temperature: 28, depth: 60, dissolved_oxygen: 6.0, turbidity: 25, ph: 7.0 } },
];

export default function Simulation() {
  const [farms, setFarms] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState('');
  const [selectedPond, setSelectedPond] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const intervalRef = useRef(null);

  const [data, setData] = useState({
    temperature: 27.5,
    depth: 120,
    dissolved_oxygen: 6.5,
    turbidity: 20,
    ph: 7.2,
  });

  useEffect(() => {
    getFarms().then(setFarms).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedFarm) {
      getPonds(selectedFarm).then(setPonds).catch(() => {});
    } else {
      getPonds().then(setPonds).catch(() => {});
    }
  }, [selectedFarm]);

  async function send() {
    if (!selectedPond) {
      alert('Pilih kolam terlebih dahulu');
      return;
    }
    setSending(true);
    try {
      await sendSimulation(selectedPond, data);
      setLastSent(new Date());
    } catch (e) {
      alert('Gagal kirim: ' + e.message);
      setAutoSend(false);
    }
    setSending(false);
  }

  useEffect(() => {
    if (autoSend && selectedPond) {
      send();
      intervalRef.current = setInterval(send, 3000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoSend, selectedPond]);

  function applyPreset(p) {
    setData(p.values);
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulasi Data Dummy</h1>
          <p className="page-subtitle">
            Atur nilai sensor untuk testing tanpa hardware ESP32
          </p>
        </div>
      </div>

      <div className="alert alert-info">
        <Sparkles size={18} />
        <div>
          <strong>Mode Simulasi.</strong> Halaman ini khusus untuk testing dengan data dummy.
          Saat ESP32 nyata terhubung, sistem otomatis menggunakan data realtime dari sensor fisik.
          Data dummy yang Anda kirim akan diperlakukan sama: disimpan ke database, di-cek thresholdnya,
          dan akan trigger auto-drain saat melebihi batas kritis.
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Pilih Target Kolam</div>
            <div className="card-subtitle">Data simulasi akan dikirim ke kolam yang dipilih</div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Peternakan</label>
            <select className="form-select" value={selectedFarm}
              onChange={e => { setSelectedFarm(e.target.value); setSelectedPond(''); }}>
              <option value="">— Semua Peternakan —</option>
              {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Kolam *</label>
            <select className="form-select" value={selectedPond}
              onChange={e => setSelectedPond(e.target.value)}>
              <option value="">— Pilih Kolam —</option>
              {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name}{p.is_connected ? ' (ESP32 aktif!)' : ''}</option>)}
            </select>
          </div>
        </div>

        {selectedPond && ponds.find(p => p.pond_id === selectedPond)?.is_connected && (
          <div className="alert alert-warning" style={{ marginTop: 12, marginBottom: 0 }}>
            <AlertCircle size={18} />
            <div>
              Kolam ini sedang menerima data dari ESP32 nyata. Mengirim data dummy bisa membuat hasil bercampur.
            </div>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Preset Cepat</div>
            <div className="card-subtitle">Pilih skenario untuk uji coba</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {PRESETS.map(p => (
            <button key={p.name}
              onClick={() => applyPreset(p)}
              style={{
                padding: 14, border: '1px solid var(--border-primary)', borderRadius: 12,
                background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{p.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div className="text-xs text-muted">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Pengatur Sensor Manual</div>
            <div className="card-subtitle">Geser slider untuk mengatur nilai</div>
          </div>
        </div>

        <SensorSlider icon={Thermometer} color="#ef4444" name="Suhu Air" unit="°C"
          min={15} max={40} step={0.1} value={data.temperature}
          onChange={v => setData({ ...data, temperature: v })} />

        <SensorSlider icon={Ruler} color="#3b82f6" name="Kedalaman" unit="cm"
          min={0} max={200} step={1} value={data.depth}
          onChange={v => setData({ ...data, depth: v })} />

        <SensorSlider icon={Droplet} color="#10b981" name="Oksigen Terlarut" unit="mg/L"
          min={0} max={12} step={0.1} value={data.dissolved_oxygen}
          onChange={v => setData({ ...data, dissolved_oxygen: v })} />

        <SensorSlider icon={Eye} color="#f59e0b" name="Kekeruhan" unit="NTU"
          min={0} max={150} step={1} value={data.turbidity}
          onChange={v => setData({ ...data, turbidity: v })} />

        <SensorSlider icon={Beaker} color="#8b5cf6" name="pH" unit=""
          min={0} max={14} step={0.1} value={data.ph}
          onChange={v => setData({ ...data, ph: v })} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="card-title">Kirim Data</div>
            <div className="card-subtitle">
              {lastSent && `Terakhir dikirim: ${lastSent.toLocaleTimeString('id-ID')}`}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Auto-Send (tiap 3 detik)</span>
              <label className="toggle">
                <input type="checkbox" checked={autoSend}
                  onChange={e => setAutoSend(e.target.checked)}
                  disabled={!selectedPond} />
                <span className="toggle-slider" />
              </label>
            </label>
            <button className="btn btn-primary" onClick={send}
              disabled={sending || !selectedPond || autoSend}>
              <Send size={16} /> Kirim Sekali
            </button>
          </div>
        </div>

        {autoSend && (
          <div className="alert alert-success" style={{ marginTop: 16, marginBottom: 0 }}>
            <Play size={18} />
            <div>
              <strong>Auto-Send Aktif.</strong> Data akan terus dikirim setiap 3 detik. Buka tab kolam untuk melihat update realtime.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SensorSlider({ icon: Icon, color, name, unit, min, max, step, value, onChange }) {
  return (
    <div className="slider-wrap">
      <div className="slider-label">
        <div className="slider-label-name flex items-center gap-2">
          <Icon size={14} style={{ color }} /> {name}
        </div>
        <div className="slider-label-value">{value.toFixed(step < 1 ? 1 : 0)} {unit}</div>
      </div>
      <input type="range" className="slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ accentColor: color }} />
      <div className="flex justify-between text-xs text-muted" style={{ marginTop: 4 }}>
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}
