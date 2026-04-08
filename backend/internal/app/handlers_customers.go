package app

import (
	"net/http"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
)

func (a *API) listCustomers(w http.ResponseWriter, r *http.Request) {
	items, err := a.queries.ListCustomersByBusiness(r.Context(), db.ListCustomersByBusinessParams{BusinessID: a.business, Column2: true})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) createCustomer(w http.ResponseWriter, r *http.Request) {
	var req struct{ FullName, Email, Phone string }
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.CreateCustomer(r.Context(), db.CreateCustomerParams{BusinessID: a.business, FullName: req.FullName, Email: text(req.Email), Phone: text(req.Phone)})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 201, item)
}

func (a *API) updateCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	var req struct {
		FullName, Email, Phone string
		IsActive               bool
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.UpdateCustomer(r.Context(), db.UpdateCustomerParams{ID: id, FullName: req.FullName, Email: text(req.Email), Phone: text(req.Phone), IsActive: req.IsActive})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) deleteCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	existing, err := a.queries.GetCustomerByID(r.Context(), id)
	if err != nil {
		writeJSON(w, 404, map[string]any{"error": "not found"})
		return
	}
	item, err := a.queries.UpdateCustomer(r.Context(), db.UpdateCustomerParams{ID: id, FullName: existing.FullName, Email: existing.Email, Phone: existing.Phone, IsActive: false})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

