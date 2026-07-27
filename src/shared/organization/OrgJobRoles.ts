/**
 * Organization Role (job title) — a third, independent per-member
 * attribute alongside Seat Type (billing/OrganizationMember.seatTier) and
 * Permission Role (RBAC/OrganizationMember.role, see OrganizationTypes.ts).
 * An Organization Role never grants a capability and never affects billing
 * — it exists purely to describe what a teammate does (e.g. "Frontend
 * Engineer") for task assignment, directories, and search.
 *
 * A member's assigned role is stored as one string ref that resolves to
 * either source without a join: `builtin:<key>` (this file's fixed
 * catalog) or `custom:<uuid>` (an organization's own `org_job_roles` row).
 * Kept as a single opaque ref column rather than two nullable FK columns
 * so adding new capabilities later (department hierarchy, role templates,
 * SCIM-synced roles) never requires a schema change to this reference
 * shape — only new fields alongside it.
 */

export type OrgJobRoleDepartment = 'engineering' | 'design' | 'product' | 'business';

export const ORG_JOB_ROLE_DEPARTMENT_LABELS: Record<OrgJobRoleDepartment, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  business: 'Business',
};

export const ORG_JOB_ROLE_DEPARTMENTS: OrgJobRoleDepartment[] = ['engineering', 'design', 'product', 'business'];

export type BuiltInOrgJobRole = {
  key: string;
  label: string;
  department: OrgJobRoleDepartment;
};

/** Fixed catalog, not per-organization data — every organization sees the
 * same built-in roles. Referenced as `builtin:<key>`; `key` must never be
 * renamed once shipped (it's what's persisted on members), only relabeled. */
export const BUILT_IN_ORG_JOB_ROLES: BuiltInOrgJobRole[] = [
  // Engineering (14)
  { key: 'frontend_engineer', label: 'Frontend Engineer', department: 'engineering' },
  { key: 'backend_engineer', label: 'Backend Engineer', department: 'engineering' },
  { key: 'fullstack_engineer', label: 'Full Stack Engineer', department: 'engineering' },
  { key: 'mobile_engineer', label: 'Mobile Engineer', department: 'engineering' },
  { key: 'devops_engineer', label: 'DevOps Engineer', department: 'engineering' },
  { key: 'site_reliability_engineer', label: 'Site Reliability Engineer', department: 'engineering' },
  { key: 'qa_engineer', label: 'QA Engineer', department: 'engineering' },
  { key: 'security_engineer', label: 'Security Engineer', department: 'engineering' },
  { key: 'data_engineer', label: 'Data Engineer', department: 'engineering' },
  { key: 'ml_engineer', label: 'Machine Learning Engineer', department: 'engineering' },
  { key: 'embedded_engineer', label: 'Embedded Engineer', department: 'engineering' },
  { key: 'engineering_manager', label: 'Engineering Manager', department: 'engineering' },
  { key: 'staff_engineer', label: 'Staff Engineer', department: 'engineering' },
  { key: 'principal_engineer', label: 'Principal Engineer', department: 'engineering' },
  // Design (5)
  { key: 'product_designer', label: 'Product Designer', department: 'design' },
  { key: 'ux_designer', label: 'UX Designer', department: 'design' },
  { key: 'ui_designer', label: 'UI Designer', department: 'design' },
  { key: 'graphic_designer', label: 'Graphic Designer', department: 'design' },
  { key: 'design_manager', label: 'Design Manager', department: 'design' },
  // Product (5)
  { key: 'product_manager', label: 'Product Manager', department: 'product' },
  { key: 'senior_product_manager', label: 'Senior Product Manager', department: 'product' },
  { key: 'product_owner', label: 'Product Owner', department: 'product' },
  { key: 'technical_product_manager', label: 'Technical Product Manager', department: 'product' },
  { key: 'head_of_product', label: 'Head of Product', department: 'product' },
  // Business (8)
  { key: 'sales_representative', label: 'Sales Representative', department: 'business' },
  { key: 'account_executive', label: 'Account Executive', department: 'business' },
  { key: 'marketing_manager', label: 'Marketing Manager', department: 'business' },
  { key: 'customer_success_manager', label: 'Customer Success Manager', department: 'business' },
  { key: 'business_development_manager', label: 'Business Development Manager', department: 'business' },
  { key: 'operations_manager', label: 'Operations Manager', department: 'business' },
  { key: 'finance_manager', label: 'Finance Manager', department: 'business' },
  { key: 'hr_manager', label: 'HR Manager', department: 'business' },
];

export function findBuiltInOrgJobRole(key: string): BuiltInOrgJobRole | undefined {
  return BUILT_IN_ORG_JOB_ROLES.find((r) => r.key === key);
}

export function builtInOrgJobRolesByDepartment(department: OrgJobRoleDepartment): BuiltInOrgJobRole[] {
  return BUILT_IN_ORG_JOB_ROLES.filter((r) => r.department === department);
}

/** A custom role an organization created — persisted in `org_job_roles`. */
export type OrgJobRole = {
  id: string;
  organizationId: string;
  name: string;
  department: OrgJobRoleDepartment | null;
  archived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const BUILTIN_PREFIX = 'builtin:';
const CUSTOM_PREFIX = 'custom:';

export function builtinJobRoleRef(key: string): string {
  return `${BUILTIN_PREFIX}${key}`;
}

export function customJobRoleRef(id: string): string {
  return `${CUSTOM_PREFIX}${id}`;
}

export type ResolvedOrgJobRole = {
  ref: string;
  label: string;
  department: OrgJobRoleDepartment | null;
  isCustom: boolean;
  isArchived: boolean;
};

/** Resolves a member's `jobRoleRef` against the fixed built-in catalog and
 * the organization's own custom roles. Returns null for an unset or
 * dangling ref (e.g. a custom role deleted out-of-band) rather than
 * throwing — callers should treat that the same as "no role assigned". */
export function resolveOrgJobRole(ref: string | null | undefined, customRoles: OrgJobRole[]): ResolvedOrgJobRole | null {
  if (!ref) return null;
  if (ref.startsWith(BUILTIN_PREFIX)) {
    const found = findBuiltInOrgJobRole(ref.slice(BUILTIN_PREFIX.length));
    return found ? { ref, label: found.label, department: found.department, isCustom: false, isArchived: false } : null;
  }
  if (ref.startsWith(CUSTOM_PREFIX)) {
    const id = ref.slice(CUSTOM_PREFIX.length);
    const found = customRoles.find((r) => r.id === id);
    return found ? { ref, label: found.name, department: found.department, isCustom: true, isArchived: found.archived } : null;
  }
  return null;
}
