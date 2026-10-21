package main

import (
	"context"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	profile "ourtaiko.dev/profile"
	"ourtaiko.dev/profile/internal/database"
	"ourtaiko.dev/profile/internal/httpapi"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loopback(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return host == "localhost" || (ip != nil && ip.IsLoopback())
}

func validUserID(id string) bool {
	b, err := hex.DecodeString(id)
	return err == nil && len(b) == 16 && strings.ToLower(id) == id
}

func main() {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatal("Cannot parse .env; check its syntax")
	}
	migrateOnly := flag.Bool("migrate", false, "apply migrations and exit")
	register := flag.String("register-service", "", "register a service that may ask for awards (with -service-name), print its key once and exit")
	name := flag.String("service-name", "", "the name of the service for -register-service")
	disable := flag.String("disable-service", "", "stop a service's key and exit")
	flag.Parse()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	pool, err := database.Open(ctx, env("DATABASE_URL", "postgres://localhost/ourtaiko_profile?host=/tmp&sslmode=disable"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}
	switch {
	case *migrateOnly:
		log.Print("PostgreSQL migrations completed")
		return
	case *register != "":
		key, err := httpapi.RegisterService(ctx, pool, *register, *name)
		if err != nil {
			log.Fatal(err)
		}
		// The key goes to stdout only, for the service's private configuration.
		fmt.Println(key)
		return
	case *disable != "":
		if err = httpapi.DisableService(ctx, pool, *disable); err != nil {
			log.Fatal(err)
		}
		log.Printf("service %s disabled", *disable)
		return
	}
	cancel()
	listen := env("LISTEN_ADDR", "127.0.0.1:8083")
	var sso *httpapi.SSOClient
	devUser := os.Getenv("DEV_USER_ID")
	if os.Getenv("SSO_ISSUER") != "" {
		if devUser != "" {
			log.Fatal("DEV_USER_ID cannot be combined with SSO_ISSUER")
		}
		sso, err = httpapi.NewSSO(httpapi.SSOConfig{Issuer: os.Getenv("SSO_ISSUER"), AvatarBaseURL: os.Getenv("SSO_AVATAR_BASE_URL"), ConnectAddress: os.Getenv("SSO_CONNECT_ADDRESS"), ServiceID: os.Getenv("SSO_SERVICE_ID"), ServiceKey: os.Getenv("SSO_SERVICE_KEY"), ClientID: os.Getenv("SSO_CLIENT_ID"), ClientSecret: os.Getenv("SSO_CLIENT_SECRET"), RedirectURL: os.Getenv("SSO_REDIRECT_URL"), EncryptionKey: os.Getenv("SESSION_ENCRYPTION_KEY")})
		if err != nil {
			log.Fatal(err)
		}
	} else if devUser != "" {
		if !validUserID(devUser) || !loopback(listen) {
			log.Fatal("DEV_USER_ID needs a 32-character lowercase hexadecimal ID and a loopback LISTEN_ADDR")
		}
		log.Printf("development sign-in enabled for user %s; never use this outside local development", devUser)
	} else {
		log.Print("no SSO_ISSUER: pages are public, sign-in is unavailable")
	}
	proxies, err := httpapi.ParseTrustedProxies(os.Getenv("TRUSTED_PROXY_CIDRS"))
	if err != nil {
		log.Fatal(err)
	}
	sources, err := httpapi.ParseSources(os.Getenv("SCORE_SOURCES"))
	if err != nil {
		log.Fatal(err)
	}
	site := profile.Site()
	if site == nil {
		log.Print("the website is not built (web/dist): serving the API only")
	}
	app := httpapi.New(pool, httpapi.Config{SSO: sso, DevUserID: devUser, TrustedProxies: proxies, Sources: sources, Site: site,
		Origin: env("APP_ORIGIN", "http://127.0.0.1:5175"), CookieSecure: env("COOKIE_SECURE", "false") == "true"})
	srv := &http.Server{Addr: listen, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	go func() {
		log.Printf("OurTaikoProfile listening on http://%s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	srv.Shutdown(shutdown)
}
