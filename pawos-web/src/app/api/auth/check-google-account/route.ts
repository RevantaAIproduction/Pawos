import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "../../../../lib/supabase/server-admin";

/**
 * Check whether a Google email address already has an associated PawOS account.
 * Used during OAuth flow to prevent silently creating a new account when the user
 * authenticates with a Google account that doesn't yet have a PawOS account.
 *
 * Request: POST with { email: string }
 * Response: { exists: boolean; userId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string };
    const email = body.email?.toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // Check if a user with this email exists in auth.users
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Error checking user existence:", error);
      return NextResponse.json(
        { error: "Failed to check account" },
        { status: 500 }
      );
    }

    const existingUser = data?.users?.find(
      (user) => user.email?.toLowerCase() === email
    );

    return NextResponse.json({
      exists: !!existingUser,
      userId: existingUser?.id,
    });
  } catch (error) {
    console.error("Error in check-google-account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
