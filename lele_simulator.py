"""
MQTT Simulator ESP32 - Pakan Lele V3.2
Berpura-pura jadi ESP32 untuk testing dashboard tanpa hardware.
Kirim status tiap 3 detik + bisa terima command dari web.

Install: pip install paho-mqtt
Jalankan: python lele_simulator.py
"""

import paho.mqtt.client as mqtt
import json
import time
import threading
import random
from datetime import datetime

MQTT_HOST = "127.0.0.1"
MQTT_PORT     = 1883
MQTT_USER     = "aquaculture"
MQTT_PASSWORD = "aquaculture123"
DEVICE_ID     = "pakan_lele_01"

TOPIC_STATUS          = "lele/device/status"
TOPIC_BIOMASS_SAMPLE  = "lele/biomass/sample"
TOPIC_BIOMASS_SUMMARY = "lele/biomass/summary"
TOPIC_FEED_SESSION    = "lele/feed/session"
TOPIC_FEED_BATCH      = "lele/feed/batch"
TOPIC_FEED_SUMMARY    = "lele/feed/summary"
TOPIC_ERROR           = "lele/device/error"
TOPIC_ACK             = "lele/device/ack"
TOPIC_COMMAND         = f"lele/device/{DEVICE_ID}/command"
TOPIC_CONFIG          = f"lele/device/{DEVICE_ID}/config"

state = {
    "device_id": DEVICE_ID,
    "wifi_connected": True,
    "mqtt_connected": True,
    "rtc_ok": True,
    "auto_feed_enabled": True,
    "feeding_in_progress": False,
    "screen": "main_menu",
    "main_menu_index": 0,
    "hx_chamber_ok": True,
    "hx_sampling_ok": True,
    "chamber_g": 0.0,
    "sampling_g": 0.0,
    "fish_count": 1000,
    "feeding_rate_percent": 3.5,
    "feeding_per_day": 2,
    "target_sample_count": 10,
    "sample_ready": False,
    "saved_sample_count": 0,
    "current_sample_index": 0,
    "avg_fish_g": 0.0,
    "servo_angle": 0,
    "stepper_enabled": False,
    "spinner_state": 0,
    "next_schedule_hhmm": "07:00",
    "seconds_to_next_feed": 3600,
    "last_feed_success": False,
    "last_feed_target_g": 0.0,
    "last_feed_actual_g": 0.0,
    "last_feed_batch_count": 0,
    "last_feed_time": "-",
    "last_error_code": "NONE",
    "last_error_msg": "Tidak ada error",
    "last_error_time": "-",
    "schedules": [
        {"index": 0, "hour": 7,  "minute": 0,  "enabled": True},
        {"index": 1, "hour": 17, "minute": 0,  "enabled": True},
        {"index": 2, "hour": 0,  "minute": 0,  "enabled": False},
        {"index": 3, "hour": 0,  "minute": 0,  "enabled": False},
        {"index": 4, "hour": 0,  "minute": 0,  "enabled": False},
        {"index": 5, "hour": 0,  "minute": 0,  "enabled": False},
    ]
}

client = None
running = True

def ts():
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

def log(msg, color=""):
    colors = {"green":"\033[92m","red":"\033[91m","yellow":"\033[93m","cyan":"\033[96m","blue":"\033[94m","":""}
    print(f"{colors.get(color,'')}{datetime.now().strftime('%H:%M:%S')} {msg}\033[0m")

def publish_status():
    state["timestamp"] = ts()
    state["seconds_to_next_feed"] = max(0, state["seconds_to_next_feed"] - 3)
    state["chamber_g"]  = round(random.uniform(0, 2), 2)
    state["sampling_g"] = round(random.uniform(0, 1), 2)
    client.publish(TOPIC_STATUS, json.dumps(state))
    log(f"[PUB] status screen={state['screen']} menu_idx={state['main_menu_index']}", "cyan")

def publish_ack(command, success, reason):
    client.publish(TOPIC_ACK, json.dumps({
        "device_id": DEVICE_ID, "timestamp": ts(),
        "command": command, "success": success, "reason": reason
    }))
    log(f"[ACK] {command} → {'OK' if success else 'FAIL'}: {reason}", "green" if success else "red")

