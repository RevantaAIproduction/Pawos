import React from 'react';
import { DevelopmentIcon } from '../NavIcons';
import { RuntimeLandingSection } from './RuntimeLandingSection';

export function DevelopmentRuntimeSection() {
  return (
    <RuntimeLandingSection
      icon={<DevelopmentIcon />}
      description="Paw works inside real codebases — understanding your project, writing and editing code, running builds and tests, and showing everything live in the Coding Canvas."
      capabilities={[
        { title: 'Coding Canvas', body: 'A live control center: project understanding, running processes, build status, test results, and a real diff — all visible while Paw works.' },
        { title: 'Code generation', body: 'Generate and edit code, run terminal commands, and manage git — with confirmation before anything destructive.' },
        { title: 'Build & test', body: 'Run builds and tests automatically, read failures, and propose targeted fixes.' },
        { title: 'Paw Go / Paw Pro', body: 'Paw Go is planning & analysis only; Paw Pro unlocks full code generation and execution — switch anytime in Settings.' },
      ]}
      quickStarts={[
        { label: 'Explain this project', prefill: 'Explain the structure of my current project.' },
        { label: 'Run my tests', prefill: 'Run my tests and tell me what fails.' },
        { label: 'Fix a bug', prefill: 'Help me fix a bug in my project.' },
      ]}
    />
  );
}
