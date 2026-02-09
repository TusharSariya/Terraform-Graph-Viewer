import logging
import re

import nest_asyncio
nest_asyncio.apply()

import json
from typing import Any, Optional

from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import VectorStoreIndex
from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.core.callbacks import CallbackManager
from llama_index.core.callbacks.base_handler import BaseCallbackHandler
from llama_index.core.callbacks.schema import CBEventType, EventPayload
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.response_synthesizers import get_response_synthesizer
from llama_index.core.prompts import PromptTemplate
from llama_index.core.schema import TextNode, NodeWithScore, QueryBundle
from llama_index.llms.ollama import Ollama
from llama_index.llms.anthropic import Anthropic
from llama_index.core.evaluation import FaithfulnessEvaluator, RelevancyEvaluator
from app import build_graph3_nodes
import os

logger = logging.getLogger(__name__)

# Initialize local embedding model
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-large-en-v1.5")

# Initialize LLM
# llm = Ollama(model="mistral", request_timeout=120.0)
llm = Anthropic(model="claude-opus-4-6", api_key=os.environ["ANTHROPIC_API_KEY"])

SYSTEM_PROMPT = (
    "You are a Terraform infrastructure expert. "
    "Answer questions using only the provided context from the Terraform plan. "
    "The context includes resources and their dependency relationships (edges). "
    "Be concise. If the context doesn't contain the answer, say so."
)


class RetrievalCallbackHandler(BaseCallbackHandler):
    """Captures RETRIEVE events for introspection (nodes retrieved, query, etc.)."""

    def __init__(self):
        super().__init__(
            event_starts_to_ignore=[],
            event_ends_to_ignore=[],
        )
        self.last_retrieve_payload: Optional[dict[str, Any]] = None

    def on_event_start(
        self,
        event_type: CBEventType,
        payload: Optional[dict[str, Any]] = None,
        event_id: str = "",
        parent_id: str = "",
        **kwargs: Any,
    ) -> str:
        return event_id

    def on_event_end(
        self,
        event_type: CBEventType,
        payload: Optional[dict[str, Any]] = None,
        event_id: str = "",
        **kwargs: Any,
    ) -> None:
        if event_type == CBEventType.RETRIEVE and payload:
            self.last_retrieve_payload = dict(payload)
            nodes = payload.get(EventPayload.NODES, [])
            logger.info(
                "[graph-rag callback] RETRIEVE event: query=%s, nodes=%d",
                payload.get(EventPayload.QUERY_STR, ""),
                len(nodes),
            )

    def start_trace(self, trace_id: Optional[str] = None) -> None:
        pass

    def end_trace(
        self,
        trace_id: Optional[str] = None,
        trace_map: Optional[dict[str, list[str]]] = None,
    ) -> None:
        pass


def _path_from_address(address: str) -> str:
    """Normalize address to path (strip [0], [1], etc)."""
    return re.sub(r"\[\d+\]", "", address)


def _resource_to_text(path: str, address: str, resource: dict, node_data: dict) -> str:
    """Build the text representation for a resource."""
    change = resource.get("change", {})
    diff_str = json.dumps(change.get("diff", {}), indent=2)
    actions_str = ", ".join(change.get("actions", []))
    before_str = json.dumps(change.get("before", {}))
    after_str = json.dumps(change.get("after", {}))
    edges_new = node_data.get("edges_new", [])
    edges_existing = node_data.get("edges_existing", [])

    return (
        f"Terraform Resource: {address}\n"
        f"Path: {path}\n"
        f"Type: {resource.get('type', 'unknown')}\n"
        f"Actions: {actions_str}\n"
        f"Before Values: {before_str}\n"
        f"After Values: {after_str}\n"
        f"New edges: {', '.join(edges_new)}\n"
        f"Existing edges: {', '.join(edges_existing)}\n"
        f"Diff:\n{diff_str}"
    )


