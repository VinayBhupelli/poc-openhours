package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "up" {
		log.Fatalf("usage: %s up", os.Args[0])
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`); err != nil {
		log.Fatalf("ensure schema_migrations: %v", err)
	}

	migDir := filepath.Join("db", "migrations")
	ents, err := os.ReadDir(migDir)
	if err != nil {
		log.Fatalf("read migrations dir: %v", err)
	}

	type mig struct {
		name string
		path string
	}
	var migs []mig
	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if !strings.HasSuffix(n, ".sql") {
			continue
		}
		migs = append(migs, mig{name: n, path: filepath.Join(migDir, n)})
	}
	sort.Slice(migs, func(i, j int) bool { return migs[i].name < migs[j].name })

	for _, m := range migs {
		var already bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, m.name).Scan(&already); err != nil {
			log.Fatalf("check migration %s: %v", m.name, err)
		}
		if already {
			continue
		}

		sqlBytes, err := os.ReadFile(m.path)
		if err != nil {
			log.Fatalf("read %s: %v", m.name, err)
		}
		sqlText := strings.TrimSpace(string(sqlBytes))
		if sqlText == "" {
			if _, err := conn.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1)`, m.name); err != nil {
				log.Fatalf("record empty migration %s: %v", m.name, err)
			}
			continue
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			log.Fatalf("begin tx %s: %v", m.name, err)
		}
		if _, err := tx.Exec(ctx, sqlText); err != nil {
			_ = tx.Rollback(ctx)
			log.Fatalf("apply %s: %v", m.name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1)`, m.name); err != nil {
			_ = tx.Rollback(ctx)
			log.Fatalf("record %s: %v", m.name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			log.Fatalf("commit %s: %v", m.name, err)
		}

		fmt.Printf("applied %s\n", m.name)
	}
}

