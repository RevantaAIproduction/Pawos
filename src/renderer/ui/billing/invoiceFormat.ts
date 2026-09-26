/** "₹2,000.00" from 200000 paise; any currency Razorpay reports, in its smallest unit (÷100). */
export function formatInvoiceAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  issued: 'Due',
  partially_paid: 'Partly paid',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** Razorpay's invoice status in plain words ("issued" means sent and not paid yet). */
export function invoiceStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status ? status[0]!.toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown');
}
