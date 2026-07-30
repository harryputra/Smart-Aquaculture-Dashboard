// ═══════════════════════════════════════════════════════════════
// Data Models – cermin dari struktur DB & API response backend
// ═══════════════════════════════════════════════════════════════

// ── User & Auth ─────────────────────────────────────────────────

class UserModel {
  final String id;
  final String email;
  final String? name;
  final String role; // superadmin | pemilik | pekerja | pengamat
  final String? orgId;
  final String? orgName;

  const UserModel({
    required this.id,
    required this.email,
    this.name,
    required this.role,
    this.orgId,
    this.orgName,
  });

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        id: j['id']?.toString() ?? '',
        email: j['email'] ?? '',
        name: j['name'],
        role: j['role'] ?? 'pengamat',
        orgId: j['org_id'],
        orgName: j['org_name'],
      );

  String get displayName => name ?? email;
  String get initial => displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';

  bool get isSuper => role == 'superadmin';
  bool get canWrite => role != 'pengamat';
  bool get canDelete => role == 'pemilik' || role == 'superadmin';
  bool get canManageUsers => role == 'pemilik' || role == 'superadmin';
}

const Map<String, String> roleLabel = {
  'superadmin': 'Super Admin',
  'pemilik': 'Pemilik',
  'pekerja': 'Pekerja',
  'pengamat': 'Pengamat',
};

// ── Farm ─────────────────────────────────────────────────────────

class FarmModel {
  final String farmId;
  final String name;
  final String? location;
  final String? owner;
  final String? description;
  final int pondCount;
  final DateTime? createdAt;

  const FarmModel({
    required this.farmId,
    required this.name,
    this.location,
    this.owner,
    this.description,
    this.pondCount = 0,
    this.createdAt,
  });

  factory FarmModel.fromJson(Map<String, dynamic> j) => FarmModel(
        farmId: j['farm_id'] ?? '',
        name: j['name'] ?? '',
        location: j['location'],
        owner: j['owner'],
        description: j['description'],
        pondCount: int.tryParse(j['pond_count']?.toString() ?? '0') ?? 0,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at']) : null,
      );
}

// ── Pond ─────────────────────────────────────────────────────────

class PondModel {
  final String pondId;
  final String farmId;
  final String name;
  final String? fishType;
  final double? sizeM2;
  final double? maxDepth;
  final int? fishCount;
  final int? initialFishCount;
  final String? stockingDate;
  final String deviceMode; // esp32 | dummy
  final bool? isConnected;
  final DateTime? lastSeen;
  final bool isActive;
  final SensorData? latestSensor;
  final SensorThreshold? threshold;
  final String? feederDeviceId;
  final String? feederName;
  final bool? feederIsOnline;

  const PondModel({
    required this.pondId,
    required this.farmId,
    required this.name,
    this.fishType,
    this.sizeM2,
    this.maxDepth,
    this.fishCount,
    this.initialFishCount,
    this.stockingDate,
    this.deviceMode = 'dummy',
    this.isConnected,
    this.lastSeen,
    this.isActive = true,
    this.latestSensor,
    this.threshold,
    this.feederDeviceId,
    this.feederName,
    this.feederIsOnline,
  });

  factory PondModel.fromJson(Map<String, dynamic> j) => PondModel(
        pondId: j['pond_id'] ?? '',
        farmId: j['farm_id'] ?? '',
        name: j['name'] ?? '',
        fishType: j['fish_type'],
        sizeM2: double.tryParse(j['size_m2']?.toString() ?? ''),
        maxDepth: double.tryParse(j['max_depth']?.toString() ?? ''),
        fishCount: int.tryParse(j['fish_count']?.toString() ?? ''),
        initialFishCount: int.tryParse(j['initial_fish_count']?.toString() ?? ''),
        stockingDate: j['stocking_date'],
        deviceMode: j['device_mode'] ?? 'dummy',
        isConnected: j['is_connected'],
        lastSeen: j['last_seen'] != null ? DateTime.tryParse(j['last_seen']) : null,
        isActive: j['is_active'] != false,
        latestSensor: j['latest_sensor'] != null
            ? SensorData.fromJson(j['latest_sensor'])
            : null,
        threshold: j['threshold'] != null
            ? SensorThreshold.fromJson(j['threshold'])
            : null,
        feederDeviceId: j['feeder_device_id'],
        feederName: j['feeder_name'],
        feederIsOnline: j['feeder_is_online'],
      );
}

// ── Sensor Data ──────────────────────────────────────────────────

class SensorData {
  final double? temperature;
  final double? depth;
  final double? dissolvedOxygen;
  final double? turbidity;
  final double? ph;
  final bool? aeratorOn;
  final double? feedLevelCm;
  final String? source;
  final DateTime? timestamp;

