import React, { useState } from 'react';

interface PaymentEvidenceUploadProps {
  billingCaseId: string;
  invoiceIds: string[];
  onUploadComplete?: (evidenceId: string, invoiceId: string) => void;
  accessToken: string;
}

export function PaymentEvidenceUpload({
  billingCaseId,
  invoiceIds,
  onUploadComplete,
  accessToken,
}: PaymentEvidenceUploadProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoiceIds[0] || '');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedMap, setUploadedMap] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select an image file (PNG, JPG, GIF, WebP).');
        setFile(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be under 10MB.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedInvoiceId) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('accessToken', accessToken);
      formData.append('billingCaseId', billingCaseId);
      formData.append('invoiceId', selectedInvoiceId);
      formData.append('file', file);

      const response = await fetch('/api/billing/upload-payment-evidence', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ reason: 'Upload failed' }));
        throw new Error(errorData.reason || 'Failed to upload evidence');
      }

      const data = await response.json() as { ok: boolean; evidenceId: string; invoiceId: string };
      if (!data.ok) throw new Error('Upload failed');

      setUploadedMap((prev) => ({ ...prev, [selectedInvoiceId]: true }));
      onUploadComplete?.(data.evidenceId, data.invoiceId);
      setSuccess(`Payment evidence uploaded successfully for Invoice ${selectedInvoiceId}`);
      setFile(null);
      setSelectedInvoiceId(invoiceIds.find(id => !uploadedMap[id]) || invoiceIds[0] || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const allUploaded = invoiceIds.every(id => uploadedMap[id]);

  return (
    <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>
        Payment Evidence
      </h4>

      {allUploaded && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: 13,
          color: '#22c55e',
          fontWeight: 500,
        }}>
          ✓ All invoice evidence uploaded. Your payment is under validation.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {invoiceIds.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Select Invoice *</span>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              disabled={uploading || allUploaded}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.2)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            >
              {invoiceIds.map((id) => (
                <option key={id} value={id} disabled={uploadedMap[id]}>
                  {id} {uploadedMap[id] ? '✓ Uploaded' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            {file ? file.name : 'Upload Payment Screenshot'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading || allUploaded}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px dashed rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'inherit',
              fontSize: 12,
              cursor: uploading || allUploaded ? 'not-allowed' : 'pointer',
              opacity: uploading || allUploaded ? 0.5 : 1,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--pawos-text-secondary)' }}>
            PNG, JPG, GIF or WebP • Max 10MB
          </span>
        </label>

        {error && (
          <div style={{ fontSize: 12, color: '#ff6b6b' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ fontSize: 12, color: '#22c55e' }}>
            {success}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading || allUploaded || !selectedInvoiceId}
          style={{
            padding: '10px',
            borderRadius: '4px',
            backgroundColor: file && !uploading && !allUploaded ? '#3b82f6' : 'rgba(255,255,255,0.1)',
            color: 'white',
            border: 'none',
            fontWeight: 600,
            cursor: file && !uploading && !allUploaded ? 'pointer' : 'not-allowed',
            opacity: file && !uploading && !allUploaded ? 1 : 0.5,
            fontSize: 13,
          }}
        >
          {uploading ? 'Uploading...' : allUploaded ? 'All Evidence Uploaded' : 'Upload Evidence'}
        </button>
      </div>

      <div style={{ marginTop: '12px', fontSize: 12, color: 'var(--pawos-text-secondary)', lineHeight: 1.5 }}>
        <strong>Note:</strong> Payment evidence is for reference only. Your actual payment status will be verified through Razorpay and our backend. We'll confirm receipt within 2 hours.
      </div>
    </div>
  );
}
