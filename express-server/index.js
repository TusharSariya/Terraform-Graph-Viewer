const express = require("express");
const cors = require("cors");
const {
  queryWithLanggraph,
  parseAnalysisToResources,
  MOCK_GRAPH_NODES,
} = require("./langgraph");

const app = express();
const PORT = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());
app.set("json spaces", 2);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", server: "express-langgraph" });
});

// LangGraph-powered RAG endpoint — mirrors Flask /api/query/langgraph
app.post("/api/query/langgraph", async (req, res) => {
  const { question, mock } = req.body || {};
  const trimmed = (question || "").trim();

  if (!trimmed) {
    return res
      .status(400)
      .json({ error: "A 'question' field is required in the JSON body." });
  }

  try {
    const result = await queryWithLanggraph(trimmed, Boolean(mock));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, trace: err.stack });
  }
});

// Graph4 endpoint — mirrors Flask /api/graph4
// Returns Terraform graph nodes enriched with LLM analysis.
// Pass ?mock=true to skip all LLM calls.
const GRAPH4_QUESTION =
  "Are there any bugs or issues in this Terraform plan? " +
  "Analyze each resource. Check for missing event source mappings, IAM gaps, " +
  "networking issues, and configuration problems.";

app.get("/api/graph4", async (req, res) => {
  const mock =
    (req.query.mock || "").toLowerCase() === "true" ||
    req.query.mock === "1";

  try {
    // In mock mode use shared mock nodes; live mode not supported (no Terraform pipeline)
    if (!mock) {
      return res.status(501).json({
        error:
          "Live mode not supported — Express backend has no Terraform pipeline. Use ?mock=true.",
      });
    }

    const nodes = JSON.parse(JSON.stringify(MOCK_GRAPH_NODES));
    const resourcePaths = Object.keys(nodes);

    const langgraphResult = await queryWithLanggraph(GRAPH4_QUESTION, mock);

    const analysisText =
      langgraphResult.synthesized_answer ||
      langgraphResult.final_answer ||
      langgraphResult.rag_answer ||
      "";
    const subAnswers = langgraphResult.sub_answers || [];

    const enrichmentByPath = await parseAnalysisToResources(
      analysisText,
      subAnswers,
      resourcePaths,
      mock
    );

    // Enrich each node — same loop as Flask
    for (const [path, nodeData] of Object.entries(nodes)) {
      const enrichment = enrichmentByPath[path] || {};
      nodeData.enrichment = {
        summary: enrichment.summary || "",
        issues: enrichment.issues || [],
        recommendations: enrichment.recommendations || [],
      };
      nodeData.AI = {
        Issues: enrichment.issues || [],
        Sumary: enrichment.summary || "",
        Recomendations: enrichment.recommendations || [],
      };
    }

    res.json(nodes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, trace: err.stack });
  }
});

app.listen(PORT, () => {
  console.log(`Express LangGraph server listening on http://localhost:${PORT}`);
});
