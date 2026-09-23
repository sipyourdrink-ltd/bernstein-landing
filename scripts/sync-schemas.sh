#!/usr/bin/env bash
# Copy the published JSON Schemas from a bernstein checkout into public/schemas/.
#
# Each schema's $id is https://bernstein.run/schemas/<file name>, so the file
# served here must be the document the id names. A published version is
# immutable: a change ships as a new file with a new version suffix, never as
# an edit to an existing one. This script refuses to overwrite a differing
# copy for that reason; delete the local file deliberately if a re-publish is
# really intended.
#
# Usage: scripts/sync-schemas.sh /path/to/bernstein
set -euo pipefail
SRC="${1:?path to a bernstein checkout}/schemas"
DST="$(cd "$(dirname "$0")/.." && pwd)/public/schemas"
mkdir -p "$DST"
rc=0
for f in "$SRC"/*.json; do
  name=$(basename "$f")
  grep -q '"\$id": "https://bernstein.run/schemas/' "$f" || continue  # vendored schema, not ours
  if [ -f "$DST/$name" ] && ! cmp -s "$f" "$DST/$name"; then
    echo "refusing to overwrite published schema $name (content differs)" >&2; rc=1; continue
  fi
  cp "$f" "$DST/$name"; echo "synced $name"
done
exit $rc
