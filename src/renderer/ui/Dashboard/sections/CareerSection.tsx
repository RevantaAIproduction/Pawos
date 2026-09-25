import React, { useState } from 'react';
import dash from '../dashboard.module.css';
import styles from './career.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { useEntitlementSnapshot } from '../../../billing/useEntitlementSnapshot';
import type { FeatureId } from '../../../../shared/billing/BillingTypes';
import type { BuildPdfDocument } from '../../../../shared/billing/BuildPdfTypes';
import type {
  AtsScoreReport,
  CareerGuidanceReport,
  CareerToolId,
  CareerToolRequest,
  GenerateResumeInput,
  ResumeResult,
  StructuredResume,
} from '../../../../shared/career/CareerTypes';
import { atsReportToPdfDocument, guidanceToPdfDocument, jobSearchLinks, resumeToPdfDocument } from '../../../../shared/career/CareerPdf';

type Tab = CareerToolId;

const TABS: { id: Tab; label: string; feature: FeatureId }[] = [
  { id: 'atsScore', label: 'ATS score', feature: 'atsScoring' },
  { id: 'rewriteResume', label: 'Rewrite resume', feature: 'resumeRewriting' },
  { id: 'generateResume', label: 'Create resume', feature: 'resumeGeneration' },
  { id: 'careerGuidance', label: 'Career & jobs', feature: 'jobSearch' },
];

export const CAREER_FEATURES: FeatureId[] = TABS.map((t) => t.feature);

const EMPTY_PROFILE: GenerateResumeInput = {
  fullName: '',
  contact: '',
  targetRole: '',
  education: '',
  experience: '',
  projects: '',
  skills: '',
  achievements: '',
};

function resumeToPlainText(resume: StructuredResume): string {
  const lines: string[] = [resume.fullName, resume.headline, resume.contactLine, ''];
  if (resume.summary) lines.push('SUMMARY', resume.summary, '');
  for (const section of resume.sections) {
    lines.push(section.heading.toUpperCase());
    for (const item of section.items) {
      lines.push([item.title, item.subtitle, item.dates].filter(Boolean).join(' | '));
      for (const bullet of item.bullets) lines.push(`- ${bullet}`);
    }
    lines.push('');
  }
  if (resume.skills.length) lines.push('SKILLS', resume.skills.join(', '));
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n').trim();
}

