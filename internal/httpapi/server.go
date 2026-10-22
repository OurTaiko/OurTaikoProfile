// Package httpapi is the OurTaikoProfile API and the server of its website.
package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"net/netip"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Origin       string
	CookieSecure bool
	// SSO is nil when no account center is configured; sign-in is then unavailable unless
	// DevUserID is set (local development only).
	SSO            *SSOClient
	DevUserID      string
	TrustedProxies []netip.Prefix
	// The services whose scores are shown, in display order.
	Sources []Source
	// The built website; nil serves only the API.
	Site fs.FS
}
type Server struct {
	DB     *pgxpool.Pool
	Config Config
	mu     sync.Mutex
	limits map[string]window
	scores *scoreCache
	client *http.Client
}
type window struct {
	since time.Time
	count int
}

func New(pool *pgxpool.Pool, cfg Config) *Server {
	return &Server{DB: pool, Config: cfg, limits: map[string]window{}, scores: newScoreCache(),
		client: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func ID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, status int, code, msg string) {
	respond(w, status, map[string]any{"code": code, "message": msg, "requestId": w.Header().Get("X-Request-ID")})
}
func internal(w http.ResponseWriter, err error) {
	log.Printf("request=%s error=%v", w.Header().Get("X-Request-ID"), err)
	problem(w, 503, "SERVICE_UNAVAILABLE", "服务暂时不可用，请稍后重试")
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		problem(w, 415, "CONTENT_TYPE_INVALID", "请使用 JSON 请求")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		problem(w, 400, "REQUEST_INVALID", "请求格式不正确")
		return false
	}
	return true
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if e := s.DB.Ping(ctx); e != nil {
			internal(w, e)
			return
		}
		respond(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/v1/auth/sso/login", s.ssoLogin)
	mux.HandleFunc("GET /api/v1/auth/sso/callback", s.ssoCallback)
	mux.HandleFunc("GET /api/v1/auth/account/{page}", s.accountRedirect)
	mux.HandleFunc("POST /api/v1/auth/logout", s.logout)
	mux.HandleFunc("GET /api/v1/me", s.me)
	mux.HandleFunc("PUT /api/v1/me/nameplate", s.wearNameplate)
	mux.HandleFunc("POST /api/v1/me/titles", s.createOwnTitle)
	mux.HandleFunc("PUT /api/v1/me/titles/{id}", s.saveOwnTitle)
	mux.HandleFunc("DELETE /api/v1/me/titles/{id}", s.deleteOwnTitle)
	mux.HandleFunc("GET /api/v1/sources", s.sources)
	mux.HandleFunc("GET /api/v1/titles", s.titleCatalog)
	mux.HandleFunc("GET /api/v1/users/{id}", s.userProfile)
	mux.HandleFunc("GET /api/v1/users/{id}/nameplate", s.userNameplate)
	mux.HandleFunc("GET /api/v1/nameplates", s.nameplates)
	mux.HandleFunc("GET /api/v1/users/{id}/scores", s.userScores)
	mux.HandleFunc("GET /api/v1/users/{id}/titles", s.userTitles)
	mux.HandleFunc("GET /api/v1/users/{id}/dans", s.userDans)
	mux.HandleFunc("PUT /api/v1/admin/titles/{id}", s.saveTitle)
	mux.HandleFunc("DELETE /api/v1/admin/titles/{id}", s.deleteTitle)
	mux.HandleFunc("POST /api/v1/admin/grants", s.grantTitle)
	mux.HandleFunc("DELETE /api/v1/admin/grants", s.revokeTitle)
	mux.HandleFunc("POST /internal/v1/awards", s.award)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { problem(w, 404, "NOT_FOUND", "接口不存在") })
	mux.HandleFunc("/internal/", func(w http.ResponseWriter, r *http.Request) { problem(w, 404, "NOT_FOUND", "接口不存在") })
	mux.HandleFunc("/", s.site)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Request-ID", ID())
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		api := strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/internal/")
		if api {
			w.Header().Set("Cache-Control", "no-store")
		}
		// Services call /internal/ from their servers, without an Origin; a browser always
		// sends one with a write.
		service := strings.HasPrefix(r.URL.Path, "/internal/")
		if r.Method != "GET" && r.Method != "HEAD" && ((service && r.Header.Get("Origin") != "") || (!service && r.Header.Get("Origin") != s.Config.Origin)) {
			problem(w, 403, "ORIGIN_INVALID", "请求来源无效，请从本站页面操作")
			return
		}
		if !service && ((r.Method != "GET" && r.Method != "HEAD") || r.URL.Path == "/api/v1/auth/sso/login") && !s.allow(r) {
			problem(w, 429, "RATE_LIMITED", "操作过于频繁，请稍后再试")
			return
		}
		if api {
			var finish func()
			w, finish = gzipJSON(w, r)
			defer finish()
		}
		defer func() {
			if e := recover(); e != nil {
				log.Printf("panic: %v", e)
				problem(w, 500, "INTERNAL_ERROR", "服务内部错误")
			}
		}()
		mux.ServeHTTP(w, r)
	})
}

// allow counts a write against its client's 40 a minute.
func (s *Server) allow(r *http.Request) bool {
	host := s.clientIP(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, v := range s.limits {
		if now.Sub(v.since) > time.Minute {
			delete(s.limits, k)
		}
	}
	limit := s.limits[host]
	if limit.since.IsZero() {
		limit.since = now
	}
	limit.count++
	s.limits[host] = limit
	return limit.count <= 40
}

// site serves the built website: a file that exists, else index.html for the page routes.
// Hashed assets are cached for a year, index.html never.
func (s *Server) site(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.Config.Site == nil {
		http.NotFound(w, r)
		return
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name != "" && name != "index.html" {
		if info, err := fs.Stat(s.Config.Site, name); err == nil && !info.IsDir() {
			if strings.HasPrefix(name, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=3600")
			}
			http.ServeFileFS(w, r, s.Config.Site, name)
			return
		}
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
	}
	page, err := fs.ReadFile(s.Config.Site, "index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
	w.Write(page)
}
