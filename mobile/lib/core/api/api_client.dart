import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import '../app_config.dart';
import '../models/models.dart';

// ── Cookie Jar Provider ───────────────────────────────────────────
final cookieJarProvider = Provider<CookieJar>((ref) => CookieJar());

// ── Dio Client Provider ───────────────────────────────────────────
final dioProvider = Provider<Dio>((ref) {
  final cookieJar = ref.read(cookieJarProvider);
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  // Cookie manager (menyimpan session cookie yang dikirim backend)
  dio.interceptors.add(CookieManager(cookieJar));

  // Logging (debug)
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      // ignore: avoid_print
      print('→ ${options.method} ${options.path}');
      handler.next(options);
    },
    onError: (error, handler) {
      // ignore: avoid_print
      print('✗ ${error.requestOptions.path}: ${error.message}');
      handler.next(error);
    },
  ));

  return dio;
});

// ── API Client ────────────────────────────────────────────────────

class ApiClient {
  final Dio _dio;

  ApiClient(this._dio);

  // ── Helper ─────────────────────────────────────────────────────

  Future<dynamic> _get(String path, {Map<String, dynamic>? params}) async {
    final r = await _dio.get(path, queryParameters: params);
    return r.data;
  }

  Future<dynamic> _post(String path, {dynamic data}) async {
    final r = await _dio.post(path, data: data);
    return r.data;
  }

  Future<dynamic> _put(String path, {dynamic data}) async {
    final r = await _dio.put(path, data: data);
    return r.data;
  }

  Future<dynamic> _delete(String path) async {
    final r = await _dio.delete(path);
    return r.data;
  }

