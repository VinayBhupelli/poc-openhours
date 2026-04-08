package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeJSON(r *http.Request, dst any) error {
	return json.NewDecoder(r.Body).Decode(dst)
}

func parseUUID(s string) (pgtype.UUID, error) {
	u, err := uuid.Parse(s)
	if err != nil {
		return pgtype.UUID{}, err
	}
	var out pgtype.UUID
	_ = out.Scan(u.String())
	return out, nil
}

func mustUUID(s string) pgtype.UUID {
	u, _ := parseUUID(s)
	return u
}

func text(v string) pgtype.Text {
	if v == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: v, Valid: true}
}

func int4(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

func dateFromTime(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}

// parseFlexibleTime accepts RFC3339 timestamps and date-only YYYY-MM-DD (UTC midnight).
func parseFlexibleTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty time string")
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	// "2006-01-02T15:04:05" without zone (treat as UTC)
	if len(s) >= 19 && s[10] == 'T' {
		if t, err := time.Parse("2006-01-02T15:04:05", s[:19]); err == nil {
			return t.UTC(), nil
		}
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	return time.Time{}, fmt.Errorf("cannot parse time: %q", s)
}

func parseFlexibleTimePtr(s *string) (*time.Time, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	t, err := parseFlexibleTime(*s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func ts(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// rekeyOccurrenceStart adjusts an occurrence_start UTC timestamp from an old
// rule's timing to a new rule's timing, preserving the calendar date.
// It extracts the local date from oldOccurrence using oldTZ + oldStartLocal,
// then recomputes the UTC occurrence using newTZ + newStartLocal.
func rekeyOccurrenceStart(oldOccurrence time.Time, oldTZ string, oldStartLocal time.Time, newTZ string, newStartLocal time.Time) (time.Time, error) {
	oldLoc, err := time.LoadLocation(oldTZ)
	if err != nil {
		return time.Time{}, fmt.Errorf("load old tz %q: %w", oldTZ, err)
	}
	localDate := oldOccurrence.In(oldLoc).Format("2006-01-02")

	newLoc, err := time.LoadLocation(newTZ)
	if err != nil {
		return time.Time{}, fmt.Errorf("load new tz %q: %w", newTZ, err)
	}
	// Match expandRuleWindows: interpret start_local's clock in the rule TZ (not UTC format string).
	// DB timestamps are often read as UTC; .In(newLoc) yields the same civil time the engine uses.
	newClock := newStartLocal.In(newLoc)
	newTimeOfDay := fmt.Sprintf("%02d:%02d:%02d", newClock.Hour(), newClock.Minute(), newClock.Second())
	newOcc, err := time.ParseInLocation("2006-01-02 15:04:05", localDate+" "+newTimeOfDay, newLoc)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse new occurrence: %w", err)
	}
	return newOcc.UTC(), nil
}
