package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var serviceID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// RegisterService creates (or replaces the key of) a service that may ask for awards and
// returns its key, which is shown only now: Profile keeps a hash.
func RegisterService(ctx context.Context, db *pgxpool.Pool, id, name string) (string, error) {
	if !serviceID.MatchString(id) || id == "admin" || name == "" || len(name) > 80 {
		return "", errors.New("give a service id of lowercase letters, digits or - (not admin) and a name of at most 80 characters")
	}
	key := ID() + ID()
	_, err := db.Exec(ctx, `INSERT INTO services(id,name,key_hash) VALUES($1,$2,$3)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,key_hash=EXCLUDED.key_hash,enabled=true`, id, name, hash(key))
	return key, err
}

// DisableService stops a service's key.
func DisableService(ctx context.Context, db *pgxpool.Pool, id string) error {
	tag, err := db.Exec(ctx, `UPDATE services SET enabled=false WHERE id=$1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		err = errors.New("no such service")
	}
	return err
}

// service authenticates a service by X-Service-ID and X-Service-Key.
func (s *Server) service(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, key := r.Header.Get("X-Service-ID"), r.Header.Get("X-Service-Key")
	var stored string
	err := s.DB.QueryRow(r.Context(), `SELECT key_hash FROM services WHERE id=$1 AND enabled`, id).Scan(&stored)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		internal(w, err)
		return "", false
	}
	if err != nil || len(key) < 32 || subtle.ConstantTimeCompare([]byte(hash(key)), []byte(stored)) != 1 {
		problem(w, 401, "SERVICE_UNAUTHORIZED", "服务凭证无效")
		return "", false
	}
	return id, true
}

// GrantedDan is what an award did to a 段位 badge.
type GrantedDan struct {
	Index    int  `json:"index"`
	Verdict  int  `json:"verdict"`
	Previous *int `json:"previous"`
	Upgraded bool `json:"upgraded"`
}

// GrantedTitle is a title an award asked for; New is false when the player already had it.
type GrantedTitle struct {
	Title
	New bool `json:"new"`
}

// SkippedTitle is a title an award asked for and could not give: no such title (not_found), an
// official title from a community course (official_only), or another player's community title
// (not_owner).
type SkippedTitle struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

type Granted struct {
	Dan     *GrantedDan    `json:"dan"`
	Titles  []GrantedTitle `json:"titles"`
	Skipped []SkippedTitle `json:"skipped"`
}

// award is POST /internal/v1/awards, for services that ran a 段位 course: the attempt (key,
// unique per service), the player, the course and its maker, whether it is official, the
// verdict (0 failed, 1–3 red, 4–6 gold), the 段位 the course stands for (official courses only; 五級 6 .. 達人 24)
// and the titles it gives on a pass. A failed attempt is recorded and gives nothing. A badge
// only goes up. A title the course may not give is skipped and the rest are given: official
// titles come from official courses only, and a player's community title from that player's
// courses only (the ones administrators keep from any course). Asking again with the same key
// returns what was granted the first time.
func (s *Server) award(w http.ResponseWriter, r *http.Request) {
	service, ok := s.service(w, r)
	if !ok {
		return
	}
	var body struct {
		Key         string   `json:"key"`
		UserID      string   `json:"userId"`
		CourseID    string   `json:"courseId"`
		CourseTitle string   `json:"courseTitle"`
		CourseOwner string   `json:"courseOwnerId"`
		Official    bool     `json:"official"`
		Verdict     int      `json:"verdict"`
		Dan         *int     `json:"dan"`
		Titles      []string `json:"titles"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Key) < 1 || len(body.Key) > 100 || !validSubject(body.UserID) || len(body.CourseID) > 100 || len(body.CourseTitle) > 200 || (body.CourseOwner != "" && !validSubject(body.CourseOwner)) ||
		body.Verdict < 0 || body.Verdict > 6 || (body.Dan != nil && (*body.Dan < danFirst || *body.Dan > 24)) || len(body.Titles) > 10 || (body.Dan != nil && !body.Official) {
		problem(w, 422, "AWARD_INVALID", "奖励请求无效")
		return
	}
	ctx := r.Context()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(ctx)
	// The player's awards one at a time, so two attempts cannot both "upgrade" a badge.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('award:'||$1,0))`, body.UserID); err != nil {
		internal(w, err)
		return
	}
	var award int64
	err = tx.QueryRow(ctx, `INSERT INTO awards(service,request_key,user_id,course_id,course_title,official,verdict,dan) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
 ON CONFLICT(service,request_key) DO NOTHING RETURNING id`, service, body.Key, body.UserID, body.CourseID, body.CourseTitle, body.Official, body.Verdict, body.Dan).Scan(&award)
	if errors.Is(err, pgx.ErrNoRows) {
		var user string
		var granted []byte
		if err = tx.QueryRow(ctx, `SELECT user_id,granted FROM awards WHERE service=$1 AND request_key=$2`, service, body.Key).Scan(&user, &granted); err != nil {
			internal(w, err)
			return
		}
		if user != body.UserID {
			problem(w, 409, "AWARD_CONFLICT", "该挑战已用于其他玩家")
			return
		}
		s.respondAward(w, ctx, body.UserID, granted)
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	granted := Granted{Titles: []GrantedTitle{}, Skipped: []SkippedTitle{}}
	if body.Verdict >= 1 {
		for _, id := range body.Titles {
			t, err := scanTitle(tx.QueryRow(ctx, `SELECT `+titleColumns+` FROM titles t WHERE t.id=$1`, id))
			reason := ""
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				reason = "not_found"
			case err != nil:
				internal(w, err)
				return
			case t.Official && !body.Official:
				reason = "official_only"
			case !t.Official && t.OwnerID != nil && *t.OwnerID != body.CourseOwner:
				reason = "not_owner"
			}
			if reason != "" {
				granted.Skipped = append(granted.Skipped, SkippedTitle{ID: id, Reason: reason})
				continue
			}
			tag, err := tx.Exec(ctx, `INSERT INTO user_titles(user_id,title_id,award_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, body.UserID, id, award)
			if err != nil {
				internal(w, err)
				return
			}
			granted.Titles = append(granted.Titles, GrantedTitle{Title: t, New: tag.RowsAffected() == 1})
		}
		if body.Dan != nil {
			d := GrantedDan{Index: *body.Dan, Verdict: body.Verdict}
			var previous int
			err = tx.QueryRow(ctx, `SELECT verdict FROM user_dans WHERE user_id=$1 AND dan=$2`, body.UserID, *body.Dan).Scan(&previous)
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				d.Upgraded = true
			case err != nil:
				internal(w, err)
				return
			default:
				d.Previous = &previous
				d.Upgraded = body.Verdict > previous
				if !d.Upgraded {
					d.Verdict = previous
				}
			}
			if d.Upgraded {
				_, err = tx.Exec(ctx, `INSERT INTO user_dans(user_id,dan,verdict,award_id,achieved_at) VALUES($1,$2,$3,$4,now())
 ON CONFLICT(user_id,dan) DO UPDATE SET verdict=EXCLUDED.verdict,award_id=EXCLUDED.award_id,achieved_at=now()`, body.UserID, *body.Dan, body.Verdict, award)
				if err != nil {
					internal(w, err)
					return
				}
			}
			granted.Dan = &d
		}
	}
	data, _ := json.Marshal(granted)
	if _, err = tx.Exec(ctx, `UPDATE awards SET granted=$2 WHERE id=$1`, award, data); err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		internal(w, err)
		return
	}
	s.respondAward(w, ctx, body.UserID, data)
}

func (s *Server) respondAward(w http.ResponseWriter, ctx context.Context, user string, granted []byte) {
	plate, err := s.nameplate(ctx, s.DB, user)
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, map[string]any{"granted": json.RawMessage(granted), "nameplate": plate})
}
