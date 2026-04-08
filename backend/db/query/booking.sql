-- name: CreateBooking :one
INSERT INTO bookings (
  business_id, staff_id, customer_id, service_id, start_at, end_at, status, source_rule_id, source_override_id
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
RETURNING *;

-- name: ListBookingsByStaffRange :many
SELECT * FROM bookings
WHERE staff_id = $1
  AND status = 'confirmed'
  AND end_at > $2
  AND start_at < $3
ORDER BY start_at;

-- name: ListBookingsByBusinessRange :many
SELECT * FROM bookings
WHERE business_id = $1
  AND ($2::bool = FALSE OR status = 'confirmed')
  AND end_at > $3
  AND start_at < $4
ORDER BY start_at;

-- name: CancelBooking :one
UPDATE bookings
SET status = 'cancelled',
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: CreateBookingURL :one
INSERT INTO booking_urls (business_id, staff_id, slug, is_active)
VALUES ($1,$2,$3,$4)
RETURNING *;

-- name: GetBookingURLBySlug :one
SELECT * FROM booking_urls
WHERE slug = $1 AND is_active = TRUE
LIMIT 1;

-- name: ListBookingURLsByBusiness :many
SELECT * FROM booking_urls
WHERE business_id = $1
ORDER BY created_at DESC;
