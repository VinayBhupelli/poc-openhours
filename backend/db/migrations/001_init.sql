-- bootstrap migration placeholder
CREATE TABLE IF NOT EXISTS bootstrap_marker (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
