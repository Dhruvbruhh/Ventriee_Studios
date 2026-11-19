---
name: rag-anything
description: "Multimodal RAG over documents with RAG-Anything (pip: raganything, built on LightRAG). Query PDFs, Office docs and images that mix text, tables, equations and figures: ingest documents into a local knowledge base, then ask questions across all of it. Use when the user wants to 'index these PDFs', 'ask questions about this document set', or needs retrieval over rich documents where plain text extraction loses tables and images."
version: 1.0.0
---

# RAG-Anything: multimodal document RAG

RAG-Anything (installed via `pip install raganything`) is a Python library, not a
CLI: you write a small script that ingests documents into a LightRAG-backed
knowledge base and queries it.

## Requirements it needs from you (check before running)

- An LLM: OpenAI-compatible API key (`OPENAI_API_KEY` + optional `OPENAI_BASE_URL`
  for local servers like Ollama/LM Studio/vLLM) for the LLM and embedding calls.
- First parse downloads MinerU models automatically (several GB, slow first run).
- Office docs (.docx/.pptx/.xlsx) additionally need LibreOffice installed.

## Minimal working script

Write and run a script like this (adjust model to what the API key supports):

```python
import asyncio
import os
from functools import partial
from raganything import RAGAnything, RAGAnythingConfig
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc

async def main():
    api_key = os.environ["OPENAI_API_KEY"]
    base_url = os.environ.get("OPENAI_BASE_URL")
    config = RAGAnythingConfig(working_dir="./rag_storage", parser="mineru")
    llm = lambda prompt, system_prompt=None, history_messages=[], **kw: openai_complete_if_cache(
        "gpt-4o-mini", prompt, system_prompt=system_prompt,
        history_messages=history_messages, api_key=api_key, base_url=base_url, **kw)
    rag = RAGAnything(
        config=config, llm_model_func=llm,
        vision_model_func=llm,  # replace with a vision-capable call when images matter
        embedding_func=EmbeddingFunc(embedding_dim=3072, max_token_size=8192,
            func=partial(openai_embed.func, model="text-embedding-3-large",
                         api_key=api_key, base_url=base_url)))
    await rag.process_document_complete(file_path="doc.pdf", output_dir="./output")
    print(await rag.aquery("your question", mode="hybrid"))

asyncio.run(main())
```

- Batch: `await rag.process_folder_complete(folder_path="./docs", file_extensions=[".pdf", ".docx"], recursive=True)`.
- Reuse an existing store: point `working_dir` at the same folder; data persists.
- Query modes: `hybrid` (default), `local`, `global`, `naive`.
- Multimodal query: `rag.aquery_with_multimodal(question, multimodal_content=[{"type": "table", "table_data": "..."}], mode="hybrid")`.

## When to use what

- Pure codebase questions: use the `graphify` skill instead; this one is for documents.
- Plain-text PDFs/notes and a quick keyword answer: simple text search may be enough.
- Rich documents (tables, figures, equations) or a persistent Q&A knowledge base: this.

## Notes

- `rag_storage/` (or whatever `working_dir` you pick) holds the indexed state;
  treat it as a cache, never edit it by hand.
- Without a configured API key the library cannot run; tell the user which key
  to set rather than inventing one.
