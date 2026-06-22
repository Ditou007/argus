import { describe, it, expect } from "vitest";
import { groupEventsByAction } from "../sessions.js";

describe("groupEventsByAction", () => {
  it("groups events onto their action, preserving action order and stripping internal cols", () => {
    const actions = [{ id: "a" }, { id: "b" }];
    const rows = [
      { _action_id: "a", _rn: 1, id: 1, confidence: 0.9 },
      { _action_id: "a", _rn: 2, id: 2, confidence: 0.5 },
      { _action_id: "b", _rn: 1, id: 3, confidence: 0.8 },
    ];
    const out = groupEventsByAction(actions, rows);
    expect(out.map((e) => e.action.id)).toEqual(["a", "b"]);
    expect(out[0].events).toEqual([
      { id: 1, confidence: 0.9 },
      { id: 2, confidence: 0.5 },
    ]); // no _action_id / _rn leak
    expect(out[1].events).toEqual([{ id: 3, confidence: 0.8 }]);
  });

  it("gives an action with no correlated events an empty list", () => {
    const out = groupEventsByAction([{ id: "lonely" }], []);
    expect(out).toEqual([{ action: { id: "lonely" }, events: [] }]);
  });

  it("ignores event rows whose action is not on the page", () => {
    const out = groupEventsByAction([{ id: "a" }], [{ _action_id: "z", _rn: 1, id: 9 }]);
    expect(out[0].events).toEqual([]);
  });
});
