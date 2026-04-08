package availability

import (
	"context"
	"encoding/hex"
	"sort"
	"strconv"
	"time"

	"openhours-poc/backend/internal/db"

	"github.com/jackc/pgx/v5/pgtype"
	rrule "github.com/teambition/rrule-go"
)

type Slot struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// ResolvedWindow represents an availability window with recurrence provenance.
// It's used by the admin UI so it can render exceptions/overrides server-side.
type ResolvedWindow struct {
	Start time.Time
	End   time.Time

	// RuleID is non-nil when the window comes from an availability rule occurrence.
	RuleID *pgtype.UUID

	// OccurrenceStart is the original (pre-override) occurrence start time (UTC),
	// used to target exceptions/overrides for "this date only" edits.
	OccurrenceStart *time.Time
}

type Engine struct {
	queries *db.Queries
}

func New(q *db.Queries) *Engine { return &Engine{queries: q} }

type overrideWithServices struct {
	ov        db.AvailabilityOverride
	serviceID []pgtype.UUID // empty => applies to all services (back-compat)
}

func uuidEq(a, b pgtype.UUID) bool {
	if !a.Valid || !b.Valid {
		return false
	}
	return a.Bytes == b.Bytes
}

func uuidStr(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	// pgtype.UUID stores 16 raw bytes.
	b := u.Bytes[:]
	hexed := hex.EncodeToString(b)
	// 8-4-4-4-12
	return hexed[0:8] + "-" + hexed[8:12] + "-" + hexed[12:16] + "-" + hexed[16:20] + "-" + hexed[20:32]
}

func (o overrideWithServices) appliesToService(serviceID pgtype.UUID) bool {
	// If override has no scoped services, treat it as applying to all services.
	if len(o.serviceID) == 0 {
		return true
	}
	for _, s := range o.serviceID {
		if uuidEq(s, serviceID) {
			return true
		}
	}
	return false
}

