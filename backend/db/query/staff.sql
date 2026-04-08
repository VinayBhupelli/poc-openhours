-- name: CreateStaff :one
INSERT INTO staff (business_id, display_name, email)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListStaffByBusiness :many
SELECT * FROM staff
WHERE business_id = $1 AND ($2::bool = FALSE OR is_active = TRUE)
ORDER BY display_name;

-- name: ListStaffByService :many
-- Staff who can offer this service: explicit staff_services link, or an active
-- availability rule that includes the service (open hours), or an active
-- availability override scoped to the service.
SELECT st.*
FROM staff st
WHERE st.business_id = $2
  AND st.is_active = TRUE
  AND (
    EXISTS (
      SELECT 1 FROM staff_services ss
      WHERE ss.staff_id = st.id
        AND ss.service_id = $1
        AND ss.is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM availability_rule_services ars
      INNER JOIN availability_rules ar ON ar.id = ars.rule_id AND ar.staff_id = ars.staff_id
      WHERE ars.staff_id = st.id
        AND ars.service_id = $1
        AND ars.is_active = TRUE
        AND ar.is_active = TRUE
        AND ar.business_id = $2
    )
    OR EXISTS (
      SELECT 1
      FROM availability_overrides o
      JOIN override_services os ON os.override_id = o.id
      WHERE o.staff_id = st.id
        AND os.service_id = $1
        AND os.is_active = TRUE
        AND o.is_active = TRUE
        AND o.is_closed = FALSE
    )
  )
ORDER BY st.display_name;

-- name: GetStaffByID :one
SELECT * FROM staff WHERE id = $1 LIMIT 1;

-- name: UpdateStaff :one
UPDATE staff
SET display_name = $2,
    email = $3,
    is_active = $4,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
