import * as nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import * as React from 'react';
import { getBrandingDir } from '../assets/AssetPathResolver';
import * as path from 'path';

import { Welcome } from './emails/Welcome';
import { OTP } from './emails/OTP';
import { VerifyEmail } from './emails/VerifyEmail';
import { PasswordReset } from './emails/PasswordReset';
import { PasswordChanged } from './emails/PasswordChanged';
import { LoginAlert } from './emails/LoginAlert';
import { GoogleAccountLinked } from './emails/GoogleAccountLinked';
import { EmailChanged } from './emails/EmailChanged';
import { AccountDeleted } from './emails/AccountDeleted';
import { SubscriptionEvent, type SubscriptionVariant } from './emails/SubscriptionEvent';
import { PaymentSuccess } from './emails/PaymentSuccess';
import { PaymentFailed } from './emails/PaymentFailed';
import { Invoice } from './emails/Invoice';
import { Refund } from './emails/Refund';
import { TokenPurchase } from './emails/TokenPurchase';
import { CompanionCreated } from './emails/CompanionCreated';
import { CompanionUpdated } from './emails/CompanionUpdated';
import { MemoryBackupComplete } from './emails/MemoryBackupComplete';
import { PeriodSummary, type SummaryStat } from './emails/PeriodSummary';
import { ProductUpdate, type ProductUpdateVariant } from './emails/ProductUpdate';
import { Newsletter, type NewsletterSection } from './emails/Newsletter';
import { FeedbackReceived } from './emails/FeedbackReceived';
import { OrganizationInvite } from './emails/OrganizationInvite';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

const LOGO_FULL_CID = 'pawos-logo-full';
const LOGO_ICON_CID = 'pawos-logo-icon';

