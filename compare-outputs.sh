#!/usr/bin/env bash
#
# Compare mock outputs from Flask (port 8000) and Express (port 8001)
# /api/query/langgraph endpoints. Both must be running.
#
# Usage: bash compare-outputs.sh
#
set -uo pipefail

FLASK_URL="http://localhost:8000/api/query/langgraph"
EXPRESS_URL="http://localhost:8001/api/query/langgraph"
PASS=0
FAIL=0

# Test questions — one per route type
declare -a QUESTIONS=(
  "What is the S3 bucket name?"
  "What resources depend on the S3 bucket?"
  "Are there any bugs in my Terraform plan?"
)
declare -a EXPECTED_ROUTES=(
  "simple"
  "complex"
  "analysis"
)

# Fields to compare (order-insensitive JSON comparison)
COMPARE_FIELDS=("route" "final_answer" "trace" "rag_answer" "refined_answer" "sub_questions" "sub_answers" "synthesized_answer" "iterations")

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

for i in "${!QUESTIONS[@]}"; do
  question="${QUESTIONS[$i]}"
  expected_route="${EXPECTED_ROUTES[$i]}"
  echo "====================================================="
  echo "Test $((i+1)): \"$question\"  (expected route: $expected_route)"
  echo "====================================================="

  payload=$(printf '{"question": %s, "mock": true}' "$(echo "$question" | jq -Rs .)")

  # Call both backends
  flask_resp=$(curl -s -X POST "$FLASK_URL" -H "Content-Type: application/json" -d "$payload")
  express_resp=$(curl -s -X POST "$EXPRESS_URL" -H "Content-Type: application/json" -d "$payload")

  # Save to files for diff
  echo "$flask_resp" | jq --sort-keys . > "$tmpdir/flask_$i.json"
  echo "$express_resp" | jq --sort-keys . > "$tmpdir/express_$i.json"

  # Compare each field
  test_passed=true
  for field in "${COMPARE_FIELDS[@]}"; do
    flask_val=$(echo "$flask_resp" | jq --sort-keys ".$field")
    express_val=$(echo "$express_resp" | jq --sort-keys ".$field")

    if [ "$flask_val" = "$express_val" ]; then
      echo "  [PASS] $field"
    else
      echo "  [FAIL] $field"
      echo "    Flask:   $flask_val"
      echo "    Express: $express_val"
      test_passed=false
    fi
  done

  # Check route matches expectation
  actual_route=$(echo "$flask_resp" | jq -r '.route')
  if [ "$actual_route" = "$expected_route" ]; then
    echo "  [PASS] route matches expected '$expected_route'"
  else
    echo "  [FAIL] expected route '$expected_route' but got '$actual_route'"
    test_passed=false
  fi

  if $test_passed; then
    echo "  >>> TEST PASSED"
    PASS=$((PASS + 1))
  else
    echo "  >>> TEST FAILED — see diffs above"
    FAIL=$((FAIL + 1))
    echo "  Full diff:"
    diff --color "$tmpdir/flask_$i.json" "$tmpdir/express_$i.json" || true
  fi
  echo ""
done

# =====================================================================
# /api/graph4 parity test
# =====================================================================
echo ""
echo "====================================================="
echo "Test $((${#QUESTIONS[@]}+1)): GET /api/graph4?mock=true"
echo "====================================================="

flask_g4=$(curl -s "http://localhost:8000/api/graph4?mock=true")
express_g4=$(curl -s "http://localhost:8001/api/graph4?mock=true")

echo "$flask_g4" | jq --sort-keys . > "$tmpdir/flask_graph4.json"
echo "$express_g4" | jq --sort-keys . > "$tmpdir/express_graph4.json"

if diff -q "$tmpdir/flask_graph4.json" "$tmpdir/express_graph4.json" > /dev/null 2>&1; then
  echo "  [PASS] Full JSON output matches"
  echo "  >>> TEST PASSED"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] JSON outputs differ"
  echo "  >>> TEST FAILED"
  diff --color "$tmpdir/flask_graph4.json" "$tmpdir/express_graph4.json" || true
  FAIL=$((FAIL + 1))
fi

# Verify enrichment fields are present
for path in "aws_s3_bucket.test" "aws_lambda_function.writer" "aws_sqs_queue.input"; do
  has_enrichment=$(echo "$flask_g4" | jq --arg p "$path" '.[$p] | has("enrichment") and has("AI")')
  if [ "$has_enrichment" = "true" ]; then
    echo "  [PASS] $path has enrichment + AI fields"
  else
    echo "  [FAIL] $path missing enrichment or AI fields"
    FAIL=$((FAIL + 1))
  fi
done
echo ""

TOTAL=$((${#QUESTIONS[@]} + 1))
echo "====================================================="
echo "Results: $PASS passed, $FAIL failed (out of $TOTAL)"
echo "====================================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
