#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py migrate --noinput
fi

# demo data for reviewers, skips workspaces that already exist so restarts keep their changes
if [ "${SEED_DEMO:-0}" = "1" ]; then
  python manage.py seed
fi

exec "$@"
