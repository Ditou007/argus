---
name: api-docs
description: Document the API from the schemas, not by hand — generate OpenAPI/Postman from the source-of-truth types so docs can't drift. Update on every route change. Use when adding or changing an API endpoint.
---

# api-docs

Hand-written API docs drift the moment the code changes. Generate them from the same schemas that validate the requests, so the docs are a projection of the truth, not a parallel copy that rots.

## Process

1. **Schemas are the source.** Define request/response shapes once (e.g. zod/typebox); generate the OpenAPI spec from them. Never maintain the spec by hand alongside the types.
2. **Update on every route change** — add/change/remove an endpoint → regenerate the spec and the Postman/collection in the same change. This is a `change→docs` row.
3. **Document only your own API.** A vendored/upstream API (OpenAI-compatible, etc.) is not yours to document — point to its spec.
4. **Every endpoint carries** method, path, auth, request schema, response schema(s) including errors, and an example.
5. **Version the contract, don't mutate it.** A breaking change versions the path; it never silently changes an existing endpoint's shape.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll write the OpenAPI by hand, it's clearer." | Hand-written and code drift apart by the next PR. Generate from the schema that runs. |
| "Docs can lag the code a bit." | A wrong API doc is worse than none — it sends integrators down a dead path. Same-change update. |
| "Errors are obvious, skip them." | The error shapes are exactly what integrators code against. Document them. |

## Red flags

- An OpenAPI spec maintained separately from the validation schemas.
- A route changed with no spec/collection update in the diff.
- Documented success shapes but undocumented error responses.

## Verification

- The spec is generated from the schemas (not hand-maintained).
- A route change updates the spec + collection in the same change.
- Auth, error responses, and an example are present per endpoint.
