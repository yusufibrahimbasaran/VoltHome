-- Schema for VoltHome Platform

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'USER' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS homes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    budget_quota DOUBLE PRECISION NOT NULL,
    current_balance DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    cumulative_energy_kwh DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    is_penalty_tariff BOOLEAN DEFAULT FALSE NOT NULL,
    tariff_rate DOUBLE PRECISION DEFAULT 2.5 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS appliances (
    id BIGSERIAL PRIMARY KEY,
    home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    safe_limit_watt DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS consumption_history (
    id BIGSERIAL PRIMARY KEY,
    home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total_kwh DOUBLE PRECISION NOT NULL,
    total_cost DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS event_logs (
    id BIGSERIAL PRIMARY KEY,
    home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id BIGSERIAL PRIMARY KEY,
    home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    recommendation_text TEXT NOT NULL,
    sent_to_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Dynamic Time-of-Use Tariff Schedule (Turkey EPDK 2024 rates)
CREATE TABLE IF NOT EXISTS tariff_schedule (
    id BIGSERIAL PRIMARY KEY,
    hour_start INTEGER NOT NULL,
    hour_end INTEGER NOT NULL,
    price_per_kwh DOUBLE PRECISION NOT NULL,
    label VARCHAR(100) NOT NULL
);

-- Seed default Turkey EPDK tariff bands (only if table is empty)
INSERT INTO tariff_schedule (hour_start, hour_end, price_per_kwh, label)
SELECT 0, 6, 2.10, 'Gece Tarifesi (00:00-06:00)'
WHERE NOT EXISTS (SELECT 1 FROM tariff_schedule);

INSERT INTO tariff_schedule (hour_start, hour_end, price_per_kwh, label)
SELECT 6, 22, 3.85, 'Gunduz Tarifesi (06:00-22:00)'
WHERE NOT EXISTS (SELECT 1 FROM tariff_schedule WHERE hour_start = 6);

INSERT INTO tariff_schedule (hour_start, hour_end, price_per_kwh, label)
SELECT 22, 24, 2.10, 'Gece Tarifesi (22:00-24:00)'
WHERE NOT EXISTS (SELECT 1 FROM tariff_schedule WHERE hour_start = 22);

-- IoT Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
    id BIGSERIAL PRIMARY KEY,
    home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    device_type VARCHAR(50) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_value DOUBLE PRECISION,
    action VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
