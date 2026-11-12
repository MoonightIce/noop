// What the owner sees while their work waits or runs: the team channel otherwise goes quiet between "task created" and a
// result or a card. Pure helpers (no I/O) so the wording is tested; cli.ts / runner.ts decide when to use them.

type Meta = Record<string, string | undefined>;

/** Work the owner asked for, directly or through a task it delegated to (only that gets progress notices). */
export const isOwnerWork = (m: Meta) => m.origin === "owner" || /^owner/.test(m.source ?? "");

/** Why a claimed task is a continuation, not a first run: null = first run; "" = a continuation with no better reason.
 *  Checked in order of what put it back in the queue most recently (requeue markers are cleared when a run finishes). */
export function resumeReason(m: Meta, body = ""): string | null {
  const note = m.requeue_note ?? "";
  if (/daemon restart/i.test(note)) return "重启后接着跑";
  if (/went offline/i.test(note)) return "原来的机器掉线，接着跑";
  if (m.stalls) return "上次运行没有动静被中止，接着跑";
  if (note) return "接着上次的进度跑";
  if (m.retried_after === "quota") return "上次账号额度用完，换账号再跑";
  if (m.retried_after) return "上次账号需要重新登录，再跑一次";
  const tail = body.slice(-600);
  if (m.resumed) {
    if (/Reopened by the owner/i.test(tail)) return "按你的新消息重新打开";
    if (/Woken from waiting by the owner/i.test(tail)) return "收到你的补充";
    if (/Resumed after waiting on/i.test(tail)) return "等待结束，回来检查";
    if (m.children) return "子任务都完成了，汇总结果";
    return "";
  }
  if (/owner added the follow-up above while you were working/i.test(tail)) return "带上你的补充重新跑";
  if (m.resumes) return `收到 ${m.resumes} 的回答`;
  return /\n## Run /.test(body) ? "" : null;
}

/** Why a queued owner task is not running yet, or null when it is simply about to be claimed. */
export function queueReason(o: { stop?: string; running: number; max: number; ahead: number }): string | null {
  const ahead = o.ahead > 0 ? `，前面还有 ${o.ahead} 个任务排着` : "";
  switch (o.stop) {
    case "full": return `本机正在跑 ${o.running} 个任务（按当前负载上限 ${o.max} 个）${ahead}，有空位马上开始`;
    case "accounts": return `AI 账号都在冷却或需要登录${ahead}，恢复后马上开始`;
    case "github": return `GitHub 接口限流中${ahead}，恢复后马上开始`;
    case "heavy": return `本机负载高，重任务先等一等${ahead}`;
    default: return null;
  }
}

/** The `step` every client shows as "最近：…": the agent's own progress (todo list, latest words) before the raw tool step,
 *  so released clients show it without an update. The raw fields stay alongside for clients that lay them out. */
export function activityStep(a: { step?: string; todo?: string; note?: string }): string | undefined {
  return [a.todo ? `进度 ${a.todo}` : "", a.note ?? a.step ?? ""].filter(Boolean).join(" · ") || undefined;
}

/** Claude's TodoWrite list → "3/7 移植 Domain 层" (the item in progress, else the next pending one). */
export function todoProgress(todos: unknown): string | undefined {
  if (!Array.isArray(todos) || !todos.length) return undefined;
  const items = todos.filter((t) => t && typeof t === "object") as { status?: string; content?: string; activeForm?: string }[];
  const done = items.filter((t) => t.status === "completed").length;
  const cur = items.find((t) => t.status === "in_progress") ?? items.find((t) => t.status !== "completed");
  const what = (cur?.activeForm || cur?.content || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${done}/${items.length}${what ? ` ${what}` : ""}`;
}

/** The agent's own words between steps, trimmed to one short line: often its interim finding ("bookmark 可用，下一步验证 Keychain"). */
export function narration(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.replace(/^[#>*\-\s`]+/, "").replace(/[*`]/g, "").trim()).filter((l) => l.length >= 4);
  const last = lines.at(-1);
  if (!last) return undefined;
  return last.length > 140 ? `${last.slice(0, 139)}…` : last;
}
