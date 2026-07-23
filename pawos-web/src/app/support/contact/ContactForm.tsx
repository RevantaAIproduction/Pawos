"use client";

import { useState } from "react";
import { CONTACT_EMAILS } from "../../../lib/config/contactConfig";

/**
 * No backend exists yet, so submitting builds a real mailto: link from the
 * fields and opens it — this actually works today (opens the visitor's own
 * mail client with the message prefilled) rather than pretending to submit
 * to a server that isn't there. Swapping this for a real API call later is
 * a one-function change; the fields themselves don't need to move.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `Message from ${name || "PawOS website visitor"}`;
    const body = `${message}\n\n— ${name}${email ? ` (${email})` : ""}`;
    window.location.href = `mailto:${CONTACT_EMAILS.support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-md space-y-4">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-neutral-300">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-neutral-300">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-neutral-300">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-3 text-sm font-semibold text-black hover:opacity-90"
      >
        Send message
      </button>
      <p className="text-center text-xs text-neutral-500">Opens your email client with this message ready to send.</p>
    </form>
  );
}
