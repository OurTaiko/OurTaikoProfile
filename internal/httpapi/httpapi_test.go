package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"ourtaiko.dev/profile/internal/database"
)

const (
	origin = "http://127.0.0.1:5175"
	player = "0000000000000000000000000000abcd"
	other  = "0000000000000000000000000000beef"
)

// testDB is a fresh database of the cluster in DATABASE_TEST_URL (scripts/test.sh starts
// one), migrated and dropped afterwards.
func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	base := os.Getenv("DATABASE_TEST_URL")
	if base == "" {
		t.Skip("DATABASE_TEST_URL not set; run scripts/test.sh")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("profile_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(base)
	u.Path = "/" + name
	pool, err := database.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		admin.Exec(context.Background(), "DROP DATABASE "+name+" WITH (FORCE)")
		admin.Close(context.Background())
	})
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return pool
}

type client struct {
	t       *testing.T
	handler http.Handler
	cookie  string
	csrf    string
}

func (c *client) do(method, path, body string, header map[string]string) *httptest.ResponseRecorder {
	c.t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	if method != "GET" && !strings.HasPrefix(path, "/internal/") {
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", c.csrf)
	}
	if c.cookie != "" {
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: c.cookie})
	}
	for k, v := range header {
		if v == "" {
			r.Header.Del(k)
		} else {
			r.Header.Set(k, v)
		}
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	return w
}

func (c *client) json(method, path, body string, status int, out any, header ...map[string]string) {
	c.t.Helper()
	var h map[string]string
	if len(header) > 0 {
		h = header[0]
	}
	w := c.do(method, path, body, h)
	if w.Code != status {
		c.t.Fatalf("%s %s: want %d got %d %s", method, path, status, w.Code, w.Body.String())
	}
	if out != nil {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			c.t.Fatal(err)
		}
	}
}

// signIn opens a development session for the player.
func (c *client) signIn() {
	c.t.Helper()
	w := c.do("GET", "/api/v1/auth/sso/login?returnTo=/me", "", nil)
	if w.Code != 303 || len(w.Result().Cookies()) != 1 {
		c.t.Fatal("dev sign-in", w.Code)
	}
	c.cookie = w.Result().Cookies()[0].Value
	var me struct {
		User      *User
		CSRFToken string
	}
	c.json("GET", "/api/v1/me", "", 200, &me)
	if me.User == nil || me.User.ID != player {
		c.t.Fatal("not signed in", me)
	}
	c.csrf = me.CSRFToken
}

