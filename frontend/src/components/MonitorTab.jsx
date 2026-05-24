import { Thermometer, Ruler, Droplet, Eye, Beaker } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const SENSOR_META = {
  temperature: { name: 'Suhu Air', icon: Thermometer, unit: '°C', color: '#ef4444' },
  depth: { name: 'Kedalaman', icon: Ruler, unit: 'cm', color: '#3b82f6' },
  dissolved_oxygen: { name: 'Oksigen Terlarut', icon: Droplet, unit: 'mg/L', color: '#10b981' },
  turbidity: { name: 'Kekeruhan', icon: Eye, unit: 'NTU', color: '#f59e0b' },
  ph: { name: 'pH Air', icon: Beaker, unit: '', color: '#8b5cf6' },
};

export default function MonitorTab({ pond, history }) {
  const latest = pond.latest_sensor || {};
  const threshold = pond.threshold || {};

  function getStatus(field, value) {
    if (value == null || !threshold) return 'normal';
    const v = parseFloat(value);
    if (field === 'temperature' && (v < threshold.temp_min || v > threshold.temp_max)) return 'danger';
    if (field === 'depth' && (v < threshold.depth_min || v > threshold.depth_max)) return 'warning';
    if (field === 'dissolved_oxygen' && (v < threshold.do_min || v > threshold.do_max)) return 'danger';
    if (field === 'turbidity' && v > threshold.turbidity_max) return 'warning';
    if (field === 'ph' && (v < threshold.ph_min || v > threshold.ph_max)) return 'warning';
    return 'normal';
  }

  const data = history.map(h => ({
    time: new Date(h.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    temperature: parseFloat(h.temperature),
    depth: parseFloat(h.depth),
    dissolved_oxygen: parseFloat(h.dissolved_oxygen),
    turbidity: parseFloat(h.turbidity),
    ph: parseFloat(h.ph),
  }));

  return (
    <>
      <div className="sensor-grid">
        {Object.entries(SENSOR_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const value = latest[key];
          const status = getStatus(key, value);
          let range = '';
          if (key === 'temperature') range = `${threshold.temp_min}-${threshold.temp_max}°C`;
          else if (key === 'depth') range = `${threshold.depth_min}-${threshold.depth_max} cm`;
          else if (key === 'dissolved_oxygen') range = `${threshold.do_min}-${threshold.do_max} mg/L`;
          else if (key === 'turbidity') range = `Max ${threshold.turbidity_max} NTU`;
          else if (key === 'ph') range = `${threshold.ph_min}-${threshold.ph_max}`;

          return (
            <div key={key} className={`sensor-card ${status}`}>
              <div className="sensor-card-header">
                <div className="sensor-card-icon"><Icon size={18} /></div>
                {status !== 'normal' && (
                  <span className={`badge badge-${status === 'danger' ? 'danger' : 'warning'}`}>
                    {status === 'danger' ? 'Bahaya' : 'Perhatian'}
                  </span>
                )}
              </div>
              <div className="sensor-card-label">{meta.name}</div>
              <div className="sensor-card-value">
                {value != null ? parseFloat(value).toFixed(1) : '--'}
                <span className="sensor-card-unit">{meta.unit}</span>
              </div>
              <div className="sensor-card-range">Normal: {range}</div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 16, fontSize: 18 }}>Grafik Tren Sensor</h3>
      <div className="chart-grid">
        {Object.entries(SENSOR_META).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <div key={key} className="chart-card">
              <div className="chart-title">
                <Icon size={16} style={{ color: meta.color }} /> {meta.name}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={meta.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5edf2" />
                  <XAxis dataKey="time" stroke="#7b94a8" fontSize={11} />
                  <YAxis stroke="#7b94a8" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #dbe7ef', borderRadius: 8 }}
                    formatter={v => [v?.toFixed(2) + ' ' + meta.unit, meta.name]}
                  />
                  <Area type="monotone" dataKey={key} stroke={meta.color} strokeWidth={2}
                    fill={`url(#g-${key})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </>
  );
}
