const API = '/api';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// Farms
export const getFarms = () => req('/farms');
export const getFarm = (id) => req(`/farms/${id}`);
export const createFarm = (data) => req('/farms', { method: 'POST', body: data });
export const deleteFarm = (id) => req(`/farms/${id}`, { method: 'DELETE' });

// Ponds
export const getPonds = (farmId) => req(`/ponds${farmId ? '?farm_id=' + farmId : ''}`);
export const getPond = (id) => req(`/ponds/${id}`);
export const createPond = (data) => req('/ponds', { method: 'POST', body: data });
export const updatePond = (id, data) => req(`/ponds/${id}`, { method: 'PUT', body: data });
export const deletePond = (id) => req(`/ponds/${id}`, { method: 'DELETE' });
export const setPondMode = (id, mode) => req(`/ponds/${id}/mode`, { method: 'PUT', body: { mode } });

// Sensors
export const getLatestSensor = (pondId) => req(`/sensors/${pondId}/latest`);
export const getSensorHistory = (pondId, limit = 50) => req(`/sensors/${pondId}/history?limit=${limit}`);

// Control
export const controlValve = (pondId, command, source = 'manual') =>
  req(`/control/${pondId}/valve`, { method: 'POST', body: { command, source } });
export const triggerDrainCycle = (pondId) =>
  req(`/control/${pondId}/drain-cycle`, { method: 'POST' });
export const sendSimulation = (pondId, data) =>
  req(`/control/${pondId}/simulate`, { method: 'POST', body: data });

// Thresholds
export const getThreshold = (pondId) => req(`/thresholds/${pondId}`);
export const updateThreshold = (pondId, data) =>
  req(`/thresholds/${pondId}`, { method: 'PUT', body: data });

// Drain Schedules
export const getSchedules = (pondId) =>
  req(`/schedules${pondId ? '?pond_id=' + pondId : ''}`);
export const createSchedule = (data) =>
  req('/schedules', { method: 'POST', body: data });
export const deleteSchedule = (id) => req(`/schedules/${id}`, { method: 'DELETE' });

// Feeding Schedules
export const getFeedingSchedules = (pondId) =>
  req(`/feeding-schedules${pondId ? '?pond_id=' + pondId : ''}`);
export const createFeedingSchedule = (data) =>
  req('/feeding-schedules', { method: 'POST', body: data });
export const deleteFeedingSchedule = (id) =>
  req(`/feeding-schedules/${id}`, { method: 'DELETE' });
export const getFeedingLogs = (pondId) => req(`/feeding-logs/${pondId}`);
export const recordFeeding = (data) =>
  req('/feeding-logs', { method: 'POST', body: data });

// Mortality
export const getMortalityRecords = (pondId) => req(`/mortality/${pondId}`);
export const getMortalitySummary = (pondId) => req(`/mortality/${pondId}/summary`);
export const recordMortality = (data) =>
  req('/mortality', { method: 'POST', body: data });
export const deleteMortality = (id) => req(`/mortality/${id}`, { method: 'DELETE' });

// Notifications
export const getNotifications = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return req(`/notifications${q ? '?' + q : ''}`);
};
export const getUnreadCount = () => req('/notifications/unread-count');
export const markNotificationRead = (id) =>
  req(`/notifications/${id}/read`, { method: 'PUT' });
export const markAllRead = () =>
  req('/notifications/read-all', { method: 'PUT' });

// Logs
export const getLogs = (pondId) => req(`/logs/${pondId}`);

// Dashboard
export const getDashboardSummary = () => req('/dashboard/summary');

// Siklus Budidaya (tebar → panen)
export const getActiveCycle = (pondId) => req(`/ponds/${pondId}/cycle`);
export const startCycle = (pondId, data) =>
  req(`/ponds/${pondId}/cycle`, { method: 'POST', body: data });
export const harvestCycle = (pondId, data) =>
  req(`/ponds/${pondId}/cycle/harvest`, { method: 'POST', body: data });
export const getCycles = (pondId) => req(`/ponds/${pondId}/cycles`);
export const cancelCycle = (pondId, notes) =>
  req(`/ponds/${pondId}/cycle/cancel`, { method: 'POST', body: { notes } });

// Sampling Biomassa & Pertumbuhan
export const getCurrentBiomass = (pondId) => req(`/ponds/${pondId}/biomass/current`);
export const getBiomassHistory = (pondId) => req(`/ponds/${pondId}/biomass`);
export const startBiomass = (pondId) => req(`/ponds/${pondId}/biomass/start`, { method: 'POST' });
export const addBiomassEntry = (pondId, weight_g) =>
  req(`/ponds/${pondId}/biomass/entry`, { method: 'POST', body: { weight_g } });
export const deleteBiomassEntry = (pondId, entryId) =>
  req(`/ponds/${pondId}/biomass/entry/${entryId}`, { method: 'DELETE' });
export const finalizeBiomass = (pondId) =>
  req(`/ponds/${pondId}/biomass/finalize`, { method: 'POST' });
