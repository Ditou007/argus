---
name: docs-flows
description: Explain a flow with a diagram — Mermaid sequence/flow charts for request paths, state machines, and scenarios, kept beside the code and updated when the flow changes. Use when a control flow or interaction is hard to follow in prose.
---

# docs-flows

Some things are clearer as a picture. A request path through five services, a state machine, an auth handshake — a Mermaid diagram conveys in seconds what a paragraph fumbles. Keep it in the repo (text, diffable) and update it when the flow changes.

## Process

1. **Diagram the things prose struggles with** — sequences across components, state transitions, decision branches. Not everything; only where a picture earns its place.
2. **Use Mermaid** (```mermaid fenced blocks) so it's version-controlled, diffable, and renders in the repo host. No binary image to drift.
3. **Pick the right type** — `sequenceDiagram` for interactions over time, `flowchart` for branching logic, `stateDiagram` for lifecycles.
4. **Keep it beside what it explains** (the flow doc, the scenario, the architecture doc) and label it with what it shows.
5. **Update the diagram in the same change as the flow.** A diagram that lies is worse than none — it's a confident wrong map.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Prose is enough." | For a five-hop async flow, prose is a wall of text nobody reconstructs. The diagram is the map. |
| "I'll paste a screenshot of a diagram tool." | A binary image can't be diffed and rots silently. Mermaid is text — it lives with the code. |
| "The flow changed but the diagram's roughly right." | 'Roughly right' is wrong on the one edge that matters. Update it with the change. |

## Red flags

- A complex async/branching flow documented only in prose.
- A diagram as a checked-in binary image instead of Mermaid text.
- A flow changed without its diagram updated.

## Verification

- Non-trivial flows have a Mermaid diagram of the right type.
- Diagrams are text (Mermaid), beside the code, labeled.
- The diagram matches the current flow (updated in the same change).
