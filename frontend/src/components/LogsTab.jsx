import { useEffect, useState } from 'react';
import { getLogs } from '../services/api';

const ACTION_LABEL = {
  valve_open: 'Katup Pengurasan Dibuka',
  valve_close: 'Katup Pengurasan Ditutup',
  inlet_open: 'Katup Pengisian Dibuka',
  inlet_close: 'Katup Pengisian Ditutup',
  auto_drain: 'Pengurasan Otomatis',
};

export default function LogsTab({ pondId }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    (async () => {
      try { setLogs(await getLogs(pondId)); } catch (e) { /* */ }
    })();
  }, [pondId]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Log Aktivitas Kontrol</div>
          <div className="card-subtitle">100 aktivitas terakhir</div>
        </div>
      </div>
      {logs.length === 0 ? (
        <div className="empty-state"><p>Belum ada aktivitas</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Waktu</th><th>Aksi</th><th>Sumber</th><th>Alasan</th></tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{new Date(l.timestamp).toLocaleString('id-ID')}</td>
                  <td>{ACTION_LABEL[l.action] || l.action}</td>
                  <td>
                    <span className={`badge ${l.triggered_by === 'auto' ? 'badge-danger' :
                      l.triggered_by === 'schedule' ? 'badge-info' : 'badge-neutral'}`}>
                      {l.triggered_by === 'auto' ? 'Otomatis' :
                       l.triggered_by === 'schedule' ? 'Jadwal' : 'Manual'}
                    </span>
                  </td>
                  <td>{l.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
