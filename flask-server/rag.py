import nest_asyncio
nest_asyncio.apply()

import json
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import VectorStoreIndex
from llama_index.core.schema import TextNode
from llama_index.llms.ollama import Ollama
from app import build_graph3_nodes

# Initialize local embedding model
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Initialize Local LLM via Ollama
llm = Ollama(model="mistral", request_timeout=120.0)


def build_index():
    """Build a VectorStoreIndex from the graph3 pipeline output."""

    # Get processed nodes from graph3 pipeline
    print("[rag] Building graph3 nodes...")
    nodes = build_graph3_nodes()
    print(f"[rag] Graph built — {len(nodes)} resource paths")

    # Build all TextNodes
    text_nodes = []
    for path, node_data in nodes.items():
        for address, resource in node_data.get("resources", {}).items():
            change = resource.get("change", {})
            diff_str = json.dumps(change.get("diff", {}), indent=2)
            actions_str = ", ".join(change.get("actions", []))

            edges_new = node_data.get("edges_new", [])
            edges_existing = node_data.get("edges_existing", [])

            node_text = (
                f"Terraform Resource: {address}\n"
                f"Path: {path}\n"
                f"Type: {resource.get('type', 'unknown')}\n"
                f"Actions: {actions_str}\n"
                f"New edges: {', '.join(edges_new)}\n"
                f"Existing edges: {', '.join(edges_existing)}\n"
                f"Diff:\n{diff_str}"
            )

            text_nodes.append(TextNode(text=node_text, id_=address))

    print(f"[rag] Indexing {len(text_nodes)} resources...")
    index = VectorStoreIndex(
        text_nodes,
        embed_model=embed_model,
    )

    print(f"[rag] Index build complete — {len(text_nodes)} resources ingested")
    return index


def build_query_engine(index):
    """Create a query engine from the index."""
    return index.as_query_engine(
        llm=llm,
        similarity_top_k=5,
    )


# Module-level singletons (built lazily)
_index = None
_query_engine = None


def get_query_engine():
    """Return a cached query engine, building the index on first call."""
    global _index, _query_engine
    if _query_engine is None:
        print("[rag] First call — building index...")
        _index = build_index()
        _query_engine = build_query_engine(_index)
        print("[rag] Query engine ready")
    else:
        print("[rag] Using cached index")
    return _query_engine


if __name__ == "__main__":
    engine = get_query_engine()
    response = engine.query("What resources depend on the security group?")
    print(str(response))
