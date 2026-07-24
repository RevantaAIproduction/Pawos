import React from 'react';
import { AdvancedSection } from './AdvancedSection';
import { UpdatesSection } from './UpdatesSection';

/** Developers tab: coding/infrastructure mode + connectors (AdvancedSection) plus version/updates (UpdatesSection), stacked. */
export function DevelopersSettingsPage() {
  return (
    <div>
      <AdvancedSection />
      <div style={{ marginTop: 14 }}>
        <UpdatesSection />
      </div>
    </div>
  );
}
