import re

import nest_asyncio
nest_asyncio.apply()

import json
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import VectorStoreIndex
from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.response_synthesizers import get_response_synthesizer
from llama_index.core.prompts import PromptTemplate
from llama_index.core.schema import TextNode, NodeWithScore, QueryBundle
from llama_index.llms.ollama import Ollama
from llama_index.llms.anthropic import Anthropic
from app import build_graph3_nodes
import os

# Initialize local embedding model
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-large-en-v1.5")

# Initialize LLM
# llm = Ollama(model="mistral", request_timeout=120.0)
llm = Anthropic(model="claude-sonnet-4-20250514", api_key=os.environ["ANTHROPIC_API_KEY"])

SYSTEM_PROMPT = (
    "You are a Terraform infrastructure expert. "
    "Answer questions using only the provided context from the Terraform plan. "
    "The context includes resources and their dependency relationships (edges). "
    "Be concise. If the context doesn't contain the answer, say so."
)


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
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._vector_retriever = vector_retriever
        self._nodes = nodes
        self._address_to_node = address_to_node
        self._path_to_neighbors = path_to_neighbors
        self._graph_hops = graph_hops

    def _retrieve(self, query_bundle: QueryBundle) -> list[NodeWithScore]:
        # 1. Vector search for initial relevant nodes
        initial = self._vector_retriever.retrieve(query_bundle)

        # 2. Collect addresses from initial results
        collected_paths: set[str] = set()
        initial_scores: dict[str, float] = {}

        for nws in initial:
            addr = nws.node.node_id
            path = _path_from_address(addr)
            collected_paths.add(path)
            initial_scores[addr] = nws.score or 1.0

        # 3. Graph expansion: add neighbor paths (1 or 2 hops)
        for _ in range(self._graph_hops):
            expanded = set(collected_paths)
            for path in collected_paths:
                for neigh_path in self._path_to_neighbors.get(path, []):
                    if neigh_path in self._nodes:
                        expanded.add(neigh_path)
            collected_paths = expanded

        # 4. Build NodeWithScore list: initial (vector) results first, then expanded
        seen_addresses: set[str] = set()
        result: list[NodeWithScore] = []

        # Add initial vector results first (preserve order and scores)
        for nws in initial:
            addr = nws.node.node_id
            if addr not in seen_addresses and addr in self._address_to_node:
                seen_addresses.add(addr)
                result.append(nws)

        # Add graph-expanded neighbors
        for path in collected_paths:
            node_data = self._nodes.get(path, {})
            for address in node_data.get("resources", {}):
                if address in seen_addresses:
                    continue
                seen_addresses.add(address)

                text_node = self._address_to_node.get(address)
                if text_node is None:
                    continue

                result.append(NodeWithScore(node=text_node, score=0.9))

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
):
    """Create a graph RAG query engine."""
    graph_retriever = TerraformGraphRetriever(
        vector_retriever=vector_retriever,
        nodes=nodes,
        address_to_node=address_to_node,
        path_to_neighbors=path_to_neighbors,
        graph_hops=1,
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

    return RetrieverQueryEngine(
        retriever=graph_retriever,
        response_synthesizer=response_synthesizer,
    )


# Module-level singletons
_vector_index = None
_query_engine = None
_graph_data = None


def get_query_engine():
    """Return a cached query engine, building on first call."""
    global _vector_index, _query_engine, _graph_data

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
        _query_engine = build_query_engine(
            vector_retriever, nodes, address_to_node, path_to_neighbors
        )
        print("[rag] Graph RAG query engine ready")
    else:
        print("[rag] Using cached index")

    return _query_engine


if __name__ == "__main__":
    engine = get_query_engine()
    response = engine.query("What resources depend on the Lambda function?")
    print(str(response))
