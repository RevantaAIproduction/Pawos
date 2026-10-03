"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { earlyAccessWorkflowTitle } from "../../../lib/earlyAccess";

interface EarlyAccessRow {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string | null;
  github_profile: string | null;
  selected_workflows: string[] | null;
  custom_use_case: string;
  source: string;
  status: string;
  created_at: string;
}

const CELL: React.CSSProperties = { padding: "12px", fontSize: "13px", verticalAlign: "top", borderTop: "1px solid #eee" };
const HEAD: React.CSSProperties = {
  padding: "12px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#666",
  textTransform: "uppercase",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** A leading = + - @ would be run as a formula when the export is opened in a spreadsheet. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: EarlyAccessRow[]): string {
  const header = ["name", "email", "role", "company", "github_profile", "selected_workflows", "custom_use_case", "created_at", "source", "status"];
  const lines = rows.map((row) =>
    [
      row.name,
      row.email,
      row.role,
      row.company ?? "",
      row.github_profile ?? "",
      (row.selected_workflows ?? []).map(earlyAccessWorkflowTitle).join("; "),
      row.custom_use_case,
      row.created_at,
      row.source,
      row.status,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}

/**
 * Read-only list of Early Access registrations. All authorization is enforced server-side in
 * /api/admin/early-access — this page only forwards the signed-in session's access token.
 */
export default function AdminEarlyAccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EarlyAccessRow[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadRegistrations() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          setError("Not authenticated. Please sign in.");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/admin/early-access", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (response.status === 403) {
            setError("Access denied. Only authorized admins can view this page.");
          } else {
            setError("Failed to load Early Access registrations.");
          }
          setLoading(false);
          return;
        }

        const data = (await response.json()) as { ok: boolean; registrations: EarlyAccessRow[]; authorizedEmail: string };
        setUserEmail(data.authorizedEmail);
        setRows(data.registrations);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
    }

    loadRegistrations();
  }, []);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "pawos-early-access.csv";
    link.click();
    URL.revokeObjectURL(href);
  };

  if (loading) {
    return (
      <div style={{ padding: "120px 40px 40px", textAlign: "center", backgroundColor: "white", minHeight: "100vh" }}>
        <div style={{ fontSize: 14, color: "#666" }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "120px 40px 40px", textAlign: "center", backgroundColor: "white", minHeight: "100vh" }}>
        <div style={{ fontSize: 14, color: "#d32f2f" }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "white", color: "#171717", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "120px 20px 40px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "28px", fontWeight: 700 }}>Early Access registrations</h1>
            <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
              {rows.length} registered • Authenticated as: <strong>{userEmail}</strong> •{" "}
              <a href="/admin/cases" style={{ color: "#2563eb" }}>Billing cases</a>
            </p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={downloadCsv}
              style={{ padding: "10px 16px", backgroundColor: "#171717", color: "white", border: "none", borderRadius: "4px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              Export CSV
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
            <p style={{ margin: 0, color: "#666" }}>No Early Access registrations yet.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px" }}>
              <thead style={{ backgroundColor: "#fafafa" }}>
                <tr>
                  <th style={HEAD}>Name</th>
                  <th style={HEAD}>Email</th>
                  <th style={HEAD}>Role</th>
                  <th style={HEAD}>Company</th>
                  <th style={HEAD}>Selected workflows</th>
                  <th style={HEAD}>Custom use case</th>
                  <th style={HEAD}>Registered</th>
                  <th style={HEAD}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...CELL, fontWeight: 600 }}>
                      {row.name}
                      {row.github_profile && (
                        <div style={{ fontWeight: 400, marginTop: "4px" }}>
                          <a href={row.github_profile} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: "12px" }}>
                            GitHub
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={CELL}>{row.email}</td>
                    <td style={{ ...CELL, whiteSpace: "nowrap" }}>{row.role}</td>
                    <td style={CELL}>{row.company ?? "—"}</td>
                    <td style={CELL}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {(row.selected_workflows ?? []).map((id) => (
                          <span key={id} style={{ fontSize: "12px", backgroundColor: "#f0f0f0", padding: "4px 8px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                            {earlyAccessWorkflowTitle(id)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...CELL, maxWidth: "320px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.custom_use_case}</td>
                    <td style={{ ...CELL, whiteSpace: "nowrap" }}>{new Date(row.created_at).toLocaleDateString()}</td>
                    <td style={{ ...CELL, whiteSpace: "nowrap" }}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
