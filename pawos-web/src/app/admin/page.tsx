import { redirect } from "next/navigation";

/**
 * Admin panel landing page — redirects to /admin/cases.
 * All authorization is enforced server-side in the cases route.
 */
export default function AdminHome() {
  redirect("/admin/cases");
}
