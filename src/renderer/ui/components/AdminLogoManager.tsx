import React, { useState, useEffect } from 'react';
import { OrganizationLogo } from './OrganizationLogo';

interface AdminLogoManagerProps {
  organizationId: string;
  accessToken: string;
  organizationName?: string;
}

export function AdminLogoManager({
  organizationId,
  accessToken,
  organizationName = 'Organization',
}: AdminLogoManagerProps) {
  const [hasLogo, setHasLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkLogo();
  }, [organizationId]);

  async function checkLogo() {
    try {
      const res = await fetch(
        `/api/organization/logo?organizationId=${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setHasLogo(!!data.logo);
      }
    } catch (e) {
      // Silently fail
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Please upload a PNG, JPEG, or WebP image');
      return;
    }

    // Validate file size (2MB max, matches Supabase bucket limit)
    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be less than 2MB');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1];
        if (!base64) {
          setError('Failed to read file');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/organization/logo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            organizationId,
            fileName: file.name,
            fileData: base64,
            mimeType: file.type,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.reason || 'Upload failed');
        }

        setHasLogo(true);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  async function removeLogo() {
    if (!window.confirm('Remove organization logo?')) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/organization/logo?organizationId=${organizationId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || 'Delete failed');
      }

      setHasLogo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
        marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 600 }}>
        Organization Logo
      </h3>

      {hasLogo && (
        <div style={{ marginBottom: 14 }}>
          <OrganizationLogo
            organizationId={organizationId}
            accessToken={accessToken}
            fallbackName={organizationName}
            size="large"
          />
        </div>
      )}

      {!hasLogo && (
        <p style={{ fontSize: 13, color: '#96969e', marginBottom: 14 }}>
          No logo uploaded. Members will see a fallback avatar.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <label
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: '#4a9eff',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Uploading…' : 'Upload Logo'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleFileSelect}
            disabled={loading}
            style={{ display: 'none' }}
          />
        </label>

        {hasLogo && (
          <button
            onClick={removeLogo}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: '#5a3a3a',
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#e08c8c', marginTop: 10 }}>
          ✗ {error}
        </p>
      )}

      <p style={{ fontSize: 11, color: '#96969e', marginTop: 10 }}>
        Formats: PNG, JPEG, WebP. Max 2MB.
      </p>
    </div>
  );
}
