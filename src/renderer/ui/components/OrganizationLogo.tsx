import React, { useState, useEffect } from 'react';

interface OrganizationLogoProps {
  organizationId: string;
  accessToken: string;
  fallbackName?: string;
  size?: 'small' | 'medium' | 'large';
}

export function OrganizationLogo({
  organizationId,
  accessToken,
  fallbackName = 'ORG',
  size = 'medium',
}: OrganizationLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogo();
  }, [organizationId]);

  async function loadLogo() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organization/logo?organizationId=${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.logo?.storage_path) {
          // Construct Supabase public URL
          const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
          const url = `${supabaseUrl}/storage/v1/object/public/org-logos/${data.logo.storage_path}`;
          setLogoUrl(url);
        }
      }
    } catch (e) {
      // Silently fail, use fallback
    } finally {
      setLoading(false);
    }
  }

  const sizeMap = {
    small: { width: 32, height: 32, fontSize: 12 },
    medium: { width: 64, height: 64, fontSize: 18 },
    large: { width: 128, height: 128, fontSize: 28 },
  };

  const dims = sizeMap[size];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Organization logo"
        style={{
          width: dims.width,
          height: dims.height,
          borderRadius: 6,
          objectFit: 'contain',
          background: 'rgba(255,255,255,0.04)',
        }}
      />
    );
  }

  // Fallback avatar
  return (
    <div
      style={{
        width: dims.width,
        height: dims.height,
        borderRadius: 6,
        background: 'linear-gradient(135deg, #4a9eff, #7dd87d)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: dims.fontSize,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {fallbackName.substring(0, 2).toUpperCase()}
    </div>
  );
}
