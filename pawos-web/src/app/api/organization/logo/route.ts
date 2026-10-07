import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * GET: Retrieve organization logo metadata
 * POST: Admin uploads/replaces logo
 * DELETE: Admin removes logo
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** The roles that manage an organization (the same set the membership policies use). */
const LOGO_MANAGER_ROLES = new Set(["owner", "organizationOwner", "organizationAdministrator", "billingAdministrator", "workspaceAdministrator"]);

/** The image type of these bytes — decided from the file itself, never from what the client says it is. */
function sniffLogoType(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  const at = (offset: number, ...values: number[]) => values.every((value, index) => bytes[offset + index] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mimeType: "image/png", extension: "png" };
  if (at(0, 0xff, 0xd8, 0xff)) return { mimeType: "image/jpeg", extension: "jpg" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mimeType: "image/webp", extension: "webp" };
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json({ ok: false, reason: "Missing organizationId." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey);

    const { data: logo, error } = await client
      .from("organization_logos")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ ok: false, reason: "Failed to fetch logo." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, logo: logo || null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
  const fileData = typeof body?.fileData === "string" ? body.fileData : "";
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken || !UUID_RE.test(organizationId) || !fileData) {
    return NextResponse.json({ ok: false, reason: "Invalid request." }, { status: 400 });
  }

  // Size first, from the encoded length, so an oversized upload is never decoded.
  if (fileData.length > Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4) {
    return NextResponse.json({ ok: false, reason: "File too large (max 2MB)." }, { status: 400 });
  }
  const buffer = Buffer.from(fileData, "base64");
  if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) {
    return NextResponse.json({ ok: false, reason: "File too large (max 2MB)." }, { status: 400 });
  }

  // The type comes from the bytes. The client's file name and declared type are not used: the
  // stored name is generated here, so nothing the client sends ends up in a storage path.
  const sniffed = sniffLogoType(buffer);
  if (!sniffed) {
    return NextResponse.json({ ok: false, reason: "Invalid image type." }, { status: 400 });
  }
  const mimeType = sniffed.mimeType;
  const fileName = `logo.${sniffed.extension}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData } = await client.auth.getUser(accessToken);
    if (!userData.user) {
      return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 401 });
    }

    // Verify user is admin
    const { data: membership } = await client
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !LOGO_MANAGER_ROLES.has(membership.role)) {
      return NextResponse.json({ ok: false, reason: "Not an admin." }, { status: 403 });
    }

    // Check if logo already exists
    const { data: existingLogo } = await client
      .from("organization_logos")
      .select("storage_path")
      .eq("organization_id", organizationId)
      .maybeSingle();

    // Delete old logo file from storage if exists
    if (existingLogo?.storage_path) {
      await client.storage.from("org-logos").remove([existingLogo.storage_path]);
    }

    // Upload new logo to Supabase storage
    const storagePath = `${organizationId}/${Date.now()}.${sniffed.extension}`;
    const { error: uploadError } = await client.storage
      .from("org-logos")
      .upload(storagePath, buffer, { upsert: false, contentType: mimeType });

    if (uploadError) {
      return NextResponse.json({ ok: false, reason: "Upload failed." }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrl } = client.storage
      .from("org-logos")
      .getPublicUrl(storagePath);

    // Update or create logo metadata
    const { error: dbError } = await client
      .from("organization_logos")
      .upsert({
        organization_id: organizationId,
        storage_path: storagePath,
        file_name: fileName,
        file_size: buffer.length,
        mime_type: mimeType,
        uploaded_by: userData.user.id,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up storage file if db update fails
      await client.storage.from("org-logos").remove([storagePath]);
      return NextResponse.json({ ok: false, reason: "Failed to save logo." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      logo: { storagePath, fileName, publicUrl: publicUrl.publicUrl },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken || !organizationId) {
    return NextResponse.json({ ok: false, reason: "Missing parameters." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData } = await client.auth.getUser(accessToken);
    if (!userData.user) {
      return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 401 });
    }

    // Verify user is admin
    const { data: membership } = await client
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !LOGO_MANAGER_ROLES.has(membership.role)) {
      return NextResponse.json({ ok: false, reason: "Not an admin." }, { status: 403 });
    }

    // Get logo to delete
    const { data: logo } = await client
      .from("organization_logos")
      .select("storage_path")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!logo) {
      return NextResponse.json({ ok: true, message: "No logo found." });
    }

    // Delete from storage
    await client.storage.from("org-logos").remove([logo.storage_path]);

    // Delete from database
    const { error: dbError } = await client
      .from("organization_logos")
      .delete()
      .eq("organization_id", organizationId);

    if (dbError) {
      return NextResponse.json({ ok: false, reason: "Failed to delete logo." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Logo deleted." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}
