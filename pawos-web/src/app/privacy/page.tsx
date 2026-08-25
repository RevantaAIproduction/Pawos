import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-16 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <Link href="/" className="text-blue-400 hover:underline">
            ← Back to PawOS
          </Link>
          <h1 className="mt-6 text-4xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold">Introduction</h2>
            <p className="text-neutral-300">
              PawOS by Revanta AI ("we," "us," "our," or "Company") operates the PawOS platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
            <p className="text-neutral-300">
              We collect information you provide directly to us, such as:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Account registration information (name, email address, password)</li>
              <li>Profile information and preferences</li>
              <li>Communications you send us</li>
              <li>Payment information (processed securely by third-party providers)</li>
            </ul>
            <p className="mt-4 text-neutral-300">
              We automatically collect certain information when you use PawOS:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Log data and usage statistics</li>
              <li>Device information and browser type</li>
              <li>IP address and general location</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-neutral-300">
              We use collected information to:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Provide and maintain our services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Improve and optimize our platform</li>
              <li>Prevent fraud and enhance security</li>
              <li>Send marketing communications (with your consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">3. Data Security</h2>
            <p className="text-neutral-300">
              We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">4. Third-Party Services</h2>
            <p className="text-neutral-300">
              PawOS integrates with third-party services including:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Supabase for authentication and database services</li>
              <li>Payment processors for billing</li>
              <li>Cloud infrastructure providers</li>
              <li>OAuth providers (Google, GitHub, Microsoft)</li>
            </ul>
            <p className="mt-4 text-neutral-300">
              These services are governed by their own privacy policies. We encourage you to review their policies before providing information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">5. Cookies</h2>
            <p className="text-neutral-300">
              PawOS uses cookies to enhance your experience, including session management and user preferences. You can control cookies through your browser settings, but this may affect functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">6. Your Rights</h2>
            <p className="text-neutral-300">
              Depending on your location, you may have rights including:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Access to your personal information</li>
              <li>Correction of inaccurate data</li>
              <li>Deletion of your data (subject to legal obligations)</li>
              <li>Portability of your information</li>
              <li>Opt-out of marketing communications</li>
            </ul>
            <p className="mt-4 text-neutral-300">
              To exercise these rights, please contact us at privacy@revantaai.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">7. Children's Privacy</h2>
            <p className="text-neutral-300">
              PawOS is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it and terminate the child's account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">8. International Transfers</h2>
            <p className="text-neutral-300">
              Your information may be transferred to, stored in, and processed in countries other than your country of residence. These countries may have data protection laws that differ from your home country. By using PawOS, you consent to such transfers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">9. Policy Changes</h2>
            <p className="text-neutral-300">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of PawOS constitutes your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">10. Contact Us</h2>
            <p className="text-neutral-300">
              If you have questions about this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="mt-4 space-y-1 text-neutral-300">
              <p><strong>Email:</strong> privacy@revantaai.com</p>
              <p><strong>Company:</strong> Revanta AI</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