class TerraformGraphRetriever(BaseRetriever):
    """
    Hybrid retriever: vector search to find entry points, then graph traversal
    to expand context with dependency neighbors.
    """

    def __init__(
        self,
        vector_retriever: BaseRetriever,
        nodes: dict,
        address_to_node: dict[str, TextNode],
        path_to_neighbors: dict[str, set[str]],
        graph_hops: int = 1,
        verbose: bool = False,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._vector_retriever = vector_retriever
        self._nodes = nodes
        self._address_to_node = address_to_node
        self._path_to_neighbors = path_to_neighbors
        self._graph_hops = graph_hops
        self._verbose = verbose
        self.last_trace: Optional[dict[str, Any]] = None

    def _retrieve(self, query_bundle: QueryBundle) -> list[NodeWithScore]:
        # 1. Vector search for initial relevant nodes
        initial = self._vector_retriever.retrieve(query_bundle)

        # 2. Collect addresses from initial results
        vector_paths: set[str] = set()
        initial_scores: dict[str, float] = {}

        for nws in initial:
            addr = nws.node.node_id
            path = _path_from_address(addr)
            vector_paths.add(path)
            initial_scores[addr] = nws.score or 1.0

        collected_paths = set(vector_paths)

        # 3. Graph expansion: add neighbor paths (1 or 2 hops)
        hop_additions: list[set[str]] = []
        for hop in range(self._graph_hops):
            expanded = set(collected_paths)
            for path in collected_paths:
                for neigh_path in self._path_to_neighbors.get(path, []):
                    if neigh_path in self._nodes:
                        expanded.add(neigh_path)
            added = expanded - collected_paths
            hop_additions.append(added)
            collected_paths = expanded

        # Logging
        if self._verbose:
            logger.info(
                "[graph-rag] Vector: %s paths, after hop 1: +%s, final: %s paths",
                len(vector_paths),
                len(hop_additions[0]) if hop_additions else 0,
                len(collected_paths),
            )
        logger.debug(
            "[graph-rag] Vector paths: %s | Expanded: %s",
            sorted(vector_paths),
            sorted(collected_paths - vector_paths),
        )

        # 4. Build NodeWithScore list: initial (vector) results first, then expanded
        seen_addresses: set[str] = set()
        result: list[NodeWithScore] = []

        # Add initial vector results first (preserve order and scores) + metadata
        for nws in initial:
            addr = nws.node.node_id
            path = _path_from_address(addr)
            if addr not in seen_addresses and addr in self._address_to_node:
                seen_addresses.add(addr)
                node = nws.node
                if not node.metadata:
                    node.metadata = {}
                node.metadata["retrieval_source"] = "vector"
                node.metadata["graph_path"] = path
                result.append(nws)

        # Add graph-expanded neighbors + metadata
        for path in collected_paths:
            node_data = self._nodes.get(path, {})
            for address in node_data.get("resources", {}):
                if address in seen_addresses:
                    continue
                seen_addresses.add(address)

                text_node = self._address_to_node.get(address)
                if text_node is None:
                    continue

                if not text_node.metadata:
                    text_node.metadata = {}
                text_node.metadata["retrieval_source"] = "graph_hop_1"
                text_node.metadata["graph_path"] = path

                result.append(NodeWithScore(node=text_node, score=0.9))

        # Store trace for debug endpoint
        self.last_trace = {
            "query": query_bundle.query_str,
            "vector_paths": sorted(vector_paths),
            "vector_path_count": len(vector_paths),
            "hop_additions": [sorted(s) for s in hop_additions],
            "collected_paths": sorted(collected_paths),
            "collected_path_count": len(collected_paths),
            "final_node_count": len(result),
        }

        return result


def build_index():
    """Build vector index and graph structures from graph3 pipeline output."""

    print("[rag] Building graph3 nodes...")
    nodes = build_graph3_nodes()
    print(f"[rag] Graph built — {len(nodes)} resource paths")

    # Build TextNodes and mappings
    text_nodes: list[TextNode] = []
    address_to_node: dict[str, TextNode] = {}
    path_to_neighbors: dict[str, set[str]] = {}

    for path, node_data in nodes.items():
        neighbors = set(node_data.get("edges_new", [])) | set(
            node_data.get("edges_existing", [])
        )
        path_to_neighbors[path] = neighbors

        for address, resource in node_data.get("resources", {}).items():
            node_text = _resource_to_text(path, address, resource, node_data)
            text_node = TextNode(text=node_text, id_=address)
            text_nodes.append(text_node)
            address_to_node[address] = text_node

    print(f"[rag] Indexing {len(text_nodes)} resources...")
    vector_index = VectorStoreIndex(text_nodes, embed_model=embed_model)
    vector_retriever = vector_index.as_retriever(similarity_top_k=5)

    print(f"[rag] Index build complete — {len(text_nodes)} resources, graph ready")
    return vector_index, vector_retriever, nodes, address_to_node, path_to_neighbors


def build_query_engine(
    vector_retriever,
    nodes: dict,
    address_to_node: dict,
    path_to_neighbors: dict,
    verbose: bool = False,
):
    """Create a graph RAG query engine."""
    retrieval_handler = RetrievalCallbackHandler()
    callback_manager = CallbackManager(handlers=[retrieval_handler])

    graph_retriever = TerraformGraphRetriever(
        vector_retriever=vector_retriever,
        nodes=nodes,
        address_to_node=address_to_node,
        path_to_neighbors=path_to_neighbors,
        graph_hops=1,
        verbose=verbose,
    )

    text_qa_template = PromptTemplate(
        f"{SYSTEM_PROMPT}\n\n"
        "Context information is below.\n"
        "---------------------\n"
        "{context_str}\n"
        "---------------------\n"
        "Given the context information and not prior knowledge, answer the query.\n"
        "Query: {query_str}\n"
        "Answer: "
    )
    response_synthesizer = get_response_synthesizer(
        llm=llm,
        text_qa_template=text_qa_template,
    )

    query_engine = RetrieverQueryEngine(
        retriever=graph_retriever,
        response_synthesizer=response_synthesizer,
        callback_manager=callback_manager,
    )

    return query_engine, graph_retriever, retrieval_handler


# Module-level singletons
_vector_index = None
_query_engine = None
_graph_retriever: Optional[TerraformGraphRetriever] = None
_retrieval_handler: Optional[RetrievalCallbackHandler] = None
_graph_data = None

# Set to True to enable verbose retrieval logging
RAG_VERBOSE = os.environ.get("RAG_VERBOSE", "").lower() in ("1", "true", "yes")


def get_query_engine():
    """Return a cached query engine, building on first call."""
    global _vector_index, _query_engine, _graph_retriever, _retrieval_handler, _graph_data

    if _query_engine is None:
        print("[rag] First call — building index...")
        (
            _vector_index,
            vector_retriever,
            nodes,
            address_to_node,
            path_to_neighbors,
        ) = build_index()
        _graph_data = (nodes, address_to_node, path_to_neighbors)
        _query_engine, _graph_retriever, _retrieval_handler = build_query_engine(
            vector_retriever,
            nodes,
            address_to_node,
            path_to_neighbors,
            verbose=RAG_VERBOSE,
        )
        print("[rag] Graph RAG query engine ready")
    else:
        print("[rag] Using cached index")

    return _query_engine


def get_graph_retriever() -> Optional[TerraformGraphRetriever]:
    """Return the graph retriever (for debug endpoint). Call get_query_engine() first."""
    get_query_engine()
    return _graph_retriever


def get_evaluators() -> tuple[FaithfulnessEvaluator, RelevancyEvaluator]:
    """Return evaluators for RAG performance validation."""
    return FaithfulnessEvaluator(llm=llm), RelevancyEvaluator(llm=llm)


if __name__ == "__main__":
    engine = get_query_engine()
    response = engine.query("What resources depend on the Lambda function?")
    print(str(response))