function ResumePreview({ resume }: { resume: StructuredResume }) {
  return (
    <div className={styles.resumePreview} data-testid="career-resume-preview">
      <div style={{ fontSize: 18, fontWeight: 700 }}>{resume.fullName}</div>
      {resume.headline && <div>{resume.headline}</div>}
      {resume.contactLine && <div style={{ opacity: 0.7 }}>{resume.contactLine}</div>}
      {resume.summary && (
        <>
          <h4>Summary</h4>
          <div>{resume.summary}</div>
        </>
      )}
      {resume.sections.map((section, si) => (
        <div key={si}>
          <h4>{section.heading}</h4>
          {section.items.map((item, ii) => (
            <div key={ii} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>
                {[item.title, item.subtitle].filter(Boolean).join(' — ')}
                {item.dates && <span style={{ fontWeight: 400, opacity: 0.7 }}> · {item.dates}</span>}
              </div>
              {item.bullets.length > 0 && (
                <ul>
                  {item.bullets.map((b, bi) => (
                    <li key={bi}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
      {resume.skills.length > 0 && (
        <>
          <h4>Skills</h4>
          <div>{resume.skills.join(', ')}</div>
        </>
      )}
    </div>
  );
}

/**
 * Career tools — the student features of PawOS Build: ATS scoring against a real job description,
 * ATS-friendly resume rewriting, resume creation from the student's own details, and career/job
 * guidance with job-board search links. Every run goes through career:run, where the main process
 * re-checks the feature entitlement and the same Paw Compute limits a chat turn uses.
 */
export function CareerSection({ onOpenUrl }: { onOpenUrl: (url: string) => void }) {
  const entitlement = useEntitlementSnapshot();
  const available = new Set(entitlement?.features ?? []);
  const visibleTabs = TABS.filter((t) => available.has(t.feature));

  const [tab, setTab] = useState<Tab>('atsScore');
  const [resumeText, setResumeText] = useState('');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [location, setLocation] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Student / fresher');
  const [profile, setProfile] = useState<GenerateResumeInput>(EMPTY_PROFILE);

  const [running, setRunning] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atsReport, setAtsReport] = useState<AtsScoreReport | null>(null);
  const [rewrite, setRewrite] = useState<ResumeResult | null>(null);
  const [generated, setGenerated] = useState<ResumeResult | null>(null);
  const [guidance, setGuidance] = useState<CareerGuidanceReport | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  if (!entitlement) return <div className={dash.card}>Loading…</div>;

  if (visibleTabs.length === 0) {
    return (
      <div className={dash.card} data-testid="career-not-included">
        <h3 className={dash.cardTitle}>Career tools</h3>
        <p className={dash.cardBody}>Resume, ATS and career tools aren't included in your current plan.</p>
      </div>
    );
  }

  const activeTab = visibleTabs.find((t) => t.id === tab)?.id ?? visibleTabs[0]?.id ?? 'atsScore';

  const importResume = async () => {
    setImportNote(null);
    setError(null);
    const result = await ipc.careerImportResume();
    if (result.ok) {
      setResumeText(result.text);
      setImportNote(`Imported ${result.fileName}${result.truncated ? ' (trimmed to fit)' : ''}. Check the text below before running a tool.`);
    } else if (!('canceled' in result && result.canceled)) {
      setError(result.reason);
    }
  };

  const run = async (request: CareerToolRequest) => {
    setRunning(request.tool);
    setError(null);
    setSavedPath(null);
    try {
      const result = await ipc.careerRun(request);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      switch (result.tool) {
        case 'atsScore':
          setAtsReport(result.data as AtsScoreReport);
          break;
        case 'rewriteResume':
          setRewrite(result.data as ResumeResult);
          break;
        case 'generateResume':
          setGenerated(result.data as ResumeResult);
          break;
        case 'careerGuidance':
          setGuidance(result.data as CareerGuidanceReport);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request failed.');
    } finally {
      setRunning(null);
    }
  };

  const exportPdf = async (doc: BuildPdfDocument, name: string) => {
    setError(null);
    setSavedPath(null);
    const result = await ipc.careerExportPdf(doc, name);
    if (result.ok) setSavedPath(result.filePath);
    else if (!('canceled' in result && result.canceled)) setError(result.reason);
  };

  const needsResume = activeTab !== 'generateResume';
  const busy = running !== null;

  return (
    <div>
      <div className={dash.card} style={{ marginBottom: 16 }}>
        <h3 className={dash.cardTitle}>Career tools</h3>
        <p className={dash.cardBody}>
          Score your resume against a real job description, rewrite it for ATS, create one from scratch, and plan your job search.
          Each run uses Paw Compute from your plan.
        </p>
      </div>

      <div className={styles.tabs} role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => {
              setTab(t.id);
              setError(null);
              setSavedPath(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={dash.card}>
        {needsResume && (
          <div className={styles.field}>
            <div className={styles.row} style={{ justifyContent: 'space-between' }}>
              <label className={styles.label} htmlFor="career-resume">Your resume</label>
              <button type="button" className={styles.linkButton} onClick={() => void importResume()} disabled={busy}>
                Import PDF / DOCX
              </button>
            </div>
            <textarea
              id="career-resume"
              className={styles.textarea}
              style={{ minHeight: 160 }}
              value={resumeText}
              placeholder="Paste your resume text here, or import a PDF/DOCX file."
              onChange={(e) => setResumeText(e.target.value)}
            />
            {importNote && <span className={styles.hint}>{importNote}</span>}
          </div>
        )}

        {activeTab === 'atsScore' && (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="career-jd">Job description</label>
              <textarea id="career-jd" className={styles.textarea} value={jobDescription} placeholder="Paste the full job posting." onChange={(e) => setJobDescription(e.target.value)} />
            </div>
            <button
              type="button"
              className={dash.primaryButton}
              disabled={busy}
              onClick={() => void run({ tool: 'atsScore', input: { resumeText, jobDescription } })}
            >
              {running === 'atsScore' ? 'Scoring…' : 'Score my resume'}
            </button>
          </>
        )}

        {activeTab === 'rewriteResume' && (
          <>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="career-role">Target role (optional)</label>
                <input id="career-role" className={styles.input} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Frontend Developer Intern" />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="career-jd2">Job description (optional)</label>
              <textarea id="career-jd2" className={styles.textarea} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste a posting to tailor the rewrite to it." />
            </div>
            <button
              type="button"
              className={dash.primaryButton}
              disabled={busy}
              onClick={() => void run({ tool: 'rewriteResume', input: { resumeText, targetRole, jobDescription } })}
            >
              {running === 'rewriteResume' ? 'Rewriting…' : 'Rewrite my resume'}
            </button>
          </>
        )}

        {activeTab === 'generateResume' && (
          <>
            <div className={styles.twoCol}>
              {(
                [
                  ['fullName', 'Full name', 'Priya Sharma'],
                  ['contact', 'Contact line', 'priya@email.com · +91 98xxxxxx · linkedin.com/in/priya'],
                  ['targetRole', 'Target role', 'Data Analyst Intern'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div className={styles.field} key={key}>
                  <label className={styles.label} htmlFor={`career-${key}`}>{label}</label>
                  <input id={`career-${key}`} className={styles.input} value={profile[key]} placeholder={placeholder} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            {(
              [
                ['education', 'Education', 'Degree, college, year, CGPA/percentage'],
                ['experience', 'Experience / internships', 'Role, organization, dates, what you did'],
                ['projects', 'Projects', 'Project name, tech used, what it does, your part'],
                ['skills', 'Skills', 'Languages, tools, frameworks'],
                ['achievements', 'Achievements & activities (optional)', 'Hackathons, certifications, clubs, awards'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div className={styles.field} key={key}>
                <label className={styles.label} htmlFor={`career-${key}`}>{label}</label>
                <textarea id={`career-${key}`} className={styles.textarea} style={{ minHeight: 70 }} value={profile[key]} placeholder={placeholder} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />
              </div>
            ))}
            <button type="button" className={dash.primaryButton} disabled={busy} onClick={() => void run({ tool: 'generateResume', input: profile })}>
              {running === 'generateResume' ? 'Creating…' : 'Create my resume'}
            </button>
          </>
        )}

        {activeTab === 'careerGuidance' && (
          <>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="career-role2">Preferred role (optional)</label>
                <input id="career-role2" className={styles.input} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Open to suggestions" />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="career-location">Preferred location (optional)</label>
                <input id="career-location" className={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bengaluru, Remote" />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="career-level">Experience level</label>
                <input id="career-level" className={styles.input} value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className={dash.primaryButton}
              disabled={busy}
              onClick={() => void run({ tool: 'careerGuidance', input: { resumeText, targetRole, location, experienceLevel } })}
            >
              {running === 'careerGuidance' ? 'Planning…' : 'Plan my job search'}
            </button>
          </>
        )}

        {error && <div className={styles.error} role="alert" data-testid="career-error">{error}</div>}
        {savedPath && (
          <div className={styles.row} style={{ marginTop: 12 }}>
            <span className={styles.success} data-testid="career-saved">Saved to {savedPath}</span>
            <button type="button" className={styles.linkButton} onClick={() => void ipc.careerRevealFile(savedPath)}>
              Show in folder
            </button>
          </div>
        )}

        {activeTab === 'atsScore' && atsReport && (
          <div className={styles.result} data-testid="career-ats-result">
            <div className={styles.row} style={{ alignItems: 'baseline' }}>
              <span className={styles.score}>{atsReport.overallScore}</span>
              <span style={{ opacity: 0.7 }}>/ 100 ATS match</span>
            </div>
            <p className={dash.cardBody}>{atsReport.verdict}</p>
            <div className={styles.subheading}>Matched keywords</div>
            <div className={styles.chips}>
              {atsReport.matchedKeywords.length ? atsReport.matchedKeywords.map((k) => <span key={k} className={styles.chip}>{k}</span>) : <span className={styles.hint}>None found</span>}
            </div>
            <div className={styles.subheading}>Missing keywords</div>
            <div className={styles.chips}>
              {atsReport.missingKeywords.length ? atsReport.missingKeywords.map((k) => <span key={k} className={`${styles.chip} ${styles.chipMissing}`}>{k}</span>) : <span className={styles.hint}>None</span>}
            </div>
            <div className={styles.subheading}>Section scores</div>
            <ul>
              {atsReport.sectionScores.map((s) => (
                <li key={s.section}>
                  <strong>{s.section}: {s.score}/100</strong> — {s.feedback}
                </li>
              ))}
            </ul>
            {atsReport.formattingIssues.length > 0 && (
              <>
                <div className={styles.subheading}>Formatting issues</div>
                <ul>{atsReport.formattingIssues.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </>
            )}
            <div className={styles.subheading}>Recommendations</div>
            <ul>{atsReport.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <button type="button" className={dash.primaryButton} onClick={() => void exportPdf(atsReportToPdfDocument(atsReport, ''), 'ATS Analysis')}>
              Download PDF
            </button>
          </div>
        )}

        {((activeTab === 'rewriteResume' && rewrite) || (activeTab === 'generateResume' && generated)) && (() => {
          const current = (activeTab === 'rewriteResume' ? rewrite : generated) as ResumeResult;
          return (
            <div className={styles.result}>
              <ResumePreview resume={current.resume} />
              {current.notes.length > 0 && (
                <>
                  <div className={styles.subheading}>Before you send it</div>
                  <ul>{current.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </>
              )}
              <div className={styles.row} style={{ marginTop: 12 }}>
                <button type="button" className={dash.primaryButton} onClick={() => void exportPdf(resumeToPdfDocument(current.resume), `${current.resume.fullName || 'Resume'} Resume`)}>
                  Download PDF
                </button>
                <button type="button" className={dash.dangerButton} onClick={() => void navigator.clipboard.writeText(resumeToPlainText(current.resume))}>
                  Copy text
                </button>
                <button
                  type="button"
                  className={dash.dangerButton}
                  onClick={() => {
                    setResumeText(resumeToPlainText(current.resume));
                    setTab('atsScore');
                  }}
                >
                  Use for ATS scoring
                </button>
              </div>
            </div>
          );
        })()}

        {activeTab === 'careerGuidance' && guidance && (
          <div className={styles.result} data-testid="career-guidance-result">
            <div className={styles.subheading}>Roles to target</div>
            {guidance.targetRoles.map((role) => (
              <div key={role.title} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>
                  {role.title} <span style={{ fontWeight: 400, opacity: 0.7 }}>· fit {role.fitScore}/100</span>
                </div>
                <div className={styles.hint} style={{ marginBottom: 6 }}>{role.reason}</div>
                <div className={styles.row}>
                  {jobSearchLinks([role.title, ...role.searchKeywords.slice(0, 2)].join(' '), location).map((link) => (
                    <button key={link.label} type="button" className={styles.linkButton} onClick={() => onOpenUrl(link.url)}>
                      Search {link.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className={styles.subheading}>Skill gaps</div>
            <ul>
              {guidance.skillGaps.map((g) => (
                <li key={g.skill}>
                  <strong>{g.skill}</strong> — {g.whyItMatters} <em>How to learn:</em> {g.howToLearn}
                </li>
              ))}
            </ul>
            <div className={styles.subheading}>Application plan</div>
            <ol>{guidance.applicationPlan.map((step, i) => <li key={i}>{step}</li>)}</ol>
            <div className={styles.subheading}>Interview preparation</div>
            <ul>
              {guidance.interviewPrep.map((q, i) => (
                <li key={i}>
                  <strong>{q.question}</strong> — {q.approach}
                </li>
              ))}
            </ul>
            <button type="button" className={dash.primaryButton} onClick={() => void exportPdf(guidanceToPdfDocument(guidance), 'Career Plan')}>
              Download PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