  const SensorData({
    this.temperature,
    this.depth,
    this.dissolvedOxygen,
    this.turbidity,
    this.ph,
    this.aeratorOn,
    this.feedLevelCm,
    this.source,
    this.timestamp,
  });

  factory SensorData.fromJson(Map<String, dynamic> j) => SensorData(
        temperature: double.tryParse(j['temperature']?.toString() ?? ''),
        depth: double.tryParse(j['depth']?.toString() ?? ''),
        dissolvedOxygen: double.tryParse(j['dissolved_oxygen']?.toString() ?? ''),
        turbidity: double.tryParse(j['turbidity']?.toString() ?? ''),
        ph: double.tryParse(j['ph']?.toString() ?? ''),
        aeratorOn: j['aerator_on'],
        feedLevelCm: double.tryParse(j['feed_level_cm']?.toString() ?? ''),
        source: j['source'],
        timestamp: j['timestamp'] != null ? DateTime.tryParse(j['timestamp']) : null,
      );
}

// ── Sensor Threshold ─────────────────────────────────────────────

class SensorThreshold {
  final double? tempMin, tempMax;
  final double? depthMin, depthMax;
  final double? doMin, doMax;
  final double? turbidityMax;
  final double? phMin, phMax;
  final bool autoDrainEnabled;
  final bool autoRefillEnabled;
  final double? feedLevelLowCm;

  const SensorThreshold({
    this.tempMin,
    this.tempMax,
    this.depthMin,
    this.depthMax,
    this.doMin,
    this.doMax,
    this.turbidityMax,
    this.phMin,
    this.phMax,
    this.autoDrainEnabled = false,
    this.autoRefillEnabled = false,
    this.feedLevelLowCm,
  });

  factory SensorThreshold.fromJson(Map<String, dynamic> j) => SensorThreshold(
        tempMin: double.tryParse(j['temp_min']?.toString() ?? ''),
        tempMax: double.tryParse(j['temp_max']?.toString() ?? ''),
        depthMin: double.tryParse(j['depth_min']?.toString() ?? ''),
        depthMax: double.tryParse(j['depth_max']?.toString() ?? ''),
        doMin: double.tryParse(j['do_min']?.toString() ?? ''),
        doMax: double.tryParse(j['do_max']?.toString() ?? ''),
        turbidityMax: double.tryParse(j['turbidity_max']?.toString() ?? ''),
        phMin: double.tryParse(j['ph_min']?.toString() ?? ''),
        phMax: double.tryParse(j['ph_max']?.toString() ?? ''),
        autoDrainEnabled: j['auto_drain_enabled'] == true,
        autoRefillEnabled: j['auto_refill_enabled'] == true,
        feedLevelLowCm: double.tryParse(j['feed_level_low_cm']?.toString() ?? ''),
      );

  Map<String, dynamic> toJson() => {
        'temp_min': tempMin,
        'temp_max': tempMax,
        'depth_min': depthMin,
        'depth_max': depthMax,
        'do_min': doMin,
        'do_max': doMax,
        'turbidity_max': turbidityMax,
        'ph_min': phMin,
        'ph_max': phMax,
        'auto_drain_enabled': autoDrainEnabled,
        'auto_refill_enabled': autoRefillEnabled,
        'feed_level_low_cm': feedLevelLowCm,
      };
}

// ── Notification ─────────────────────────────────────────────────

class NotificationModel {
  final int id;
  final String? pondId;
  final String? pondName;
  final String type; // critical | risk | info | success
  final String? category;
  final String title;
  final String? message;
  final bool isRead;
  final DateTime? createdAt;

  const NotificationModel({
    required this.id,
    this.pondId,
    this.pondName,
    required this.type,
    this.category,
    required this.title,
    this.message,
    this.isRead = false,
    this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> j) => NotificationModel(
        id: j['id'] ?? 0,
        pondId: j['pond_id'],
        pondName: j['pond_name'],
        type: j['type'] ?? 'info',
        category: j['category'],
        title: j['title'] ?? '',
        message: j['message'],
        isRead: j['is_read'] == true,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at']) : null,
      );
}

// ── Dashboard Summary ─────────────────────────────────────────────

class DashboardSummary {
  final int totalFarms;
  final int totalPonds;
  final int connectedDevices;
  final int deaths30d;
  final int unreadNotifications;
  final int feedings24h;

  const DashboardSummary({
    this.totalFarms = 0,
    this.totalPonds = 0,
    this.connectedDevices = 0,
    this.deaths30d = 0,
    this.unreadNotifications = 0,
    this.feedings24h = 0,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) => DashboardSummary(
        totalFarms: j['total_farms'] ?? 0,
        totalPonds: j['total_ponds'] ?? 0,
        connectedDevices: j['connected_devices'] ?? 0,
        deaths30d: j['deaths_30d'] ?? 0,
        unreadNotifications: j['unread_notifications'] ?? 0,
        feedings24h: j['feedings_24h'] ?? 0,
      );
}

// ── Feeding ──────────────────────────────────────────────────────

class FeedingLog {
  final int id;
  final String pondId;
  final double feedAmountKg;
  final String? feedType;
  final String? triggeredBy;
  final String? note;
  final DateTime? timestamp;

