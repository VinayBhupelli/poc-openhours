-- name: CreateService :one
INSERT INTO services (business_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, default_capacity)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListServicesByBusiness :many
SELECT * FROM services
WHERE business_id = $1 AND ($2::bool = FALSE OR is_active = TRUE)
ORDER BY name;

-- name: ListServicesByStaff :many
SELECT s.*
FROM services s
JOIN staff_services ss ON ss.service_id = s.id
WHERE ss.staff_id = $1
  AND s.business_id = $2
  AND ss.is_active = TRUE
  AND s.is_active = TRUE
ORDER BY s.name;

-- name: GetServiceByID :one
SELECT * FROM services WHERE id = $1 LIMIT 1;

-- name: UpdateService :one
UPDATE services
SET name = $2,
    duration_minutes = $3,
    buffer_before_minutes = $4,
    buffer_after_minutes = $5,
    default_capacity = $6,
    is_active = $7,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