def simulate_feeding(target_g, session_name):
    def _feed():
        state["feeding_in_progress"] = True
        state["screen"] = "feeding"
        log(f"[FEEDING] {session_name} target={target_g}g", "yellow")
        session_id = f"feed_{int(time.time())}"
        batches = max(1, -(-int(target_g) // 100))
        client.publish(TOPIC_FEED_SESSION, json.dumps({
            "device_id": DEVICE_ID, "timestamp": ts(),
            "feed_session_id": session_id, "session_name": session_name,
            "event": "start", "target_total_g": target_g,
            "planned_batch_count": batches, "max_batch_g": 100.0
        }))
        total = 0.0
        for i in range(batches):
            time.sleep(1)
            bt = min(100.0, target_g - i*100)
            ba = round(bt * random.uniform(0.96, 1.02), 2)
            total += ba
            client.publish(TOPIC_FEED_BATCH, json.dumps({
                "device_id": DEVICE_ID, "timestamp": ts(),
                "feed_session_id": session_id,
                "batch_no": i+1, "total_batches": batches,
                "target_g": bt, "actual_g": ba,
                "spinner_direction": "CW" if i%2==0 else "CCW", "success": True
            }))
            log(f"  Batch {i+1}/{batches}: {ba}g", "yellow")
            publish_status()
        client.publish(TOPIC_FEED_SUMMARY, json.dumps({
            "device_id": DEVICE_ID, "timestamp": ts(),
            "feed_session_id": session_id, "session_name": session_name,
            "event": "summary", "target_total_g": target_g,
            "actual_total_g": round(total, 2), "batch_count": batches, "success": True
        }))
        state.update({"last_feed_success": True, "last_feed_target_g": target_g,
                      "last_feed_actual_g": round(total,2), "last_feed_batch_count": batches,
                      "last_feed_time": ts(), "feeding_in_progress": False,
                      "screen": "main_menu", "chamber_g": 0.0})
        log(f"[FEEDING] Selesai! {round(total,2)}g", "green")
        publish_status()
    threading.Thread(target=_feed, daemon=True).start()

def simulate_sampling():
    def _sample():
        state["screen"] = "sample_active"
        state["saved_sample_count"] = 0
        samples = []
        n = state["target_sample_count"]
        log(f"[SAMPLING] Mulai {n} ikan...", "yellow")
        for i in range(n):
            time.sleep(0.4)
            w = round(random.uniform(45, 85), 2)
            samples.append(w)
            state["current_sample_index"] = i
            state["saved_sample_count"] = i+1
            state["sampling_g"] = w
            client.publish(TOPIC_BIOMASS_SAMPLE, json.dumps({
                "device_id": DEVICE_ID, "timestamp": ts(), "fish_no": i+1, "fish_weight_g": w
            }))
            log(f"  Ikan {i+1}: {w}g", "yellow")
            publish_status()
        avg = round(sum(samples)/len(samples), 2)
        rate = 7.0 if avg<=20 else 5.0 if avg<=50 else 3.5 if avg<=100 else 2.8 if avg<=300 else 2.0
        biomass = round(avg * state["fish_count"] / 1000, 3)
        daily = round(biomass * (rate/100) * 1000, 2)
        per_s = round(daily / state["feeding_per_day"], 2)
        state.update({"avg_fish_g": avg, "sample_ready": True,
                      "feeding_rate_percent": rate, "screen": "sample_summary", "sampling_g": 0.0})
        client.publish(TOPIC_BIOMASS_SUMMARY, json.dumps({
            "device_id": DEVICE_ID, "timestamp": ts(),
            "sample_count": n, "average_fish_weight_g": avg,
            "fish_count": state["fish_count"], "estimated_biomass_kg": biomass,
            "feeding_rate_percent": rate, "feeding_per_day": state["feeding_per_day"],
            "estimated_daily_feed_g": daily, "estimated_feed_per_schedule_g": per_s
        }))
        log(f"[SAMPLING] Selesai! AVG={avg}g Biomassa={biomass}kg Rate={rate}%", "green")
        time.sleep(1)
        state["screen"] = "main_menu"
        publish_status()
    threading.Thread(target=_sample, daemon=True).start()

def on_connect(c, userdata, flags, rc):
    if rc == 0:
        log("[MQTT] Connected ke broker!", "green")
        c.subscribe(TOPIC_COMMAND)
        c.subscribe(TOPIC_CONFIG)
        log(f"[MQTT] Subscribed ke {TOPIC_COMMAND}", "green")
    else:
        log(f"[MQTT] Gagal rc={rc}", "red")

def on_message(c, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except:
        return
    log(f"[RECV] {msg.topic}: {payload}", "blue")
    if msg.topic == TOPIC_COMMAND:
        cmd = payload.get("command","")
        if cmd == "btn":
            btn = payload.get("button","")
            if btn == "up":
                state["main_menu_index"] = (state["main_menu_index"]-1) % 8
            elif btn == "down":
                state["main_menu_index"] = (state["main_menu_index"]+1) % 8
            elif btn == "ok":
                screens = ["status","feed_menu","biomass_menu","data_kolam_menu",
                           "schedule_menu","tare_menu","history_menu","settings_menu"]
                if state["screen"] == "main_menu":
                    state["screen"] = screens[state["main_menu_index"]]
                else:
                    state["screen"] = "main_menu"
            elif btn == "back":
                state["screen"] = "main_menu"
            publish_ack(cmd, True, f"Button {btn}")
            publish_status()
        elif cmd == "manual_feed_adaptive":
            if not state["sample_ready"]:
                publish_ack(cmd, False, "Sampling belum dilakukan"); return
            target = round(state["avg_fish_g"]*state["fish_count"]*(state["feeding_rate_percent"]/100)/state["feeding_per_day"],1)
            publish_ack(cmd, True, f"Feed {target}g queued")
            simulate_feeding(target, "WEB ADAPTIF")
        elif cmd == "manual_feed_gram":
            target = payload.get("target_g", 100)
            publish_ack(cmd, True, f"Feed {target}g queued")
            simulate_feeding(target, "WEB CUSTOM")
        elif cmd == "set_auto_feed":
            state["auto_feed_enabled"] = payload.get("enabled", False)
            publish_ack(cmd, True, "Auto feed " + ("ON" if state["auto_feed_enabled"] else "OFF"))
            publish_status()
        elif cmd == "tare":
            scale = payload.get("scale_type","all")
            state["chamber_g"] = 0.0
            if scale in ["sampling","all"]: state["sampling_g"] = 0.0
            publish_ack(cmd, True, f"Tare {scale} done"); publish_status()
        elif cmd == "reset_samples":
            state.update({"sample_ready":False,"saved_sample_count":0,"avg_fish_g":0.0})
            publish_ack(cmd, True, "Samples reset"); publish_status()
        elif cmd == "start_sampling":
            publish_ack(cmd, True, "Sampling started"); simulate_sampling()
        elif cmd == "auto_gen_schedule":
            publish_ack(cmd, True, "Schedule generated"); publish_status()
        elif cmd == "open_valve":
            state["servo_angle"] = 45; publish_ack(cmd, True, "Open"); publish_status()
        elif cmd == "close_valve":
            state["servo_angle"] = 0; publish_ack(cmd, True, "Close"); publish_status()
        else:
            publish_ack(cmd, False, f"Unknown: {cmd}")
    elif msg.topic == TOPIC_CONFIG:
        changed = False
        for k,sk in [("fish_count","fish_count"),("feeding_per_day","feeding_per_day"),("target_sample_count","target_sample_count")]:
            if k in payload: state[sk] = payload[k]; changed = True
        if "schedule_index" in payload:
            idx = payload["schedule_index"]
            if 0 <= idx < 6:
                for k in ["hour","minute","enabled"]:
                    if k in payload: state["schedules"][idx][k] = payload[k]
            changed = True
        if changed:
            publish_ack("config_update", True, "Config applied"); publish_status()

def status_loop():
    while running:
        time.sleep(3)
        if client and client.is_connected():
            publish_status()

def main():
    global client, running
    print("\033[96m" + "="*55)
    print("  🐟 MQTT Simulator ESP32 - Pakan Lele V3.2")
    print("="*55 + "\033[0m")
    print(f"  Host   : {MQTT_HOST}:{MQTT_PORT}")
    print(f"  Device : {DEVICE_ID}")
    print("  Tekan Ctrl+C untuk berhenti\n")

    client = mqtt.Client(client_id=f"{DEVICE_ID}_sim")
    client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
    except Exception as e:
        log(f"[ERROR] Tidak bisa konek MQTT: {e}", "red")
        log("Pastikan Docker running: docker compose up -d", "yellow")
        return

    threading.Thread(target=status_loop, daemon=True).start()
    log("Simulator jalan! Buka http://localhost:3000/lele-feeder", "green")
    log("Device akan muncul ONLINE dalam 5 detik...", "green")

    try:
        client.loop_forever()
    except KeyboardInterrupt:
        running = False
        log("\nSimulator dihentikan.", "yellow")

if __name__ == "__main__":
    main()