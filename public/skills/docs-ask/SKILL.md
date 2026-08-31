---
name: docs-ask
description: Ask questions against the Bernstein documentation and blog, answered with citations by the site's retrieval-pinned assistant over A2A JSON-RPC or SSE.
---

# Docs Ask

bernstein.run runs a retrieval-augmented assistant pinned to this
project's own index: the documentation, the blog, and the adapter
catalogue. It declines rather than answering from outside that corpus,
so its answers are citable, not plausible.

## Endpoints

### A2A (JSON-RPC, single response)

```
POST https://bernstein.run/api/a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "How does Bernstein isolate parallel agents?" }]
    }
  }
}
```

The result is a single A2A `Message` with one text part. Only
`message/send` is implemented; other methods return JSON-RPC `-32601`.

## Streaming alternative

`POST https://bernstein.run/api/ask` with `{"query": "..."}` streams
Server-Sent Events: `event: token` frames carrying `{"delta":"..."}`,
one `event: citation` frame, then `event: done`.

## Rules

- Queries are capped at 2000 characters and rate limited per IP; back
  off on `429`.
- A decline means the corpus does not cover the question. Fetch the
  documentation directly at https://bernstein.readthedocs.io/ instead
  of rephrasing until something slips through.
