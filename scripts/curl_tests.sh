#!/usr/bin/env bash
# eRTMAC-NWIS backend smoke tests — every endpoint via curl (happy path + error path).
#   bash scripts/curl_tests.sh [BASE_URL]      default http://127.0.0.1:8000
set -u
BASE="${1:-http://127.0.0.1:8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PY:-}"
if [ -z "$PY" ]; then
  if [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then PY="$ROOT/backend/.venv/Scripts/python.exe";
  elif [ -x "$ROOT/backend/.venv/bin/python" ]; then PY="$ROOT/backend/.venv/bin/python";
  else PY="python"; fi
fi
TMP="$(mktemp -d)"
PASS=0; FAIL=0

# check NAME EXPECTED_STATUS SUMMARY_EXPR curl-args...
#   SUMMARY_EXPR is a python expression over `d` (parsed JSON) returning a short string; may raise → FAIL
check() {
  local name="$1" expect="$2" expr="$3"; shift 3
  local code body
  code=$(curl -s -o "$TMP/body" -w "%{http_code}" "$@")
  if [ "$code" != "$expect" ]; then
    echo "FAIL  [$code≠$expect] $name"; head -c 300 "$TMP/body"; echo; FAIL=$((FAIL+1)); return
  fi
  if [ -n "$expr" ]; then
    body=$("$PY" -c "import json,sys; d=json.load(open(sys.argv[1], encoding='utf-8')); print($expr)" "$TMP/body" 2>&1)
    if [ $? -ne 0 ]; then echo "FAIL  [$code] $name → summary error: $body"; FAIL=$((FAIL+1)); return; fi
  else
    body="$(head -c 80 "$TMP/body" | tr -d '\n')"
  fi
  echo "ok    [$code] $name → $body"; PASS=$((PASS+1))
}

echo "== eRTMAC-NWIS API smoke tests @ $BASE =="

# --- root / health / reference --------------------------------------------------------------
check "GET /"                        200 "d['name']"                                        "$BASE/"
check "GET /api/health"              200 "f\"wells={d['wells']} llm={d['llm']['enabled']}\"" "$BASE/api/health"
check "GET /api/formations"          200 "f\"{len(d['formations'])} formations, {len(d['event_types'])} event types\"" "$BASE/api/formations"
check "GET /api/stats"               200 "f\"wells={d['wells_total']} events={d['events_total']} offsets15={d['offset_wells_in_radius']} npt={d['offset_npt_hours']} reports={d['indexed_reports']} alerts={d['active_alerts']}\"" "$BASE/api/stats"
check "GET /api/stats?radius_km=25"  200 "f\"offsets25={d['offset_wells_in_radius']}\""       "$BASE/api/stats?radius_km=25"

# --- wells --------------------------------------------------------------------------------------
check "GET /api/wells"               200 "f\"count={d['count']} active={d['active_well_id']} first={d['wells'][0]['id']} ev={d['wells'][0]['event_count']}\"" "$BASE/api/wells"
check "GET /api/wells?field=Duliajan" 200 "f\"count={d['count']}\""                          "$BASE/api/wells?field=Duliajan"
check "GET /api/wells/nearby (15 km)" 200 "f\"count={d['count']} nearest={d['wells'][0]['id']}@{d['wells'][0]['distance_km']}km {d['wells'][0]['bearing']} events={d['total_events']}\"" "$BASE/api/wells/nearby?well_id=DLJ-ACT-01&radius_km=15"
check "GET /api/wells/nearby (5 km)"  200 "f\"count={d['count']} ids={[w['id'] for w in d['wells']]}\"" "$BASE/api/wells/nearby?radius_km=5"
check "GET /api/wells/nearby?type=Kick" 200 "f\"count={d['count']} kicks={[ (w['id'], w['event_count']) for w in d['wells']][:4]}\"" "$BASE/api/wells/nearby?radius_km=15&type=Kick"
check "GET /api/wells/nearby bad well" 404 "d['detail']"                                     "$BASE/api/wells/nearby?well_id=XXX-99"
check "GET /api/wells/DLJ-12"         200 "f\"td={d['total_depth_m']} forms={len(d['formations'])} casing={len(d['casing'])} events={len(d['events'])} logs={len(d['logs'])} pp={len(d['pressure_window'])} dist={d['distance_km']}km\"" "$BASE/api/wells/DLJ-12"
check "GET /api/wells/DLJ-ACT-01"     200 "f\"depth={d['current_depth_m']} fm={d['current_formation']} logs={len(d['logs'])} events={len(d['events'])}\"" "$BASE/api/wells/DLJ-ACT-01"
check "GET /api/wells/NOPE-01"        404 "d['detail']"                                      "$BASE/api/wells/NOPE-01"

# --- knowledge search ---------------------------------------------------------------------------
check "GET /api/events (no query)"    200 "f\"total={d['total']} first={d['items'][0]['citation']} {d['items'][0]['severity']}\"" "$BASE/api/events?limit=5"
check "GET /api/events?search=stuck pipe barail" 200 "f\"total={d['total']} top={[i['citation'] for i in d['items'][:3]]} scores={[i['score'] for i in d['items'][:3]]}\"" "$BASE/api/events?search=stuck%20pipe%20barail&limit=5"
check "GET /api/events?type=Kick&formation=Kopili&severity=Critical" 200 "f\"total={d['total']} {[i['citation'] for i in d['items'][:3]]}\"" "$BASE/api/events?type=Kick&formation=Kopili&severity=Critical"
check "GET /api/events?search=losses&radius_km=15" 200 "f\"total={d['total']} facets_types={ {k:v for k,v in d['facets']['event_types'].items() if v} }\"" "$BASE/api/events?search=losses&radius_km=15"
check "GET /api/events?well_id=DLJ-12" 200 "f\"total={d['total']}\""                        "$BASE/api/events?well_id=DLJ-12"
check "GET /api/events/1"             200 "f\"{d['citation']} {d['event_type']}\""            "$BASE/api/events/1"
check "GET /api/events/999999"        404 "d['detail']"                                      "$BASE/api/events/999999"

# --- correlation --------------------------------------------------------------------------------
check "GET /api/correlation (default)" 200 "f\"wells={d['well_ids']} links={len(d['links'])} depth_max={d['depth_max_m']} events={d['event_count']}\"" "$BASE/api/correlation"
check "GET /api/correlation 3 wells"  200 "f\"barail_tops={[p['top_m'] for l in d['links'] if l['formation']=='Barail' for p in l['points']]}\"" "$BASE/api/correlation?well_ids=DLJ-12,DLJ-18,NHK-07"
check "GET /api/correlation unknown"  404 "d['detail']"                                      "$BASE/api/correlation?well_ids=DLJ-12,ZZZ-01"
check "GET /api/correlation 7 wells"  422 "d['detail']"                                      "$BASE/api/correlation?well_ids=DLJ-03,DLJ-07,DLJ-12,DLJ-18,DLJ-21,DLJ-24,DLJ-29"

# --- risk ---------------------------------------------------------------------------------------
check "GET /api/risk/profile (active, 15 km)" 200 "'; '.join(f\"{z['depth_m']:.0f} m {z['event_type']} {z['formation']} {z['level']} {z['score']:.0f}% ev={z['evidence_count']} near={z['nearest_offset_km']}\" for z in d['top_risks'][:5]) + f\" | bins={len(d['bins'])} offsets={len(d['offset_wells'])} rows={d['model']['training_rows']}\"" "$BASE/api/risk/profile?well_id=DLJ-ACT-01&radius_km=15"
check "GET /api/risk/profile (DLJ-12, 25 km)" 200 "f\"top={d['top_risks'][0]['event_type']}@{d['top_risks'][0]['depth_m']} {d['top_risks'][0]['score']}% safe_intervals={len(d['safe_intervals'])}\"" "$BASE/api/risk/profile?well_id=DLJ-12&radius_km=25"
check "GET /api/risk/profile unknown" 404 "d['detail']"                                      "$BASE/api/risk/profile?well_id=NOPE-01"
curl -s "$BASE/api/risk/profile?well_id=DLJ-ACT-01&radius_km=15" | "$PY" -c "import json,sys; d=json.load(sys.stdin); d.pop('current_depth_m'); [z.pop('ahead') for z in d['top_risks']]; d.pop('risks_ahead',None); d.pop('generated_at'); print(json.dumps(d,sort_keys=True))" > "$TMP/r1"
curl -s "$BASE/api/risk/profile?well_id=DLJ-ACT-01&radius_km=15" | "$PY" -c "import json,sys; d=json.load(sys.stdin); d.pop('current_depth_m'); [z.pop('ahead') for z in d['top_risks']]; d.pop('risks_ahead',None); d.pop('generated_at'); print(json.dumps(d,sort_keys=True))" > "$TMP/r2"
if cmp -s "$TMP/r1" "$TMP/r2"; then echo "ok    risk profile deterministic (two calls identical)"; PASS=$((PASS+1)); else echo "FAIL  risk profile not deterministic"; FAIL=$((FAIL+1)); fi

# --- live simulation + controls -----------------------------------------------------------------
check "GET /api/live?reset=true"      200 "f\"depth={d['depth_m']} fm={d['formation']} next={d['next_formation']}@{d['distance_to_next_m']}m alerts={d['active_alert_count']} speed={d['speed']} feed={d['feed']}\"" "$BASE/api/live?reset=true"
check "GET /api/live"                 200 "f\"depth={d['depth_m']} rop={d['params']['rop']} torque={d['params']['torque']} hist={len(d['history'])} status={d['status']}\"" "$BASE/api/live"
check "GET /api/live?jump_to_depth=2808" 200 "f\"depth={d['depth_m']} alerts={[(a['well_id'],a['depth_m'],a['event_type'],a['severity'],a['distance_ahead_m']) for a in d['alerts']]}\"" "$BASE/api/live?jump_to_depth=2808"
check "GET /api/live?speed=20"        200 "f\"speed={d['speed']} applied={d.get('applied')}\""  "$BASE/api/live?speed=20"
check "GET /api/live?trigger_alert=true" 200 "f\"demo_alerts={[(a['well_id'],a['depth_m'],a['event_type']) for a in d['alerts'] if a['is_demo']]}\"" "$BASE/api/live?trigger_alert=true"
check "POST /api/live/control jump 3250 @1x" 200 "f\"depth={d['depth_m']} fm={d['formation']} next={d['next_formation']} alerts={d['active_alert_count']} top={d['top_alert']['title'] if d['top_alert'] else None}\"" -X POST -H "Content-Type: application/json" -d '{"jump_to_depth":3250,"speed":1}' "$BASE/api/live/control"
check "POST /api/live/control radius 25" 200 "f\"radius={d['radius_km']} offsets={d['offset_wells_in_radius']} alerts={d['active_alert_count']}\"" -X POST -H "Content-Type: application/json" -d '{"radius_km":25}' "$BASE/api/live/control"
check "POST /api/live/control reset"  200 "f\"depth={d['depth_m']} speed={d['speed']} alerts={d['active_alert_count']}\"" -X POST -H "Content-Type: application/json" -d '{"reset":true,"radius_km":15}' "$BASE/api/live/control"
check "GET /api/live bad speed type"  422 "d['detail'][0]['msg']"                            "$BASE/api/live?speed=fast"

# --- documents ----------------------------------------------------------------------------------
check "GET /api/documents/samples"    200 "f\"{len(d['samples'])} samples, available={all(s['available'] for s in d['samples'])}\"" "$BASE/api/documents/samples"
code=$(curl -s -o "$TMP/pdf" -w "%{http_code}" "$BASE/api/documents/samples/DDR_DLJ-12_2019-03-14.pdf")
if [ "$code" = "200" ] && head -c 4 "$TMP/pdf" | grep -q "%PDF"; then echo "ok    [200] GET /api/documents/samples/{name} → PDF $(stat -c %s "$TMP/pdf") bytes"; PASS=$((PASS+1)); else echo "FAIL  GET sample pdf ($code)"; FAIL=$((FAIL+1)); fi
check "GET /api/documents/samples/missing" 404 "d['detail']"                                "$BASE/api/documents/samples/nope.pdf"
check "POST /api/documents/sample (text DDR)" 200 "f\"doc={d['document_id']} src={d['text_source']} ocr={d['ocr_status']} method={d['extraction_method']} events={[(e['event_type'],e['depth_m'],e['severity'],e['confidence']) for e in d['events']]} steps={[s['status'] for s in d['steps']]}\"" -X POST "$BASE/api/documents/sample?name=DDR_DLJ-12_2019-03-14.pdf"
check "POST /api/documents/sample (scanned)" 200 "f\"doc={d['document_id']} src={d['text_source']} ocr={d['ocr_status']} msg={d['ocr_message']} events={[(e['event_type'],e['depth_m'],e['severity']) for e in d['events']]} ocr_step={[s for s in d['steps'] if s['key']=='ocr'][0]['detail']}\"" -X POST "$BASE/api/documents/sample?name=DDR_DLJ-18_2020-01-27_SCANNED.pdf"
check "POST /api/documents/sample missing" 404 "d['detail']"                                -X POST "$BASE/api/documents/sample?name=nope.pdf"
check "POST /api/documents/upload (DLJ-07 DDR)" 200 "f\"doc={d['document_id']} well={d['detected']['well_id']} events={[(e['event_type'],e['depth_m'],e['formation']) for e in d['events']]}\"" -F "file=@$ROOT/backend/sample_docs/DDR_DLJ-07_2021-06-18.pdf" "$BASE/api/documents/upload"
printf 'not a pdf' > "$TMP/x.txt"
check "POST /api/documents/upload non-pdf" 415 "d['detail']"                                -F "file=@$TMP/x.txt" "$BASE/api/documents/upload"
# confirm: take the DLJ-07 upload's events, tweak one description, save, then find it via search
UP=$(curl -s -F "file=@$ROOT/backend/sample_docs/DDR_DLJ-07_2021-06-18.pdf" "$BASE/api/documents/upload")
CONFIRM=$(echo "$UP" | "$PY" -c "
import json,sys
d=json.load(sys.stdin)
evs=d['events']
evs[0]['description']='CURLTEST-UNIQUE-TOKEN '+evs[0]['description']
print(json.dumps({'document_id': d['document_id'], 'events': evs}))")
check "POST /api/documents/confirm"   200 "f\"saved={d['count']} ids={[e['id'] for e in d['saved']]} origin={d['saved'][0]['origin']} src={d['saved'][0]['source_doc']}\"" -X POST -H "Content-Type: application/json" -d "$CONFIRM" "$BASE/api/documents/confirm"
check "GET /api/events?search=CURLTEST (confirmed searchable)" 200 "f\"total={d['total']} first={d['items'][0]['citation']} origin={d['items'][0]['origin']}\"" "$BASE/api/events?search=CURLTEST-UNIQUE-TOKEN"
check "GET /api/events?origin=upload"  200 "f\"total={d['total']}\""                         "$BASE/api/events?origin=upload"
check "POST /api/documents/confirm bad well" 422 "d['detail']"                               -X POST -H "Content-Type: application/json" -d '{"document_id":1,"events":[{"well_id":"ZZZ-01","depth_m":100,"event_type":"Kick","description":"x"}]}' "$BASE/api/documents/confirm"
check "POST /api/documents/confirm bad type" 422 "d['detail']"                               -X POST -H "Content-Type: application/json" -d '{"document_id":1,"events":[{"well_id":"DLJ-12","depth_m":100,"event_type":"Explosion","description":"x"}]}' "$BASE/api/documents/confirm"
check "POST /api/documents/confirm missing doc" 404 "d['detail']"                            -X POST -H "Content-Type: application/json" -d '{"document_id":99999,"events":[{"well_id":"DLJ-12","depth_m":100,"event_type":"Kick","description":"x"}]}' "$BASE/api/documents/confirm"
check "GET /api/documents"            200 "f\"count={d['count']} statuses={[x['status'] for x in d['documents']]}\"" "$BASE/api/documents"
check "GET /api/documents/1"          200 "f\"{d['filename']} status={d['status']} events={len(d['events'])}\"" "$BASE/api/documents/1"
check "GET /api/documents/99999"      404 "d['detail']"                                      "$BASE/api/documents/99999"

# --- assistant ----------------------------------------------------------------------------------
check "GET /api/assistant/suggestions" 200 "f\"{len(d['prompts'])} prompts, llm={d['llm']['enabled']}\"" "$BASE/api/assistant/suggestions"
check "POST /api/assistant/chat (Barail problems)" 200 "f\"mode={d['mode']} title={d['title']!r} summary={d['summary']!r} sections={[s['heading'] for s in d['sections']]} cites={[c['label'] for c in d['citations']]}\"" -X POST -H "Content-Type: application/json" -d '{"message":"What problems did offset wells face in the Barail formation?"}' "$BASE/api/assistant/chat"
check "POST /api/assistant/chat (Kopili MW Baghjan)" 200 "f\"title={d['title']!r} summary={d['summary']!r} sections={[s['heading'] for s in d['sections']]}\"" -X POST -H "Content-Type: application/json" -d '{"message":"Recommended mud weight for Kopili in Baghjan area?"}' "$BASE/api/assistant/chat"
check "POST /api/assistant/chat (well DLJ-12)" 200 "f\"title={d['title']!r} intent={d['intent']} cites={[c['label'] for c in d['citations']][:3]}\"" -X POST -H "Content-Type: application/json" -d '{"message":"What happened on DLJ-12 while drilling Barail?"}' "$BASE/api/assistant/chat"
check "POST /api/assistant/chat (casing)" 200 "f\"title={d['title']!r} sections={[s['heading'] for s in d['sections']]}\"" -X POST -H "Content-Type: application/json" -d '{"message":"What casing programme did nearby wells use through Tipam?"}' "$BASE/api/assistant/chat"
check "POST /api/assistant/chat (gibberish)" 200 "f\"title={d['title']!r} retrieved={d['retrieved']}\"" -X POST -H "Content-Type: application/json" -d '{"message":"xyzzy plugh"}' "$BASE/api/assistant/chat"
check "POST /api/assistant/chat empty" 422 "d['detail'][0]['msg']"                           -X POST -H "Content-Type: application/json" -d '{"message":""}' "$BASE/api/assistant/chat"

# --- stats after ingestion ----------------------------------------------------------------------
check "GET /api/stats (after confirm)" 200 "f\"uploaded_events={d['uploaded_events']} docs={d['documents_ingested']} confirmed={d['documents_confirmed']} reports={d['indexed_reports']}\"" "$BASE/api/stats"

echo "== $PASS passed, $FAIL failed =="
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