func TestAwardsTitlesAndNameplates(t *testing.T) {
	pool := testDB(t)
	ctx := context.Background()
	app := New(pool, Config{Origin: origin, DevUserID: player})
	c := &client{t: t, handler: app.Handler()}
	key, err := RegisterService(ctx, pool, "fanmade", "OurTaiko Fanmade")
	if err != nil {
		t.Fatal(err)
	}
	auth := map[string]string{"X-Service-ID": "fanmade", "X-Service-Key": key}

	// An administrator (the development user is one) keeps the catalog.
	c.json("PUT", "/api/v1/admin/titles/kidou", `{"name":"太鼓の達人","nameTranslations":{"en":"Taiko Master"},"style":"gold","official":true}`, 401, nil)
	c.signIn()
	c.json("PUT", "/api/v1/admin/titles/kidou", `{"name":"太鼓の達人","nameTranslations":{"en":"Taiko Master"},"style":"gold","official":true}`, 200, nil)
	c.json("PUT", "/api/v1/admin/titles/fan", `{"name":"ファン","style":"wood","official":false}`, 200, nil)
	c.json("PUT", "/api/v1/admin/titles/Bad", `{"name":"x","style":"wood"}`, 422, nil)
	c.json("PUT", "/api/v1/admin/titles/odd", `{"name":"x","style":"neon"}`, 422, nil)
	var catalog struct{ Titles []Title }
	c.json("GET", "/api/v1/titles", "", 200, &catalog)
	if len(catalog.Titles) != 2 || catalog.Titles[0].ID != "kidou" || string(catalog.Titles[0].NameTranslations) != `{"en":"Taiko Master"}` {
		t.Fatal("catalog", catalog)
	}

	// Services prove themselves; browsers may not call them.
	award := func(body string, status int, out any, header map[string]string) {
		t.Helper()
		c.json("POST", "/internal/v1/awards", body, status, out, header)
	}
	award(`{"key":"x","userId":"`+player+`","verdict":1}`, 401, nil, map[string]string{"X-Service-ID": "fanmade", "X-Service-Key": strings.Repeat("0", 64)})
	award(`{"key":"x","userId":"`+player+`","verdict":1}`, 403, nil, map[string]string{"X-Service-ID": "fanmade", "X-Service-Key": key, "Origin": origin})

	type reply struct {
		Granted   Granted
		Nameplate Nameplate
	}
	var first reply
	award(`{"key":"attempt-1","userId":"`+player+`","courseId":"10","courseTitle":"十段","official":true,"verdict":2,"dan":20,"titles":["kidou"]}`, 200, &first, auth)
	if first.Granted.Dan == nil || !first.Granted.Dan.Upgraded || first.Granted.Dan.Previous != nil || len(first.Granted.Titles) != 1 || !first.Granted.Titles[0].New {
		t.Fatalf("first pass %+v", first.Granted)
	}
	if first.Nameplate.Dan == nil || first.Nameplate.Dan.Index != 20 || first.Nameplate.Dan.Gold || first.Nameplate.Title != nil {
		t.Fatalf("plate after first pass %+v", first.Nameplate)
	}
	var again reply
	award(`{"key":"attempt-1","userId":"`+player+`","courseId":"10","courseTitle":"十段","official":true,"verdict":2,"dan":20,"titles":["kidou"]}`, 200, &again, auth)
	if !again.Granted.Titles[0].New || !again.Granted.Dan.Upgraded {
		t.Fatal("the same attempt answers what it granted the first time", again.Granted)
	}
	award(`{"key":"attempt-1","userId":"`+other+`","verdict":2}`, 409, nil, auth)
	var lower reply
	award(`{"key":"attempt-2","userId":"`+player+`","official":true,"verdict":1,"dan":20,"titles":["kidou"]}`, 200, &lower, auth)
	if lower.Granted.Dan.Upgraded || lower.Granted.Dan.Verdict != 2 || *lower.Granted.Dan.Previous != 2 || lower.Granted.Titles[0].New {
		t.Fatalf("a badge only goes up %+v", lower.Granted)
	}
	var gold reply
	award(`{"key":"attempt-3","userId":"`+player+`","official":true,"verdict":5,"dan":20}`, 200, &gold, auth)
	if !gold.Granted.Dan.Upgraded || !gold.Nameplate.Dan.Gold {
		t.Fatalf("gold %+v", gold)
	}
	var failed reply
	award(`{"key":"attempt-4","userId":"`+player+`","official":true,"verdict":0,"dan":24,"titles":["kidou"]}`, 200, &failed, auth)
	if failed.Granted.Dan != nil || len(failed.Granted.Titles) != 0 || failed.Nameplate.Dan.Index != 20 {
		t.Fatalf("a failed attempt gives nothing %+v", failed)
	}
	award(`{"key":"attempt-5","userId":"`+player+`","official":false,"verdict":3,"titles":["kidou"]}`, 422, nil, auth)
	award(`{"key":"attempt-6","userId":"`+player+`","official":false,"verdict":3,"dan":3}`, 422, nil, auth)
	award(`{"key":"attempt-7","userId":"`+player+`","official":false,"verdict":3,"titles":["missing"]}`, 422, nil, auth)
	var community reply
	award(`{"key":"attempt-8","userId":"`+player+`","courseTitle":"みんなの段位","official":false,"verdict":3,"titles":["fan"]}`, 200, &community, auth)
	if len(community.Granted.Titles) != 1 || community.Granted.Titles[0].Official {
		t.Fatal("a community course gives community titles", community.Granted)
	}

	// The player wears one of their titles; the plate is public.
	c.json("PUT", "/api/v1/me/nameplate", `{"titleId":"nope","showDan":true}`, 422, nil)
	var worn Nameplate
	c.json("PUT", "/api/v1/me/nameplate", `{"titleId":"kidou","showDan":true}`, 200, &worn)
	if worn.Title == nil || worn.Title.Style != "gold" || worn.Dan == nil {
		t.Fatal("worn", worn)
	}
	public := &client{t: t, handler: app.Handler()}
	var plate Nameplate
	public.json("GET", "/api/v1/users/"+player+"/nameplate", "", 200, &plate)
	if plate.Title == nil || plate.Title.ID != "kidou" || !plate.Dan.Gold || plate.Dan.Index != 20 || plate.Nickname != "本地开发用户" {
		t.Fatal("public plate", plate)
	}
	var batch struct{ Nameplates map[string]Nameplate }
	w := public.do("GET", "/api/v1/nameplates?ids="+player+","+other+","+player, "", nil)
	if w.Code != 200 || w.Header().Get("Access-Control-Allow-Origin") != "*" || json.Unmarshal(w.Body.Bytes(), &batch) != nil ||
		len(batch.Nameplates) != 2 || batch.Nameplates[player].Title.ID != "kidou" || batch.Nameplates[other].Title != nil {
		t.Fatal("batch plates", w.Code, w.Body.String())
	}
	public.json("GET", "/api/v1/nameplates?ids=nope", "", 400, nil)
	c.json("PUT", "/api/v1/me/nameplate", `{"titleId":null,"showDan":false}`, 200, &worn)
	public.json("GET", "/api/v1/users/"+player+"/nameplate", "", 200, &plate)
	if plate.Title != nil || plate.Dan != nil || plate.ShowDan {
		t.Fatal("hidden", plate)
	}
	var held struct{ Titles []HeldTitle }
	public.json("GET", "/api/v1/users/"+player+"/titles", "", 200, &held)
	if len(held.Titles) != 2 || held.Titles[0].Title.ID != "fan" || held.Titles[0].CourseTitle != "みんなの段位" || held.Titles[1].Service != "fanmade" {
		t.Fatal("held titles", held)
	}
	var dans struct {
		Badges  []DanBadge
		History []AwardRecord
	}
	public.json("GET", "/api/v1/users/"+player+"/dans", "", 200, &dans)
	if len(dans.Badges) != 1 || dans.Badges[0].Verdict != 5 || len(dans.History) != 5 {
		t.Fatalf("dans %+v", dans)
	}

	// An administrator grants and takes back a title; a revoked key stops working.
	c.json("POST", "/api/v1/admin/grants", `{"userId":"`+other+`","titleId":"fan"}`, 200, nil)
	public.json("GET", "/api/v1/users/"+other+"/titles", "", 200, &held)
	if len(held.Titles) != 1 || held.Titles[0].Service != "admin" {
		t.Fatal("granted", held)
	}
	c.json("DELETE", "/api/v1/admin/grants", `{"userId":"`+other+`","titleId":"fan"}`, 200, nil)
	c.json("DELETE", "/api/v1/admin/grants", `{"userId":"`+other+`","titleId":"fan"}`, 404, nil)
	if err = DisableService(ctx, pool, "fanmade"); err != nil {
		t.Fatal(err)
	}
	award(`{"key":"attempt-9","userId":"`+player+`","verdict":1}`, 401, nil, auth)
	c.json("PUT", "/api/v1/me/nameplate", `{"titleId":null,"showDan":true}`, 403, nil, map[string]string{"Origin": "https://evil.test"})
}

