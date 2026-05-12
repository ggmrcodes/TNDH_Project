#!/usr/bin/env bash
# Seed a local HAPI FHIR server with HaemoCare's TH Core Appointment fixtures.
#
# Prereq: HAPI FHIR running at FHIR_BASE_URL (default http://localhost:8090/fhir).
#   Quick start:
#     docker run -d -p 8090:8080 --name haemocare-fhir hapiproject/hapi:latest
#     # wait ~20s for the server to warm up, then:
#     ./scripts/seed-fhir.sh
#
# Optionally point at a different endpoint:
#     FHIR_BASE_URL=http://localhost:8080/fhir ./scripts/seed-fhir.sh
set -euo pipefail

FHIR_BASE_URL="${FHIR_BASE_URL:-http://localhost:8090/fhir}"
FIXTURE="$(cd "$(dirname "$0")/.." && pwd)/supabase/fhir-fixtures/th-core-appointments.json"

if [[ ! -f "$FIXTURE" ]]; then
  echo "fixture not found: $FIXTURE" >&2
  exit 1
fi

echo "seeding $FHIR_BASE_URL with $(basename "$FIXTURE") ..."
curl -sS -X POST "$FHIR_BASE_URL" \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  --data-binary "@$FIXTURE" | head -c 400
echo
echo
echo "verify: curl -sS '$FHIR_BASE_URL/Appointment?patient=Patient/haemocare-mock-patient' | head -c 400"
