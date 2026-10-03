import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS, ALL_PERMISSIONS, allOf, isPermissionKey, type PermissionKey } from "@/lib/rbac/catalog";
import { ROLE_PRESETS } from "@/lib/rbac/presets";
import { resolvePermissions, ungrantable } from "@/lib/rbac/resolve";
import { guardGrant, guardSelf, guardTarget } from "@/lib/rbac/guards";
import type { CurrentUser } from "@/lib/auth/current-user";

const actor = (perms: PermissionKey[], isMasterAdmin = false): CurrentUser => ({
  id: "actor",
  name: "Actor",
  email: "a@x.test",
  isMasterAdmin,
  roles: [],
  permissions: new Set(perms),
});

describe("permission catalog", () => {
  it("has unique, well-formed keys", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("marks every CCTV permission sensitive", () => {
    expect(ALL_PERMISSIONS.filter((p) => p.module === "cctv").every((p) => p.sensitive)).toBe(true);
  });

  it("only references real permissions in presets", () => {
    for (const r of ROLE_PRESETS) for (const p of r.permissions) expect(isPermissionKey(p), `${r.key}: ${p}`).toBe(true);
  });

  it("follows the CCTV access matrix: Security Head live + playback, Event Head live (own events), nobody else", () => {
    const cctv = Object.fromEntries(
      ROLE_PRESETS.map((r) => [r.key, r.permissions.filter((p) => p.startsWith("cctv.")).sort()]).filter(([, p]) => p.length),
    );
    expect(cctv).toEqual({ security_head: ["cctv.live", "cctv.playback", "cctv.view"], event_head: ["cctv.live"] });
  });

  it("lets only the Treasurer preset approve expenses", () => {
    const approvers = ROLE_PRESETS.filter((r) => r.permissions.includes("finance.approve_expense"));
    expect(approvers.map((r) => r.key)).toEqual(["treasurer"]);
  });

  it("gives no preset every permission (nobody sees everything by default)", () => {
    for (const r of ROLE_PRESETS) expect(new Set(r.permissions).size).toBeLessThan(ALL_PERMISSION_KEYS.length);
  });
});

describe("resolvePermissions", () => {
  it("unions role permissions", () => {
    const set = resolvePermissions({
      isMasterAdmin: false,
      rolePermissions: ["events.view", "events.view", "tickets.view"],
      overrides: [],
    });
    expect([...set].sort()).toEqual(["events.view", "tickets.view"]);
  });

  it("applies GRANT overrides", () => {
    const set = resolvePermissions({
      isMasterAdmin: false,
      rolePermissions: [],
      overrides: [{ permissionKey: "finance.view", effect: "GRANT" }],
    });
    expect(set.has("finance.view")).toBe(true);
  });

  it("lets DENY beat a role grant", () => {
    const set = resolvePermissions({
      isMasterAdmin: false,
      rolePermissions: allOf("tickets"),
      overrides: [{ permissionKey: "tickets.refund", effect: "DENY" }],
    });
    expect(set.has("tickets.refund")).toBe(false);
    expect(set.has("tickets.checkin")).toBe(true);
  });

  it("gives Master Admin everything regardless of overrides", () => {
    const set = resolvePermissions({
      isMasterAdmin: true,
      rolePermissions: [],
      overrides: [{ permissionKey: "audit.view", effect: "DENY" }],
    });
    expect(set.size).toBe(ALL_PERMISSION_KEYS.length);
  });
});

describe("escalation guards", () => {
  it("blocks granting permissions the actor lacks", () => {
    const secretary = actor(["roles.assign", "members.view"]);
    expect(ungrantable(secretary, ["members.view", "finance.approve_expense"])).toEqual(["finance.approve_expense"]);
    expect(guardGrant(secretary, ["finance.approve_expense"])).toMatch(/can't grant/);
    expect(guardGrant(secretary, ["members.view"])).toBeNull();
  });

  it("lets a Master Admin grant anything", () => {
    expect(guardGrant(actor([], true), ALL_PERMISSION_KEYS)).toBeNull();
  });

  it("protects Master Admin accounts from non-masters", () => {
    expect(guardTarget(actor(["users.suspend"]), { id: "x", isMasterAdmin: true })).toMatch(/Only a Master Admin/);
    expect(guardTarget(actor([], true), { id: "x", isMasterAdmin: true })).toBeNull();
  });

  it("stops non-masters changing their own access", () => {
    expect(guardSelf(actor(["roles.assign"]), "actor")).toMatch(/can't change/);
    expect(guardSelf(actor(["roles.assign"]), "someone-else")).toBeNull();
    expect(guardSelf(actor([], true), "actor")).toBeNull();
  });
});
