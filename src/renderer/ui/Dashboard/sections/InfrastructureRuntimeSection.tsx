import React from 'react';
import { CloudIcon } from '../NavIcons';
import { RuntimeLandingSection } from './RuntimeLandingSection';

export function InfrastructureRuntimeSection() {
  return (
    <RuntimeLandingSection
      icon={<CloudIcon />}
      description="Paw connects to your real infrastructure — repos, CI/CD, hosting, and servers — to investigate issues and ship deploys, always with confirmation before anything risky."
      capabilities={[
        { title: 'Deploys', body: 'Deploy, roll back, and promote staging to production on Vercel, Netlify, and more.' },
        { title: 'Investigation', body: 'Correlate logs, deploys, and errors to find root causes across your stack.' },
        { title: 'CI/CD & tickets', body: 'Check build status and work Linear/Jira/GitHub/GitLab tickets directly.' },
        { title: 'Safe by default', body: 'Read-only investigation mode until you switch to full execution — every risky action is confirmed first.' },
      ]}
      quickStarts={[
        { label: 'Check my last deploy', prefill: 'What happened with my last deployment?' },
        { label: 'Investigate an issue', prefill: 'Help me investigate a production issue.' },
        { label: 'Deploy my project', prefill: 'Deploy my project.' },
      ]}
    />
  );
}
