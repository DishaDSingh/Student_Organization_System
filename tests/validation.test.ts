import { describe, expect, it } from "vitest";
import { committeeSchema, createUserSchema, departmentSchema, setupSchema } from "@/lib/validation/schemas";

const user = (over: Record<string, unknown> = {}) =>
  createUserSchema.safeParse({ name: "Tanvi Rao", email: "Tanvi@Horizon.test", ...over });

describe("user validation", () => {
  it("normalises email, phone and roll number", () => {
    const r = createUserSchema.parse({
      name: "  Tanvi Rao ",
      email: " Tanvi@Horizon.TEST ",
      phone: "098201 55555",
      studentId: "hit25cs900",
    });
    expect(r).toMatchObject({
      name: "Tanvi Rao",
      email: "tanvi@horizon.test",
      phone: "+919820155555",
      studentId: "HIT25CS900",
      roleIds: [],
    });
  });

  it("treats empty optional fields as absent", () => {
    const r = createUserSchema.parse({ name: "Tanvi Rao", email: "t@x.test", phone: "", studentId: "  ", departmentId: "" });
    expect(r.phone).toBeUndefined();
    expect(r.studentId).toBeUndefined();
    expect(r.departmentId).toBeUndefined();
  });

  it.each([
    [{ name: "R2D2" }, "name"],
    [{ name: "A" }, "name"],
    [{ email: "not-an-email" }, "email"],
    [{ phone: "12345" }, "phone"],
    [{ phone: "5820012345" }, "phone"], // Indian mobiles start 6–9
    [{ studentId: "x!" }, "studentId"],
  ])("rejects %o", (over, field) => {
    const r = user(over);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });

  it("accepts Unicode names with apostrophes and hyphens", () => {
    expect(user({ name: "Zoë D'Souza-Iyer" }).success).toBe(true);
  });
});

describe("setup validation", () => {
  const base = {
    org: { name: "Horizon Student Association", shortName: "HSA", academicYearStart: "7" },
    admin: { name: "Aarav Mehta", email: "a@x.test", password: "secret123", confirmPassword: "secret123" },
  };

  it("accepts a valid setup and coerces the month", () => {
    expect(setupSchema.parse(base).org.academicYearStart).toBe(7);
  });

  it("requires matching passwords", () => {
    const r = setupSchema.safeParse({ ...base, admin: { ...base.admin, confirmPassword: "secret124" } });
    expect(r.error?.issues[0].path).toEqual(["admin", "confirmPassword"]);
  });

  it("requires a letter and a number in the password", () => {
    expect(setupSchema.safeParse({ ...base, admin: { ...base.admin, password: "abcdefgh", confirmPassword: "abcdefgh" } }).success).toBe(
      false,
    );
  });
});

describe("department & committee validation", () => {
  it("upper-cases department codes and enforces 2–6 letters", () => {
    expect(departmentSchema.parse({ name: "Finance", code: "fin" }).code).toBe("FIN");
    expect(departmentSchema.safeParse({ name: "Finance", code: "F1" }).success).toBe(false);
  });

  it("rejects a term that ends before it starts", () => {
    const r = committeeSchema.safeParse({ name: "Gala Committee", termStart: "2026-05-01", termEnd: "2026-04-01" });
    expect(r.error?.issues[0].path).toEqual(["termEnd"]);
  });
});
