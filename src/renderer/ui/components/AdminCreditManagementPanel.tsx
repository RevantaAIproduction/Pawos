import React, { useState, useEffect } from 'react';
import { CreditUsageDisplay } from './CreditUsageDisplay';

interface MemberAllocation {
  id: string;
  member_user_id: string;
  allocated_credits: number;
  used_credits: number;
  updated_at: string;
}

interface CreditRequest {
  id: string;
  requesting_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_amount: number;
  allocated_amount?: number;
  reason?: string;
  created_at: string;
}

interface AdminCreditManagementPanelProps {
  organizationId: string;
  accessToken: string;
  members: Array<{ userId: string; email: string; displayName: string }>;
}

export function AdminCreditManagementPanel({
  organizationId,
  accessToken,
  members,
}: AdminCreditManagementPanelProps) {
  const [allocations, setAllocations] = useState<MemberAllocation[]>([]);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [manualAllocateAmount, setManualAllocateAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [organizationId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch allocations
      const allocRes = await fetch(
        `/api/organization/credit-allocations?organizationId=${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (allocRes.ok) {
        const data = await allocRes.json();
        setAllocations(data.allocations || []);
      }

      // Fetch requests
      const reqRes = await fetch(
        `/api/organization/credit-requests?organizationId=${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }

  async function approveRequest(req: CreditRequest) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/organization/credit-allocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId,
          requestId: req.id,
          memberId: req.requesting_user_id,
          allocateAmount: req.requested_amount,
          approve: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || 'Approval failed');
      }

      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error approving request');
    } finally {
      setLoading(false);
    }
  }

  async function rejectRequest(req: CreditRequest) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/organization/credit-allocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId,
          requestId: req.id,
          memberId: req.requesting_user_id,
          allocateAmount: 0,
          approve: false,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || 'Rejection failed');
      }

      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error rejecting request');
    } finally {
      setLoading(false);
    }
  }

  async function manualAllocate(memberId: string) {
    if (!manualAllocateAmount || Number(manualAllocateAmount) < 0) {
      setError('Enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/organization/credit-allocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId,
          requestId: null,
          memberId,
          allocateAmount: Number(manualAllocateAmount),
          approve: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || 'Allocation failed');
      }

      setManualAllocateAmount('');
      setSelectedMemberId(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error allocating credits');
    } finally {
      setLoading(false);
    }
  }

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    return member?.displayName || member?.email || userId;
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <div
      style={{
        padding: 16,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
        marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
        Member Credit Management
      </h3>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 600, color: '#f4b860' }}>
            Pending Requests ({pendingRequests.length})
          </h4>
          {pendingRequests.map((req) => (
            <div
              key={req.id}
              style={{
                padding: 10,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 6,
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>
                  <strong>{getMemberName(req.requesting_user_id)}</strong> requested{' '}
                  {req.requested_amount.toLocaleString()} credits
                </span>
              </div>
              {req.reason && (
                <p style={{ margin: '4px 0', color: '#96969e', fontSize: 11 }}>
                  Reason: {req.reason}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => approveRequest(req)}
                  disabled={loading}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: '#4a9eff',
                    color: '#fff',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectRequest(req)}
                  disabled={loading}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: '#5a3a3a',
                    color: '#fff',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Member Allocations */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 600 }}>
        Member Allocations
      </h4>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12,
        }}
      >
        {allocations.map((alloc) => {
          const member = members.find((m) => m.userId === alloc.member_user_id);
          const remaining = alloc.allocated_credits - alloc.used_credits;
          const isSelected = selectedMemberId === alloc.member_user_id;

          return (
            <div
              key={alloc.id}
              style={{
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 6,
                cursor: 'pointer',
                border: isSelected ? '1px solid #4a9eff' : '1px solid rgba(255,255,255,0.1)',
              }}
              onClick={() =>
                setSelectedMemberId(
                  isSelected ? null : alloc.member_user_id
                )
              }
            >
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>
                {member?.displayName || member?.email || 'Unknown'}
              </div>
              <CreditUsageDisplay
                label="Credits"
                used={alloc.used_credits}
                remaining={remaining}
                compact={true}
              />

              {isSelected && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <label style={{ fontSize: 11, color: '#96969e', display: 'block', marginBottom: 6 }}>
                    Allocate credits:
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={manualAllocateAmount}
                      onChange={(e) => setManualAllocateAmount(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#e8e8ec',
                        fontSize: 12,
                      }}
                    />
                    <button
                      onClick={() => manualAllocate(alloc.member_user_id)}
                      disabled={loading || !manualAllocateAmount}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: '#4a9eff',
                        color: '#fff',
                        border: 'none',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Set
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#e08c8c', marginTop: 12 }}>
          ✗ {error}
        </p>
      )}
    </div>
  );
}