/**
 * Every outbound PawOS email — transactional or marketing — goes through
 * this class. Nothing else in the app should call nodemailer directly.
 * Independent of Supabase Auth's own built-in confirmation/reset emails,
 * which are sent by Supabase's own servers and are not controllable here.
 */
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private from = '';

  init(config: SmtpConfig): void {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
  }

  private branding() {
    return { logoFullSrc: `cid:${LOGO_FULL_CID}`, logoIconSrc: `cid:${LOGO_ICON_CID}` };
  }

  private async send(to: string, subject: string, element: React.ReactElement): Promise<void> {
    if (!this.transporter) {
      throw new Error('EmailService is not configured — set SMTP_HOST/PORT/USER/PASS/EMAIL_FROM in .env.');
    }
    const html = await render(element);
    const brandingDir = getBrandingDir();
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      attachments: [
        { filename: 'logo-full.png', path: path.join(brandingDir, 'logo-full.png'), cid: LOGO_FULL_CID },
        { filename: 'logo-icon.png', path: path.join(brandingDir, 'logo-icon.png'), cid: LOGO_ICON_CID },
      ],
    });
  }

  async sendWelcome(to: string, params: { name: string; launchUrl: string }): Promise<void> {
    await this.send(to, `Welcome to PawOS, ${params.name}`, React.createElement(Welcome, { ...params, ...this.branding() }));
  }

  async sendOTP(to: string, params: { code: string; expiresInMinutes: number }): Promise<void> {
    await this.send(to, `Your PawOS verification code: ${params.code}`, React.createElement(OTP, { ...params, ...this.branding() }));
  }

  async sendVerification(to: string, params: { name: string; verifyUrl: string }): Promise<void> {
    await this.send(to, 'Confirm your PawOS email', React.createElement(VerifyEmail, { ...params, ...this.branding() }));
  }

  async sendPasswordReset(to: string, params: { name: string; resetUrl: string }): Promise<void> {
    await this.send(to, 'Reset your PawOS password', React.createElement(PasswordReset, { ...params, ...this.branding() }));
  }

  async sendPasswordChanged(to: string, params: { name: string; whenText: string }): Promise<void> {
    await this.send(to, 'Your PawOS password was changed', React.createElement(PasswordChanged, { ...params, ...this.branding() }));
  }

  async sendLoginAlert(
    to: string,
    params: { name: string; variant: 'success' | 'newDevice'; whenText: string; device?: string; location?: string }
  ): Promise<void> {
    const subject = params.variant === 'newDevice' ? 'New sign-in to your PawOS account' : 'You signed in to PawOS';
    await this.send(to, subject, React.createElement(LoginAlert, { ...params, ...this.branding() }));
  }

  async sendGoogleAccountLinked(to: string, params: { name: string; email: string }): Promise<void> {
    await this.send(to, 'Google account linked', React.createElement(GoogleAccountLinked, { ...params, ...this.branding() }));
  }

  async sendEmailChanged(to: string, params: { name: string; oldEmail: string; newEmail: string }): Promise<void> {
    await this.send(to, 'Your PawOS account email was changed', React.createElement(EmailChanged, { ...params, ...this.branding() }));
  }

  async sendAccountDeleted(to: string, params: { name: string }): Promise<void> {
    await this.send(to, 'Your PawOS account has been deleted', React.createElement(AccountDeleted, { ...params, ...this.branding() }));
  }

  async sendSubscription(
    to: string,
    params: { name: string; variant: SubscriptionVariant; planName: string; detailText: string; manageUrl: string }
  ): Promise<void> {
    await this.send(to, `PawOS — ${params.planName}`, React.createElement(SubscriptionEvent, { ...params, ...this.branding() }));
  }

  async sendPaymentSuccess(to: string, params: { name: string; amount: string; planName: string; invoiceUrl: string }): Promise<void> {
    await this.send(to, 'Payment successful', React.createElement(PaymentSuccess, { ...params, ...this.branding() }));
  }

  async sendPaymentFailure(
    to: string,
    params: { name: string; amount: string; planName: string; updatePaymentUrl: string }
  ): Promise<void> {
    await this.send(to, 'Payment failed — action needed', React.createElement(PaymentFailed, { ...params, ...this.branding() }));
  }

  async sendInvoice(
    to: string,
    params: {
      invoiceNumber: string;
      customerName: string;
      amount: string;
      tax: string;
      date: string;
      paymentMethod: string;
      downloadUrl: string;
    }
  ): Promise<void> {
    await this.send(to, `Invoice ${params.invoiceNumber}`, React.createElement(Invoice, { ...params, ...this.branding() }));
  }

  async sendRefund(to: string, params: { name: string; amount: string; reason?: string }): Promise<void> {
    await this.send(to, 'Your refund has been processed', React.createElement(Refund, { ...params, ...this.branding() }));
  }

  async sendTokenPurchase(to: string, params: { name: string; tokenAmount: string; newBalance: string }): Promise<void> {
    await this.send(to, 'Token purchase successful', React.createElement(TokenPurchase, { ...params, ...this.branding() }));
  }

  async sendCompanionCreated(to: string, params: { name: string; companionName: string; openUrl: string }): Promise<void> {
    await this.send(to, `${params.companionName} is ready`, React.createElement(CompanionCreated, { ...params, ...this.branding() }));
  }

  async sendCompanionUpdated(to: string, params: { name: string; companionName: string; changeSummary: string }): Promise<void> {
    await this.send(to, `${params.companionName} was updated`, React.createElement(CompanionUpdated, { ...params, ...this.branding() }));
  }

  async sendMemoryBackupComplete(to: string, params: { name: string; whenText: string; itemCount: number }): Promise<void> {
    await this.send(to, 'Memory backup complete', React.createElement(MemoryBackupComplete, { ...params, ...this.branding() }));
  }

  async sendWeeklySummary(to: string, params: { name: string; stats: SummaryStat[] }): Promise<void> {
    await this.send(
      to,
      'Your weekly PawOS summary',
      React.createElement(PeriodSummary, { name: params.name, period: 'weekly', stats: params.stats, ...this.branding() })
    );
  }

  async sendMonthlySummary(to: string, params: { name: string; stats: SummaryStat[] }): Promise<void> {
    await this.send(
      to,
      'Your monthly PawOS summary',
      React.createElement(PeriodSummary, { name: params.name, period: 'monthly', stats: params.stats, ...this.branding() })
    );
  }

  async sendProductUpdate(
    to: string,
    params: { variant: ProductUpdateVariant; title: string; body: string; learnMoreUrl: string }
  ): Promise<void> {
    await this.send(to, params.title, React.createElement(ProductUpdate, { ...params, ...this.branding() }));
  }

  async sendFeedbackReceived(
    to: string,
    params: { rating: number; comment?: string; fromName: string; appVersion: string }
  ): Promise<void> {
    await this.send(to, `New PawOS feedback: ${params.rating}/5 stars`, React.createElement(FeedbackReceived, { ...params, ...this.branding() }));
  }

  async sendOrganizationInvite(
    to: string,
    params: { organizationName: string; role: string; inviterName: string; openUrl: string }
  ): Promise<void> {
    await this.send(
      to,
      `You've been invited to ${params.organizationName} on PawOS`,
      React.createElement(OrganizationInvite, { ...params, ...this.branding() })
    );
  }

  async sendNewsletter(
    to: string,
    params: { headline: string; intro: string; sections: NewsletterSection[]; ctaLabel?: string; ctaUrl?: string; unsubscribeUrl: string }
  ): Promise<void> {
    await this.send(to, params.headline, React.createElement(Newsletter, { ...params, ...this.branding() }));
  }
}

export const emailService = new EmailService();