  // ── Auth ───────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    return await _post('/auth/login', data: {'email': email, 'password': password});
  }

  Future<void> logout() async {
    await _post('/auth/logout');
  }

  Future<Map<String, dynamic>> me() async {
    return await _get('/auth/me');
  }

  Future<Map<String, dynamic>> refresh() async {
    return await _post('/auth/refresh');
  }

  // ── Quick Login ────────────────────────────────────────────────

  Future<Map<String, dynamic>> getQuickLoginPublic(String token) async {
    return await _get('/quick-login/public', params: {'token': token});
  }

  Future<Map<String, dynamic>> quickLoginPost(Map<String, dynamic> body) async {
    return await _post('/quick-login/login', data: body);
  }

  // ── Dashboard ──────────────────────────────────────────────────

  Future<DashboardSummary> getDashboardSummary() async {
    final j = await _get('/dashboard/summary');
    return DashboardSummary.fromJson(j);
  }

  // ── Farms ──────────────────────────────────────────────────────

  Future<List<FarmModel>> getFarms() async {
    final j = await _get('/farms') as List;
    return j.map((e) => FarmModel.fromJson(e)).toList();
  }

  Future<FarmModel> getFarm(String id) async {
    return FarmModel.fromJson(await _get('/farms/$id'));
  }

  Future<FarmModel> createFarm(Map<String, dynamic> data) async {
    return FarmModel.fromJson(await _post('/farms', data: data));
  }

  Future<void> deleteFarm(String id) async {
    await _delete('/farms/$id');
  }

  // ── Ponds ──────────────────────────────────────────────────────

  Future<List<PondModel>> getPonds({String? farmId, bool includeArchived = false}) async {
    final params = <String, dynamic>{};
    if (farmId != null) params['farm_id'] = farmId;
    if (includeArchived) params['include_archived'] = '1';
    final j = await _get('/ponds', params: params) as List;
    return j.map((e) => PondModel.fromJson(e)).toList();
  }

  Future<PondModel> getPond(String id) async {
    return PondModel.fromJson(await _get('/ponds/$id'));
  }

  Future<PondModel> createPond(Map<String, dynamic> data) async {
    return PondModel.fromJson(await _post('/ponds', data: data));
  }

  Future<PondModel> updatePond(String id, Map<String, dynamic> data) async {
    return PondModel.fromJson(await _put('/ponds/$id', data: data));
  }

  Future<void> deletePond(String id) async {
    await _delete('/ponds/$id');
  }

  Future<void> setPondMode(String id, String mode) async {
    await _put('/ponds/$id/mode', data: {'mode': mode});
  }

  Future<void> archivePond(String id, bool isActive) async {
    await _put('/ponds/$id/archive', data: {'is_active': isActive});
  }

  // ── Sensors ────────────────────────────────────────────────────

  Future<SensorData?> getLatestSensor(String pondId) async {
    final j = await _get('/sensors/$pondId/latest');
    if (j == null) return null;
    return SensorData.fromJson(j);
  }

  Future<List<SensorData>> getSensorHistory(String pondId, {int limit = 50}) async {
    final j = await _get('/sensors/$pondId/history', params: {'limit': limit}) as List;
    return j.map((e) => SensorData.fromJson(e)).toList();
  }

  // ── Thresholds ─────────────────────────────────────────────────

  Future<SensorThreshold?> getThreshold(String pondId) async {
    final j = await _get('/thresholds/$pondId');
    if (j == null) return null;
    return SensorThreshold.fromJson(j);
  }

  Future<SensorThreshold> updateThreshold(String pondId, SensorThreshold t) async {
    return SensorThreshold.fromJson(await _put('/thresholds/$pondId', data: t.toJson()));
  }

  // ── Control ────────────────────────────────────────────────────

  Future<void> controlValve(String pondId, String command) async {
    await _post('/control/$pondId/valve', data: {'command': command, 'source': 'manual'});
  }

  Future<void> triggerDrainCycle(String pondId) async {
    await _post('/control/$pondId/drain-cycle');
  }

  Future<void> sendSimulation(String pondId, Map<String, dynamic> data) async {
    await _post('/control/$pondId/simulate', data: data);
  }

  // ── Aerator ────────────────────────────────────────────────────

  Future<AeratorStatus> getAerator(String pondId) async {
    return AeratorStatus.fromJson(await _get('/aerator/$pondId'));
  }

  Future<void> setAerator(String pondId, Map<String, dynamic> data) async {
    await _put('/aerator/$pondId', data: data);
  }

  // ── Drain Schedules ────────────────────────────────────────────

  Future<List<dynamic>> getSchedules({String? pondId}) async {
    return await _get('/schedules', params: pondId != null ? {'pond_id': pondId} : null) as List;
  }

  Future<dynamic> createSchedule(Map<String, dynamic> data) async {
    return await _post('/schedules', data: data);
  }

  Future<void> deleteSchedule(int id) async {
    await _delete('/schedules/$id');
  }

  // ── Feeding Schedules ──────────────────────────────────────────

  Future<List<FeedingSchedule>> getFeedingSchedules({String? pondId}) async {
    final j = await _get('/feeding-schedules', params: pondId != null ? {'pond_id': pondId} : null) as List;
    return j.map((e) => FeedingSchedule.fromJson(e)).toList();
  }

  Future<FeedingSchedule> createFeedingSchedule(Map<String, dynamic> data) async {
    return FeedingSchedule.fromJson(await _post('/feeding-schedules', data: data));
  }

  Future<void> deleteFeedingSchedule(int id) async {
    await _delete('/feeding-schedules/$id');
  }

  Future<List<FeedingLog>> getFeedingLogs(String pondId) async {
    final j = await _get('/feeding-logs/$pondId') as List;
    return j.map((e) => FeedingLog.fromJson(e)).toList();
  }

  Future<void> recordFeeding(Map<String, dynamic> data) async {
    await _post('/feeding-logs', data: data);
  }

  // ── Mortality ──────────────────────────────────────────────────

  Future<List<MortalityRecord>> getMortality(String pondId) async {
    final j = await _get('/mortality/$pondId') as List;
    return j.map((e) => MortalityRecord.fromJson(e)).toList();
  }

  Future<Map<String, dynamic>?> getMortalitySummary(String pondId) async {
    return await _get('/mortality/$pondId/summary');
  }

  Future<MortalityRecord> recordMortality(Map<String, dynamic> data) async {
    return MortalityRecord.fromJson(await _post('/mortality', data: data));
  }

  Future<MortalityRecord> updateMortality(int id, Map<String, dynamic> data) async {
    return MortalityRecord.fromJson(await _put('/mortality/$id', data: data));
  }

  Future<void> deleteMortality(int id) async {
    await _delete('/mortality/$id');
  }

  // ── Notifications ──────────────────────────────────────────────

  Future<List<NotificationModel>> getNotifications({
    String? pondId,
    bool unreadOnly = false,
    int limit = 50,
  }) async {
    final params = <String, dynamic>{'limit': limit};
    if (pondId != null) params['pond_id'] = pondId;
    if (unreadOnly) params['unread_only'] = 'true';
    final j = await _get('/notifications', params: params) as List;
    return j.map((e) => NotificationModel.fromJson(e)).toList();
  }

  Future<int> getUnreadCount() async {
    final j = await _get('/notifications/unread-count');
    return j['count'] ?? 0;
  }

  Future<void> markRead(int id) async {
    await _put('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _put('/notifications/read-all');
  }

  // ── Logs ───────────────────────────────────────────────────────

  Future<List<ControlLog>> getLogs(String pondId) async {
    final j = await _get('/logs/$pondId') as List;
    return j.map((e) => ControlLog.fromJson(e)).toList();
  }

  // ── Water Devices ──────────────────────────────────────────────

  Future<List<WaterDevice>> getWaterDevices() async {
    final j = await _get('/water-devices') as List;
    return j.map((e) => WaterDevice.fromJson(e)).toList();
  }

  // ── Cycle ──────────────────────────────────────────────────────

  Future<PondCycle?> getActiveCycle(String pondId) async {
    try {
      final j = await _get('/ponds/$pondId/cycle');
      if (j == null) return null;
      return PondCycle.fromJson(j);
    } catch (_) {
      return null;
    }
  }

  Future<PondCycle> startCycle(String pondId, Map<String, dynamic> data) async {
    return PondCycle.fromJson(await _post('/ponds/$pondId/cycle', data: data));
  }

  Future<void> harvestCycle(String pondId, Map<String, dynamic> data) async {
    await _post('/ponds/$pondId/cycle/harvest', data: data);
  }

  Future<List<PondCycle>> getCycles(String pondId) async {
    final j = await _get('/ponds/$pondId/cycles') as List;
    return j.map((e) => PondCycle.fromJson(e)).toList();
  }

  Future<void> cancelCycle(String pondId, String? notes) async {
    await _post('/ponds/$pondId/cycle/cancel', data: {'notes': notes});
  }

  // ── Biomass ────────────────────────────────────────────────────

  Future<dynamic> getCurrentBiomass(String pondId) async {
    return await _get('/ponds/$pondId/biomass/current');
  }

  Future<List<dynamic>> getBiomassHistory(String pondId) async {
    return await _get('/ponds/$pondId/biomass') as List;
  }

  Future<void> startBiomass(String pondId) async {
    await _post('/ponds/$pondId/biomass/start');
  }

  Future<void> addBiomassEntry(String pondId, double weightG) async {
    await _post('/ponds/$pondId/biomass/entry', data: {'weight_g': weightG});
  }

  Future<void> deleteBiomassEntry(String pondId, int entryId) async {
    await _delete('/ponds/$pondId/biomass/entry/$entryId');
  }

  Future<void> finalizeBiomass(String pondId) async {
    await _post('/ponds/$pondId/biomass/finalize');
  }

  // ── Financial ──────────────────────────────────────────────────

  Future<dynamic> getFeedStock(String pondId) async {
    return await _get('/ponds/$pondId/feed-stock');
  }

  Future<void> updateFeedStock(String pondId, Map<String, dynamic> data) async {
    await _put('/ponds/$pondId/feed-stock', data: data);
  }

  Future<List<dynamic>> getCosts(String pondId) async {
    return await _get('/ponds/$pondId/costs') as List;
  }

  Future<void> addCost(String pondId, Map<String, dynamic> data) async {
    await _post('/ponds/$pondId/costs', data: data);
  }

  Future<void> deleteCost(String pondId, int id) async {
    await _delete('/ponds/$pondId/costs/$id');
  }

  Future<dynamic> getFinancial(String pondId) async {
    return await _get('/ponds/$pondId/financial');
  }

  // ── Logbook ────────────────────────────────────────────────────

  Future<List<dynamic>> getLogbook(String pondId) async {
    return await _get('/ponds/$pondId/logbook') as List;
  }

  Future<void> addLogbook(String pondId, Map<String, dynamic> data) async {
    await _post('/ponds/$pondId/logbook', data: data);
  }

  Future<void> deleteLogbook(String pondId, int id) async {
    await _delete('/ponds/$pondId/logbook/$id');
  }

  // ── Lele Feeder ────────────────────────────────────────────────

  Future<List<LeleDevice>> getLeleDevices() async {
    final j = await _get('/lele/devices') as List;
    return j.map((e) => LeleDevice.fromJson(e)).toList();
  }

  Future<LeleDevice> getLeleDevice(String deviceId) async {
    return LeleDevice.fromJson(await _get('/lele/devices/$deviceId'));
  }

  Future<void> leleCommand(String deviceId, String cmd, {Map<String, dynamic>? extra}) async {
    await _post('/lele/devices/$deviceId/command', data: {'cmd': cmd, ...?extra});
  }

  Future<LeleDevice> createLeleDevice(Map<String, dynamic> data) async {
    return LeleDevice.fromJson(await _post('/lele/devices', data: data));
  }

  Future<LeleDevice> updateLeleDevice(String deviceId, Map<String, dynamic> data) async {
    return LeleDevice.fromJson(await _put('/lele/devices/$deviceId', data: data));
  }

  Future<void> deleteLeleDevice(String deviceId) async {
    await _delete('/lele/devices/$deviceId');
  }

  // ── WA Notification ────────────────────────────────────────────

  Future<dynamic> getWaConfig() async {
    return await _get('/wa/config');
  }

  Future<void> setWaConfig(Map<String, dynamic> data) async {
    await _put('/wa/config', data: data);
  }

  Future<List<dynamic>> getWaRecipients({String? orgId}) async {
    return await _get('/wa/recipients', params: orgId != null ? {'org_id': orgId} : null) as List;
  }

  Future<dynamic> createWaRecipient(Map<String, dynamic> data) async {
    return await _post('/wa/recipients', data: data);
  }

  Future<void> updateWaRecipient(int id, Map<String, dynamic> data) async {
    await _put('/wa/recipients/$id', data: data);
  }

  Future<void> deleteWaRecipient(int id) async {
    await _delete('/wa/recipients/$id');
  }

  Future<void> testWaRecipient(int id) async {
    await _post('/wa/recipients/$id/test');
  }

  Future<List<dynamic>> getWaLog() async {
    return await _get('/wa/log') as List;
  }

  // ── CCTV ───────────────────────────────────────────────────────

  Future<dynamic> getCctvConfig({String? orgId}) async {
    return await _get('/cctv/config', params: orgId != null ? {'org_id': orgId} : null);
  }

  Future<List<dynamic>> getCctvCameras({String? orgId}) async {
    return await _get('/cctv/cameras', params: orgId != null ? {'org_id': orgId} : null) as List;
  }

  Future<dynamic> createCctvCamera(Map<String, dynamic> data) async {
    return await _post('/cctv/cameras', data: data);
  }

  Future<void> updateCctvCamera(int id, Map<String, dynamic> data) async {
    await _put('/cctv/cameras/$id', data: data);
  }

  Future<void> deleteCctvCamera(int id) async {
    await _delete('/cctv/cameras/$id');
  }

  // ── Users ──────────────────────────────────────────────────────

  Future<List<AppUser>> getUsers({String? orgId}) async {
    final j = await _get('/users', params: orgId != null ? {'org_id': orgId} : null) as List;
    return j.map((e) => AppUser.fromJson(e)).toList();
  }

  Future<AppUser> createUser(Map<String, dynamic> data) async {
    return AppUser.fromJson(await _post('/users', data: data));
  }

  Future<AppUser> updateUser(int id, Map<String, dynamic> data) async {
    return AppUser.fromJson(await _put('/users/$id', data: data));
  }

  Future<void> deleteUser(int id) async {
    await _delete('/users/$id');
  }

  Future<List<dynamic>> getOrgs() async {
    return await _get('/orgs') as List;
  }

  Future<dynamic> createOrg(Map<String, dynamic> data) async {
    return await _post('/orgs', data: data);
  }

  Future<void> updateOrg(String id, Map<String, dynamic> data) async {
    await _put('/orgs/$id', data: data);
  }

  Future<void> deleteOrg(String id) async {
    await _delete('/orgs/$id');
  }

  // ── DB Explorer (Super Admin) ────────────────────────────────────

  Future<List<String>> dbTables() async {
    final j = await _get('/db/tables') as List;
    return j.cast<String>();
  }

  Future<Map<String, dynamic>> dbTable(String name, {int limit = 100, int offset = 0}) async {
    return await _get('/db/table/${Uri.encodeComponent(name)}', params: {'limit': limit, 'offset': offset});
  }

  Future<Map<String, dynamic>> dbQuery(String sql) async {
    return await _post('/db/query', data: {'sql': sql});
  }

  // ── Firmware OTA ────────────────────────────────────────────────

  Future<List<dynamic>> getLeleFirmwareList() async {
    return await _get('/lele-ota/firmwares') as List;
  }

  Future<void> uploadLeleFirmware(String filePath, String filename) async {
    final formData = FormData.fromMap({
      'firmware': await MultipartFile.fromFile(filePath, filename: filename),
    });
    await _dio.post('/lele-ota/upload', data: formData);
  }

  Future<void> flashFirmware(String deviceId, int firmwareId) async {
    await _post('/lele-ota/flash', data: {'device_id': deviceId, 'firmware_id': firmwareId});
  }

  // ── Cycle Compare ─────────────────────────────────────────────

  Future<List<dynamic>> getCycleCompare() async {
    return await _get('/cycles/compare') as List;
  }

  // ── Pond Overview ─────────────────────────────────────────────

  Future<Map<String, dynamic>?> getPondOverview(String pondId) async {
    try {
      return await _get('/ponds/$pondId/overview');
    } catch (_) {
      return null;
    }
  }

  // ── Water Audit ─────────────────────────────────────────────────

  Future<dynamic> getWaterAudit(String pondId, {int days = 7}) async {
    return await _get('/ponds/$pondId/water-audit', params: {'days': days});
  }
}

// ── Provider ──────────────────────────────────────────────────────

final apiClientProvider = Provider<ApiClient>((ref) {
  final dio = ref.read(dioProvider);
  return ApiClient(dio);
});
