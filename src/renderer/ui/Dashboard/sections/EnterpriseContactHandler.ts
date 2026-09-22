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
  phone: string;
  seatsNeeded: number;
  message?: string;
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
      options.setMessage('[error] Name is required');
      options.setBusy(false);
      return;
    }

    if (!formData.email?.trim()) {
      options.setMessage('[error] Email is required');
      options.setBusy(false);
      return;
    }

    if (!formData.company?.trim()) {
      options.setMessage('[error] Company is required');
      options.setBusy(false);
      return;
    }

    if (!formData.phone?.trim()) {
      options.setMessage('[error] Phone number is required');
      options.setBusy(false);
      return;
    }

    if (!formData.seatsNeeded || formData.seatsNeeded < 20) {
      options.setMessage('[error] Minimum 20 seats required');
      options.setBusy(false);
      return;
    }

    if (formData.message && formData.message.length > 5000) {
      options.setMessage('[error] Message too long (max 5000 characters)');
      options.setBusy(false);
      return;
    }

    // Get auth token
    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      options.setMessage('[error] Sign in required');
      options.setBusy(false);
      return;
    }

    // Send to backend via IPC
    const result = await ipc.enterpriseSubmitInquiry({
      name: formData.name,
      email: formData.email,
      company: formData.company,
      phone: formData.phone,
      seatsNeeded: formData.seatsNeeded,
      message: formData.message,
    });

    if (!result.ok) {
      options.setMessage(`[error] ${result.reason}`);
      options.setBusy(false);
      return;
    }

    // Success - no immediate email, user waits for support response
    options.setMessage(
      `✅ Thank you! Your inquiry has been received.\n\nOur team will review your requirements and contact you at ${formData.email} shortly.`
    );
    options.setBusy(false);

  } catch (error) {
    options.setMessage(`[error] ${error instanceof Error ? error.message : 'Failed to submit inquiry'}`);
    options.setBusy(false);
  }
}
