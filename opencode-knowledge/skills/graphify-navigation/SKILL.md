---
name: graphify-navigation
description: Use the prebuilt code knowledge graph to navigate this project before reading files
license: MIT
compatibility: opencode
metadata:
  category: navigation
  difficulty: beginner
---

# Graphify Navigation Skill

## What I Do

This project has a **prebuilt knowledge graph** at `graphify-out/graph.json`. I use it to
understand code structure, call relationships, and dependencies **before** opening or
grepping files — which is faster and uses far fewer tokens than reading the codebase.

## Commands (all local, zero cost, no network)

- `graphify query "<question>"` — find the symbols/files relevant to a question (BFS over the graph)
- `graphify path "<A>" "<B>"` — show how two symbols/classes are connected
- `graphify explain "<Symbol>"` — describe a node and everything it connects to
- `graphify affected "<Symbol>"` — reverse traversal: what breaks if I change this symbol

Add `--budget <N>` to `query` to cap output size (default 2000 tokens).

## How I Use It

1. **Before** broad reading/grepping, run `graphify query` using the **exact class/method
   names** likely present in the code. The matcher is case-folded substring + IDF — it has
   **no synonyms or stemming**, so query with real code vocabulary (e.g. `PlayerJoinListener`,
   `onEnable`, `DatabaseManager`), not natural-language paraphrases.
2. Use the results to open only the handful of files that actually matter.
3. For impact analysis before a refactor, use `graphify affected "<Symbol>"`.

## Critical Rules

- ✅ Only ever run the **read-only** subcommands: `query`, `path`, `explain`, `affected`.
- ❌ Do **not** run `graphify update`, `extract`, `install`, `clone`, `watch`, or any build/write
  subcommand. The AuroraCraft platform rebuilds the graph automatically when your session ends —
  you never need to build or refresh it yourself.
- If `graphify-out/graph.json` does not exist, the graph is unavailable for this project; just
  work normally without it.
