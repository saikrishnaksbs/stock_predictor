#!/bin/sh
set -e

# Only start the embedded mongod when nothing else is configured as the
# database — local dev (docker-compose.yml) explicitly points MONGO_URI at
# a separate `mongo` container and should NOT also boot one in here.
# This is what lets a single Dockerfile serve both:
#  - docker-compose (real, separate, persistent Mongo container), and
#  - a single-container free-tier host like Render (Mongo embedded here,
#    data does NOT survive a restart/sleep-wake — see render.yaml's comment).
EFFECTIVE_MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"

case "$EFFECTIVE_MONGO_URI" in
  *localhost*|*127.0.0.1*)
    echo "entrypoint: starting embedded mongod (MONGO_URI points at localhost)"
    mongod --dbpath /data/db --bind_ip 127.0.0.1 --logpath /var/log/mongod.log --fork

    echo "entrypoint: waiting for mongod to accept connections..."
    for i in $(seq 1 30); do
      if python -c "
import pymongo, sys
try:
    pymongo.MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=1000).admin.command('ping')
except Exception:
    sys.exit(1)
" 2>/dev/null; then
        echo "entrypoint: mongod is up"
        break
      fi
      sleep 1
    done
    ;;
  *)
    echo "entrypoint: MONGO_URI points elsewhere, not starting embedded mongod"
    ;;
esac

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
