import { describe, expect, it } from 'vitest';
import { formatInvoiceAmount, invoiceStatusLabel } from './invoiceFormat';

describe('Invoices table formatting', () => {
  it('amounts come in paise/cents and show in their currency', () => {
    expect(formatInvoiceAmount(200000, 'INR')).toBe('₹2,000.00');
    expect(formatInvoiceAmount(2000, 'USD')).toContain('$20.00');
    expect(formatInvoiceAmount(1050, 'XYZ-not-a-code')).toBe('10.50 XYZ-not-a-code');
  });

  it('statuses read in plain words', () => {
    expect(invoiceStatusLabel('paid')).toBe('Paid');
    expect(invoiceStatusLabel('issued')).toBe('Due');
    expect(invoiceStatusLabel('partially_paid')).toBe('Partly paid');
    expect(invoiceStatusLabel('something_new')).toBe('Something new');
  });
});
