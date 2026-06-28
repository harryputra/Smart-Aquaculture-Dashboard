import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Trash2, Pause, Play, Download,
  Radio, AlertTriangle, Copy, Check, Wifi, WifiOff, Zap,
} from 'lucide-react';
import { getDeviceTraffic, getGlobalTraffic, pingDevice } from '../../services/leleApi';

const MAX_ROWS = 600;
const POLL_MS = 1500;

// Konsol MQTT 2 arah (📥 dari hardware / 📤 ke hardware). Dipakai per-device
// (deviceId diisi) maupun global (deviceId null → tampilkan semua device).
export default function MqttMonitorPanel({ deviceId = null, device = null }) {
  const isGlobal = !deviceId;
  const [rows, setRows] = useState([]);
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [filter, setFilter] = useState('all');      // all | in | out | error
  const [expanded, setExpanded] = useState({});
  const [ping, setPing] = useState(null);           // {sentAt, rttMs, status}
  const [copiedId, setCopiedId] = useState(null);

  const lastIdRef = useRef(0);
  const consoleRef = useRef(null);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const fetchTraffic = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const data = isGlobal
        ? await getGlobalTraffic(lastIdRef.current)
        : await getDeviceTraffic(deviceId, lastIdRef.current);
      if (data && data.length) {
        lastIdRef.current = Math.max(lastIdRef.current, ...data.map(d => d.id));
        setRows(prev => {
          const merged = [...prev, ...data];
          return merged.length > MAX_ROWS ? merged.slice(merged.length - MAX_ROWS) : merged;
        });
      }
    } catch (_) { /* diam: jaringan sesaat */ }
  }, [deviceId, isGlobal]);

  // Reset saat device berganti.
  useEffect(() => { lastIdRef.current = 0; setRows([]); setPing(null); }, [deviceId]);

  useEffect(() => {
    fetchTraffic();
    const id = setInterval(fetchTraffic, POLL_MS);
    return () => clearInterval(id);
  }, [fetchTraffic]);

  // Auto-scroll ke bawah saat ada data baru.
  useEffect(() => {
    if (autoscroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [rows, autoscroll]);

  // Deteksi ACK untuk Test Koneksi → hitung round-trip.
  useEffect(() => {
    if (!ping || ping.rttMs != null) return;
    const ack = rows.find(r =>
      r.direction === 'in' && r.topic.endsWith('/ack') &&
      new Date(r.created_at).getTime() >= ping.sentAt - 1500);
    if (ack) {
      const rtt = new Date(ack.created_at).getTime() - ping.sentAt;
      setPing(p => ({ ...p, rttMs: Math.max(0, rtt), status: 'ok' }));
    }
  }, [rows, ping]);

  useEffect(() => {
    if (!ping || ping.rttMs != null || ping.status === 'error') return;
    const t = setTimeout(() => {
      setPing(p => (p && p.rttMs == null ? { ...p, status: 'timeout' } : p));
    }, 8000);
    return () => clearTimeout(t);
  }, [ping]);

  async function doPing() {
    setPing({ sentAt: Date.now(), rttMs: null, status: 'waiting' });
    try {
      const r = await pingDevice(deviceId);
      setPing({ sentAt: r.sentAt || Date.now(), rttMs: null, status: 'waiting' });
    } catch (e) {
      setPing({ sentAt: Date.now(), rttMs: null, status: 'error', error: e.message });
    }
  }

  function copyRow(r) {
    const text = `[${new Date(r.created_at).toLocaleString('id-ID')}] ${r.direction.toUpperCase()} ${r.topic}\n${r.payload}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(r.id); setTimeout(() => setCopiedId(null), 1200);
  }

  function downloadLog() {
    const text = rows.map(r =>
      `[${new Date(r.created_at).toISOString()}] ${r.direction.toUpperCase()} ${r.device_id || '-'} ${r.topic}\n${r.payload}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mqtt-log-${deviceId || 'global'}-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filtered = rows.filter(r =>
    filter === 'all' ? true :
    filter === 'in' ? r.direction === 'in' :
    filter === 'out' ? r.direction === 'out' :
    filter === 'error' ? r.is_error : true);

  const counts = {
    in: rows.filter(r => r.direction === 'in').length,
    out: rows.filter(r => r.direction === 'out').length,
    error: rows.filter(r => r.is_error).length,
  };

  // Ringkasan koneksi (device mode).
  const lastIn = [...rows].reverse().find(r => r.direction === 'in');
  const secsAgo = lastIn ? Math.round((Date.now() - new Date(lastIn.created_at).getTime()) / 1000) : null;
  const online = device ? device.is_online : (secsAgo != null && secsAgo < 30);

  const FilterBtn = ({ id, label, count }) => (
    <button
      className={'btn btn-sm ' + (filter === id ? 'btn-primary' : 'btn-secondary')}
      onClick={() => setFilter(id)} style={{ padding: '4px 10px' }}>
      {label}{count != null ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title"><Radio size={18} style={{ verticalAlign: -3 }} /> Monitor Koneksi (MQTT)</div>
          <div className="card-subtitle">
            {isGlobal ? 'Semua device — lalu lintas pesan masuk & keluar' : `Device: ${deviceId}`}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {!isGlobal && (
            <span className="badge" style={{ background: online ? '#d1fae5' : '#fee2e2', color: online ? '#047857' : '#b91c1c' }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? 'TERHUBUNG' : 'TERPUTUS'}
              {secsAgo != null && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {secsAgo}s lalu</span>}
            </span>
          )}
        </div>
      </div>

      {/* Test koneksi (device mode) */}
      {!isGlobal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={doPing}>
            <Zap size={15} /> Test Koneksi (Ping)
          </button>
          {ping && (
            <span className="text-xs" style={{
              padding: '4px 10px', borderRadius: 8, fontWeight: 600,
              background: ping.status === 'ok' ? '#d1fae5' : ping.status === 'timeout' || ping.status === 'error' ? '#fee2e2' : '#fef3c7',
              color: ping.status === 'ok' ? '#047857' : ping.status === 'timeout' || ping.status === 'error' ? '#b91c1c' : '#b45309',
            }}>
              {ping.status === 'waiting' && '⏳ menunggu balasan device...'}
              {ping.status === 'ok' && `✅ Tersambung — round-trip ${ping.rttMs} ms`}
              {ping.status === 'timeout' && '⛔ Tidak ada balasan (8s) — perintah mungkin tak sampai'}
              {ping.status === 'error' && `❌ ${ping.error || 'gagal kirim'}`}
            </span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <FilterBtn id="all" label="Semua" count={rows.length} />
        <FilterBtn id="in" label="📥 Masuk" count={counts.in} />
        <FilterBtn id="out" label="📤 Keluar" count={counts.out} />
        <FilterBtn id="error" label="⚠ Error" count={counts.error} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPaused(p => !p)}>
            {paused ? <><Play size={14} /> Lanjut</> : <><Pause size={14} /> Jeda</>}
          </button>
          <button className={'btn btn-sm ' + (autoscroll ? 'btn-primary' : 'btn-secondary')} onClick={() => setAutoscroll(a => !a)}>
            <ArrowDownToLine size={14} /> Auto-scroll
          </button>
          <button className="btn btn-secondary btn-sm" onClick={downloadLog} title="Unduh log"><Download size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setRows([]); }} title="Bersihkan layar"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Konsol */}
      <div ref={consoleRef} style={{
        height: 460, overflowY: 'auto', background: '#0b1220', borderRadius: 10,
        padding: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
        border: '1px solid var(--border-primary)',
      }}>
        {filtered.length === 0 && (
          <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>
            {paused ? 'Dijeda.' : 'Menunggu pesan... (device kirim status tiap 3 detik)'}
          </div>
        )}
        {filtered.map(r => {
          const inbound = r.direction === 'in';
          const isOpen = !!expanded[r.id];
          let pretty = r.payload;
          if (isOpen) { try { pretty = JSON.stringify(JSON.parse(r.payload), null, 2); } catch (_) {} }
          const t = new Date(r.created_at).toLocaleTimeString('id-ID', { hour12: false });
          return (
            <div key={r.id} style={{
              padding: '5px 8px', marginBottom: 4, borderRadius: 6,
              borderLeft: `3px solid ${r.is_error ? '#ef4444' : inbound ? '#22d3ee' : '#a78bfa'}`,
              background: r.is_error ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}>
                <span style={{ color: '#64748b', minWidth: 64 }}>{t}</span>
                <span style={{ color: inbound ? '#22d3ee' : '#a78bfa', fontWeight: 700, minWidth: 20 }}>
                  {inbound ? '📥' : '📤'}
                </span>
                {isGlobal && <span style={{ color: '#fbbf24', minWidth: 90 }}>{r.device_id || '-'}</span>}
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{r.topic.replace('lele/', '')}</span>
                {r.is_error && <AlertTriangle size={13} style={{ color: '#ef4444' }} />}
                <button onClick={(ev) => { ev.stopPropagation(); copyRow(r); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}
                  title="Salin">
                  {copiedId === r.id ? <Check size={13} style={{ color: '#22c55e' }} /> : <Copy size={13} />}
                </button>
              </div>
              <pre style={{
                margin: '3px 0 0 72px', whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', color: '#94a3b8',
                wordBreak: 'break-all',
              }}>{pretty}</pre>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 8 }}>
        Klik baris untuk lihat JSON lengkap · 📥 dari hardware · 📤 dari dashboard ·
        garis merah = error · update tiap {POLL_MS / 1000}s · maks {MAX_ROWS} baris di layar (riwayat penuh tersimpan di server)
      </div>
    </div>
  );
}