func (e *Engine) GetAvailability(ctx context.Context, staffID, serviceID pgtype.UUID, from, to time.Time, serviceDurationMin int32, requestedCapacity int32) ([]Slot, error) {
	if requestedCapacity <= 0 {
		requestedCapacity = 1
	}
	rules, err := e.queries.ListActiveRulesForStaffServiceRange(ctx, db.ListActiveRulesForStaffServiceRangeParams{
		StaffID: staffID,
		ServiceID: serviceID,
		Column3: date(from),
		Column4: date(to),
	})
	if err != nil {
		return nil, err
	}

	windows := make([]Slot, 0, 64)

	for _, r := range rules {
		ruleWindows, err := expandRuleWindows(r, from, to)
		if err != nil {
			continue
		}
		exceptions, _ := e.queries.ListAvailabilityExceptionsByRuleRange(ctx, db.ListAvailabilityExceptionsByRuleRangeParams{RuleID: r.ID, OccurrenceStart: ts(from), OccurrenceStart_2: ts(to)})
		overrides, _ := e.queries.ListAvailabilityOverridesByRuleRange(ctx, db.ListAvailabilityOverridesByRuleRangeParams{RuleID: r.ID, OriginalOccurrenceStart: ts(from), OriginalOccurrenceStart_2: ts(to)})

		excluded := map[int64]bool{}
		for _, ex := range exceptions {
			// Admin endpoints can insert inconsistent staff_id; engine should only apply
			// exceptions for the staff that we're currently expanding.
			if uuidEq(ex.StaffID, staffID) {
				excluded[ex.OccurrenceStart.Time.Unix()] = true
			}
		}
		overrideMap := map[int64]overrideWithServices{}
		for _, ov := range overrides {
			// Overrides are occurrence-level: when present, they replace the base occurrence.
			// Service scoping controls which services get the replaced window; non-listed
			// services should not show the base occurrence for that date.
			if !uuidEq(ov.StaffID, staffID) {
				continue
			}
			svcs, err := e.queries.ListOverrideServices(ctx, ov.ID)
			if err != nil {
				return nil, err
			}
			scoped := make([]pgtype.UUID, 0, len(svcs))
			for _, s := range svcs {
				scoped = append(scoped, s.ServiceID)
			}
			overrideMap[ov.OriginalOccurrenceStart.Time.Unix()] = overrideWithServices{ov: ov, serviceID: scoped}
		}

		for _, win := range ruleWindows {
			k := win.Start.Unix()
			if excluded[k] {
				continue
			}
			if ows, ok := overrideMap[k]; ok {
				if ows.ov.IsClosed {
					continue
				}
				// If the override exists but does not apply to this service,
				// the base occurrence is suppressed for this service.
				if !ows.appliesToService(serviceID) {
					continue
				}
				win.Start = ows.ov.NewStart.Time
				win.End = ows.ov.NewEnd.Time
			}
			windows = append(windows, win)
		}
	}

	// Also include windows that come purely from overrides even if the rule no longer
	// lists this service in availability_rule_services (override-only availabilities).
	// These are constructed directly from override new_start/new_end when the override
	// is scoped to this service.
	overrideOnlyWindows := []Slot{}
	// Look up all overrides for this staff+service in range, regardless of rule_services.
	ovRules, err := e.queries.ListAvailabilityRulesByStaff(ctx, db.ListAvailabilityRulesByStaffParams{
		StaffID: staffID,
		Column2: true,
	})
	if err == nil {
		for _, r := range ovRules {
			ovrs, _ := e.queries.ListAvailabilityOverridesByRuleRange(ctx, db.ListAvailabilityOverridesByRuleRangeParams{
				RuleID:                 r.ID,
				OriginalOccurrenceStart:   ts(from),
				OriginalOccurrenceStart_2: ts(to),
			})
			for _, ov := range ovrs {
				if !uuidEq(ov.StaffID, staffID) || !ov.IsActive || ov.IsClosed {
					continue
				}
				svcs, err := e.queries.ListOverrideServices(ctx, ov.ID)
				if err != nil {
					return nil, err
				}
				hasService := false
				for _, s := range svcs {
					if uuidEq(s.ServiceID, serviceID) {
						hasService = true
						break
					}
				}
				if !hasService {
					continue
				}
				// Respect the requested range.
				start := ov.NewStart.Time
				end := ov.NewEnd.Time
				if !start.Before(to) || !end.After(from) {
					continue
				}
				overrideOnlyWindows = append(overrideOnlyWindows, Slot{Start: start, End: end})
			}
		}
	}

	if len(overrideOnlyWindows) > 0 {
		windows = append(windows, overrideOnlyWindows...)
	}

	serviceDur := time.Duration(serviceDurationMin) * time.Minute
	if serviceDur <= 0 {
		serviceDur = 30 * time.Minute
	}
	slots := splitWindows(windows, serviceDur, from, to)

	// sqlc parameter mapping:
	//   $2 -> bookings.end_at > $2  (we pass `from`)
	//   $3 -> bookings.start_at < $3 (we pass `to`)
	bookings, err := e.queries.ListBookingsByStaffRange(ctx, db.ListBookingsByStaffRangeParams{StaffID: staffID, EndAt: ts(from), StartAt: ts(to)})
	if err != nil {
		return nil, err
	}
	slots = removeBooked(slots, bookings)

	sort.Slice(slots, func(i, j int) bool { return slots[i].Start.Before(slots[j].Start) })
	return dedupe(slots), nil
}

