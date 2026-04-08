PROJECT_ROOT := $(shell pwd)
BACKEND_DIR := $(PROJECT_ROOT)/backend
FRONTEND_DIR := $(PROJECT_ROOT)/frontend

DB_DSN := postgresql://openhours:openhours@localhost:54329/openhours?sslmode=disable

.PHONY: up down migrate seed reset-data sqlc-generate backend-dev frontend-dev test integration-test

up:
	docker compose up -d postgres

down:
	docker compose down

migrate:
	cd $(BACKEND_DIR) && DATABASE_URL='$(DB_DSN)' go run ./cmd/migrate up

seed: migrate
	cd $(BACKEND_DIR) && DATABASE_URL='$(DB_DSN)' go run ./cmd/seed

# Empty all data tables (schema unchanged). Uses docker postgres service name from compose.
reset-data:
	docker exec -i openhours-postgres psql -U openhours -d openhours -v ON_ERROR_STOP=1 -f - < $(PROJECT_ROOT)/scripts/reset-db-data.sql

sqlc-generate:
	cd $(BACKEND_DIR) && sqlc generate

backend-dev:
	cd $(BACKEND_DIR) && DATABASE_URL='$(DB_DSN)' go run ./cmd/api

frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

test:
	cd $(BACKEND_DIR) && go test ./...

integration-test:
	cd $(BACKEND_DIR) && RUN_INTEGRATION=1 go test ./internal/tests/... && RUN_INTEGRATION=1 go test -tags=integration ./internal/app/...

