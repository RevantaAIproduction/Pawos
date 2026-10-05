import { describe, expect, it } from "vitest";
import { orgBilling } from "./orgBilling";

const org = (role: string, tier: "team" | "enterprise" = "team") => ({ id: "o1", name: "Acme", tier, role });

describe("Team / Enterprise billing roles", () => {
  it("owners and billing admins manage purchases", () => {
    for (const role of ["owner", "billingAdministrator", "organizationOwner", "organizationAdministrator"]) {
      expect(orgBilling({ tier: "team", organizations: [org(role)] })?.isAdmin).toBe(true);
    }
  });
  it("members and other admins only see their plan and usage", () => {
    for (const role of ["member", "workspaceAdministrator", "itAdministrator", "securityAdministrator", "departmentManager"]) {
      expect(orgBilling({ tier: "enterprise", organizations: [org(role, "enterprise")] })?.isAdmin).toBe(false);
    }
  });
  it("individual plans have no organization billing", () => {
    expect(orgBilling({ tier: "pro", organizations: [] })).toBeNull();
  });
});
