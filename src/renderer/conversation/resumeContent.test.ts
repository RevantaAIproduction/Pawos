import { describe, expect, it } from 'vitest';
import { findResumeProblems, resumeAsText, resumeToExportDocument, toChatResume } from './resumeContent';

describe('present_resume content', () => {
  it('keeps the document as title + sections, dropping empty lines and empty sections', () => {
    const resume = toChatResume({
      title: '  Tharun Esta — Resume ',
      sections: [
        { heading: 'Tharun Esta', paragraphs: ['tharun@example.com · Hyderabad', '  ', 7] },
        { heading: 'Experience', paragraphs: ['Engineer, Acme — 2022–2024', '• Cut API latency 40%'] },
        { heading: '', paragraphs: [] },
        'junk',
      ],
    });
    expect(resume).toEqual({
      title: 'Tharun Esta — Resume',
      sections: [
        { heading: 'Tharun Esta', paragraphs: ['tharun@example.com · Hyderabad'] },
        { heading: 'Experience', paragraphs: ['Engineer, Acme — 2022–2024', '• Cut API latency 40%'] },
      ],
    });
    expect(resumeAsText(resume!)).toBe('Tharun Esta\ntharun@example.com · Hyderabad\n\nExperience\nEngineer, Acme — 2022–2024\n• Cut API latency 40%');
  });

  it('checks the resume against what the user typed: exact contact details, every mentioned section, name header', () => {
    const user = ['New one. Asha Rao, asha.rao@example.com, +91 90000 00000, Bengaluru, linkedin.com/in/asharao. Experience: Flipkart 2021-2024. Education: B.Tech CS, VIT 2021. Skills: React.'];
    const good = {
      title: 'Asha Rao — Resume',
      sections: [
        { heading: 'Asha Rao', paragraphs: ['asha.rao@example.com · +91 90000 00000 · Bengaluru · linkedin.com/in/asharao'] },
        { heading: 'Experience', paragraphs: ['Frontend Developer, Flipkart — 2021–2024'] },
        { heading: 'Education', paragraphs: ['B.Tech CS, VIT — 2021'] },
        { heading: 'Skills', paragraphs: ['React'] },
      ],
    };
    expect(findResumeProblems(good, user)).toEqual([]);

    // What Flash-Lite actually produced in live runs: a "tidied" email, no Education, no name header.
    const bad = {
      title: 'Resume',
      sections: [
        { heading: 'Summary', paragraphs: ['Frontend developer · asharao@example.com · 9000000000'] },
        { heading: 'Experience', paragraphs: ['Flipkart'] },
        { heading: 'Skills', paragraphs: ['React'] },
      ],
    };
    expect(findResumeProblems(bad, user)).toEqual([
      'the email must be exactly "asha.rao@example.com"',
      'the phone number must be exactly "+91 90000 00000"',
      'the link "linkedin.com/in/asharao" is missing',
      'a "Education" section is missing',
      "the first section's heading must be the person's full name, with their contact details as its lines",
    ]);
  });

  it('for download: the name becomes the title and the contact lines the subtitle — the name is not printed twice', () => {
    expect(
      resumeToExportDocument({
        title: 'Asha Rao — Frontend Resume',
        sections: [
          { heading: 'Asha Rao', paragraphs: ['asha.rao@example.com', '+91 90000 00000 · Bengaluru'] },
          { heading: 'Skills', paragraphs: ['React'] },
        ],
      })
    ).toEqual({ title: 'Asha Rao', subtitle: 'asha.rao@example.com · +91 90000 00000 · Bengaluru', sections: [{ heading: 'Skills', paragraphs: ['React'] }] });
    // No name header → keep the document as it is.
    const plain = { title: 'Cover letter', sections: [{ heading: 'Summary', paragraphs: ['x'] }] };
    expect(resumeToExportDocument(plain)).toEqual({ title: 'Cover letter', sections: plain.sections });
  });

  it('nothing usable → null (the model is told to send real content)', () => {
    expect(toChatResume({ title: 'x', sections: [] })).toBeNull();
    expect(toChatResume({ title: 'x' })).toBeNull();
    expect(toChatResume(null)).toBeNull();
  });
});
