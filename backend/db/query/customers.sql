-- name: CreateCustomer :one
INSERT INTO customers (business_id, full_name, email, phone)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListCustomersByBusiness :many
SELECT * FROM customers
WHERE business_id = $1 AND ($2::bool = FALSE OR is_active = TRUE)
ORDER BY full_name;

-- name: GetCustomerByID :one
SELECT * FROM customers WHERE id = $1 LIMIT 1;

-- name: GetCustomerByBusinessEmail :one
SELECT * FROM customers
WHERE business_id = $1
  AND LOWER(TRIM(COALESCE(email::text, ''))) = LOWER(TRIM($2))
LIMIT 1;

-- name: UpdateCustomer :one
UPDATE customers
SET full_name = $2,
    email = $3,
    phone = $4,
    is_active = $5,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
