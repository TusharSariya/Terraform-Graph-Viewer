# Express LangGraph Server

Node.js/Express duplicate of the Flask `/api/query/langgraph` endpoint. Implements the same state-machine workflow for Terraform RAG queries, with a mock mode for cost-free parity testing against the Python backend.

## Quick Start

```bash
npm install
npm start
# Server runs on http://localhost:8001
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8001` | Server port |
| `ANTHROPIC_API_KEY` | — | Required for non-mock (live) requests |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude model to use |

## API

### `GET /`

Health check.

```bash
curl http://localhost:8001/
```

```json
{ "status": "ok", "server": "express-langgraph" }
```

### `POST /api/query/langgraph`

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | The Terraform infrastructure question |
| `mock` | boolean | no | Skip real LLM/RAG calls and return deterministic canned responses |

## Examples

### Simple route — direct lookup

Questions that don't match analysis or complex keywords go through a single RAG retrieval.

```bash
curl -X POST http://localhost:8001/api/query/langgraph \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the S3 bucket name?", "mock": true}'
```

```json
{
  "question": "What is the S3 bucket name?",
  "route": "simple",
  "final_answer": "The Terraform plan contains an S3 bucket (aws_s3_bucket.test), a Lambda function (aws_lambda_function.writer), and an SQS queue (aws_sqs_queue.input). The Lambda is triggered by the SQS queue via an event source mapping.",
  "rag_answer": "The Terraform plan contains an S3 bucket (aws_s3_bucket.test), a Lambda function (aws_lambda_function.writer), and an SQS queue (aws_sqs_queue.input). The Lambda is triggered by the SQS queue via an event source mapping.",
  "refined_answer": null,
  "sub_questions": null,
  "sub_answers": null,
  "synthesized_answer": null,
  "trace": [
    "[router] Classified as 'simple'",
    "[rag] Retrieved answer (220 chars)",
    "[final] Output: 220 chars"
  ],
  "iterations": 0
}
```

### Complex route — RAG + critique

Questions containing keywords like "depend", "use", "connect", "link", "chain", or "impact" trigger the critique/refine loop after RAG retrieval.

```bash
curl -X POST http://localhost:8001/api/query/langgraph \
  -H "Content-Type: application/json" \
  -d '{"question": "What resources depend on the S3 bucket?", "mock": true}'
```

```json
{
  "question": "What resources depend on the S3 bucket?",
  "route": "complex",
  "final_answer": "The Terraform plan contains an S3 bucket (aws_s3_bucket.test), a Lambda function (aws_lambda_function.writer), and an SQS queue (aws_sqs_queue.input). The Lambda is triggered by the SQS queue via an event source mapping.",
  "rag_answer": "The Terraform plan contains an S3 bucket (aws_s3_bucket.test), a Lambda function (aws_lambda_function.writer), and an SQS queue (aws_sqs_queue.input). The Lambda is triggered by the SQS queue via an event source mapping.",
  "refined_answer": null,
  "sub_questions": null,
  "sub_answers": null,
  "synthesized_answer": null,
  "trace": [
    "[router] Classified as 'complex'",
    "[rag] Retrieved answer (220 chars)",
    "[critique] needs_refinement=False",
    "[final] Output: 220 chars"
  ],
  "iterations": 0
}
```

### Analysis route — multi-query decomposition

Broad questions containing keywords like "bug", "error", "issue", "analyze", "missing", etc. are decomposed into sub-questions, each queried in parallel, then synthesized.

```bash
curl -X POST http://localhost:8001/api/query/langgraph \
  -H "Content-Type: application/json" \
  -d '{"question": "Are there any bugs in my Terraform plan?", "mock": true}'
```

```json
{
  "question": "Are there any bugs in my Terraform plan?",
  "route": "analysis",
  "final_answer": "The Terraform plan is well-configured. No deployment issues, security gaps, or missing dependencies were found. The Lambda function is properly connected to the SQS queue via an event source mapping with appropriate IAM permissions.",
  "rag_answer": null,
  "refined_answer": null,
  "sub_questions": [
    "Are there Terraform deployment or plan issues?",
    "Are there security or IAM issues?",
    "Are there any missing resources or dependencies?"
  ],
  "sub_answers": [
    {
      "question": "Are there Terraform deployment or plan issues?",
      "answer": "No deployment issues found. All resources have valid configurations."
    },
    {
      "question": "Are there security or IAM issues?",
      "answer": "The Lambda function has an IAM role with appropriate SQS permissions."
    },
    {
      "question": "Are there any missing resources or dependencies?",
      "answer": "No missing dependencies detected. The event source mapping connects Lambda to SQS."
    }
  ],
  "synthesized_answer": "The Terraform plan is well-configured. No deployment issues, security gaps, or missing dependencies were found. The Lambda function is properly connected to the SQS queue via an event source mapping with appropriate IAM permissions.",
  "trace": [
    "[router] Classified as 'analysis'",
    "[decompose] Generated 3 sub-questions",
    "[multi_rag] Retrieved 3 sub-answers in parallel",
    "[synthesize] Combined 3 answers (232 chars)",
    "[final] Output: 232 chars"
  ],
  "iterations": 0
}
```

### Error handling

```bash
curl -X POST http://localhost:8001/api/query/langgraph \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
  "error": "A 'question' field is required in the JSON body."
}
```

