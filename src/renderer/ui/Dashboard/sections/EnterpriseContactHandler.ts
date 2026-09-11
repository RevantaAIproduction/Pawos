import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';

export interface EnterpriseContactHandler {
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
  userEmail: string;
  userName?: string;
}

export interface EnterpriseContactForm {
  name: string;
  email: string;
  company: string;
  requirements: string;
}

export async function submitEnterpriseContact(
  formData: EnterpriseContactForm,
  options: EnterpriseContactHandler
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    // Validate form
    if (!formData.name?.trim()) {
      options.setMessage('❌ Name is required');
      options.setBusy(false);
      return;
    }

    if (!formData.email?.trim()) {
      options.setMessage('❌ Email is required');
      options.setBusy(false);
      return;
    }

    if (!formData.company?.trim()) {
      options.setMessage('❌ Company is required');
      options.setBusy(false);
      return;
    }

    if (!formData.requirements?.trim() || formData.requirements.length < 10) {
      options.setMessage('❌ Please describe your requirements (min 10 characters)');
      options.setBusy(false);
      return;
    }

    // Get auth token
    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      options.setMessage('❌ Sign in required');
      options.setBusy(false);
      return;
    }

    // Send to backend via IPC
    const result = await ipc.enterpriseSubmitInquiry({
      name: formData.name,
      email: formData.email,
      company: formData.company,
      requirements: formData.requirements,
      accessToken,
    });

    if (!result.ok) {
      options.setMessage(`❌ ${result.reason}`);
      options.setBusy(false);
      return;
    }

    // Success - no immediate email, user waits for support response
    options.setMessage(
      `✅ Thank you! Your inquiry has been received.\n\nOur team will review your requirements and contact you at ${formData.email} shortly.`
    );
    options.setBusy(false);

  } catch (error) {
    options.setMessage(`❌ ${error instanceof Error ? error.message : 'Failed to submit inquiry'}`);
    options.setBusy(false);
  }
}
