---
name: graphify
description: "Query the codebase as a knowledge graph instead of grepping. Graphify (installed via pip as `graphifyy`) maps code, docs and configs into graphify-out/graph.json with tree-sitter AST parsing, fully local, no LLM needed for code. Use when you need to understand architecture, trace how two components connect, find what is impacted by a change, or answer codebase questions that would otherwise require reading many files. Requires the graph to be built first (`python -m graphify extract . --code-only`)."
version: 1.0.0
---

# Graphify: query the codebase as a knowledge graph

Graphify turns a codebase into `graphify-out/graph.json`: a knowledge graph of
concepts, files and their connections. Code is parsed locally with tree-sitter,
deterministically, nothing leaves the machine. Query it instead of grepping.

On this machine the CLI is installed as a Python module, so call it as
`python -m graphify ...` (the PyPI package is `graphifyy`; the command name is `graphify`).

## Building the graph

Only when `graphify-out/graph.json` does not exist yet, or the user asks:

```
python -m graphify extract . --code-only          # code only, no API key, fully local
python -m graphify extract . --code-only --no-viz # skip the HTML, faster on big repos
```

- `--code-only` keeps everything local and needs no API key. Without it,
  docs/PDFs/images go through an LLM backend (needs an API key env var).
- After code changes: `python -m graphify update .` re-extracts only changed files.

## Querying (this is the point of the skill)

Prefer these over reading many files:

```
python -m graphify query "what connects auth to the database?"   # scoped subgraph for a question
python -m graphify path "UserService" "DatabasePool"             # shortest path between two nodes
python -m graphify explain "APIRouter"                           # one node + its connections
python -m graphify affected "RateLimiter"                        # reverse traversal: what is impacted
python -m graphify god-nodes                                     # most-connected architectural hubs
```

Exit codes for `query`/`path`/`explain`: 0 answer, 3 ambiguous name (candidates
are printed, pick one), 4 no matching node.

Every edge is tagged `EXTRACTED` (explicit in source) or `INFERRED` (resolved),
so you can tell direct reads from derived links.

## When to use it

- "How does X work?" -> `explain "X"`, then read only the files the answer cites.
- "Where should this feature go?" -> `god-nodes` + `query` for the subsystem.
- "What breaks if I change X?" -> `affected "X"`.
- "How are A and B connected?" -> `path "A" "B"`.

## Notes

- Output dir `graphify-out/` (graph.html, GRAPH_REPORT.md, graph.json) is
  regenerable; never treat it as source of truth for edits.
- If a query returns nothing useful, fall back to normal search and mention
  the graph may be stale; suggest `python -m graphify update .`.
