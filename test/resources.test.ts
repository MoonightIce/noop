import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldAlertDisk, staleDerivedData } from "../src/resources";

const plist = (date: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>LastAccessedDate</key><date>${date}</date>
<key>WorkspacePath</key><string>/x/App.xcworkspace</string></dict></plist>`;

test.skipIf(process.platform !== "darwin")("staleDerivedData picks idle and orphaned project folders only", async () => {
  const root = mkdtempSync(join(tmpdir(), "dd-"));
  const now = Date.parse("2026-11-06T00:00:00Z");
  const mk = (name: string, date?: string) => {
    mkdirSync(join(root, name));
    if (date) writeFileSync(join(root, name, "info.plist"), plist(date));
  };
  mk("App-active", "2026-11-05T00:00:00Z");
  mk("App-idle", "2026-10-20T00:00:00Z");
  mk("App-orphan");
  utimesSync(join(root, "App-orphan"), new Date(now - 3 * 86400e3), new Date(now - 3 * 86400e3));
  for (const shared of ["ModuleCache.noindex", "SDKExplicitPrecompiledModules", "Files-abc"]) mk(shared);
  try {
    const got = (await staleDerivedData(root, 7, now)).map((p) => p.slice(root.length + 1)).sort();
    expect(got).toEqual(["App-idle", "App-orphan"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a still-low disk alerts once a day, or sooner only when it keeps shrinking", () => {
  const t0 = Date.parse("2026-11-16T00:00:00Z");
  expect(shouldAlertDisk(undefined, 57, t0)).toBe(true);
  const prev = { at: t0, freeGB: 57 };
  expect(shouldAlertDisk(prev, 57, t0 + 30 * 60_000)).toBe(false); // the old every-30-min nag
  expect(shouldAlertDisk(prev, 53, t0 + 6 * 3600_000)).toBe(false);
  expect(shouldAlertDisk(prev, 45, t0 + 6 * 3600_000)).toBe(true);
  expect(shouldAlertDisk(prev, 57, t0 + 24 * 3600_000)).toBe(true);
});
