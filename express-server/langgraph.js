/**
 * LangGraph-powered Terraform RAG — Node.js port of flask-server/LangGraph.py
 *
 * Implements the same state-machine workflow:
 *   router → (analysis path: decompose → multi_rag → synthesize → format_final)
 *            (simple/complex path: rag_retrieve → [critique → refine] → format_final)
 *
 * When mock=true, all LLM/RAG calls return deterministic canned responses identical
 * to the Python backend, enabling cross-backend parity testing.
 */

const Anthropic = require("@anthropic-ai/sdk");

// ---------------------------------------------------------------------------
// Mock responses — must match flask-server/LangGraph.py exactly
// ---------------------------------------------------------------------------

const MOCK_RAG_ANSWER =
  "The Terraform plan contains an S3 bucket (aws_s3_bucket.test), " +
  "a Lambda function (aws_lambda_function.writer), and an SQS queue " +
  "(aws_sqs_queue.input). The Lambda is triggered by the SQS queue " +
  "via an event source mapping.";

const MOCK_SUB_QUESTIONS = [
  "Are there Terraform deployment or plan issues?",
  "Are there security or IAM issues?",
  "Are there any missing resources or dependencies?",
];

const MOCK_SUB_ANSWERS = [
  {
    question: "Are there Terraform deployment or plan issues?",
    answer:
      "No deployment issues found. All resources have valid configurations.",
  },
  {
    question: "Are there security or IAM issues?",
    answer:
      "The Lambda function has an IAM role with appropriate SQS permissions.",
  },
  {
    question: "Are there any missing resources or dependencies?",
    answer:
      "No missing dependencies detected. The event source mapping connects Lambda to SQS.",
  },
];

const MOCK_SYNTHESIZED_ANSWER =
  "The Terraform plan is well-configured. No deployment issues, security gaps, " +
  "or missing dependencies were found. The Lambda function is properly connected " +
  "to the SQS queue via an event source mapping with appropriate IAM permissions.";

const MOCK_CRITIQUE_RESPONSE =
  '{"complete": true, "reason": "The answer addresses the question with specific resource details."}';

const MOCK_REFINED_ANSWER =
  "After additional review: The Terraform plan includes properly configured " +
  "resources with no issues detected.";

const MOCK_GRAPH_NODES = {
  "aws_s3_bucket.test": {
    resources: {
      "aws_s3_bucket.test": {
        address: "aws_s3_bucket.test",
        type: "aws_s3_bucket",
        change: {
          actions: ["no-op"],
          before: { bucket: "my-test-bucket" },
          after: { bucket: "my-test-bucket" },
          diff: {},
        },
      },
    },
    edges_new: ["aws_lambda_function.writer"],
    edges_existing: [],
  },
  "aws_lambda_function.writer": {
    resources: {
      "aws_lambda_function.writer": {
        address: "aws_lambda_function.writer",
        type: "aws_lambda_function",
        change: {
          actions: ["no-op"],
          before: { function_name: "writer" },
          after: { function_name: "writer" },
          diff: {},
        },
      },
    },
    edges_new: ["aws_sqs_queue.input"],
    edges_existing: ["aws_s3_bucket.test"],
  },
  "aws_sqs_queue.input": {
    resources: {
      "aws_sqs_queue.input": {
        address: "aws_sqs_queue.input",
        type: "aws_sqs_queue",
        change: {
          actions: ["no-op"],
          before: { name: "input-queue" },
          after: { name: "input-queue" },
          diff: {},
        },
      },
    },
    edges_new: [],
    edges_existing: ["aws_lambda_function.writer"],
  },
};

const MOCK_ENRICHMENT = {
  "aws_s3_bucket.test": {
    summary: "S3 bucket used for data storage. No issues detected.",
    issues: [],
    recommendations: [],
  },
  "aws_lambda_function.writer": {
    summary:
      "Lambda function triggered by SQS queue via event source mapping.",
    issues: ["No dead letter queue configured for error handling"],
    recommendations: ["Add a dead letter queue for failed invocations"],
  },
  "aws_sqs_queue.input": {
    summary: "SQS queue that triggers the Lambda function.",
    issues: [],
    recommendations: ["Consider adding a message retention policy"],
  },
};

// ---------------------------------------------------------------------------
// Anthropic client (lazy — only created when needed for non-mock calls)
// ---------------------------------------------------------------------------

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

async function llmInvoke(messages, { system } = {}) {
  const client = getClient();
  const params = {
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    messages,
  };
  if (system) {
    params.system = system;
  }
  const response = await client.messages.create(params);
  // Extract text from content blocks
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

/**
 * Router — classify question into simple / complex / analysis.
 * Pure keyword logic, no LLM call.
 */
function router(state) {
  const question = state.question.toLowerCase();

  const analysisKeywords = [
    "bug",
    "error",
    "issue",
    "correct",
    "wrong",
    "problem",
    "analyze",
    "lambda",
    "event_source",
    "event source mapping",
    "trigger",
    "consumer",
    "missing",
  ];

  const complexKeywords = [
    "depend",
    "use",
    "connect",
    "link",
    "chain",
    "impact",
  ];

  let route;
  if (analysisKeywords.some((kw) => question.includes(kw))) {
    route = "analysis";
  } else if (complexKeywords.some((kw) => question.includes(kw))) {
    route = "complex";
  } else {
    route = "simple";
  }

  return { route, trace: [`[router] Classified as '${route}'`] };
}

/**
 * RAG retrieve — get an initial answer from the RAG engine.
 */
async function ragRetrieve(state) {
  let answer;
  if (state.mock) {
    answer = MOCK_RAG_ANSWER;
  } else {
    // Without a vector store in Node, use Anthropic directly with a generic context prompt
    answer = await llmInvoke(
      [
        {
          role: "user",
          content:
            `You are a Terraform infrastructure expert. Answer this question about a Terraform plan:\n\n${state.question}`,
        },
      ],
      {
        system:
          "You are a Terraform infrastructure expert. Answer questions about resources, dependencies, and the Terraform plan. Be concise.",
      }
    );
  }

  return { rag_answer: answer, trace: [`[rag] Retrieved answer (${answer.length} chars)`] };
}

/**
 * Decompose — break a broad analysis question into sub-questions.
 */
async function decompose(state) {
  let subQuestions;
  if (state.mock) {
    subQuestions = [...MOCK_SUB_QUESTIONS];
  } else {
    const prompt =
      `Given this Terraform/infrastructure question, decompose it into 3-5 specific sub-questions.\n` +
      `Each sub-question should target a different concern. Use these categories when relevant:\n` +
      `- Terraform deployment issues (syntax, plan errors, state)\n` +
      `- Security issues (IAM, permissions, exposed resources)\n` +
      `- Networking issues (VPC, subnets, connectivity)\n` +
      `- Missing resources or dependencies (resources needed but not defined)\n` +
      `- Configuration issues (incorrect values, drift)\n\n` +
      `Original question: ${state.question}\n\n` +
      `Return a JSON array of strings only. Example: ["question 1?", "question 2?", "question 3?"]\n` +
      `Output only the JSON array, no other text.`;

    const text = await llmInvoke([{ role: "user", content: prompt }]);
    const match = text.match(/\[[\s\S]*?\]/);
    try {
      const parsed = JSON.parse(match ? match[0] : text);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        subQuestions = parsed.slice(0, 6);
      }
    } catch {
      // fallback
    }
    if (!subQuestions) {
      subQuestions = [
        "Are there Terraform deployment or plan issues?",
        "Are there security or IAM issues?",
        "Are there networking or connectivity issues?",
        "Are there any missing resources or dependencies?",
        "Does each aws_lambda_function that should consume from SQS/Kinesis have a corresponding aws_lambda_event_source_mapping?",
        "Are there configuration or drift issues?",
      ];
    }
  }

  return {
    sub_questions: subQuestions,
    trace: [`[decompose] Generated ${subQuestions.length} sub-questions`],
  };
}

/**
 * Multi-RAG retrieve — run RAG for each sub-question in parallel.
 */
async function multiRagRetrieve(state) {
  const subQuestions = state.sub_questions || [];

  let subAnswers;
  if (state.mock) {
    const mockLookup = {};
    for (const a of MOCK_SUB_ANSWERS) {
      mockLookup[a.question] = a.answer;
    }
    subAnswers = subQuestions.map((sq) => ({
      question: sq,
      answer: mockLookup[sq] || MOCK_RAG_ANSWER,
    }));
  } else {
    subAnswers = await Promise.all(
      subQuestions.map(async (sq) => {
        const answer = await llmInvoke(
          [
            {
              role: "user",
              content: `You are a Terraform infrastructure expert. Answer this question:\n\n${sq}`,
            },
          ],
          {
            system:
              "You are a Terraform infrastructure expert. Be concise.",
          }
        );
        return { question: sq, answer };
      })
    );
  }

  return {
    sub_answers: subAnswers,
    trace: [
      `[multi_rag] Retrieved ${subAnswers.length} sub-answers in parallel`,
    ],
  };
}

/**
 * Synthesize — combine sub-answers into one coherent answer.
 */
async function synthesize(state) {
  const subAnswers = state.sub_answers || [];

  let synthesized;
  if (state.mock) {
    synthesized = MOCK_SYNTHESIZED_ANSWER;
  } else {
    const chunks = subAnswers
      .map((item, i) => `### ${i + 1}. ${item.question}\n${item.answer}`)
      .join("\n");

    const prompt =
      `Original question: ${state.question}\n\n` +
      `Below are answers to specific sub-questions about the Terraform infrastructure.\n` +
      `Synthesize them into one coherent, well-structured answer. Group by concern if helpful.\n` +
      `Include any issues or recommendations. Be concise but complete.\n\n` +
      `Sub-question answers:\n${chunks}\n\nSynthesized answer:`;

    synthesized = await llmInvoke([{ role: "user", content: prompt }]);
  }

  return {
    synthesized_answer: synthesized,
    trace: [
      `[synthesize] Combined ${subAnswers.length} answers (${synthesized.length} chars)`,
    ],
  };
}

/**
 * Critique — evaluate whether the RAG answer is complete.
 */
async function critique(state) {
  if (state.mock) {
    return {
      critique: MOCK_CRITIQUE_RESPONSE,
      needs_refinement: false,
      trace: ["[critique] needs_refinement=False"],
    };
  }

  const critiqueText = await llmInvoke(
    [
      {
        role: "user",
        content:
          `Question: ${state.question}\n\nAnswer to evaluate:\n${state.rag_answer || ""}\n\n` +
          `Is this answer complete and supported by the context? Reply with JSON only.`,
      },
    ],
    {
      system:
        'You are a strict quality assessor. Evaluate if the answer fully addresses the question ' +
        'using ONLY the provided context. Answer with a JSON object: {"complete": true/false, "reason": "brief explanation"}.',
    }
  );

  let needsRefinement = true;
  if (
    critiqueText.toLowerCase().includes("true") &&
    critiqueText.toLowerCase().includes("complete")
  ) {
    needsRefinement = false;
  }

  return {
    critique: critiqueText,
    needs_refinement: needsRefinement,
    trace: [`[critique] needs_refinement=${needsRefinement}`],
  };
}

/**
 * Refine — follow-up RAG + synthesis when critique says answer is incomplete.
 */
