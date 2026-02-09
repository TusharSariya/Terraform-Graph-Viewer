"""
LangGraph-powered Terraform RAG: demonstrates more powerful features than basic RAG.

Features demonstrated:
1. ROUTING - Classify question type (simple / complex / analysis) and route to different strategies
2. AGENTIC RAG - Retrieve → Critique → Refine loop (iterate if answer is incomplete)
3. TOOL USE - RAG wrapped as a LangChain tool that the graph can invoke
4. MULTI-STEP REASONING - Explicit graph of nodes with conditional edges
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

import logging
import os
from operator import add
from typing import Annotated, Literal, Optional, TypedDict

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
        for phrase in ["bug", "error", "issue", "correct", "wrong", "problem", "analyze"]
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
    """Choose the final answer (refined if we had refinement, else initial)."""
    refined = state.get("refined_answer")
    initial = state.get("rag_answer", "")
    final = refined if refined else initial

    return {"final_answer": final, "trace": [f"[final] Output: {len(final)} chars"]}


# ---------------------------------------------------------------------------
# Conditional edge: after router
# ---------------------------------------------------------------------------


def route_after_router(state: TerraformRAGState) -> Literal["rag_retrieve", "rag_retrieve"]:
    """All routes go through RAG first; complexity affects critique/refine."""
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
    builder.add_node("rag_retrieve", rag_retrieve)
    builder.add_node("critique", critique)
    builder.add_node("refine", refine_then_format)
    builder.add_node("format_final", format_final)

    # Edges
    builder.add_edge(START, "router")
    builder.add_conditional_edges("router", route_after_router)
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