  const FeedingLog({
    required this.id,
    required this.pondId,
    required this.feedAmountKg,
    this.feedType,
    this.triggeredBy,
    this.note,
    this.timestamp,
  });

  factory FeedingLog.fromJson(Map<String, dynamic> j) => FeedingLog(
        id: j['id'] ?? 0,
        pondId: j['pond_id'] ?? '',
        feedAmountKg: double.tryParse(j['feed_amount_kg']?.toString() ?? '0') ?? 0,
        feedType: j['feed_type'],
        triggeredBy: j['triggered_by'],
        note: j['note'],
        timestamp: j['timestamp'] != null ? DateTime.tryParse(j['timestamp']) : null,
      );
}

class FeedingSchedule {
  final int id;
  final String pondId;
  final String scheduleTime;
  final String scheduleDays;
  final double feedAmountKg;
  final String? feedType;
  final String? note;
  final bool isActive;

  const FeedingSchedule({
    required this.id,
    required this.pondId,
    required this.scheduleTime,
    required this.scheduleDays,
    required this.feedAmountKg,
    this.feedType,
    this.note,
    this.isActive = true,
  });

  factory FeedingSchedule.fromJson(Map<String, dynamic> j) => FeedingSchedule(
        id: j['id'] ?? 0,
        pondId: j['pond_id'] ?? '',
        scheduleTime: j['schedule_time'] ?? '',
        scheduleDays: j['schedule_days'] ?? '1,2,3,4,5,6,7',
        feedAmountKg: double.tryParse(j['feed_amount_kg']?.toString() ?? '0') ?? 0,
        feedType: j['feed_type'],
        note: j['note'],
        isActive: j['is_active'] != false,
      );

  List<int> get days => scheduleDays.split(',').map((e) => int.tryParse(e.trim()) ?? 1).toList();
}

// ── Mortality ─────────────────────────────────────────────────────

class MortalityRecord {
  final int id;
  final String pondId;
  final int deathCount;
  final String? cause;
  final String? note;
  final DateTime? recordedAt;

  const MortalityRecord({
    required this.id,
    required this.pondId,
    required this.deathCount,
    this.cause,
    this.note,
    this.recordedAt,
  });

  factory MortalityRecord.fromJson(Map<String, dynamic> j) => MortalityRecord(
        id: j['id'] ?? 0,
        pondId: j['pond_id'] ?? '',
        deathCount: j['death_count'] ?? 0,
        cause: j['cause'],
        note: j['note'],
        recordedAt: j['recorded_at'] != null ? DateTime.tryParse(j['recorded_at']) : null,
      );
}

// ── Control Log ───────────────────────────────────────────────────

class ControlLog {
  final int id;
  final String pondId;
  final String action;
  final String? triggeredBy;
  final String? reason;
  final DateTime? timestamp;

  const ControlLog({
    required this.id,
    required this.pondId,
    required this.action,
    this.triggeredBy,
    this.reason,
    this.timestamp,
  });

  factory ControlLog.fromJson(Map<String, dynamic> j) => ControlLog(
        id: j['id'] ?? 0,
        pondId: j['pond_id'] ?? '',
        action: j['action'] ?? '',
        triggeredBy: j['triggered_by'],
        reason: j['reason'],
        timestamp: j['timestamp'] != null ? DateTime.tryParse(j['timestamp']) : null,
      );
}

// ── Lele Feeder ───────────────────────────────────────────────────

class LeleDevice {
  final String deviceId;
  final String? name;
  final String? pondId;
  final bool isOnline;
  final double? feedLevelCm;
  final int? motorSteps;
  final DateTime? lastSeen;

  const LeleDevice({
    required this.deviceId,
    this.name,
    this.pondId,
    this.isOnline = false,
    this.feedLevelCm,
    this.motorSteps,
    this.lastSeen,
  });

  factory LeleDevice.fromJson(Map<String, dynamic> j) => LeleDevice(
        deviceId: j['device_id'] ?? '',
        name: j['name'],
        pondId: j['pond_id'],
        isOnline: j['is_online'] == true,
        feedLevelCm: double.tryParse(j['feed_level_cm']?.toString() ?? ''),
        motorSteps: int.tryParse(j['motor_steps']?.toString() ?? ''),
        lastSeen: j['last_seen'] != null ? DateTime.tryParse(j['last_seen']) : null,
      );
}

// ── User Management ───────────────────────────────────────────────

class AppUser {
  final int id;
  final String email;
  final String? name;
  final String role;
  final String? orgId;
  final String? orgName;
  final bool isActive;
  final DateTime? createdAt;

