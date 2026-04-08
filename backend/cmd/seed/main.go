package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		panic("DATABASE_URL is required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	seed := []string{
		`INSERT INTO businesses (id, name, slug, timezone, is_active)
		 VALUES ('11111111-1111-1111-1111-111111111111', 'Vikings Salon', 'vikings', 'Asia/Kolkata', TRUE)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, timezone=EXCLUDED.timezone, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO staff (id, business_id, display_name, email, is_active)
		 VALUES ('7d4b5ab7-9ce8-4615-ab3a-92a7808edd16', '11111111-1111-1111-1111-111111111111', 'Jane Smith', 'jane.s@gmail.com', TRUE)
		 ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, email=EXCLUDED.email, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO staff (id, business_id, display_name, email, is_active)
		 VALUES ('7b7b0876-55c5-49e3-8d16-83d185af6035', '11111111-1111-1111-1111-111111111111', 'Roberto Jarvis', 'roberto.j@gmail.com', TRUE)
		 ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, email=EXCLUDED.email, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO customers (id, business_id, full_name, email, phone, is_active)
		 VALUES ('1948f559-dd2d-4d24-8c21-2358ab7b4c29', '11111111-1111-1111-1111-111111111111', 'Jerrie Maguire', 'jerry.m@gmail.com', NULL, TRUE)
		 ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email, phone=EXCLUDED.phone, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO services (id, business_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, default_capacity, is_active)
		 VALUES ('aa507fc3-8b22-4d69-b391-6adda4458290', '11111111-1111-1111-1111-111111111111', 'Haircut', 30, 0, 0, 1, TRUE)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, duration_minutes=EXCLUDED.duration_minutes, buffer_before_minutes=EXCLUDED.buffer_before_minutes, buffer_after_minutes=EXCLUDED.buffer_after_minutes, default_capacity=EXCLUDED.default_capacity, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO services (id, business_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, default_capacity, is_active)
		 VALUES ('e100d08d-e7e0-416c-96d5-4118eb3f21f0', '11111111-1111-1111-1111-111111111111', 'Shampoo', 30, 0, 0, 1, TRUE)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, duration_minutes=EXCLUDED.duration_minutes, buffer_before_minutes=EXCLUDED.buffer_before_minutes, buffer_after_minutes=EXCLUDED.buffer_after_minutes, default_capacity=EXCLUDED.default_capacity, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO services (id, business_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, default_capacity, is_active)
		 VALUES ('e308d1b5-1433-4d68-9b28-675813a3aed6', '11111111-1111-1111-1111-111111111111', 'Hairspa', 60, 0, 0, 1, TRUE)
		 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, duration_minutes=EXCLUDED.duration_minutes, buffer_before_minutes=EXCLUDED.buffer_before_minutes, buffer_after_minutes=EXCLUDED.buffer_after_minutes, default_capacity=EXCLUDED.default_capacity, is_active=TRUE, updated_at=NOW();`,
		`INSERT INTO service_durations (id, service_id, duration_minutes, price_cents, is_active)
		 VALUES ('46b63efd-602d-4088-85a8-ec8fd011bbf5', 'aa507fc3-8b22-4d69-b391-6adda4458290', 30, 1000, TRUE)
		 ON CONFLICT (id) DO UPDATE SET service_id=EXCLUDED.service_id, duration_minutes=EXCLUDED.duration_minutes, price_cents=EXCLUDED.price_cents, is_active=EXCLUDED.is_active;`,
		`INSERT INTO service_durations (id, service_id, duration_minutes, price_cents, is_active)
		 VALUES ('4523a7bd-e70a-45ef-a8ad-b5ce285f4d94', 'e100d08d-e7e0-416c-96d5-4118eb3f21f0', 30, 1000, TRUE)
		 ON CONFLICT (id) DO UPDATE SET service_id=EXCLUDED.service_id, duration_minutes=EXCLUDED.duration_minutes, price_cents=EXCLUDED.price_cents, is_active=EXCLUDED.is_active;`,
		`INSERT INTO service_durations (id, service_id, duration_minutes, price_cents, is_active)
		 VALUES ('91215271-cef6-41dd-b355-b1c4065f7d40', 'e308d1b5-1433-4d68-9b28-675813a3aed6', 60, 1000, TRUE)
		 ON CONFLICT (id) DO UPDATE SET service_id=EXCLUDED.service_id, duration_minutes=EXCLUDED.duration_minutes, price_cents=EXCLUDED.price_cents, is_active=EXCLUDED.is_active;`,
		`INSERT INTO booking_urls (id, business_id, slug, is_active)
		 VALUES ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'vikings', TRUE)
		 ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, is_active=TRUE;`,
	}

	for _, q := range seed {
		if _, err := pool.Exec(ctx, q); err != nil {
			panic(err)
		}
	}

	fmt.Println("seed complete: business + staff + customers + services + booking url")
}