func (e *Engine) GetResolvedWindows(ctx context.Context, staffID, serviceID pgtype.UUID, from, to time.Time) ([]ResolvedWindow, error) {
	rules, err := e.queries.ListActiveRulesForStaffServiceRange(ctx, db.ListActiveRulesForStaffServiceRangeParams{
		StaffID: staffID,
		ServiceID: serviceID,
		Column3: date(from),
		Column4: date(to),
	})
	if err != nil {
		return nil, err
	}

	out := make([]ResolvedWindow, 0, 64)
	seen := map[string]bool{}

	for _, r := range rules {
		ruleWindows, err := expandRuleWindows(r, from, to)
		if err != nil {
			continue
		}

		exceptions, _ := e.queries.ListAvailabilityExceptionsByRuleRange(ctx, db.ListAvailabilityExceptionsByRuleRangeParams{
			RuleID: r.ID,
			OccurrenceStart:   ts(from),
			OccurrenceStart_2: ts(to),
		})

		overrides, _ := e.queries.ListAvailabilityOverridesByRuleRange(ctx, db.ListAvailabilityOverridesByRuleRangeParams{
			RuleID: r.ID,
			OriginalOccurrenceStart:   ts(from),
			OriginalOccurrenceStart_2: ts(to),
		})

		excluded := map[int64]bool{}
		for _, ex := range exceptions {
			// Admin endpoints can insert inconsistent staff_id; engine should only apply
			// exceptions for the staff that we're currently expanding.
			if uuidEq(ex.StaffID, staffID) {
				excluded[ex.OccurrenceStart.Time.Unix()] = true
			}
		}

		overrideMap := map[int64]overrideWithServices{}
		for _, ov := range overrides {
			// Overrides are occurrence-level: when present, they replace the base occurrence.
			// Service scoping controls which services get the replaced window; non-listed
			// services should not show the base occurrence for that date.
			if !uuidEq(ov.StaffID, staffID) {
				continue
			}
			svcs, err := e.queries.ListOverrideServices(ctx, ov.ID)
			if err != nil {
				return nil, err
			}
			scoped := make([]pgtype.UUID, 0, len(svcs))
			for _, s := range svcs {
				scoped = append(scoped, s.ServiceID)
			}
			overrideMap[ov.OriginalOccurrenceStart.Time.Unix()] = overrideWithServices{ov: ov, serviceID: scoped}
		}

		for _, win := range ruleWindows {
			origStart := win.Start
			k := origStart.Unix()
			if excluded[k] {
				continue
			}

			// Apply override if present; keep provenance as "this occurrence of the original series".
			if ows, ok := overrideMap[k]; ok {
				if ows.ov.IsClosed {
					continue
				}
				// If the override exists but does not apply to this service,
				// the base occurrence is suppressed for this service.
				if !ows.appliesToService(serviceID) {
					continue
				}
				win.Start = ows.ov.NewStart.Time
				win.End = ows.ov.NewEnd.Time
			}

			rid := r.ID
			oc := origStart
			rw := ResolvedWindow{
				Start: win.Start,
				End:   win.End,
				RuleID: &rid,
				OccurrenceStart: &oc,
			}
			k2 := uuidStr(rid) + "|" + strconv.FormatInt(oc.Unix(), 10) + "|" + strconv.FormatInt(rw.Start.Unix(), 10) + "|" + strconv.FormatInt(rw.End.Unix(), 10)
			if !seen[k2] {
				seen[k2] = true
				out = append(out, rw)
			}
		}
	}

	// Also include windows that come purely from overrides even if the rule no longer
	// lists this service in availability_rule_services (override-only admin view).
	ovRules, err := e.queries.ListAvailabilityRulesByStaff(ctx, db.ListAvailabilityRulesByStaffParams{
		StaffID:  staffID,
		Column2:  true,
	})
	if err == nil {
		for _, rr := range ovRules {
			ovrs, _ := e.queries.ListAvailabilityOverridesByRuleRange(ctx, db.ListAvailabilityOverridesByRuleRangeParams{
				RuleID:                 rr.ID,
				OriginalOccurrenceStart:   ts(from),
				OriginalOccurrenceStart_2: ts(to),
			})
			for _, ov := range ovrs {
				if !uuidEq(ov.StaffID, staffID) || !ov.IsActive || ov.IsClosed {
					continue
				}
				svcs, err := e.queries.ListOverrideServices(ctx, ov.ID)
				if err != nil {
					return nil, err
				}
				hasService := false
				for _, s := range svcs {
					if uuidEq(s.ServiceID, serviceID) {
						hasService = true
						break
					}
				}
				if !hasService {
					continue
				}

				orig := ov.OriginalOccurrenceStart.Time
				rid := rr.ID
				oc := orig
				rw := ResolvedWindow{
					Start:           ov.NewStart.Time,
					End:             ov.NewEnd.Time,
					RuleID:          &rid,
					OccurrenceStart: &oc,
				}
				k2 := uuidStr(rid) + "|" + strconv.FormatInt(oc.Unix(), 10) + "|" + strconv.FormatInt(rw.Start.Unix(), 10) + "|" + strconv.FormatInt(rw.End.Unix(), 10)
				if !seen[k2] {
					seen[k2] = true
					out = append(out, rw)
				}
			}
		}
	}

	return out, nil
}

