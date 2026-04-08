-- name: CreateAvailabilityRule :one
INSERT INTO availability_rules (
  business_id, staff_id, rule_type, timezone, start_local, end_local, rrule, effective_from, effective_until, default_capacity
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
RETURNING *;

-- name: UpdateAvailabilityRule :one
UPDATE availability_rules
SET rule_type = $2,
    timezone = $3,
    start_local = $4,
    end_local = $5,
    rrule = $6,
    effective_from = $7,
    effective_until = $8,
    default_capacity = $9,
    is_active = $10,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: ListAvailabilityRulesByStaff :many
SELECT * FROM availability_rules
WHERE staff_id = $1 AND ($2::bool = FALSE OR is_active = TRUE)
ORDER BY created_at DESC;

-- name: ListActiveRulesForStaffServiceRange :many
SELECT ar.*
FROM availability_rules ar
JOIN availability_rule_services ars
  ON ars.rule_id = ar.id
 AND ars.staff_id = ar.staff_id
WHERE ar.staff_id = $1
  AND ars.service_id = $2
  AND ar.is_active = TRUE
  AND ars.is_active = TRUE
  AND ar.effective_from <= $4::date
  AND (ar.effective_until IS NULL OR ar.effective_until >= $3::date)
ORDER BY ar.created_at DESC;

-- name: CreateAvailabilityRuleService :one
INSERT INTO availability_rule_services (rule_id, staff_id, service_id, capacity_override, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListAvailabilityRuleServicesByRule :many
SELECT * FROM availability_rule_services
WHERE rule_id = $1 AND ($2::bool = FALSE OR is_active = TRUE)
ORDER BY service_id;

-- name: ListRuleServicesByService :many
SELECT * FROM availability_rule_services
WHERE service_id = $1 AND is_active = TRUE
ORDER BY staff_id;

-- name: SetAvailabilityRuleServiceState :exec
UPDATE availability_rule_services
SET is_active = $3
WHERE rule_id = $1 AND service_id = $2;

-- name: GetAvailabilityRuleByID :one
SELECT * FROM availability_rules WHERE id = $1;

-- name: CreateAvailabilityException :one
INSERT INTO availability_exceptions (business_id, rule_id, staff_id, occurrence_start, reason)
VALUES ($1,$2,$3,$4,$5)
RETURNING *;

-- name: ListAvailabilityExceptionsByRuleRange :many
SELECT * FROM availability_exceptions
WHERE rule_id = $1
  AND occurrence_start >= $2
  AND occurrence_start <= $3
ORDER BY occurrence_start;

-- name: CreateAvailabilityOverride :one
INSERT INTO availability_overrides (
  business_id, rule_id, staff_id, original_occurrence_start, new_start, new_end, capacity, is_closed, is_active
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
RETURNING *;

-- name: ListAvailabilityOverridesByRuleRange :many
SELECT * FROM availability_overrides
WHERE rule_id = $1
  AND is_active = TRUE
  AND original_occurrence_start >= $2
  AND original_occurrence_start <= $3
ORDER BY original_occurrence_start;

-- name: CreateOverrideService :one
INSERT INTO override_services (override_id, service_id, is_active)
VALUES ($1,$2,$3)
RETURNING *;

-- name: ListOverrideServices :many
SELECT * FROM override_services
WHERE override_id = $1 AND is_active = TRUE;
