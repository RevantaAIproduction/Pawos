import React, { useMemo } from 'react';
import AppRoot from './AppRoot';
import CompanionExperience from './CompanionExperience';

export default function App() {
  const windowRole = useMemo(
    () => new URLSearchParams(window.location.search).get('window') ?? 'main',
    []
  );

  if (windowRole === 'companion') {
    return <CompanionExperience />;
  }

  return <AppRoot />;
}