func expandRuleWindows(r db.AvailabilityRule, from, to time.Time) ([]Slot, error) {
	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		loc = time.UTC
	}
	startClock := r.StartLocal.Time.In(loc)
	endClock := r.EndLocal.Time.In(loc)
	dur := endClock.Sub(startClock)
	if dur <= 0 {
		dur = 30 * time.Minute
	}

	anchor := time.Date(r.EffectiveFrom.Time.Year(), r.EffectiveFrom.Time.Month(), r.EffectiveFrom.Time.Day(), startClock.Hour(), startClock.Minute(), 0, 0, loc)
	opt, err := rrule.StrToROption(r.Rrule)
	if err != nil {
		return nil, err
	}
	opt.Dtstart = anchor
	if r.EffectiveUntil.Valid {
		opt.Until = time.Date(r.EffectiveUntil.Time.Year(), r.EffectiveUntil.Time.Month(), r.EffectiveUntil.Time.Day(), 23, 59, 59, 0, loc)
	}
	rr, err := rrule.NewRRule(*opt)
	if err != nil {
		return nil, err
	}

	occs := rr.Between(from.In(loc), to.In(loc), true)
	out := make([]Slot, 0, len(occs))
	for _, occ := range occs {
		start := time.Date(occ.Year(), occ.Month(), occ.Day(), startClock.Hour(), startClock.Minute(), 0, 0, loc)
		end := start.Add(dur)
		out = append(out, Slot{Start: start.UTC(), End: end.UTC()})
	}
	return out, nil
}

func splitWindows(windows []Slot, d time.Duration, from, to time.Time) []Slot {
	out := make([]Slot, 0, len(windows)*4)
	for _, w := range windows {
		cur := w.Start
		for cur.Add(d).Equal(w.End) || cur.Add(d).Before(w.End) {
			nxt := cur.Add(d)
			if (cur.Equal(from) || cur.After(from)) && (nxt.Equal(to) || nxt.Before(to)) {
				out = append(out, Slot{Start: cur, End: nxt})
			}
			cur = nxt
		}
	}
	return out
}

func removeBooked(slots []Slot, bookings []db.Booking) []Slot {
	out := make([]Slot, 0, len(slots))
	for _, s := range slots {
		blocked := false
		for _, b := range bookings {
			if overlap(s.Start, s.End, b.StartAt.Time, b.EndAt.Time) {
				blocked = true
				break
			}
		}
		if !blocked {
			out = append(out, s)
		}
	}
	return out
}

func overlap(aStart, aEnd, bStart, bEnd time.Time) bool {
	return aStart.Before(bEnd) && bStart.Before(aEnd)
}

func dedupe(in []Slot) []Slot {
	seen := map[int64]bool{}
	out := make([]Slot, 0, len(in))
	for _, s := range in {
		k := s.Start.UnixNano()
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, s)
	}
	return out
}

func date(t time.Time) pgtype.Date { return pgtype.Date{Time: t, Valid: true} }
func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }
