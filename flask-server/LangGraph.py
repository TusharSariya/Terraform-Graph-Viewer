"""
LangGraph-powered Terraform RAG: demonstrates more powerful features than basic RAG.

Features demonstrated:
1. ROUTING - Classify question type (simple / complex / analysis) and route to different strategies
2. MULTI-QUERY (analysis) - Decompose broad questions into sub-questions, RAG each in parallel, synthesize
3. AGENTIC RAG - Retrieve → Critique → Refine loop (iterate if answer is incomplete)
4. TOOL USE - RAG wrapped as a LangChain tool that the graph can invoke
5. STATE TRACKING - Full trace of steps, iterations, and intermediate results

Compare to basic rag.py: single retrieval → single LLM call. No routing, no critique, no refinement.

Usage:
  pip install langgraph langchain langchain-anthropic langchain-core
  curl -X POST http://localhost:8000/api/query/langgraph -H "Content-Type: application/json" \\
    -d '{"question": "Are there any bugs in my Terraform plan?"}'
"""

from __future__ import annotations

import nest_asyncio
nest_asyncio.apply()

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from operator import add
from typing import Annotated, Any, Literal, Optional, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State schema
# ---------------------------------------------------------------------------


class TerraformRAGState(TypedDict):
    """State passed through the LangGraph workflow."""

    # User input
    question: str

    # Routing
    route: Optional[str]  # "simple" | "complex" | "analysis"

    # RAG results
    rag_answer: Optional[str]
    critique: Optional[str]
    needs_refinement: Optional[bool]

    # Refinement (agentic loop)
    refined_answer: Optional[str]
    iteration: int

    # Multi-query (analysis path)
    sub_questions: Optional[list[str]]
    sub_answers: Optional[list[dict[str, str]]]  # [{"question": str, "answer": str}, ...]
    synthesized_answer: Optional[str]

    # Final output
    final_answer: Optional[str]

    # Trace / introspection (reducer: append new entries)
    trace: Annotated[list[str], add]


# ---------------------------------------------------------------------------
# LLM & Tools
# ---------------------------------------------------------------------------

llm = ChatAnthropic(
    model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
    temperature=0,
)


@tool
def terraform_rag_query(question: str) -> str:
    """
    Query the Terraform infrastructure graph RAG.
    Use this to get answers about resources, dependencies, and the Terraform plan.
    """
    from rag import get_query_engine

    engine = get_query_engine()
    response = engine.query(question)
    return str(response)


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


def router(state: TerraformRAGState) -> TerraformRAGState:
    """
    Classify the question and route to the appropriate strategy.
    - simple: direct lookup (e.g. "what is X?")
    - complex: needs graph traversal + potential refinement (e.g. "what depends on X?")
    - analysis: broad question needing multiple retrievals (e.g. "are there bugs?")
    """
    question = state["question"].lower()

    if any(
        phrase in question
        for phrase in [
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
        ]
    ):
        route = "analysis"
    elif any(
        phrase in question
        for phrase in ["depend", "use", "connect", "link", "chain", "impact"]
    ):
        route = "complex"
    else:
        route = "simple"

    logger.info("[LangGraph] Router: %s -> %s", question[:50], route)

    return {"route": route, "trace": [f"[router] Classified as '{route}'"]}


def rag_retrieve(state: TerraformRAGState) -> TerraformRAGState:
    """Call the graph RAG to get an initial answer."""
    question = state["question"]

    answer = terraform_rag_query.invoke({"question": question})

    return {"rag_answer": answer, "trace": [f"[rag] Retrieved answer ({len(answer)} chars)"]}


# ---------------------------------------------------------------------------
# Connection checklist: when service X connects to Y, verify env vars, IAM,
# networking, and connecting resources (e.g., ESM for Lambdas)
# ---------------------------------------------------------------------------

CONNECTION_CHECKS: dict[tuple[str, str], list[str]] = {
    # Lambda consuming from SQS
    ("aws_lambda_function", "aws_sqs_queue"): [
        "Does the Lambda have an aws_lambda_event_source_mapping to the SQS queue?",
        "Does the Lambda have IAM permissions for sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes?",
        "Is the Lambda in a VPC that can reach SQS, or using public SQS?",
    ],
    # Lambda consuming from SNS (if used as trigger)
    ("aws_lambda_function", "aws_sns_topic"): [
        "Does the Lambda have an aws_lambda_event_source_mapping or aws_lambda_permission for the SNS topic?",
        "Does the Lambda have IAM permissions for sns:Subscribe or equivalent?",
    ],
    # Lambda reading from S3
    ("aws_lambda_function", "aws_s3_bucket"): [
        "Does the Lambda have IAM permissions for s3:GetObject, s3:ListBucket?",
        "Is there an environment variable or parameter for the bucket name/ARN?",
    ],
    # Lambda writing to S3
    ("aws_s3_bucket", "aws_lambda_function"): [
        "Does the Lambda have IAM permissions for s3:PutObject, s3:DeleteObject?",
        "Is there an environment variable for the bucket name?",
    ],
    # Lambda consuming from Kinesis/DynamoDB streams
    ("aws_lambda_function", "aws_kinesis_stream"): [
        "Does the Lambda have an aws_lambda_event_source_mapping to the Kinesis stream?",
        "Does the Lambda have IAM permissions for kinesis:GetRecords, kinesis:GetShardIterator?",
    ],
    ("aws_lambda_function", "aws_dynamodb_table"): [
        "If consuming from DynamoDB streams: does the Lambda have aws_lambda_event_source_mapping?",
        "Does the Lambda have IAM permissions for dynamodb:GetItem, dynamodb:Query, or streams permissions?",
    ],
    # ECS service connecting to RDS
    ("aws_ecs_service", "aws_db_instance"): [
        "Does the ECS task have environment variables for DB host, port, and credentials?",
        "Does the ECS task role have IAM or secrets manager access for DB credentials?",
        "Are security groups configured so ECS can reach the RDS instance?",
    ],
    # Generic fallback for any service-to-service
    ("*", "*"): [
        "Does the connection include the required environment variables for the consumer to reach the target?",
        "Does the consumer have IAM permissions to access the target?",
        "Is networking (VPC, security groups) configured for the connection?",
    ],
}


def _extract_resource_type(path: str) -> str | None:
    """Extract Terraform resource type from path (e.g. aws_lambda_function, aws_sqs_queue)."""
    parts = path.split(".")
    for part in parts:
        if part.startswith("aws_") and "." not in part:
            return part
    return None


# Pairs where we inject checklist questions if BOTH types exist in graph
# (connections may be indirect via IAM policies, so edge-based scan can miss them)
CO_PRESENCE_CHECKS: list[tuple[str, str]] = [
    ("aws_lambda_function", "aws_sqs_queue"),  # Lambda consuming from SQS
    ("aws_lambda_function", "aws_s3_bucket"),  # Lambda accessing S3
]


def _get_connection_check_questions() -> list[str]:
    """
    Scan the graph for connected resource pairs, infer types, and return
    checklist questions from CONNECTION_CHECKS. Also adds questions when
    key resource types co-exist (e.g. Lambda + SQS) even without direct edges.
    Dedupes and returns unique questions.
    """
    try:
        from app import build_graph3_nodes
    except ImportError:
        return []

    nodes = build_graph3_nodes()
    seen_questions: set[str] = set()
    result: list[str] = []

    # Collect all resource types present in the graph
    types_present: set[str] = set()
    for path in nodes:
        t = _extract_resource_type(path)
        if t:
            types_present.add(t)

    # 1. Edge-based: iterate connected pairs
    for path, node_data in nodes.items():
        source_type = _extract_resource_type(path)
        if not source_type:
            continue

        edges = list(node_data.get("edges_new", [])) + list(node_data.get("edges_existing", []))
        for target_path in edges:
            if target_path not in nodes:
                continue
            target_type = _extract_resource_type(target_path)
            if not target_type:
                continue

            key = (source_type, target_type)
            questions = CONNECTION_CHECKS.get(key) or CONNECTION_CHECKS.get(("*", "*"), [])
            for q in questions:
                if q not in seen_questions:
                    seen_questions.add(q)
                    result.append(q)

    # 2. Co-presence: if Lambda + SQS (or similar) exist, add their checklist
    for src, tgt in CO_PRESENCE_CHECKS:
        if src in types_present and tgt in types_present:
            key = (src, tgt)
            questions = CONNECTION_CHECKS.get(key, [])
            for q in questions:
                if q not in seen_questions:
                    seen_questions.add(q)
                    result.append(q)

    return result


# ---------------------------------------------------------------------------
# Multi-query (analysis path)
# ---------------------------------------------------------------------------


def decompose_question(question: str) -> list[str]:
    """
    LLM decomposes a broad question into 3-5 specific sub-questions.
    Each targets a different concern: deployment, security, networking, dependencies, etc.
    """
    prompt = f"""Given this Terraform/infrastructure question, decompose it into 3-5 specific sub-questions.
Each sub-question should target a different concern. Use these categories when relevant:
- Terraform deployment issues (syntax, plan errors, state)
- Security issues (IAM, permissions, exposed resources)
- Networking issues (VPC, subnets, connectivity)
- Missing resources or dependencies (resources needed but not defined)
- Configuration issues (incorrect values, drift)

Original question: {question}

Return a JSON array of strings only. Example: ["question 1?", "question 2?", "question 3?"]
Output only the JSON array, no other text."""

    response = llm.invoke([HumanMessage(content=prompt)])
    text = (response.content if hasattr(response, "content") else str(response)).strip()

    # Extract JSON array (handle markdown code blocks)
    match = re.search(r"\[[\s\S]*?\]", text)

    if match:
        text = match.group(0)
    try:
        sub_questions = json.loads(text)
        if isinstance(sub_questions, list) and all(isinstance(s, str) for s in sub_questions):
            return sub_questions[:6]  # Cap at 6
    except json.JSONDecodeError:
        pass

    # Fallback: use predefined sub-questions (include Lambda event source mapping check)
    return [
        "Are there Terraform deployment or plan issues?",
        "Are there security or IAM issues?",
        "Are there networking or connectivity issues?",
        "Are there any missing resources or dependencies?",
        "Does each aws_lambda_function that should consume from SQS/Kinesis have a corresponding aws_lambda_event_source_mapping? List Lambdas and their event source mappings (or note if missing).",
        "Are there configuration or drift issues?",
    ]


def decompose(state: TerraformRAGState) -> TerraformRAGState:
    """Generate sub-questions from broad analysis question, plus connection-checklist questions."""
    question = state["question"]
    sub_questions = decompose_question(question)

    # Inject rule-based connection checklist questions from graph scan
    checklist_questions = _get_connection_check_questions()
    seen = {sq.lower().strip() for sq in sub_questions}
    added = 0
    for q in checklist_questions:
        if q.lower().strip() not in seen:
            sub_questions.append(q)
            seen.add(q.lower().strip())
            added += 1

    if added:
        logger.info(
            "[LangGraph] Added %d connection-checklist questions (total: %d)",
            added,
            len(sub_questions),
        )
    logger.info("[LangGraph] Decomposed into %d sub-questions: %s", len(sub_questions), sub_questions)

    return {
        "sub_questions": sub_questions,
        "trace": [f"[decompose] Generated {len(sub_questions)} sub-questions"],
    }


def multi_rag_retrieve(state: TerraformRAGState) -> TerraformRAGState:
    """Run RAG for each sub-question in parallel, collect answers."""
    sub_questions = state.get("sub_questions", [])

    def _rag_one(sq: str) -> dict[str, str]:
        ans = terraform_rag_query.invoke({"question": sq})
        return {"question": sq, "answer": ans}

    sub_answers = []
    with ThreadPoolExecutor(max_workers=min(6, len(sub_questions))) as executor:
        futures = {executor.submit(_rag_one, sq): sq for sq in sub_questions}
        for future in as_completed(futures):
            sub_answers.append(future.result())

    # Preserve order of sub_questions
    order = {sq: i for i, sq in enumerate(sub_questions)}
    sub_answers.sort(key=lambda x: order.get(x["question"], 999))

    return {
        "sub_answers": sub_answers,
        "trace": [f"[multi_rag] Retrieved {len(sub_answers)} sub-answers in parallel"],
    }


def synthesize(state: TerraformRAGState) -> TerraformRAGState:
    """LLM synthesizes sub-answers into one coherent answer."""
    question = state["question"]
    sub_answers = state.get("sub_answers", [])

    chunks = []
    for i, item in enumerate(sub_answers, 1):
        chunks.append(f"### {i}. {item['question']}\n{item['answer']}")

    synthesize_prompt = f"""Original question: {question}

Below are answers to specific sub-questions about the Terraform infrastructure.
Synthesize them into one coherent, well-structured answer. Group by concern if helpful.
Include any issues or recommendations. Be concise but complete.

Sub-question answers:
{chr(10).join(chunks)}

Synthesized answer:"""

    response = llm.invoke([HumanMessage(content=synthesize_prompt)])
    synthesized = response.content if hasattr(response, "content") else str(response)

    return {
        "synthesized_answer": synthesized,
        "trace": [f"[synthesize] Combined {len(sub_answers)} answers ({len(synthesized)} chars)"],
    }


def critique(state: TerraformRAGState) -> TerraformRAGState:
    """
    LLM critiques the RAG answer: is it complete and faithful to the context?
    Returns needs_refinement=True if the answer seems incomplete or uncertain.
    """
    question = state["question"]
    answer = state.get("rag_answer", "")

    messages = [
        SystemMessage(
            content="You are a strict quality assessor. Evaluate if the answer fully addresses the question "
            "using ONLY the provided context. Answer with a JSON object: {\"complete\": true/false, \"reason\": \"brief explanation\"}."
        ),
        HumanMessage(
            content=f"Question: {question}\n\nAnswer to evaluate:\n{answer}\n\n"
            "Is this answer complete and supported by the context? Reply with JSON only."
        ),
    ]

    response = llm.invoke(messages)
    critique_text = response.content if hasattr(response, "content") else str(response)

    # Parse simple JSON (robust fallback)
    needs_refinement = True
    if "true" in critique_text.lower() and "complete" in critique_text.lower():
        needs_refinement = False

    return {
        "critique": critique_text,
        "needs_refinement": needs_refinement,
        "trace": [f"[critique] needs_refinement={needs_refinement}"],
    }


def refine(state: TerraformRAGState) -> TerraformRAGState:
    """
    If critique said the answer is incomplete, do a follow-up RAG with a refined question
    and synthesize a better answer.
    """
    question = state["question"]
    initial_answer = state.get("rag_answer", "")
    critique_text = state.get("critique", "")

    # Refined question: ask for supplemental info based on critique
    refine_prompt = (
        f"Original question: {question}\n\n"
        f"Initial answer (may be incomplete): {initial_answer}\n\n"
        f"Critique: {critique_text}\n\n"
        "Generate a more specific follow-up question to retrieve missing information. "
        "One short question only, no explanation."
    )
    messages = [HumanMessage(content=refine_prompt)]
    response = llm.invoke(messages)
    follow_up = response.content if hasattr(response, "content") else str(response)
    follow_up = follow_up.strip().strip('"').strip("'")[:200]

    # Second RAG call with follow-up
    supplemental = terraform_rag_query.invoke({"question": follow_up})

    # Synthesize combined answer
    synthesize_prompt = (
        f"Original question: {question}\n\n"
        f"Initial answer: {initial_answer}\n\n"
        f"Supplemental info (from follow-up): {supplemental}\n\n"
        "Combine into one complete, concise answer. Do not repeat yourself."
    )
    messages = [HumanMessage(content=synthesize_prompt)]
    response = llm.invoke(messages)
    refined = response.content if hasattr(response, "content") else str(response)

    return {"refined_answer": refined, "trace": [f"[refine] Synthesized {len(refined)} chars"]}


def format_final(state: TerraformRAGState) -> TerraformRAGState:
    """Choose the final answer (synthesized > refined > initial)."""
    synthesized = state.get("synthesized_answer")
    refined = state.get("refined_answer")
    initial = state.get("rag_answer", "")
    final = synthesized or refined or initial

    return {"final_answer": final, "trace": [f"[final] Output: {len(final)} chars"]}


# ---------------------------------------------------------------------------
# Conditional edge: after router
# ---------------------------------------------------------------------------


def route_after_router(state: TerraformRAGState) -> Literal["decompose", "rag_retrieve"]:
    """Analysis -> multi-query path. Simple/complex -> single RAG path."""
    route = state.get("route", "simple")
    if route == "analysis":
        return "decompose"
    return "rag_retrieve"


# ---------------------------------------------------------------------------
# Conditional edge: after RAG
# ---------------------------------------------------------------------------


def route_after_rag(state: TerraformRAGState) -> Literal["critique", "format_final"]:
    """
    For 'complex' and 'analysis': run critique (potential refine loop).
    For 'simple': skip critique and go straight to final.
    """
    route = state.get("route", "simple")
    if route in ("complex", "analysis"):
        return "critique"
    return "format_final"


# ---------------------------------------------------------------------------
# Conditional edge: after critique
# ---------------------------------------------------------------------------


def route_after_critique(state: TerraformRAGState) -> Literal["refine", "format_final"]:
    """If critique says incomplete -> refine. Else -> final."""
    needs_refinement = state.get("needs_refinement", False)
    iteration = state.get("iteration", 0)
    max_iterations = 1  # Cap refinement loop
    if needs_refinement and iteration < max_iterations:
        return "refine"
    return "format_final"


# ---------------------------------------------------------------------------
# Refine node: also increments iteration
# ---------------------------------------------------------------------------


def refine_then_format(state: TerraformRAGState) -> TerraformRAGState:
    """Refine and pass through to format_final."""
    result = refine(state)
    result["iteration"] = state.get("iteration", 0) + 1
    return result


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------


def build_terraform_langgraph() -> StateGraph:
    """Build and compile the LangGraph workflow."""
    builder = StateGraph(TerraformRAGState)

    # Nodes
    builder.add_node("router", router)
    builder.add_node("decompose", decompose)
    builder.add_node("multi_rag_retrieve", multi_rag_retrieve)
    builder.add_node("synthesize", synthesize)
    builder.add_node("rag_retrieve", rag_retrieve)
    builder.add_node("critique", critique)
    builder.add_node("refine", refine_then_format)
    builder.add_node("format_final", format_final)

    # Edges
    builder.add_edge(START, "router")
    builder.add_conditional_edges("router", route_after_router)
    # Analysis path: decompose -> multi_rag -> synthesize -> format_final
    builder.add_edge("decompose", "multi_rag_retrieve")
    builder.add_edge("multi_rag_retrieve", "synthesize")
    builder.add_edge("synthesize", "format_final")
    # Single RAG path
    builder.add_conditional_edges("rag_retrieve", route_after_rag)
    builder.add_conditional_edges("critique", route_after_critique)
    builder.add_edge("refine", "format_final")
    builder.add_edge("format_final", END)

    return builder.compile()


# ---------------------------------------------------------------------------
# Convenience
# ---------------------------------------------------------------------------

_graph = None


def get_langgraph() -> StateGraph:
    """Return the compiled LangGraph (cached)."""
    global _graph
    if _graph is None:
        _graph = build_terraform_langgraph()
    return _graph


def query_with_langgraph(question: str) -> dict:
    """
    Run a question through the full LangGraph workflow.
    Returns dict with final_answer, trace, route, and metadata.
    """
    graph = get_langgraph()
    initial_state: TerraformRAGState = {
        "question": question,
        "route": None,
        "rag_answer": None,
        "critique": None,
        "needs_refinement": None,
        "refined_answer": None,
        "iteration": 0,
        "sub_questions": None,
        "sub_answers": None,
        "synthesized_answer": None,
        "final_answer": None,
        "trace": [],
    }

    result = graph.invoke(initial_state)

    return {
        "question": question,
        "final_answer": result.get("final_answer"),
        "route": result.get("route"),
        "rag_answer": result.get("rag_answer"),
        "refined_answer": result.get("refined_answer"),
        "sub_questions": result.get("sub_questions"),
        "sub_answers": result.get("sub_answers"),
        "synthesized_answer": result.get("synthesized_answer"),
        "trace": result.get("trace", []),
        "iterations": result.get("iteration", 0),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("LangGraph Terraform RAG Demo\n" + "=" * 50)

    # Test with different question types to show routing
    questions = [
        "What resources depend on the Lambda function?",
        "Are there any bugs in my Terraform plan?",
        "What is the S3 bucket name?",
    ]

    for q in questions:
        print(f"\nQ: {q}")
        out = query_with_langgraph(q)
        print(f"Route: {out['route']}")
        print(f"Trace: {out['trace']}")
        print(f"Answer: {out['final_answer'][:300]}..." if out.get("final_answer") else "No answer")
        print("-" * 50)
