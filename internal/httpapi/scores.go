package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Source is a service whose public score list (GET /api/v1/users/{id}/scores) is shown.
// API is where this server reaches it; Site is its public website, for links.
type Source struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	API  string `json:"-"`
	Site string `json:"site"`
}

// DefaultSources are the two OurTaiko services.
var DefaultSources = []Source{
	{ID: "fanmade", Name: "OurTaiko Fanmade", API: "https://fanmade.ourtaiko.org", Site: "https://fanmade.ourtaiko.org"},
	{ID: "database", Name: "OurTaiko Database", API: "https://database.ourtaiko.org", Site: "https://database.ourtaiko.org"},
}

// ParseSources reads SCORE_SOURCES: a JSON array of {id, name, api, site}; empty is the default.
func ParseSources(raw string) ([]Source, error) {
	if strings.TrimSpace(raw) == "" {
		return DefaultSources, nil
	}
	var list []struct{ ID, Name, API, Site string }
	if err := json.Unmarshal([]byte(raw), &list); err != nil || len(list) == 0 {
		return nil, errors.New("SCORE_SOURCES must be a JSON array of {id, name, api, site}")
	}
	sources := []Source{}
	seen := map[string]bool{}
	for _, s := range list {
		for _, base := range []string{s.API, s.Site} {
			u, err := url.Parse(base)
			if err != nil || u.Host == "" || u.RawQuery != "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
				return nil, fmt.Errorf("source %q needs http(s) api and site URLs", s.ID)
			}
		}
		if s.ID == "" || s.ID == "all" || seen[s.ID] || s.Name == "" || strings.Trim(s.ID, "abcdefghijklmnopqrstuvwxyz0123456789-") != "" {
			return nil, fmt.Errorf("source id %q must be unique lowercase letters, digits or -", s.ID)
		}
		seen[s.ID] = true
		sources = append(sources, Source{ID: s.ID, Name: s.Name, API: strings.TrimRight(s.API, "/"), Site: strings.TrimRight(s.Site, "/")})
	}
	return sources, nil
}

// SourceScore is a row of a service's list as it gave it, with where it came from.
type SourceScore struct {
	ID                string          `json:"id"`
	SongID            json.RawMessage `json:"songId"`
	DifficultyID      int64           `json:"difficultyId"`
	Course            string          `json:"course"`
	Side              string          `json:"side"`
	Good              int64           `json:"good"`
	OK                int64           `json:"ok"`
	Bad               int64           `json:"bad"`
	Score             int64           `json:"score"`
	Drumroll          int64           `json:"drumroll"`
	MaxCombo          int64           `json:"max_combo"`
	ClearStatus       int             `json:"ClearStatus"`
	IsLatest          bool            `json:"isLatest"`
	SubmittedAt       time.Time       `json:"submittedAt"`
	Title             string          `json:"title"`
	TitleTranslations json.RawMessage `json:"titleTranslations"`
	Level             int             `json:"level"`
	BestClearStatus   *int            `json:"bestClearStatus,omitempty"`
	PlayCount         *int            `json:"playCount,omitempty"`
	Source            string          `json:"source"`
	ChartURL          string          `json:"chartUrl"`
	// The service kept the play's recording; ReplayURL opens it on the chart's page there. A
	// recording of files replaced since does not fit the chart any more and has no address.
	HasReplay bool   `json:"hasReplay"`
	ReplayURL string `json:"replayUrl,omitempty"`
}

const (
	scorePageSize = 50
	// A service's rows read for one list; a player with more sees the newest ones.
	sourceRowLimit = 2000
	scoreCacheTTL  = time.Minute
)

type sourceList struct {
	rows      []SourceScore
	truncated bool
	err       error
	at        time.Time
}

// scoreCache keeps each service's rows of a list for a minute.
type scoreCache struct {
	mu      sync.Mutex
	entries map[string]*sourceList
}

func newScoreCache() *scoreCache { return &scoreCache{entries: map[string]*sourceList{}} }

func (c *scoreCache) get(key string) *sourceList {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.entries[key]; ok && time.Since(v.at) < scoreCacheTTL {
		return v
	}
	return nil
}

func (c *scoreCache) put(key string, v *sourceList) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) > 2000 {
		for k, e := range c.entries {
			if time.Since(e.at) >= scoreCacheTTL {
				delete(c.entries, k)
			}
		}
		if len(c.entries) > 2000 {
			c.entries = map[string]*sourceList{}
		}
	}
	c.entries[key] = v
}

