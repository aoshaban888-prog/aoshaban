// node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import "../js/task-core.js";
const C = globalThis.TaskCore;
const T = o => C.normalize({ title: "t", ...o }, o && o.id);

test("older tasks read as schema 2", () => {
  const t = C.normalize({ title: " مهمة ", notes: "ملاحظة", status: "doing", priority: "normal", createdBy: "a@x" }, "1");
  assert.equal(t.title, "مهمة"); assert.equal(t.description, "ملاحظة"); assert.equal(t.priority, "medium");
  assert.equal(t.status, "doing"); assert.equal(t.owner, "a@x"); assert.deepEqual(t.checklist, []);
  assert.equal(C.normalize({ title: "x", priority: "high" }).priority, "high");
  assert.equal(C.normalize({ title: "x", status: "weird" }).status, "todo");
  const p = C.migrationPatch({ title: "x", priority: "normal" }, "boss@x");
  assert.equal(p.owner, "boss@x"); assert.equal(p.schema, 2); assert.equal(p.priority, "medium");
});

test("progress from checklist and subtasks", () => {
  assert.equal(C.progress(T({})), 0);
  assert.equal(C.progress(T({ status: "done" })), 100);
  assert.equal(C.progress(T({ checklist: [{ text: "a", done: true }, { text: "b" }] })), 50);
  const kids = [T({ status: "done" }), T({ checklist: [{ text: "a", done: true }, { text: "b" }] }), T({ status: "cancelled" })];
  // 1 checklist item done of 2 + subtasks 1 and 0.5 → (1 + 1.5) / 4
  assert.equal(C.progress(T({ checklist: [{ text: "a", done: true }, { text: "b" }] }), kids), 63);
  assert.equal(C.progress(T({ progressMode: "manual", progressManual: 37 }), kids), 37);
  assert.equal(C.progress(T({ progressMode: "manual", progressManual: 250 })), 100);
});

test("group progress leaves out cancelled and subtasks", () => {
  const ts = [T({ id: "a", status: "done" }), T({ id: "b" }), T({ id: "c", status: "cancelled" }), T({ id: "d", parentId: "a" })];
  assert.equal(C.groupProgress(ts), 50);
  assert.equal(C.groupProgress([]), null);
});

test("due state and tone", () => {
  assert.equal(C.dueState(T({ due: "2026-11-17" }), "2026-11-18"), "late");
  assert.equal(C.dueState(T({ due: "2026-11-18" }), "2026-11-18"), "today");
  assert.equal(C.dueState(T({ due: "2026-11-20" }), "2026-11-18"), "soon");
  assert.equal(C.dueState(T({ due: "2026-11-17", status: "done" }), "2026-11-18"), "none");
  assert.equal(C.progressTone(40, "late"), "late");
  assert.equal(C.progressTone(100, "late"), "done");
  assert.equal(C.progressTone(80, "ok"), "good");
});

test("dependencies block and cycles are caught", () => {
  const a = T({ id: "a" }), b = T({ id: "b", dependsOn: ["a"] }), c = T({ id: "c", dependsOn: ["b"] });
  const by = new Map([a, b, c].map(t => [t.id, t]));
  assert.equal(C.blockers(b, by).length, 1);
  assert.equal(C.canMoveTo(b, "doing", by), false);
  assert.equal(C.canMoveTo(b, "deferred", by), true);
  assert.equal(C.makesCycle("a", "c", by), true);   // a → c → b → a
  assert.equal(C.makesCycle("c", "a", by), false);
  assert.equal(C.makesCycle("a", "a", by), true);
  a.status = "done"; assert.equal(C.blockers(b, by).length, 0);
});

test("recurrence dates", () => {
  assert.equal(C.nextDate("2026-11-18", { freq: "daily", interval: 1 }), "2026-11-19");
  assert.equal(C.nextDate("2026-11-18", { freq: "daily", interval: 3 }), "2026-11-21");
  assert.equal(C.nextDate("2026-11-18", { freq: "weekly", interval: 1 }), "2026-11-25");
  assert.equal(C.nextDate("2026-01-31", { freq: "monthly", interval: 1 }), "2026-02-28");
  // Wednesday, weekly on Sunday and Thursday → Thursday, then the next Sunday
  assert.equal(C.nextDate("2026-11-18", { freq: "weekly", interval: 1, days: [0, 4] }), "2026-11-19");
  assert.equal(C.nextDate("2026-11-19", { freq: "weekly", interval: 1, days: [0, 4] }), "2026-11-22");
  assert.equal(C.nextDate("2026-11-19", { freq: "weekly", interval: 2, days: [0, 4] }), "2026-11-29");
});

test("next occurrence resets the work and skips past dates", () => {
  const t = T({ id: "x", due: "2026-11-10", startDate: "2026-11-08", status: "done", spent: 30, recurrence: { freq: "weekly", interval: 1 }, checklist: [{ text: "a", done: true }] });
  const n = C.nextOccurrence(t, "2026-11-18");
  assert.equal(n.due, "2026-11-24"); assert.equal(n.startDate, "2026-11-22");
  assert.equal(n.status, "todo"); assert.equal(n.spent, 0); assert.equal(n.checklist[0].done, false); assert.equal(n.id, null);
  assert.equal(C.nextOccurrence(T({}), "2026-11-18"), null);
});

test("validation and the activity diff", () => {
  assert.deepEqual(C.validate(T({})), []);
  assert.ok(C.validate(T({ title: "" })).length);
  assert.ok(C.validate(T({ startDate: "2026-11-20", due: "2026-11-18" })).length);
  const ch = C.changes(T({ status: "todo", priority: "low" }), T({ status: "doing", priority: "low" }));
  assert.equal(ch.length, 1); assert.equal(ch[0].from, "لم تبدأ"); assert.equal(ch[0].to, "قيد التنفيذ");
});

test("time input", () => {
  assert.equal(C.parseMinutes("1.5"), 90); assert.equal(C.parseMinutes("1:30"), 90);
  assert.equal(C.parseMinutes("45د"), 45); assert.equal(C.parseMinutes("2س"), 120); assert.equal(C.parseMinutes(""), 0);
  assert.ok(Number.isNaN(C.parseMinutes("abc")));
  assert.equal(C.fmtMinutes(90), "1س 30د");
});
