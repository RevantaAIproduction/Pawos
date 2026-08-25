"use client";

import { useEffect, useState } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface BillingCase {
  id: string;
  customer_name: string;
  organization_name: string;
  billing_email: string;
  tier: string;
  plan: string | null;
  member_count: number;
  usd_total: number;
  inr_total: number;
  validation_status: string;
  decision: string | null;
  created_at: string;
  invoice_ids: string[] | null;
  assigned_persona: string | null;
}

interface ExpandedCaseId {
  [key: string]: boolean;
}

export default function AdminCasesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<BillingCase[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedCaseId>({});
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadCases() {
      try {
        const supabase = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || "",
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        );

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          setError("Not authenticated. Please sign in.");
          setLoading(false);
          return;
        }

        setToken(accessToken);

        const response = await fetch("/api/admin/cases", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (response.status === 403) {
            setError("Access denied. Only authorized admins can view this page.");
          } else {
            setError("Failed to load cases.");
          }
          setLoading(false);
          return;
        }

        const data = (await response.json()) as { ok: boolean; cases: BillingCase[]; authorizedEmail: string };
        setUserEmail(data.authorizedEmail);
        setCases(data.cases);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
    }

    loadCases();
  }, []);

  const handleAction = async (caseId: string, action: 'approve' | 'reject') => {
    if (!token) return;
    if (action === 'reject' && !rejectionReason[caseId]) {
      alert('Please enter a rejection reason');
      return;
    }

    setActionInProgress(caseId);
    try {
      const response = await fetch("/api/admin/cases", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          caseId,
          reason: action === 'reject' ? rejectionReason[caseId] : undefined,
        }),
      });

      if (!response.ok) {
        alert("Failed to process action");
        return;
      }

      // Refresh cases
      const casesResponse = await fetch("/api/admin/cases", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (casesResponse.ok) {
        const data = (await casesResponse.json()) as { ok: boolean; cases: BillingCase[] };
        setCases(data.cases);
      }

      setRejectionReason((prev) => ({ ...prev, [caseId]: '' }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#666" }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#d32f2f" }}>{error}</div>
      </div>
    );
  }

  const pendingCases = cases.filter(c => c.validation_status === 'awaiting_review');
  const reviewedCases = cases.filter(c => c.validation_status !== 'awaiting_review');

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "28px", fontWeight: 700 }}>
          PawOS Admin Panel
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
          Authenticated as: <strong>{userEmail}</strong>
        </p>
      </div>

      {cases.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
          <p style={{ margin: 0, color: "#666" }}>No billing cases yet.</p>
        </div>
      ) : (
        <>
          {pendingCases.length > 0 && (
            <>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
                Pending Review ({pendingCases.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "32px" }}>
                {pendingCases.map((caseItem) => (
                  <div key={caseItem.id} style={{ border: "1px solid #ddd", borderRadius: "8px", overflow: "hidden" }}>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [caseItem.id]: !prev[caseItem.id] }))}
                      style={{
                        width: "100%",
                        padding: "16px",
                        backgroundColor: "#fafafa",
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>
                          {caseItem.customer_name} • {caseItem.organization_name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                          ${caseItem.usd_total.toFixed(2)} • {caseItem.tier} • {caseItem.member_count} member(s)
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {expanded[caseItem.id] ? "▼" : "▶"}
                      </div>
                    </button>

                    {expanded[caseItem.id] && (
                      <div style={{ padding: "16px", borderTop: "1px solid #eee", backgroundColor: "white" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                          <div>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Email</div>
                            <div style={{ fontSize: "13px", marginTop: "4px" }}>{caseItem.billing_email}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Persona</div>
                            <div style={{ fontSize: "13px", marginTop: "4px" }}>{caseItem.assigned_persona}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Amount (INR)</div>
                            <div style={{ fontSize: "13px", marginTop: "4px" }}>₹{caseItem.inr_total.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Created</div>
                            <div style={{ fontSize: "13px", marginTop: "4px" }}>
                              {new Date(caseItem.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        {caseItem.invoice_ids && caseItem.invoice_ids.length > 0 && (
                          <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#666", textTransform: "uppercase", marginBottom: "8px" }}>
                              Invoices ({caseItem.invoice_ids.length})
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {caseItem.invoice_ids.map((id) => (
                                <span key={id} style={{ fontSize: "12px", backgroundColor: "#f0f0f0", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
                                  {id.slice(0, 8)}...
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                          <button
                            onClick={() => handleAction(caseItem.id, 'approve')}
                            disabled={actionInProgress === caseItem.id}
                            style={{
                              flex: 1,
                              padding: "10px",
                              backgroundColor: "#22c55e",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontWeight: 600,
                              cursor: actionInProgress === caseItem.id ? "not-allowed" : "pointer",
                              opacity: actionInProgress === caseItem.id ? 0.5 : 1,
                            }}
                          >
                            {actionInProgress === caseItem.id ? "Processing..." : "Approve"}
                          </button>
                          <button
                            onClick={() => setExpanded((prev) => ({ ...prev, [`${caseItem.id}-reject`]: !prev[`${caseItem.id}-reject`] }))}
                            style={{
                              flex: 1,
                              padding: "10px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Reject
                          </button>
                        </div>

                        {expanded[`${caseItem.id}-reject`] && (
                          <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#fef2f2", borderRadius: "4px" }}>
                            <textarea
                              value={rejectionReason[caseItem.id] || ''}
                              onChange={(e) => setRejectionReason((prev) => ({ ...prev, [caseItem.id]: e.target.value }))}
                              placeholder="Reason for rejection (required)"
                              style={{
                                width: "100%",
                                padding: "8px",
                                borderRadius: "4px",
                                border: "1px solid #fca5a5",
                                fontSize: "13px",
                                fontFamily: "inherit",
                                marginBottom: "8px",
                              }}
                              rows={3}
                            />
                            <button
                              onClick={() => handleAction(caseItem.id, 'reject')}
                              disabled={actionInProgress === caseItem.id}
                              style={{
                                width: "100%",
                                padding: "8px",
                                backgroundColor: "#dc2626",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontWeight: 600,
                                cursor: actionInProgress === caseItem.id ? "not-allowed" : "pointer",
                                opacity: actionInProgress === caseItem.id ? 0.5 : 1,
                              }}
                            >
                              {actionInProgress === caseItem.id ? "Processing..." : "Confirm Rejection"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {reviewedCases.length > 0 && (
            <>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
                Reviewed ({reviewedCases.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {reviewedCases.map((caseItem) => (
                  <div key={caseItem.id} style={{ border: "1px solid #e0e0e0", borderRadius: "8px", padding: "16px", backgroundColor: caseItem.decision === 'approved' ? "#f0fdf4" : "#fef2f2" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>
                          {caseItem.customer_name} • {caseItem.organization_name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                          ${caseItem.usd_total.toFixed(2)} • {caseItem.decision === 'approved' ? '✓ Approved' : '✗ Rejected'}
                        </div>
                      </div>
                      <span style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: caseItem.decision === 'approved' ? "#dcfce7" : "#fee2e2",
                        color: caseItem.decision === 'approved' ? "#166534" : "#991b1b",
                      }}>
                        {caseItem.decision === 'approved' ? 'APPROVED' : 'REJECTED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: "32px", padding: "16px", backgroundColor: "#f9f9f9", borderRadius: "8px", fontSize: "12px", color: "#666", lineHeight: "1.6" }}>
        <strong>Admin Panel Note:</strong> Only founder@revantaai.com, pawos@revantaai.com, and tharun@revantaai.com can access this interface. Backend authorization is enforced at the API level.
      </div>
    </div>
  );
}
