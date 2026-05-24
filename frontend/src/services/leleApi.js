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
export const remoteButton = (id, button) =>
  req(`/devices/${id}/control/button`, { method: 'POST', body: { button } });
export const remoteConfig = (id, config) =>
  req(`/devices/${id}/config-mqtt`, { method: 'PUT', body: config });
export const remoteUpdateSchedule = (id, idx, data) =>
  req(`/devices/${id}/schedule/${idx}`, { method: 'PUT', body: data });

// DATA QUERIES
export const getLeleBiomassSamples = (id) => req(`/devices/${id}/biomass-samples`);
export const getLeleBiomassSummary = (id) => req(`/devices/${id}/biomass-summary`);
export const getLeleGrowth = (id) => req(`/devices/${id}/growth`);
export const getLeleSessions = (id) => req(`/devices/${id}/sessions`);
export const getLeleErrors = (id) => req(`/devices/${id}/errors`);
export const getTareHistory = (id) => req(`/devices/${id}/tare-history`);
export const getSyncedSchedules = (id) => req(`/devices/${id}/schedules-synced`);