func TestScoresOfEveryServiceInOneList(t *testing.T) {
	pool := testDB(t)
	row := func(id string, song any, score int64, level int, at string) map[string]any {
		return map[string]any{"id": id, "songId": song, "difficultyId": 1, "course": "Oni", "side": "single", "score": score, "level": level,
			"submittedAt": at, "title": "Song " + id, "titleTranslations": map[string]string{}, "isLatest": true, "ClearStatus": 1}
	}
	serve := func(rows []map[string]any, fail bool) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if fail || r.URL.Path != "/api/v1/users/"+player+"/scores" || r.URL.Query().Get("sort") != "recent" {
				w.WriteHeader(500)
				return
			}
			var page int
			fmt.Sscan(r.URL.Query().Get("page"), &page)
			start, end := min((page-1)*2, len(rows)), min(page*2, len(rows))
			json.NewEncoder(w).Encode(map[string]any{"items": rows[start:end], "total": len(rows)})
		}))
	}
	fanmade := serve([]map[string]any{
		row("f1", "11111111111111111111111111111111", 900000, 8, "2026-01-03T00:00:00Z"),
		row("f2", "22222222222222222222222222222222", 700000, 10, "2026-01-01T00:00:00Z"),
		row("f3", "33333333333333333333333333333333", 990000, 3, "2025-12-01T00:00:00Z"),
	}, false)
	defer fanmade.Close()
	database := serve([]map[string]any{row("d1", 101, 950000, 9, "2026-01-02T00:00:00Z")}, false)
	defer database.Close()
	down := serve(nil, true)
	defer down.Close()
	sources := []Source{
		{ID: "fanmade", Name: "Fanmade", API: fanmade.URL, Site: "https://fanmade.test"},
		{ID: "database", Name: "Database", API: database.URL, Site: "https://database.test"},
		{ID: "down", Name: "Down", API: down.URL, Site: "https://down.test"},
	}
	c := &client{t: t, handler: New(pool, Config{Origin: origin, Sources: sources}).Handler()}
	type page struct {
		Items   []SourceScore
		Total   int
		Sort    string
		Sources []struct {
			ID    string
			Count int
			Error string
		}
	}
	ids := func(p page) string {
		out := []string{}
		for _, item := range p.Items {
			out = append(out, item.Source+":"+item.ID)
		}
		return strings.Join(out, ",")
	}
	var merged page
	c.json("GET", "/api/v1/users/"+player+"/scores", "", 200, &merged)
	if merged.Sort != "level" || merged.Total != 4 || ids(merged) != "fanmade:f2,database:d1,fanmade:f1,fanmade:f3" {
		t.Fatalf("merged by level: %s %+v", ids(merged), merged)
	}
	if merged.Items[1].ChartURL != "https://database.test/charts/101" || merged.Items[0].ChartURL != "https://fanmade.test/charts/22222222222222222222222222222222" {
		t.Fatal("chart links", merged.Items[0].ChartURL, merged.Items[1].ChartURL)
	}
	if merged.Sources[2].Error == "" || merged.Sources[0].Count != 3 || merged.Sources[1].Count != 1 {
		t.Fatalf("a service that fails is reported %+v", merged.Sources)
	}
	c.json("GET", "/api/v1/users/"+player+"/scores?sort=recent", "", 200, &merged)
	if ids(merged) != "fanmade:f1,database:d1,fanmade:f2,fanmade:f3" {
		t.Fatal("merged by date", ids(merged))
	}
	c.json("GET", "/api/v1/users/"+player+"/scores?source=database&sort=score", "", 200, &merged)
	if ids(merged) != "database:d1" || len(merged.Sources) != 1 {
		t.Fatal("one service", ids(merged))
	}
	for _, query := range []string{"?view=x", "?sort=x", "?course=Ura", "?source=nope", "?page=0"} {
		c.json("GET", "/api/v1/users/"+player+"/scores"+query, "", 400, nil)
	}
	c.json("GET", "/api/v1/users/not-a-user/scores", "", 404, nil)
}

