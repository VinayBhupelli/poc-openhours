CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    display_name TEXT NOT NULL,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    buffer_before_minutes INT NOT NULL DEFAULT 0,
    buffer_after_minutes INT NOT NULL DEFAULT 0,
    default_capacity INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_services (
    staff_id UUID NOT NULL REFERENCES staff(id),
    service_id UUID NOT NULL REFERENCES services(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    staff_id UUID NOT NULL REFERENCES staff(id),
    rule_type TEXT NOT NULL,
    timezone TEXT NOT NULL,
    start_local TIMESTAMP NOT NULL,
    end_local TIMESTAMP NOT NULL,
    rrule TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_until DATE,
    default_capacity INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, staff_id)
);

CREATE TABLE IF NOT EXISTS availability_rule_services (
    rule_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    capacity_override INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rule_id, service_id),
    FOREIGN KEY (rule_id, staff_id) REFERENCES availability_rules(id, staff_id)
);

CREATE TABLE IF NOT EXISTS availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    rule_id UUID NOT NULL REFERENCES availability_rules(id),
    staff_id UUID NOT NULL REFERENCES staff(id),
    occurrence_start TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, occurrence_start)
);

CREATE TABLE IF NOT EXISTS availability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    rule_id UUID NOT NULL REFERENCES availability_rules(id),
    staff_id UUID NOT NULL REFERENCES staff(id),
    original_occurrence_start TIMESTAMPTZ NOT NULL,
    new_start TIMESTAMPTZ NOT NULL,
    new_end TIMESTAMPTZ NOT NULL,
    capacity INT,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, original_occurrence_start)
);

CREATE TABLE IF NOT EXISTS override_services (
    override_id UUID NOT NULL REFERENCES availability_overrides(id),
    service_id UUID NOT NULL REFERENCES services(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (override_id, service_id)
);

CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    staff_id UUID NOT NULL REFERENCES staff(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    service_id UUID NOT NULL REFERENCES services(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('confirmed','cancelled')),
    source_rule_id UUID,
    source_override_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_urls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    staff_id UUID REFERENCES staff(id),
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_durations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    price_cents INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_business_active ON staff (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_services_business_active ON services (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_business_active ON customers (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_services_service_active_staff ON staff_services (service_id, is_active, staff_id);
CREATE INDEX IF NOT EXISTS idx_rules_staff_active ON availability_rules (staff_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rule_services_service_active_staff ON availability_rule_services (service_id, is_active, staff_id);
CREATE INDEX IF NOT EXISTS idx_rule_services_staff_active_rule ON availability_rule_services (staff_id, is_active, rule_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_rule_occurrence ON availability_exceptions (rule_id, occurrence_start);
CREATE INDEX IF NOT EXISTS idx_overrides_rule_occurrence ON availability_overrides (rule_id, original_occurrence_start);
CREATE INDEX IF NOT EXISTS idx_service_durations_service ON service_durations (service_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_service_start ON bookings (staff_id, service_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_business_start ON bookings (business_id, start_at);
