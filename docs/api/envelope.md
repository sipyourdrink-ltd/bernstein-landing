# API response envelope

This document is the canonical reference for response shapes returned by
the JSON routes under `app/api/`. Code-level helpers live at
`lib/api/errors.ts`.

## Success and error envelope

All non-streaming JSON routes return one of two shapes.

```ts
type ApiSuccess<T> = { ok: true; data?: T };
type ApiError = {
  ok: false;
  error: { code: string; message: string; details?: unknown[] };
};
```

- `ok` is always present and is the only field a generic client needs to
  branch on.
- `error.code` is `SCREAMING_SNAKE` and stable.
- `error.message` is short, human-readable, and safe to log. It is not a
  UI-facing string; the client picks copy off `error.code`.
- `error.details` is optional, ordered, and machine-readable (e.g. zod
  issue path + message). Keep it small.

### Codes

The current registry. New routes pick from this list before inventing a
new code.

| Code                   | HTTP | Meaning                                                |
|------------------------|------|--------------------------------------------------------|
| `INVALID_PARAMS`       | 400  | Body or query failed validation.                       |
| `UNAUTHORIZED`         | 401  | Missing or invalid credentials.                        |
| `NOT_FOUND`            | 404  | Resource does not exist.                               |
| `INVALID_ARTICLE`      | 404  | Slug not in the published set.                         |
| `RATE_LIMITED`         | 429  | Per-IP or per-token bucket exhausted. `Retry-After` set. |
| `QUOTA_EXCEEDED`       | 429  | Upstream quota hit. Surface as RATE_LIMITED to clients. |
| `INTERNAL`             | 500  | Unhandled failure. Operator logs the cause.            |
| `UPSTREAM_FAILED`      | 502  | A required dependency returned an error.               |
| `SERVICE_UNAVAILABLE`  | 503  | Dependency is reachable but reporting unhealthy.       |
| `NOT_CONFIGURED`       | 503  | An env var the route requires is unset.                |
| `TEMPORARILY_UNAVAILABLE` | 503 | Best-effort retry will likely succeed.                |

## Pagination envelope (list responses)

When a route returns a list, the success payload nests inside `data` and
follows this shape.

```ts
type Page<T> = {
  items: T[];
  total?: number;
  cursor?: string;
};
```

- `items` is always present and may be empty.
- `total` is optional. Only include it when it is cheap to compute. Do
  not expose a stale `total` from a partial scan.
- `cursor` is an opaque continuation token. Clients pass it back as a
  query parameter to fetch the next page. Absence means no more pages.

A successful list response therefore looks like:

```json
{
  "ok": true,
  "data": {
    "items": [{ "id": "abc", "title": "..." }],
    "cursor": "eyJvZmZzZXQiOjIwfQ"
  }
}
```

## Streaming routes

`/api/ask` returns Server-Sent Events. The wire format is unrelated to
the JSON envelope above. Error frames stay as:

```
event: error
data: { "type": "error", "code": "INVALID_PARAMS", "message": "query is required" }
```

The `type`, `code`, and `message` fields match the JSON envelope's
`error` block so a client that consumes both surfaces can share a single
mapper.

## Worked examples

### Invalid request body

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "invalid email"
  }
}
```

### Validation with field-level details

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "invalid request",
    "details": [
      { "path": ["slug"], "message": "must be lowercase" }
    ]
  }
}
```

### Single object

```json
{
  "ok": true,
  "data": {
    "monthly_downloads": 1234,
    "stars": 42,
    "fetched_at": "2026-05-20T09:00:00Z"
  }
}
```

### List

```json
{
  "ok": true,
  "data": {
    "items": [
      { "url": "https://bernstein.run/blog/a", "score": 0.91 }
    ]
  }
}
```
