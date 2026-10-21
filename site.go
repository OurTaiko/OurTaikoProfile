// Package profile is OurTaikoProfile: the API server (cmd/server) with the website built
// into it.
package profile

import (
	"embed"
	"io/fs"
)

// The website as `pnpm build` in web/ leaves it.
//
//go:embed all:web/dist
var dist embed.FS

// Site is the built website; nil when it has not been built.
func Site() fs.FS {
	site, err := fs.Sub(dist, "web/dist")
	if err != nil {
		return nil
	}
	if _, err = fs.Stat(site, "index.html"); err != nil {
		return nil
	}
	return site
}
