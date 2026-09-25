import { describe, expect, it } from 'vitest';
import { isPawosAdminEmail, PAWOS_ADMIN_EMAILS } from '../../shared/admin/AdminEmails';
import { toAdminError } from './AdminService';
import { formatAdminValue } from '../ui/admin/AdminDataTable';

describe('Admin console — visibility and error handling', () => {
  it('recognises exactly the PawOS admin emails (case/whitespace-insensitive), never anyone else', () => {
    expect(PAWOS_ADMIN_EMAILS).toEqual(['founder@revantaai.com', 'pawos@revantaai.com', 'tharun@revantaai.com']);
    expect(isPawosAdminEmail('Founder@RevantaAI.com ')).toBe(true);
    expect(isPawosAdminEmail('tharun@revantaai.com')).toBe(true);
    expect(isPawosAdminEmail('student@college.edu')).toBe(false);
    expect(isPawosAdminEmail('founder@revantaai.com.evil.com')).toBe(false);
    expect(isPawosAdminEmail(undefined)).toBe(false);
    expect(isPawosAdminEmail('')).toBe(false);
  });

  it('turns server error codes into readable messages', () => {
    expect(toAdminError({ message: 'forbidden' }).message).toContain('not authorized');
    expect(toAdminError({ message: 'cannot_remove_self' }).message).toContain("can't remove your own");
    expect(toAdminError({ message: 'last_admin' }).message).toContain('last admin');
    expect(toAdminError({ message: 'not_active' }).message).toContain("can't be renewed");
    expect(toAdminError({ message: 'permission denied for function admin_overview' }).message).toContain('no active server session');
    expect(toAdminError({ message: 'something else' }).message).toBe('something else');
  });

  it('formats live-schema values for the generic admin tables', () => {
    expect(formatAdminValue(null)).toBe('—');
    expect(formatAdminValue(true)).toBe('Yes');
    expect(formatAdminValue(1234)).toBe((1234).toLocaleString());
    expect(formatAdminValue('2026-09-24T10:00:00+00:00')).not.toContain('T10:00');
    expect(formatAdminValue({ a: 1 })).toBe('{"a":1}');
  });
});