// fetch reads a user's whole list from one service, page by page, up to sourceRowLimit.
func (s *Server) fetch(ctx context.Context, source Source, user, view, course string) *sourceList {
	key := strings.Join([]string{source.ID, user, view, course}, "|")
	if cached := s.scores.get(key); cached != nil {
		return cached
	}
	list := &sourceList{rows: []SourceScore{}, at: time.Now()}
	for page := 1; ; page++ {
		query := url.Values{"view": {view}, "sort": {"recent"}, "page": {strconv.Itoa(page)}}
		if course != "" {
			query.Set("course", course)
		}
		var reply struct {
			Items []SourceScore `json:"items"`
			Total int           `json:"total"`
		}
		if err := s.getJSON(ctx, source.API+"/api/v1/users/"+user+"/scores?"+query.Encode(), &reply); err != nil {
			list.err = err
			return list
		}
		for _, row := range reply.Items {
			row.Source = source.ID
			id := strings.Trim(string(row.SongID), `"`)
			if id != "" && strings.Trim(id, "0123456789abcdef") == "" {
				row.ChartURL = source.Site + "/charts/" + id
				if row.HasReplay && row.IsLatest && row.ID != "" {
					row.ReplayURL = row.ChartURL + "?replay=" + url.QueryEscape(row.ID)
				}
			}
			list.rows = append(list.rows, row)
		}
		if len(reply.Items) == 0 || len(list.rows) >= reply.Total {
			break
		}
		if len(list.rows) >= sourceRowLimit {
			list.truncated = true
			break
		}
	}
	s.scores.put(key, list)
	return list
}

func (s *Server) getJSON(ctx context.Context, address string, out any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return errors.New("unreachable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	if err = json.NewDecoder(http.MaxBytesReader(nil, res.Body, 8<<20)).Decode(out); err != nil {
		return errors.New("invalid response")
	}
	return nil
}

var scoreOrders = map[string]func(a, b *SourceScore) bool{
	"recent": func(a, b *SourceScore) bool { return a.SubmittedAt.After(b.SubmittedAt) },
	"score": func(a, b *SourceScore) bool {
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		return a.SubmittedAt.After(b.SubmittedAt)
	},
	"level": func(a, b *SourceScore) bool {
		if a.Level != b.Level {
			return a.Level > b.Level
		}
		return a.Score > b.Score
	},
}

var scoreCourses = map[string]bool{"Easy": true, "Normal": true, "Hard": true, "Oni": true, "Edit": true}

// userScores is GET /api/v1/users/{id}/scores: the player's rows of every service (or one,
// source=<id>) in one list, public like the services' own. view=best (default) or all, sort
// level/score/recent (default level for best, recent for all), course, 50 rows a page. A
// service that does not answer is reported in sources[].error while the others still show.
func (s *Server) userScores(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validSubject(id) {
		problem(w, 404, "USER_NOT_FOUND", "用户不存在")
		return
	}
	query := r.URL.Query()
	view := query.Get("view")
	if view == "" {
		view = "best"
	}
	order := query.Get("sort")
	if order == "" {
		order = map[string]string{"best": "level", "all": "recent"}[view]
	}
	less, sorted := scoreOrders[order]
	course := query.Get("course")
	source := query.Get("source")
	if source == "" {
		source = "all"
	}
	page := 1
	if raw := query.Get("page"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 10000 {
			problem(w, 400, "QUERY_INVALID", "页码无效")
			return
		}
		page = n
	}
	selected := []Source{}
	for _, src := range s.Config.Sources {
		if source == "all" || source == src.ID {
			selected = append(selected, src)
		}
	}
	if (view != "best" && view != "all") || !sorted || (course != "" && !scoreCourses[course]) || len(selected) == 0 {
		problem(w, 400, "QUERY_INVALID", "查询参数无效")
		return
	}
	lists := make([]*sourceList, len(selected))
	var wait sync.WaitGroup
	for i, src := range selected {
		wait.Add(1)
		go func() {
			defer wait.Done()
			lists[i] = s.fetch(r.Context(), src, id, view, course)
		}()
	}
	wait.Wait()
	rows := []SourceScore{}
	type status struct {
		Source
		Count     int    `json:"count"`
		Truncated bool   `json:"truncated"`
		Error     string `json:"error,omitempty"`
	}
	statuses := []status{}
	for i, list := range lists {
		st := status{Source: selected[i], Count: len(list.rows), Truncated: list.truncated}
		if list.err != nil {
			st.Error = list.err.Error()
		}
		statuses = append(statuses, st)
		rows = append(rows, list.rows...)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := &rows[i], &rows[j]
		if less(a, b) {
			return true
		}
		if less(b, a) {
			return false
		}
		if a.Source != b.Source {
			return a.Source < b.Source
		}
		return a.ID < b.ID
	})
	total := len(rows)
	start := min((page-1)*scorePageSize, total)
	end := min(start+scorePageSize, total)
	respond(w, 200, map[string]any{"items": rows[start:end], "total": total, "page": page, "pageSize": scorePageSize, "view": view, "sort": order, "sources": statuses})
}

func (s *Server) sources(w http.ResponseWriter, r *http.Request) {
	respond(w, 200, map[string]any{"sources": s.Config.Sources})
}
