import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "../../../../lib/supabase/server-admin";
import { LEGAL_DOCUMENT_VERSIONS } from "../../../../lib/legal/sections";

/**
 * Check whether the authenticated user has accepted the current required versions
 * of all legal documents. Used to determine if a user needs to accept legal terms
 * before accessing their account.
 *
 * Returns: { accepted: boolean; missingDocuments?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseClient();

    // Get the current user from the Authorization header (JWT)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Check which required documents are missing
    const requiredDocs = Object.entries(LEGAL_DOCUMENT_VERSIONS).map(([slug, version]) => ({
      slug,
      version,
    }));

    const missingDocuments: string[] = [];

    for (const { slug, version } of requiredDocs) {
      const { data, error } = await supabase
        .from("user_legal_acceptance")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("document_slug", slug)
        .eq("document_version", version);

      if (error) {
        console.error(`Error checking acceptance for ${slug}:`, error);
        return NextResponse.json(
          { error: "Failed to check legal acceptance" },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        missingDocuments.push(slug);
      }
    }

    return NextResponse.json({
      accepted: missingDocuments.length === 0,
      missingDocuments: missingDocuments.length > 0 ? missingDocuments : undefined,
    });
  } catch (error) {
    console.error("Error in check-legal-acceptance:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
