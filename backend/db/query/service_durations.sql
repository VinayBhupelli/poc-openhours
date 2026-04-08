-- name: ListServiceDurations :many
SELECT * FROM service_durations
WHERE service_id = $1 AND is_active = TRUE
ORDER BY duration_minutes;

-- name: CreateServiceDuration :one
INSERT INTO service_durations (service_id, duration_minutes, price_cents, is_active)
VALUES ($1, $2, $3, TRUE)
RETURNING *;

-- name: UpdateServiceDuration :one
UPDATE service_durations
SET duration_minutes = $2,
    price_cents = $3,
    is_active = $4
WHERE id = $1
RETURNING *;

-- name: DeleteServiceDuration :exec
UPDATE service_durations SET is_active = FALSE WHERE id = $1;

-- name: DeleteServiceDurationsByService :exec
UPDATE service_durations SET is_active = FALSE WHERE service_id = $1;