  const AppUser({
    required this.id,
    required this.email,
    this.name,
    required this.role,
    this.orgId,
    this.orgName,
    this.isActive = true,
    this.createdAt,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] ?? 0,
        email: j['email'] ?? '',
        name: j['name'],
        role: j['role'] ?? 'pengamat',
        orgId: j['org_id'],
        orgName: j['org_name'],
        isActive: j['is_active'] != false,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at']) : null,
      );
}

// ── Water Device ──────────────────────────────────────────────────

class WaterDevice {
  final String pondId;
  final String name;
  final String? fishType;
  final String deviceMode;
  final String? farmId;
  final String? farmName;
  final String? deviceId;
  final bool? isConnected;
  final DateTime? lastSeen;
  final String? ipAddress;
  final int? rssi;
  final SensorData? latest;
  final SensorThreshold? threshold;

  const WaterDevice({
    required this.pondId,
    required this.name,
    this.fishType,
    this.deviceMode = 'dummy',
    this.farmId,
    this.farmName,
    this.deviceId,
    this.isConnected,
    this.lastSeen,
    this.ipAddress,
    this.rssi,
    this.latest,
    this.threshold,
  });

  factory WaterDevice.fromJson(Map<String, dynamic> j) => WaterDevice(
        pondId: j['pond_id'] ?? '',
        name: j['name'] ?? '',
        fishType: j['fish_type'],
        deviceMode: j['device_mode'] ?? 'dummy',
        farmId: j['farm_id'],
        farmName: j['farm_name'],
        deviceId: j['device_id'],
        isConnected: j['is_connected'],
        lastSeen: j['last_seen'] != null ? DateTime.tryParse(j['last_seen']) : null,
        ipAddress: j['ip_address'],
        rssi: int.tryParse(j['rssi']?.toString() ?? ''),
        latest: j['latest'] != null ? SensorData.fromJson(j['latest']) : null,
        threshold: j['threshold'] != null ? SensorThreshold.fromJson(j['threshold']) : null,
      );
}

// ── Aerator ───────────────────────────────────────────────────────

class AeratorStatus {
  final String mode; // auto | manual | off
  final double? doOn;
  final double? doOff;
  final bool manualOn;
  final bool? aeratorOn;

  const AeratorStatus({
    required this.mode,
    this.doOn,
    this.doOff,
    this.manualOn = false,
    this.aeratorOn,
  });

  factory AeratorStatus.fromJson(Map<String, dynamic> j) => AeratorStatus(
        mode: j['aerator_mode'] ?? 'auto',
        doOn: double.tryParse(j['aerator_do_on']?.toString() ?? ''),
        doOff: double.tryParse(j['aerator_do_off']?.toString() ?? ''),
        manualOn: j['aerator_manual_on'] == true,
        aeratorOn: j['aerator_on'],
      );
}

// ── Cycle ─────────────────────────────────────────────────────────

class PondCycle {
  final int id;
  final String pondId;
  final String status; // active | harvested | cancelled
  final int? stockCount;
  final String? fishSize;
  final String? fishSource;
  final double? stockWeightKg;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? notes;

  const PondCycle({
    required this.id,
    required this.pondId,
    required this.status,
    this.stockCount,
    this.fishSize,
    this.fishSource,
    this.stockWeightKg,
    this.startDate,
    this.endDate,
    this.notes,
  });

  factory PondCycle.fromJson(Map<String, dynamic> j) => PondCycle(
        id: j['id'] ?? 0,
        pondId: j['pond_id'] ?? '',
        status: j['status'] ?? 'active',
        stockCount: int.tryParse(j['stock_count']?.toString() ?? ''),
        fishSize: j['fish_size'],
        fishSource: j['fish_source'],
        stockWeightKg: double.tryParse(j['stock_weight_kg']?.toString() ?? ''),
        startDate: j['start_date'] != null ? DateTime.tryParse(j['start_date']) : null,
        endDate: j['end_date'] != null ? DateTime.tryParse(j['end_date']) : null,
        notes: j['notes'],
      );
}

// ── Quick Login ───────────────────────────────────────────────────

class QuickLoginAccount {
  final String role;
  final String label;
  final String email;
  final String? password;

  const QuickLoginAccount({
    required this.role,
    required this.label,
    required this.email,
    this.password,
  });

  factory QuickLoginAccount.fromJson(Map<String, dynamic> j) => QuickLoginAccount(
        role: j['role'] ?? '',
        label: j['label'] ?? j['role'] ?? '',
        email: j['email'] ?? '',
        password: j['password'],
      );
}
