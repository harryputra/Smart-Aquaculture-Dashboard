const API = '/api/lele';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Devices
export const getLeleDevices = () => req('/devices');
export const getLeleDevice = (id) => req(`/devices/${id}`);
export const assignLeleDevice = (id, pond_id, name) =>
  req(`/devices/${id}/assign`, { method: 'PUT', body: { pond_id, name } });
export const getLastAck = (id) => req(`/devices/${id}/last-ack`);

// REMOTE CONTROL
export const remoteManualFeed = (id) =>
  req(`/devices/${id}/control/manual-feed`, { method: 'POST' });
export const remoteFeedGram = (id, target_g) =>
  req(`/devices/${id}/control/feed-gram`, { method: 'POST', body: { target_g } });
export const remoteAutoFeed = (id, enabled) =>
  req(`/devices/${id}/control/auto-feed`, { method: 'POST', body: { enabled } });
export const setFeedMode = (id, mode) =>
  req(`/devices/${id}/control/feed-mode`, { method: 'POST', body: { mode } });
export const getFeedProgress = (id) => req(`/devices/${id}/feed-progress`);
export const setSpinner = (id, data) =>
  req(`/devices/${id}/control/spinner`, { method: 'POST', body: data });
export const testSpread = (id, seconds) =>
  req(`/devices/${id}/control/test-spread`, { method: 'POST', body: { seconds } });
export const remoteTare = (id, scale_type) =>
  req(`/devices/${id}/control/tare`, { method: 'POST', body: { scale_type } });
export const remoteResetSamples = (id) =>
  req(`/devices/${id}/control/reset-samples`, { method: 'POST' });
export const remoteStartSampling = (id) =>
  req(`/devices/${id}/control/start-sampling`, { method: 'POST' });
export const remoteAutoGenSchedule = (id) =>
  req(`/devices/${id}/control/auto-gen-schedule`, { method: 'POST' });
export const remoteValve = (id, action) =>
  req(`/devices/${id}/control/valve`, { method: 'POST', body: { action } });
export const remoteConfig = (id, config) =>
  req(`/devices/${id}/config-mqtt`, { method: 'PUT', body: config });
export const remoteUpdateSchedule = (id, idx, data) =>
  req(`/devices/${id}/schedule/${idx}`, { method: 'PUT', body: data });

// MONITOR / DIAGNOSTIK (lalu lintas MQTT 2 arah)
export const getDeviceTraffic = (id, afterId = 0, limit = 120) =>
  req(`/devices/${id}/traffic?afterId=${afterId}&limit=${limit}`);
export const getGlobalTraffic = (afterId = 0, limit = 150) =>
  req(`/traffic?afterId=${afterId}&limit=${limit}`);
export const pingDevice = (id) =>
  req(`/devices/${id}/ping`, { method: 'POST' });

// DATA QUERIES
export const getLeleBiomassSamples = (id) => req(`/devices/${id}/biomass-samples`);
export const getLeleBiomassSummary = (id) => req(`/devices/${id}/biomass-summary`);
export const getLeleGrowth = (id) => req(`/devices/${id}/growth`);
export const getLeleSessions = (id) => req(`/devices/${id}/sessions`);
export const getLeleErrors = (id) => req(`/devices/${id}/errors`);
export const getTareHistory = (id) => req(`/devices/${id}/tare-history`);
export const getSyncedSchedules = (id) => req(`/devices/${id}/schedules-synced`);
