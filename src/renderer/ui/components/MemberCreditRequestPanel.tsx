import React, { useState, useEffect } from 'react';
import { CreditUsageDisplay } from './CreditUsageDisplay';

interface MemberAllocation {
  id: string;
  allocated_credits: number;
  used_credits: number;
  updated_at: string;
}

interface CreditRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_amount: number;
  allocated_amount?: number;
  reason?: string;
  created_at: string;
}

interface MemberCreditRequestPanelProps {
  organizationId: string;
  tier: 'Team' | 'Enterprise';
  accessToken: string;
}

export function MemberCreditRequestPanel({
  organizationId,
  tier,
  accessToken,
}: MemberCreditRequestPanelProps) {
  const [allocation, setAllocation] = useState<MemberAllocation | null>(null);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [requestAmount, setRequestAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadData();
  }, [organizationId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch allocation
      const allocRes = await fetch(
        `/api/organization/credit-allocations?organizationId=${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (allocRes.ok) {
        const data = await allocRes.json();
        if (data.allocations && data.allocations.length > 0) {
          setAllocation(data.allocations[0]);
        }
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

  async function submitRequest() {
    if (!requestAmount || Number(requestAmount) <= 0) {
      setError('Enter a valid credit amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/organization/credit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId,
          requestedAmount: Number(requestAmount),
          reason: reason || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || 'Request failed');
      }

      setRequestAmount('');
      setReason('');
      setSubmitted(true);
      await loadData();
      setTimeout(() => setSubmitted(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error submitting request');
    } finally {
      setLoading(false);
    }
  }

  const remaining = allocation
    ? allocation.allocated_credits - allocation.used_credits
    : 0;

  const pending = requests.find((r) => r.status === 'pending');

  return (
    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
      <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 600 }}>
        Your {tier} Credits
      </h3>

      {allocation ? (
        <div style={{ marginBottom: 20 }}>
          <CreditUsageDisplay
            label="Credits"
            used={allocation.used_credits}
            remaining={remaining}
            compact={false}
          />
          <p
            style={{
              fontSize: 12,
              color: '#96969e',
              margin: '8px 0 0 0',
              marginTop: 8,
            }}
          >
            Allocated: {allocation.allocated_credits.toLocaleString()}
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#96969e', marginBottom: 14 }}>
          No allocation yet. Contact your admin.
        </p>
      )}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600 }}>
          Request More Credits
        </h4>

        {pending && (
          <p style={{ fontSize: 12, color: '#f4b860', marginBottom: 12 }}>
            📋 Pending request: {pending.requested_amount.toLocaleString()} credits
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="number"
            placeholder="Credits needed"
            value={requestAmount}
            onChange={(e) => setRequestAmount(e.target.value)}
            disabled={loading || !!pending}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e8e8ec',
              fontSize: 13,
            }}
          />
          <textarea
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={loading || !!pending}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e8e8ec',
              fontSize: 13,
              resize: 'vertical',
              minHeight: 60,
            }}
          />
          <button
            onClick={submitRequest}
            disabled={loading || !requestAmount || !!pending}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: !loading && requestAmount && !pending ? '#4a9eff' : '#3a5c7a',
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 500,
              cursor: !loading && requestAmount && !pending ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Submitting…' : 'Request Credits'}
          </button>
        </div>

        {submitted && (
          <p style={{ fontSize: 12, color: '#7dd87d', marginTop: 8 }}>
            ✓ Request submitted. Awaiting admin approval.
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: '#e08c8c', marginTop: 8 }}>
            ✗ {error}
          </p>
        )}
      </div>
    </div>
  );
}
