# Kanban Java API

All paths are same-origin `/api`. Health is public; every other endpoint requires
`Authorization: Bearer <Supabase access token>`. Never send the publishable key as
a Bearer access token. Java verifies ES256/P-256 signature, trusted issuer, audience,
expiry, optional not-before, and UUID subject before any database operation.

**Verification scope:** isolated fixture-token/PostgreSQL tests are being run during
implementation. Real-project sign-in, runtime TLS connectivity, and course acceptance
are separate checks; this document is an interface contract, not a release claim.

## Resources and envelopes

| Method | Path | Request body | Success |
|---|---|---|---|
| GET | `/api/health` | none | 200 `{ "status": "ok", "service": "kanban-api" }` |
| GET | `/api/boards` | none | 200 `{ "boards": [board, ...] }` |
| POST | `/api/boards` | name, optional description | 201 `{ "board": board, "columns": [...] }`; Location header |
| GET | `/api/boards/{id}` | none | 200 `{ "board": board, "columns": [...] }` |
| PUT | `/api/boards/{id}` | name, optional description | 200 `{ "board": board }` |
| DELETE | `/api/boards/{id}` | none | 204, no body |
| POST | `/api/columns/{id}/cards` | title, optional description/priority/dueDate | 201 `{ "card": card }` |
| PUT | `/api/cards/{id}` | title, priority, optional description/dueDate | 200 `{ "card": card }` |
| DELETE | `/api/cards/{id}` | none | 204, no body |
| POST | `/api/cards/{id}/move` | targetColumnId, newPosition | 200 `{ "board": board, "columns": [...] }` |

A board contains `id`, `name`, nullable `description`, `createdAt`, `updatedAt`.
Each column contains `id`, `name`, zero-based `position`, and ordered `cards`.
Each card contains `id`, `columnId`, `title`, nullable `description`, `priority`,
nullable `dueDate`, zero-based `position`, `createdAt`, `updatedAt`.
UUIDs are canonical strings. Timestamps are ISO-8601 instants. Due dates are
calendar strings `YYYY-MM-DD`, never timestamps or timezone-shifted instants.

## Validation and update semantics

- Bodies are UTF-8 JSON objects; media type `application/json`, optional UTF-8 charset.
- Maximum body size: 65,536 bytes. Invalid UTF-8, duplicate properties, trailing
  JSON, arrays/scalars, and fields outside each endpoint's allowlist are rejected.
- Server-owned identity/owner/position fields cannot be supplied to editable endpoints.
- Names and titles are stripped, nonblank; board name max 100 Unicode code points,
  card title max 200. Board/card description max 2,000/5,000 code points.
- PUT replaces editable values. Send explicit `null` to clear description or due
  date. Omitted nullable fields also become null; omitted title/name/required
  update priority is invalid. The UI sends the full editable payload.
- Creation priority defaults to MEDIUM when omitted. Valid priorities are exactly
  LOW, MEDIUM, HIGH. Explicit null priority is invalid.
- Due dates allow valid past/future dates but no time, offset, invalid leap date,
  or year zero. Null clears; an empty string is not a valid API date.
- Exactly three columns are created atomically with each board: To Do, In Progress,
  Done. Column names/order are not editable in this MVP.

Move example:

```json
{ "targetColumnId": "7c37b398-0800-4f36-8490-f19d98c29106", "newPosition": 0 }
```

`newPosition` is the final insertion index. For same-column N cards, valid range
is 0..N-1. For another column with M cards, valid range is 0..M. Cross-board moves
are invalid. Source/destination orders are read again after acquiring the owning
board lock; source compaction, insertion, board recency, and uniqueness validation
commit together. A failed transaction must leave the previous snapshot intact.

## Errors and privacy

Example:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request fields." } }
```

Do not depend on optional message text for branching; use status/code. The current
server returns generic safe validation messages rather than per-field details.

| Status | Meaning |
|---|---|
| 400 | Invalid JSON/fields/UUID/date/position or cross-board move |
| 401 | Missing or invalid/expired token; WWW-Authenticate: Bearer |
| 404 | Resource missing or owned by another user; same generic response |
| 405 | Method not supported; Allow header lists accepted methods |
| 413 | Body too large |
| 415 | Unsupported media type/charset |
| 500 | Unexpected sanitized application failure |
| 503 | Auth keys, runtime configuration, or database temporarily unavailable |

Responses are `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
No SQL, stack traces, credentials, access tokens, or raw rejected input are returned.
The runtime DB role can see application rows; Java ownership predicates are the
end-user boundary. JDBC does not automatically carry `auth.uid()`.

## Browser retry policy

Read session through the Supabase SDK, not a second token store. Only same-origin
API paths are allowed. Requests omit cookies, reject redirects, and time out.
A GET denied with 401 may refresh the SDK session once and retry once. Writes
are never automatically replayed; a failed mutation asks the user to sign in or
retry explicitly. A received 204 is success with no JSON to parse.

There is no Java password-login, registration, refresh-token, or JWT-issuing API.
Supabase Auth owns identity/session flows; Java owns all Kanban data operations.
