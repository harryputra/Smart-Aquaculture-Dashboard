import { useState, useEffect } from 'react';
import { Fish, Hash, Send, Info, Calculator } from 'lucide-react';
import { remoteConfig } from '../../services/leleApi';

export default function DataKolamPanel({ device }) {
  const [busy, setBusy] = useState(false);
  const [fishCount, setFishCount] = useState(device.fish_count || 1000);
  const [feedingPerDay, setFeedingPerDay] = useState(device.feeding_per_day || 2);

  useEffect(() => {
    setFishCount(device.fish_count || 1000);
    setFeedingPerDay(device.feeding_per_day || 2);
  }, [device.fish_count, device.feeding_per_day]);

  async function saveFishCount() {
    if (fishCount < 1) { alert('Min 1 ekor'); return; }
    setBusy(true);
    try {
      await remoteConfig(device.device_id, { fish_count: fishCount });
      alert('✅ Jumlah ikan dikirim ke device');
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function saveFeedingPerDay() {
    if (feedingPerDay < 1 || feedingPerDay > 6) { alert('Range: 1-6 kali/hari'); return; }
    if (!confirm(`Set frekuensi ke ${feedingPerDay}x/hari?\n\nDevice akan AUTO-GENERATE jadwal pakan baru menggantikan yang lama.`)) return;
    setBusy(true);
    try {
      await remoteConfig(device.device_id, { feeding_per_day: feedingPerDay });
      alert('✅ Frekuensi dikirim. Jadwal akan auto-generate.');
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const isOffline = !device.is_online;
  const avgWeight = parseFloat(device.avg_fish_g || 0);
  const feedingRate = parseFloat(device.feeding_rate_percent || 0);
  const biomassKg = (avgWeight * fishCount) / 1000;
  const dailyFeedG = biomassKg * (feedingRate / 100) * 1000;
  const perScheduleG = feedingPerDay > 0 ? dailyFeedG / feedingPerDay : 0;

  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">🐟 Jumlah Ikan</div>
            <div className="card-subtitle">LCD: Data Kolam → Jumlah Ikan (step 500 ekor)</div>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label className="form-label">Jumlah ekor</label>
            <input type="number" min="1" step="100" className="form-input" value={fishCount}
              onChange={e => setFishCount(+e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveFishCount} disabled={busy || isOffline}
            style={{ alignSelf: 'flex-end', padding: '12px 20px' }}>
            <Send size={16} /> Kirim ke Device
          </button>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          Tersimpan di device (Preferences): <strong>{device.fish_count || 0}</strong> ekor
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">🍽️ Frekuensi Pakan / Hari</div>
            <div className="card-subtitle">LCD: Data Kolam → Frekuensi/Hari (1-6 kali)</div>
          </div>
        </div>
        <div className="alert alert-warning">
          <Info size={18} />
          <div>Mengubah frekuensi akan <strong>auto-generate jadwal baru</strong> menggantikan yang lama (range jam 07:00 - 17:00 dibagi rata).</div>
        </div>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label className="form-label">Berapa kali pakan / hari</label>
            <input type="number" min="1" max="6" className="form-input" value={feedingPerDay}
              onChange={e => setFeedingPerDay(+e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveFeedingPerDay} disabled={busy || isOffline}
            style={{ alignSelf: 'flex-end', padding: '12px 20px' }}>
            <Send size={16} /> Kirim & Auto-Gen Jadwal
          </button>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          Tersimpan di device: <strong>{device.feeding_per_day || 0}x/hari</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">📊 Feed Info (Preview Adaptif)</div>
            <div className="card-subtitle">LCD: Data Kolam → Feed Info (4 halaman)</div>
          </div>
        </div>

        {!device.sample_ready ? (
          <div className="alert alert-warning">
            <Info size={18} />
            <div>Belum ada data sampling biomassa. Lakukan sampling dulu di tab <em>Timbang Biomassa</em> untuk lihat preview.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Info4Card title="Halaman 1" label1="Avg ikan" value1={`${avgWeight.toFixed(1)} g`} label2="Ikan" value2={`${fishCount} ekor`} />
            <Info4Card title="Halaman 2" label1="Biomassa total" value1={`${biomassKg.toFixed(2)} kg`} highlight />
            <Info4Card title="Halaman 3" label1="Rate Auto" value1={`${feedingRate.toFixed(1)}%`} label2="Per hari" value2={`${Math.round(dailyFeedG)} g`} />
            <Info4Card title="Halaman 4" label1="Per jadwal" value1={`${Math.round(perScheduleG)} g`} label2="Jadwal/hari" value2={`${feedingPerDay}x`} highlight />
          </div>
        )}

        <div className="alert alert-info" style={{ marginTop: 12 }}>
          <Calculator size={18} />
          <div className="text-xs">
            <strong>Rumus:</strong> biomassa × feeding_rate% / feeding_per_day. Rate auto dihitung di device dari curve:
            20g→7%, 50g→5%, 100g→3.5%, 300g→2.8%, 700g→2%, 1000g→1.5%
          </div>
        </div>
      </div>
    </>
  );
}

function Info4Card({ title, label1, value1, label2, value2, highlight }) {
  return (
    <div style={{
      padding: 14,
      background: highlight ? 'var(--success-light)' : 'var(--bg-elevated)',
      borderRadius: 10,
      border: highlight ? '2px solid var(--success)' : '1px solid var(--border-primary)',
    }}>
      <div className="text-xs text-muted" style={{ marginBottom: 8 }}>{title}</div>
      <div className="text-xs text-muted">{label1}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value1}</div>
      {label2 && (
        <>
          <div className="text-xs text-muted" style={{ marginTop: 6 }}>{label2}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{value2}</div>
        </>
      )}
    </div>
  );
}