async function refine(state) {
  if (state.mock) {
    const refined = MOCK_REFINED_ANSWER;
    return {
      refined_answer: refined,
      trace: [`[refine] Synthesized ${refined.length} chars`],
    };
  }

  const initialAnswer = state.rag_answer || "";
  const critiqueText = state.critique || "";

  // Generate follow-up question
  const followUpPrompt =
    `Original question: ${state.question}\n\n` +
    `Initial answer (may be incomplete): ${initialAnswer}\n\n` +
    `Critique: ${critiqueText}\n\n` +
    `Generate a more specific follow-up question to retrieve missing information. ` +
    `One short question only, no explanation.`;

  let followUp = await llmInvoke([{ role: "user", content: followUpPrompt }]);
  followUp = followUp.trim().replace(/^["']|["']$/g, "").slice(0, 200);

  // Second RAG call
  const supplemental = await llmInvoke(
    [
      {
        role: "user",
        content: `You are a Terraform infrastructure expert. Answer this question:\n\n${followUp}`,
      },
    ],
    {
      system:
        "You are a Terraform infrastructure expert. Be concise.",
    }
  );

  // Synthesize combined answer
  const synthesizePrompt =
    `Original question: ${state.question}\n\n` +
    `Initial answer: ${initialAnswer}\n\n` +
    `Supplemental info (from follow-up): ${supplemental}\n\n` +
    `Combine into one complete, concise answer. Do not repeat yourself.`;

  const refined = await llmInvoke([
    { role: "user", content: synthesizePrompt },
  ]);

  return {
    refined_answer: refined,
    trace: [`[refine] Synthesized ${refined.length} chars`],
  };
}

/**
 * Format final — pick the best available answer.
 */
function formatFinal(state) {
  const final =
    state.synthesized_answer || state.refined_answer || state.rag_answer || "";

  return {
    final_answer: final,
    trace: [`[final] Output: ${final.length} chars`],
  };
}

// ---------------------------------------------------------------------------
// Conditional routing (matches Python exactly)
// ---------------------------------------------------------------------------

function routeAfterRouter(state) {
  return state.route === "analysis" ? "decompose" : "rag_retrieve";
}

function routeAfterRag(state) {
  return state.route === "complex" || state.route === "analysis"
    ? "critique"
    : "format_final";
}

function routeAfterCritique(state) {
  const needsRefinement = state.needs_refinement || false;
  const iteration = state.iteration || 0;
  const maxIterations = 1;
  return needsRefinement && iteration < maxIterations ? "refine" : "format_final";
}

// ---------------------------------------------------------------------------
// State machine runner
// ---------------------------------------------------------------------------

/**
 * Execute the LangGraph state machine.
 * Follows edges exactly as built in Python's build_terraform_langgraph().
 */
async function runGraph(state) {
  // Helper: merge node result into state (trace is appended, not replaced)
  function mergeResult(result) {
    for (const [key, value] of Object.entries(result)) {
      if (key === "trace") {
        state.trace = [...(state.trace || []), ...value];
      } else {
        state[key] = value;
      }
    }
  }

  // START -> router
  mergeResult(router(state));

  // Conditional: router -> decompose | rag_retrieve
  const afterRouter = routeAfterRouter(state);

  if (afterRouter === "decompose") {
    // Analysis path: decompose -> multi_rag_retrieve -> synthesize -> format_final
    mergeResult(await decompose(state));
    mergeResult(await multiRagRetrieve(state));
    mergeResult(await synthesize(state));
    mergeResult(formatFinal(state));
  } else {
    // Single RAG path: rag_retrieve -> (critique?) -> (refine?) -> format_final
    mergeResult(await ragRetrieve(state));

    // Conditional: rag_retrieve -> critique | format_final
    const afterRag = routeAfterRag(state);

    if (afterRag === "critique") {
      mergeResult(await critique(state));

      // Conditional: critique -> refine | format_final
      const afterCritique = routeAfterCritique(state);

      if (afterCritique === "refine") {
        const refineResult = await refine(state);
        refineResult.iteration = (state.iteration || 0) + 1;
        mergeResult(refineResult);
      }
    }

    mergeResult(formatFinal(state));
  }

  return state;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function queryWithLanggraph(question, mock = false) {
  const initialState = {
    question,
    mock,
    route: null,
    rag_answer: null,
    critique: null,
    needs_refinement: null,
    refined_answer: null,
    iteration: 0,
    sub_questions: null,
    sub_answers: null,
    synthesized_answer: null,
    final_answer: null,
    trace: [],
  };

  const result = await runGraph(initialState);

  return {
    question,
    final_answer: result.final_answer || null,
    route: result.route || null,
    rag_answer: result.rag_answer || null,
    refined_answer: result.refined_answer || null,
    sub_questions: result.sub_questions || null,
    sub_answers: result.sub_answers || null,
    synthesized_answer: result.synthesized_answer || null,
    trace: result.trace || [],
    iterations: result.iteration || 0,
  };
}

/**
 * Parse LangGraph analysis into per-resource enrichment.
 * Mirrors flask-server/LangGraph.py parse_analysis_to_resources().
 */
async function parseAnalysisToResources(
  analysisText,
  subAnswers,
  resourcePaths,
  mock = false
) {
  if (!resourcePaths || resourcePaths.length === 0) {
    return {};
  }

  if (mock) {
    const pathsSet = new Set(resourcePaths);
    const result = {};
    for (const [p, v] of Object.entries(MOCK_ENRICHMENT)) {
      if (pathsSet.has(p)) {
        result[p] = { ...v };
      }
    }
    return result;
  }

  // Build context from sub-answers
  let subContext = "";
  if (subAnswers && subAnswers.length > 0) {
    subContext = subAnswers
      .map((a) => `Q: ${a.question || ""}\nA: ${a.answer || ""}`)
      .join("\n\n");
  }

  const pathsJson = JSON.stringify(resourcePaths);
  const prompt =
    `Given this Terraform infrastructure analysis:\n\n` +
    `=== SYNTHESIZED ANALYSIS ===\n${analysisText}\n=== END ===\n\n` +
    (subContext
      ? `\n=== SUB-QUESTION ANSWERS (additional context) ===\n${subContext}\n=== END ===\n\n`
      : "") +
    `And these resource paths from the Terraform plan:\n${pathsJson}\n\n` +
    `For each resource path that the analysis discusses, extract what it says. Return a JSON object where each key is a resource path (exact string from the list) and each value is:\n` +
    `{ "summary": "brief 1-2 sentence summary for this resource", "issues": ["issue1", "issue2"], "recommendations": ["rec1", "rec2"] }\n\n` +
    `Rules:\n` +
    `- Only include paths that appear in the list and that the analysis discusses\n` +
    `- If the analysis doesn't mention a resource, omit it (don't include empty entries)\n` +
    `- Use empty arrays for issues/recommendations if none\n` +
    `- Return valid JSON only, no markdown or extra text`;

  const text = await llmInvoke([{ role: "user", content: prompt }]);

  const match = text.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : text;

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === "object" && parsed !== null) {
      const pathsSet = new Set(resourcePaths);
      const result = {};
      for (const [path, val] of Object.entries(parsed)) {
        if (pathsSet.has(path) && typeof val === "object") {
          result[path] = {
            summary: val.summary || "",
            issues: Array.isArray(val.issues) ? val.issues : [],
            recommendations: Array.isArray(val.recommendations)
              ? val.recommendations
              : [],
          };
        }
      }
      return result;
    }
  } catch {
    // fall through
  }

  return {};
}

module.exports = {
  queryWithLanggraph,
  parseAnalysisToResources,
  MOCK_GRAPH_NODES,
  MOCK_ENRICHMENT,
};
