const API = '/api';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',     // kirim cookie sesi (same-origin via proxy)
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Auth
export const authLogin = (email, password) => req('/auth/login', { method: 'POST', body: { email, password } });
export const authLogout = () => req('/auth/logout', { method: 'POST' });
export const authMe = () => req('/auth/me');
export const authRefresh = () => req('/auth/refresh', { method: 'POST' });

// Manajemen pengguna & organisasi
export const getUsers = (orgId) => req('/users' + (orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''));
export const createUser = (data) => req('/users', { method: 'POST', body: data });
export const updateUser = (id, data) => req(`/users/${id}`, { method: 'PUT', body: data });
export const deleteUser = (id) => req(`/users/${id}`, { method: 'DELETE' });
export const getOrgs = () => req('/orgs');
export const createOrg = (data) => req('/orgs', { method: 'POST', body: data });
export const updateOrg = (id, data) => req(`/orgs/${id}`, { method: 'PUT', body: data });
export const deleteOrg = (id) => req(`/orgs/${id}`, { method: 'DELETE' });

// Notifikasi WhatsApp
export const getWaConfig = () => req('/wa/config');
export const setWaConfig = (data) => req('/wa/config', { method: 'PUT', body: data });
export const getWaRecipients = (orgId) => req('/wa/recipients' + (orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''));
export const createWaRecipient = (data) => req('/wa/recipients', { method: 'POST', body: data });
export const updateWaRecipient = (id, data) => req(`/wa/recipients/${id}`, { method: 'PUT', body: data });
export const deleteWaRecipient = (id) => req(`/wa/recipients/${id}`, { method: 'DELETE' });
export const testWaRecipient = (id) => req(`/wa/recipients/${id}/test`, { method: 'POST' });
export const getWaLog = () => req('/wa/log');

// Quick-Login
export const getQuickLoginPublic = (token) =>
  req('/quick-login/public' + (token ? `?token=${encodeURIComponent(token)}` : ''));
export const quickLoginPost = (body) => req('/quick-login/login', { method: 'POST', body });
export const getQuickLoginConfig = () => req('/admin/quick-login');
export const setQuickLoginConfig = (body) => req('/admin/quick-login', { method: 'PUT', body });

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

// Keuangan: stok pakan, biaya operasional, proyeksi finansial
export const getFeedStock = (pondId) => req(`/ponds/${pondId}/feed-stock`);
export const updateFeedStock = (pondId, data) =>
  req(`/ponds/${pondId}/feed-stock`, { method: 'PUT', body: data });
export const getCosts = (pondId) => req(`/ponds/${pondId}/costs`);
export const addCost = (pondId, data) =>
  req(`/ponds/${pondId}/costs`, { method: 'POST', body: data });
export const deleteCost = (pondId, id) =>
  req(`/ponds/${pondId}/costs/${id}`, { method: 'DELETE' });
export const getFinancial = (pondId) => req(`/ponds/${pondId}/financial`);

// Logbook, audit air, ekspor, arsip (Fase 4)
export const getLogbook = (pondId) => req(`/ponds/${pondId}/logbook`);
export const addLogbook = (pondId, data) =>
  req(`/ponds/${pondId}/logbook`, { method: 'POST', body: data });
export const deleteLogbook = (pondId, id) =>
  req(`/ponds/${pondId}/logbook/${id}`, { method: 'DELETE' });
export const getWaterAudit = (pondId, days = 7) =>
  req(`/ponds/${pondId}/water-audit?days=${days}`);
export const archivePond = (pondId, is_active) =>
  req(`/ponds/${pondId}/archive`, { method: 'PUT', body: { is_active } });
export const exportUrl = (pondId, type) => `${API}/ponds/${pondId}/export?type=${type}`;
