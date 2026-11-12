// What the owner sees while their work waits or runs (src/progress.ts).
import { expect, test } from "bun:test";
import { activityStep, isOwnerWork, narration, queueReason, resumeReason, todoProgress } from "../src/progress";

test("owner work: asked directly or delegated from it", () => {
  expect(isOwnerWork({ source: "owner@chat" })).toBe(true);
  expect(isOwnerWork({ source: "followup:T-0011", origin: "owner" })).toBe(true);
  expect(isOwnerWork({ source: "routine:triage-inbound" })).toBe(false);
});

test("a first run is a start; each requeue path reads as a continuation with its reason", () => {
  expect(resumeReason({}, "the request")).toBeNull();
  expect(resumeReason({ requeue_note: "Requeued after daemon restart on mac; check for partial work." })).toBe("重启后接着跑");
  expect(resumeReason({ requeue_note: "Requeued: host pc went offline mid-task." })).toBe("原来的机器掉线，接着跑");
  expect(resumeReason({ stalls: "1", requeue_note: "Your previous run was stopped: quiet" })).toBe("上次运行没有动静被中止，接着跑");
  expect(resumeReason({ retried_after: "quota" })).toBe("上次账号额度用完，换账号再跑");
  expect(resumeReason({ resumes: "D-0003" })).toBe("收到 D-0003 的回答");
  expect(resumeReason({ resumed: "yes", children: "T-0015,T-0016" }, "## Run x\n**delegated**")).toBe("子任务都完成了，汇总结果");
  expect(resumeReason({ resumed: "yes" }, "...\nReopened by the owner's message above: act on it now.\n")).toBe("按你的新消息重新打开");
  // a later wake-up wins over the card answered before it (resumes stays on the task)
  expect(resumeReason({ resumed: "yes", resumes: "D-0003", children: "T-1" })).toBe("子任务都完成了，汇总结果");
  // a restart while resuming from a card: the restart is the latest reason
  expect(resumeReason({ resumes: "D-0003", requeue_note: "Requeued after daemon restart on mac" })).toBe("重启后接着跑");
  expect(resumeReason({}, "req\n\n## Run 2026 · h · claude\n**done** — x\n")).toBe("");
});

test("a queued owner task is told why it waits; no reason, no notice", () => {
  expect(queueReason({ stop: "full", running: 2, max: 2, ahead: 0 })).toBe("本机正在跑 2 个任务（按当前负载上限 2 个），有空位马上开始");
  expect(queueReason({ stop: "full", running: 2, max: 2, ahead: 1 })).toContain("前面还有 1 个任务排着");
  expect(queueReason({ stop: "accounts", running: 0, max: 3, ahead: 0 })).toContain("AI 账号");
  expect(queueReason({ stop: undefined, running: 0, max: 3, ahead: 0 })).toBeNull();
});

test("TodoWrite becomes done/total plus the item in progress", () => {
  const todos = [
    { content: "建 workspace", activeForm: "建 workspace", status: "completed" },
    { content: "移植 Domain 层", activeForm: "移植 Domain 层中", status: "in_progress" },
    { content: "跑测试", status: "pending" },
  ];
  expect(todoProgress(todos)).toBe("1/3 移植 Domain 层中");
  expect(todoProgress([{ content: "a", status: "completed" }])).toBe("1/1"); // all done: nothing in progress
  expect(todoProgress([])).toBeUndefined();
  expect(todoProgress("nope")).toBeUndefined();
});

test("narration keeps the agent's last line, without markdown, short", () => {
  expect(narration("先看一下目录。\n\n**结论**：bookmark 可以在沙盒里用，下一步验证 Keychain。")).toBe("结论：bookmark 可以在沙盒里用，下一步验证 Keychain。");
  expect(narration("ok")).toBeUndefined();
  expect(narration("x".repeat(300))!.length).toBe(140);
});

test("the step every client shows leads with the agent's own progress", () => {
  expect(activityStep({ step: "Bash · cargo build" })).toBe("Bash · cargo build");
  expect(activityStep({ step: "Bash · cargo build", todo: "2/5 移植 Core", note: "Domain 层编译通过" })).toBe("进度 2/5 移植 Core · Domain 层编译通过");
  expect(activityStep({ step: "Read · a.rs", todo: "2/5 移植 Core" })).toBe("进度 2/5 移植 Core · Read · a.rs");
  expect(activityStep({})).toBeUndefined();
});
