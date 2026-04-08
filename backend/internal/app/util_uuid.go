package app

import "github.com/jackc/pgx/v5/pgtype"

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	v, _ := u.Value()
	if v == nil {
		return ""
	}
	return v.(string)
}

