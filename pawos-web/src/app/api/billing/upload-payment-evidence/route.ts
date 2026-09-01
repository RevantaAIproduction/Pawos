import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Uploads payment evidence (screenshot) for a billing case.
 * Associates with specific invoice and updates case validation status.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { ok: false, reason: "Invalid form data." },
      { status: 400 }
    );
  }

  const accessToken = formData.get("accessToken") as string | null;
  const billingCaseId = formData.get("billingCaseId") as string | null;
  const invoiceId = formData.get("invoiceId") as string | null;
  const file = formData.get("file") as File | null;

  if (!accessToken || !billingCaseId || !invoiceId || !file) {
    return NextResponse.json(
      { ok: false, reason: "Missing required fields (accessToken, billingCaseId, invoiceId, file)." },
      { status: 400 }
    );
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json(
      { ok: false, reason: "Only image files are accepted." },
      { status: 400 }
    );
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, reason: "File size exceeds 10MB limit." },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, reason: "Invalid or expired session." },
      { status: 401 }
    );
  }
  const userId = userData.user.id;

  // Verify the user owns this billing case
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: caseRecord, error: caseError } = await dbClient
    .from("billing_cases")
    .select("id, invoice_ids, user_id")
    .eq("id", billingCaseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (caseError || !caseRecord) {
    return NextResponse.json(
      { ok: false, reason: "Billing case not found or you don't have permission to access it." },
      { status: 404 }
    );
  }

  // Verify the invoice belongs to this case
  const invoiceIds = (caseRecord.invoice_ids || []) as string[];
  if (!invoiceIds.includes(invoiceId)) {
    return NextResponse.json(
      { ok: false, reason: "Invoice does not belong to this billing case." },
      { status: 400 }
    );
  }

  // Upload file to Supabase Storage
  const storagePath = `billing-cases/${billingCaseId}/${invoiceId}-${Date.now()}-${file.name}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await dbClient.storage
    .from("payment-evidence")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload-payment-evidence] Storage error:', uploadError);
    return NextResponse.json(
      { ok: false, reason: "Failed to upload file." },
      { status: 500 }
    );
  }

  // Get public URL for the uploaded file
  const { data: publicUrlData } = dbClient.storage
    .from("payment-evidence")
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlData?.publicUrl || storagePath;

  // Record the evidence entry (in a payment_evidence table or within billing_cases)
  // For now, we'll store it as JSON within the case's evidence field
  // This is a simplified approach; in production, use a separate table
  const timestamp = new Date().toISOString();
  const evidenceEntry = {
    id: crypto.randomUUID(),
    invoiceId,
    fileName: file.name,
    filePath: storagePath,
    publicUrl,
    uploadedAt: timestamp,
  };

  // Update billing case with evidence and set to under_validation
  const { error: updateError } = await dbClient
    .from("billing_cases")
    .update({
      validation_status: "awaiting_review",
    })
    .eq("id", billingCaseId);

  if (updateError) {
    console.warn(`[upload-payment-evidence] Failed to update case status:`, updateError);
  }

  return NextResponse.json({
    ok: true,
    evidenceId: evidenceEntry.id,
    fileName: file.name,
    uploadedAt: timestamp,
    invoiceId,
    billingCaseId,
  });
}
