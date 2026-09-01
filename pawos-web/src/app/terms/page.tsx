import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-16 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <Link href="/" className="text-blue-400 hover:underline">
            ← Back to PawOS
          </Link>
          <h1 className="mt-6 text-4xl font-bold">Terms of Service</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Last updated: 31 August 2026 • Version: 2026-08-31
          </p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold">Introduction</h2>
            <p className="text-neutral-300">
              These Terms of Service (&quot;Terms&quot;) constitute a legal agreement between you and Revanta AI (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) governing your use of the PawOS platform, website, and related services. By accessing or using PawOS, you agree to be bound by these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-neutral-300">
              By using PawOS, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree, please do not use our services. We reserve the right to modify these Terms at any time. Continued use of PawOS following any changes constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">2. Use License</h2>
            <p className="text-neutral-300">
              We grant you a limited, non-exclusive, non-transferable license to use PawOS for personal or internal business purposes. This license does not permit you to:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Modify or copy the materials (except for personal, non-commercial use)</li>
              <li>Reverse engineer or decompile the software</li>
              <li>Attempt to gain unauthorized access to systems or data</li>
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>Resell, redistribute, or commercially exploit the service without authorization</li>
              <li>Remove or alter any proprietary notices or labels</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">3. User Accounts</h2>
            <p className="text-neutral-300">
              When you create an account with PawOS, you agree to:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain the confidentiality of your password</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>
            <p className="mt-4 text-neutral-300">
              We reserve the right to suspend or terminate accounts that violate these Terms or engage in prohibited activities.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">4. Prohibited Conduct</h2>
            <p className="text-neutral-300">
              You agree not to:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights of others</li>
              <li>Transmit viruses, malware, or harmful code</li>
              <li>Engage in harassment, threats, or abusive behavior</li>
              <li>Attempt to gain unauthorized access to systems</li>
              <li>Use the service to spam, phish, or distribute malicious content</li>
              <li>Overload or disrupt the service through automated tools</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">5. Intellectual Property</h2>
            <p className="text-neutral-300">
              All content, features, and functionality of PawOS (including software, code, design, and documentation) are owned by Revanta AI or licensed to us. These are protected by copyright, trademark, and other intellectual property laws. Your use of PawOS does not grant you ownership of any intellectual property rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">6. User Content</h2>
            <p className="text-neutral-300">
              You retain all rights to any content you upload or create within PawOS. By using our service, you grant us a limited license to store, process, and display your content as necessary to operate the service and comply with legal obligations. You represent that you own or have permission to use all user content.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">7. Payment and Billing</h2>
            <p className="text-neutral-300">
              If you use paid features of PawOS:
            </p>
            <ul className="ml-6 list-disc space-y-2 text-neutral-300">
              <li>You agree to pay all charges as stated in your subscription plan</li>
              <li>Billing occurs automatically unless you cancel before renewal</li>
              <li>You authorize us to charge your payment method on file</li>
              <li>We reserve the right to change prices with 30 days&apos; notice</li>
              <li>Refunds are handled in accordance with our refund policy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">8. Disclaimer of Warranties</h2>
            <p className="text-neutral-300">
              PAWOS IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE MAKE NO WARRANTIES, EXPRESS OR IMPLIED, REGARDING THE SERVICE. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="mt-4 text-neutral-300">
              We do not guarantee that PawOS will be uninterrupted, secure, or error-free. Use of the service is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">9. Limitation of Liability</h2>
            <p className="text-neutral-300">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, REVANTA AI AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-4 text-neutral-300">
              OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">10. Indemnification</h2>
            <p className="text-neutral-300">
              You agree to indemnify and hold harmless Revanta AI from any claims, damages, losses, or expenses (including legal fees) arising from your violation of these Terms, your use of PawOS, or your infringement of any rights of others.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">11. Third-Party Links</h2>
            <p className="text-neutral-300">
              PawOS may contain links to third-party websites and services. We are not responsible for the content, accuracy, or practices of external sites. Your use of third-party services is governed by their own terms and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">12. Termination</h2>
            <p className="text-neutral-300">
              We may terminate or suspend your account and access to PawOS immediately, without prior notice or liability, if you violate these Terms or engage in prohibited conduct. Upon termination, your right to use PawOS ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">13. Governing Law</h2>
            <p className="text-neutral-300">
              These Terms are governed by and construed in accordance with the laws of the jurisdiction in which Revanta AI is incorporated, without regard to its conflict of law provisions. Any legal action or proceeding shall be brought exclusively in the courts of that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">14. Severability</h2>
            <p className="text-neutral-300">
              If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">15. Contact Us</h2>
            <p className="text-neutral-300">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-4 space-y-1 text-neutral-300">
              <p><strong>Email:</strong> legal@revantaai.com</p>
              <p><strong>Company:</strong> Revanta AI</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
