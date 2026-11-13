// Every card says which task it comes from (owner, T-0150): a decision its own task, a proposals batch the tasks
// that proposed its items (their `source: followup:T-…`).
import { expect, test } from "bun:test";
import { P, writeDoc } from "../src/core";
import { cardSources } from "../src/server";

const task = (folder: string, id: string, title: string, source = "") =>
  writeDoc(P("tasks", folder, `${id}.md`), { id, title, agent: "lead", source }, "");

test("a decision's source is its task, with the task's title", () => {
  task("blocked", "T-0093", "Propose next actions (fleet idle)");
  expect(cardSources({ id: "D-0042", task: "T-0093" })).toEqual([{ id: "T-0093", title: "Propose next actions (fleet idle)" }]);
});

test("a proposals batch's sources are the tasks that proposed its items, once each", () => {
  task("blocked", "T-0025", "evolve · 2026-11-10 03:30");
  task("proposed", "T-0026", "focus-check", "followup:T-0025");
  task("proposed", "T-0027", "another", "followup:T-0025");
  task("proposed", "T-0030", "from chat", "owner@chat");
  expect(cardSources({ id: "P-0004", items: "T-0026,T-0027,T-0030" })).toEqual([
    { id: "T-0025", title: "evolve · 2026-11-10 03:30" },
    { id: "T-0030", title: "from chat" },
  ]);
});

test("a source task that is gone still shows its id", () => {
  expect(cardSources({ id: "D-0001", task: "T-0999" })).toEqual([{ id: "T-0999", title: "" }]);
});
