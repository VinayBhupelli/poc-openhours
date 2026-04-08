package app

import (
	"context"
	"net/http"
	"time"

	"openhours-poc/backend/internal/availability"
	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type API struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	engine   *availability.Engine
	business pgtype.UUID
}

func New(ctx context.Context, dsn string) (*API, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	a := &API{pool: pool, queries: db.New(pool)}
	a.engine = availability.New(a.queries)
	a.business = mustUUID("11111111-1111-1111-1111-111111111111")
	return a, nil
}

func (a *API) Close() { a.pool.Close() }

func (a *API) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// Auth + public booking flow
	r.Get("/v1/public/booking-url/{slug}", a.publicBookingURL)
	r.Get("/v1/public/services", a.publicServices)
	r.Get("/v1/public/staff", a.publicStaff)
	r.Get("/v1/public/availability", a.availabilityPreview)
	r.Post("/v1/public/bookings", a.createBooking)
	r.Get("/v1/public/bookings", a.listBookings)
	r.Get("/v1/public/services/{id}/durations", a.listServiceDurations)

	// Admin APIs (auth removed for this POC)
	// Staff
	r.Get("/v1/staff", a.listStaff)
	r.Post("/v1/staff", a.createStaff)
	r.Put("/v1/staff/{id}", a.updateStaff)
	r.Delete("/v1/staff/{id}", a.deleteStaff)

	// Services + service durations
	r.Get("/v1/services", a.listServices)
	r.Post("/v1/services", a.createService)
	r.Put("/v1/services/{id}", a.updateService)
	r.Delete("/v1/services/{id}", a.deleteService)
	r.Get("/v1/services/{id}/durations", a.listServiceDurations)
	r.Post("/v1/services/{id}/durations", a.createServiceDuration)
	r.Put("/v1/service-durations/{id}", a.updateServiceDuration)
	r.Delete("/v1/service-durations/{id}", a.deleteServiceDuration)

	// Customers
	r.Get("/v1/customers", a.listCustomers)
	r.Post("/v1/customers", a.createCustomer)
	r.Put("/v1/customers/{id}", a.updateCustomer)
	r.Delete("/v1/customers/{id}", a.deleteCustomer)

	// Bookings
	r.Get("/v1/bookings", a.listBookings)
	r.Delete("/v1/bookings/{id}", a.cancelBooking)

	// Booking URLs
	r.Get("/v1/booking-urls", a.listBookingURLs)
	r.Post("/v1/booking-urls", a.createBookingURL)

	// OpenHours (availability) CRUD + mutations
	r.Post("/v1/availability/rules", a.createRule)
	r.Put("/v1/availability/rules/{id}", a.updateRule)
	r.Get("/v1/availability/rules", a.listRules)

	r.Post("/v1/availability/rules/{id}/services", a.attachRuleService)
	r.Get("/v1/admin/open-hours/merged", a.adminMergedOpenHoursSlots)
	r.Post("/v1/availability/rules/{id}/mutations", a.mutateRule)

	// Booking helpers
	r.Get("/v1/bookings/available-staff", a.availableStaff)
	r.Get("/v1/bookings/availability", a.availabilityPreview)
	r.Post("/v1/bookings", a.createBooking)

	return r
}