func TestTheWebsiteIsServedWithItsPageRoutes(t *testing.T) {
	pool := testDB(t)
	site := fstest.MapFS{
		"index.html":         {Data: []byte("<!doctype html><title>Profile</title>")},
		"assets/app-1234.js": {Data: []byte("console.log(1)")},
	}
	c := &client{t: t, handler: New(pool, Config{Origin: origin, Site: site}).Handler()}
	for _, path := range []string{"/", "/users/" + player, "/me"} {
		w := c.do("GET", path, "", nil)
		if w.Code != 200 || !strings.Contains(w.Body.String(), "<title>Profile</title>") || w.Header().Get("Cache-Control") != "no-cache" {
			t.Fatal(path, w.Code, w.Header())
		}
	}
	w := c.do("GET", "/assets/app-1234.js", "", nil)
	if w.Code != 200 || !strings.Contains(w.Header().Get("Cache-Control"), "immutable") {
		t.Fatal("asset", w.Code, w.Header())
	}
	if w = c.do("GET", "/assets/missing.js", "", nil); w.Code != 404 {
		t.Fatal("missing asset", w.Code)
	}
	if w = c.do("GET", "/api/v1/nothing", "", nil); w.Code != 404 || !strings.Contains(w.Body.String(), "NOT_FOUND") {
		t.Fatal("unknown API path", w.Code)
	}
}
