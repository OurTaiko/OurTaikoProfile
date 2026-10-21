#!/bin/sh
# Run the complete suite against a private disposable PostgreSQL cluster.
set -eu
cd "$(dirname "$0")/.."
export GOCACHE="${GOCACHE:-/tmp/profile-go-build}"
if [ -n "${DATABASE_TEST_URL:-}" ]; then
  go test -race ./... "$@"
  go vet ./...
  exit 0
fi
PG_BINDIR="${PG_BINDIR:-$(pg_config --bindir)}"
PROFILE_TEST_TMP="$(mktemp -d /tmp/profile-pg.XXXXXX)"
cleanup() {
  "$PG_BINDIR/pg_ctl" -D "$PROFILE_TEST_TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$PROFILE_TEST_TMP"
}
trap cleanup EXIT HUP INT TERM
"$PG_BINDIR/initdb" -D "$PROFILE_TEST_TMP/data" -A trust -U profile_test --no-locale -E UTF8 >"$PROFILE_TEST_TMP/init.log"
# Disable TCP. The socket and data are both in this test's private directory.
"$PG_BINDIR/pg_ctl" -D "$PROFILE_TEST_TMP/data" -l "$PROFILE_TEST_TMP/server.log" \
  -o "-k $PROFILE_TEST_TMP -p 55448 -c listen_addresses='' -c fsync=off" -w start >/dev/null
export DATABASE_TEST_URL="postgres://profile_test@/postgres?host=$PROFILE_TEST_TMP&port=55448&sslmode=disable"
go test -race ./... "$@"
go vet ./...
