import os
import sys
import time
import json
import random
import threading
import subprocess

# Ensure kafka-python-ng is installed
try:
    from kafka import KafkaConsumer, KafkaProducer
except ImportError:
    print("Kafka library not found. Installing 'kafka-python-ng' dynamically...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "kafka-python-ng"])
        from kafka import KafkaConsumer, KafkaProducer
    except Exception as e:
        print(f"Could not install kafka-python-ng: {e}")
        print("Please run: pip install kafka-python-ng")
        sys.exit(1)

# Configuration
KAFKA_BROKER = os.environ.get("KAFKA_SERVERS", "localhost:9092")
REGISTRATION_TOPIC = "volthome-registration"
TELEMETRY_TOPIC = "volthome-telemetry"

print(f"VoltHome Telemetry Simulator started using broker: {KAFKA_BROKER}")

# Memory storage for registered homes
# Format: { home_id: { 'name': name, 'appliances': [ { 'id': id, 'name': name, 'type': type, 'safeLimitWatt': limit } ] } }
registered_homes = {}
lock = threading.Lock()

# Kafka Producer
producer = None
try:
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BROKER,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    print("Kafka Producer successfully initialized.")
except Exception as e:
    print(f"Warning: Failed to connect to Kafka broker. Producer is offline: {e}")

def registration_listener():
    """Listens to the registration topic and appends new homes to local simulation memory."""
    global registered_homes
    print(f"Listening for home registrations on topic: {REGISTRATION_TOPIC}...")
    
    try:
        consumer = KafkaConsumer(
            REGISTRATION_TOPIC,
            bootstrap_servers=KAFKA_BROKER,
            auto_offset_reset='earliest',
            enable_auto_commit=True,
            group_id='volthome-telemetry-simulator',
            value_deserializer=lambda x: json.loads(x.decode('utf-8'))
        )
        
        for message in consumer:
            home_data = message.value
            home_id = int(home_data.get("homeId"))
            home_name = home_data.get("name")
            appliances = home_data.get("appliances", [])
            
            with lock:
                registered_homes[home_id] = {
                    "name": home_name,
                    "appliances": appliances,
                    "anomaly_cycles": {app.get("id"): 0 for app in appliances} # Track count to trigger deliberate anomalies
                }
            print(f"\n[ASSET REGISTERED] Added Home: {home_name} (ID: {home_id}) with {len(appliances)} appliances to simulation memory.")
            for app in appliances:
                print(f"  - Appliance: {app.get('name')} | Type: {app.get('type')} | Safe Limit: {app.get('safeLimitWatt')}W")
            
    except Exception as e:
        print(f"Error in Kafka registration listener: {e}")

def telemetry_emitter():
    """Periodically generates power consumption telemetry (Watts) for all registered homes and appliances."""
    print("Starting background telemetry generator loop (Every 2 seconds)...")
    
    # Wait for consumer thread to hook up
    time.sleep(2)
    
    while True:
        try:
            with lock:
                homes_copy = list(registered_homes.items())
            
            if not homes_copy:
                # No homes registered yet, check logs and wait
                time.sleep(2)
                continue
            
            for home_id, home_info in homes_copy:
                name = home_info["name"]
                appliances = home_info["appliances"]
                
                for app in appliances:
                    app_id = int(app.get("id"))
                    app_name = app.get("name")
                    safe_limit = float(app.get("safeLimitWatt", 1000.0))
                    
                    # Core simulation logic
                    # Usually, appliances run between 10% and 80% of their safe limit.
                    # However, we deliberately cause an appliance to breach its limit every now and then
                    # to trigger consecutive breach checks (3 cycles) and test the AI notification pipeline.
                    
                    # Retrieve consecutive breach state in simulator to force a breach sequence
                    anomaly_cycle = home_info["anomaly_cycles"].get(app_id, 0)
                    
                    # 5% chance to start a deliberate anomaly sequence of 3 cycles
                    if anomaly_cycle == 0 and random.random() < 0.05:
                        home_info["anomaly_cycles"][app_id] = 1
                        anomaly_cycle = 1
                    
                    if anomaly_cycle > 0 and anomaly_cycle <= 3:
                        # Force a breach (1.1x to 1.3x of safe limit)
                        wattage = safe_limit * random.uniform(1.1, 1.3)
                        home_info["anomaly_cycles"][app_id] += 1
                        print(f"[SIMULATING BREACH] Appliance {app_name} (Home: {name}) is in breach cycle {anomaly_cycle}/3. Wattage: {wattage:.1f}W")
                    else:
                        # Reset deliberate anomaly tracker after 3 cycles or keep it 0
                        home_info["anomaly_cycles"][app_id] = 0
                        # Normal behavior: random usage (e.g. 20% to 90% of safe limit), or device is turned off (0W, 20% chance)
                        if random.random() < 0.2:
                            wattage = 0.0
                        else:
                            wattage = safe_limit * random.uniform(0.2, 0.9)
                    
                    payload = {
                        "homeId": home_id,
                        "applianceId": app_id,
                        "wattage": round(wattage, 2),
                        "timestamp": int(time.time())
                    }
                    
                    if producer:
                        producer.send(TELEMETRY_TOPIC, key=str(home_id).encode('utf-8'), value=payload)
                        print(f"  Sent telemetry -> Home: {name} | Appliance: {app_name} | Wattage: {payload['wattage']}W")
                    else:
                        print(f"  [MOCK TELEMETRY] Home: {name} | Appliance: {app_name} | Wattage: {payload['wattage']}W")
            
            # Flush Kafka buffer
            if producer:
                producer.flush()
                
            time.sleep(2.0)
            
        except Exception as e:
            print(f"Error in telemetry emitter loop: {e}")
            time.sleep(5)

if __name__ == "__main__":
    # Start registration listener thread
    listener_thread = threading.Thread(target=registration_listener, daemon=True)
    listener_thread.start()
    
    # Start emitter loop in main thread
    telemetry_emitter()
