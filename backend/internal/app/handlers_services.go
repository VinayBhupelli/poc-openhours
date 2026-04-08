package app

import (
	"net/http"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (a *API) listServices(w http.ResponseWriter, r *http.Request) {
	items, err := a.queries.ListServicesByBusiness(r.Context(), db.ListServicesByBusinessParams{BusinessID: a.business, Column2: true})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) createService(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name                                                                      string
		DurationMinutes, BufferBeforeMinutes, BufferAfterMinutes, DefaultCapacity int32
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.CreateService(r.Context(), db.CreateServiceParams{
		BusinessID: a.business, Name: req.Name, DurationMinutes: req.DurationMinutes,
		BufferBeforeMinutes: req.BufferBeforeMinutes, BufferAfterMinutes: req.BufferAfterMinutes, DefaultCapacity: req.DefaultCapacity,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 201, item)
}

func (a *API) updateService(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	var req struct {
		Name                                                                      string
		DurationMinutes, BufferBeforeMinutes, BufferAfterMinutes, DefaultCapacity int32
		IsActive                                                                  bool
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.UpdateService(r.Context(), db.UpdateServiceParams{ID: id, Name: req.Name, DurationMinutes: req.DurationMinutes, BufferBeforeMinutes: req.BufferBeforeMinutes, BufferAfterMinutes: req.BufferAfterMinutes, DefaultCapacity: req.DefaultCapacity, IsActive: req.IsActive})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) deleteService(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	existing, err := a.queries.GetServiceByID(r.Context(), id)
	if err != nil {
		writeJSON(w, 404, map[string]any{"error": "not found"})
		return
	}
	item, err := a.queries.UpdateService(r.Context(), db.UpdateServiceParams{ID: id, Name: existing.Name, DurationMinutes: existing.DurationMinutes, BufferBeforeMinutes: existing.BufferBeforeMinutes, BufferAfterMinutes: existing.BufferAfterMinutes, DefaultCapacity: existing.DefaultCapacity, IsActive: false})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) listServiceDurations(w http.ResponseWriter, r *http.Request) {
	serviceID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service id"})
		return
	}
	items, err := a.queries.ListServiceDurations(r.Context(), serviceID)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if items == nil {
		items = []db.ServiceDuration{}
	}
	writeJSON(w, 200, items)
}

func (a *API) createServiceDuration(w http.ResponseWriter, r *http.Request) {
	serviceID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service id"})
		return
	}
	var req struct {
		DurationMinutes int32 `json:"duration_minutes"`
		PriceCents      int32 `json:"price_cents"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.CreateServiceDuration(r.Context(), db.CreateServiceDurationParams{
		ServiceID: serviceID, DurationMinutes: req.DurationMinutes,
		PriceCents: int4Ptr(req.PriceCents),
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 201, item)
}

func (a *API) updateServiceDuration(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	var req struct {
		DurationMinutes int32 `json:"duration_minutes"`
		PriceCents      int32 `json:"price_cents"`
		IsActive        bool  `json:"is_active"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.UpdateServiceDuration(r.Context(), db.UpdateServiceDurationParams{
		ID: id, DurationMinutes: req.DurationMinutes,
		PriceCents: int4Ptr(req.PriceCents), IsActive: req.IsActive,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) deleteServiceDuration(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	if err := a.queries.DeleteServiceDuration(r.Context(), id); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func int4Ptr(v int32) pgtype.Int4 {
	return pgtype.Int4{Int32: v, Valid: true}
}

