import { redirect } from "next/navigation";

/** Keep the legacy URL pointed at the current, versioned Privacy Policy. */
export default function PrivacyPage() {
  redirect("/legal/privacy-policy");
}