### `GET /api/graph4` — enriched Terraform graph with LLM analysis

Returns Terraform graph nodes enriched with per-resource AI analysis (summary, issues, recommendations). Pass `?mock=true` to skip all LLM calls.

```bash
curl "http://localhost:8001/api/graph4?mock=true"
```

```json
{
  "aws_s3_bucket.test": {
    "resources": {
      "aws_s3_bucket.test": {
        "address": "aws_s3_bucket.test",
        "type": "aws_s3_bucket",
        "change": { "actions": ["no-op"], "before": {"bucket": "my-test-bucket"}, "after": {"bucket": "my-test-bucket"}, "diff": {} }
      }
    },
    "edges_new": ["aws_lambda_function.writer"],
    "edges_existing": [],
    "enrichment": {
      "summary": "S3 bucket used for data storage. No issues detected.",
      "issues": [],
      "recommendations": []
    },
    "AI": {
      "Issues": [],
      "Sumary": "S3 bucket used for data storage. No issues detected.",
      "Recomendations": []
    }
  },
  "aws_lambda_function.writer": {
    "resources": { "..." : "..." },
    "edges_new": ["aws_sqs_queue.input"],
    "edges_existing": ["aws_s3_bucket.test"],
    "enrichment": {
      "summary": "Lambda function triggered by SQS queue via event source mapping.",
      "issues": ["No dead letter queue configured for error handling"],
      "recommendations": ["Add a dead letter queue for failed invocations"]
    },
    "AI": {
      "Issues": ["No dead letter queue configured for error handling"],
      "Sumary": "Lambda function triggered by SQS queue via event source mapping.",
      "Recomendations": ["Add a dead letter queue for failed invocations"]
    }
  },
  "aws_sqs_queue.input": {
    "resources": { "..." : "..." },
    "edges_new": [],
    "edges_existing": ["aws_lambda_function.writer"],
    "enrichment": {
      "summary": "SQS queue that triggers the Lambda function.",
      "issues": [],
      "recommendations": ["Consider adding a message retention policy"]
    },
    "AI": {
      "Issues": [],
      "Sumary": "SQS queue that triggers the Lambda function.",
      "Recomendations": ["Consider adding a message retention policy"]
    }
  }
}
```

### Live mode (no mock)

Omit `mock` or set it to `false` to make real Anthropic API calls. Requires `ANTHROPIC_API_KEY` to be set.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
curl -X POST http://localhost:8001/api/query/langgraph \
  -H "Content-Type: application/json" \
  -d '{"question": "Are there any bugs in my Terraform plan?"}'
```

Note: `/api/graph4` without `?mock=true` returns `501` on the Express backend since it has no Terraform pipeline. Use the Flask backend for live graph4 calls.

## Workflow

Questions are classified by keyword matching into one of three routes:

```
           +-- simple ----> rag_retrieve ----------------------> format_final
           |
router ----+-- complex ---> rag_retrieve --> critique --> refine -> format_final
           |
           +-- analysis --> decompose --> multi_rag --> synthesize -> format_final
```

- **simple** — single RAG retrieval, straight to final answer
- **complex** — RAG retrieval + LLM critique; refines if incomplete (max 1 iteration)
- **analysis** — decomposes into sub-questions, runs RAG on each in parallel, synthesizes

### Routing keywords

| Route | Triggers on |
|---|---|
| analysis | bug, error, issue, correct, wrong, problem, analyze, lambda, event_source, event source mapping, trigger, consumer, missing |
| complex | depend, use, connect, link, chain, impact |
| simple | everything else |

Analysis keywords are checked first, then complex, then simple as the fallback.

## Mock Mode

Pass `"mock": true` in the request body (for POST endpoints) or `?mock=true` as a query param (for GET endpoints) to bypass all Anthropic API and RAG calls. Returns the same deterministic canned responses as the Flask backend, enabling cross-backend parity validation without incurring API costs.

### Running the parity comparison

```bash
# Start both servers
cd ../flask-server && ./venv/bin/python app.py &   # port 8000
npm start &                                         # port 8001

# Compare outputs across all endpoints
bash ../compare-outputs.sh
```

Expected output:

```
=====================================================
Test 1: "What is the S3 bucket name?"  (expected route: simple)
=====================================================
  [PASS] route
  [PASS] final_answer
  [PASS] trace
  ...all PASS...
  >>> TEST PASSED

=====================================================
Test 2: "What resources depend on the S3 bucket?"  (expected route: complex)
=====================================================
  ...all PASS...
  >>> TEST PASSED

=====================================================
Test 3: "Are there any bugs in my Terraform plan?"  (expected route: analysis)
=====================================================
  ...all PASS...
  >>> TEST PASSED

=====================================================
Test 4: GET /api/graph4?mock=true
=====================================================
  [PASS] Full JSON output matches
  >>> TEST PASSED
  [PASS] aws_s3_bucket.test has enrichment + AI fields
  [PASS] aws_lambda_function.writer has enrichment + AI fields
  [PASS] aws_sqs_queue.input has enrichment + AI fields

=====================================================
Results: 4 passed, 0 failed (out of 4)
=====================================================
```

## Project Structure

```
express-server/
  index.js       Express server and route handler
  langgraph.js   State machine, node functions, mock constants
  package.json
```
