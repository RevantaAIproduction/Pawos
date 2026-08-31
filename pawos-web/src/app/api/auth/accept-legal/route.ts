import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "../../../../lib/supabase/server-admin";
import { LEGAL_DOCUMENT_VERSIONS } from "../../../../lib/legal/sections";

/**
 * Record that an authenticated user has accepted specific versions of legal documents.
 * Called by the frontend after the user checks acceptance boxes and submits the form.
 *
 * Request body: { documentSlugs: string[] }
 * Returns: { success: boolean; error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Get the current user from the Authorization header (JWT)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createSupabaseClient();

    // Verify the token and get the user
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const body = await request.json() as { documentSlugs?: string[] };
    const documentSlugs = body.documentSlugs || [];

    // Validate that requested documents are in our list
    const validSlugs = Object.keys(LEGAL_DOCUMENT_VERSIONS);
    for (const slug of documentSlugs) {
      if (!validSlugs.includes(slug)) {
        return NextResponse.json(
          { error: `Unknown legal document: ${slug}` },
          { status: 400 }
        );
      }
    }

    // Record acceptance for each document
    const acceptanceRecords = documentSlugs.map((slug) => ({
      user_id: userId,
      document_slug: slug,
      document_version: LEGAL_DOCUMENT_VERSIONS[slug as keyof typeof LEGAL_DOCUMENT_VERSIONS],
      user_agent: request.headers.get("user-agent") || null,
      ip_address: request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || null,
    }));

    const { error: insertError } = await supabase
      .from("user_legal_acceptance")
      .insert(acceptanceRecords);

    if (insertError) {
      console.error("Error recording legal acceptance:", insertError);
      return NextResponse.json(
        { error: "Failed to record acceptance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in accept-legal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
