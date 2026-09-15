"use client";

import { useState } from "react";
import { CONTACT_EMAILS } from "../../../lib/config/contactConfig";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("support");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `PawOS Inquiry: ${name || "Website Visitor"}`;
    const body = `${message}

— ${name}${email ? ` (${email})` : ""}`;
    
    let targetEmail: string = CONTACT_EMAILS.hello;
    if (category === "support") targetEmail = CONTACT_EMAILS.support;
    if (category === "enterprise") targetEmail = CONTACT_EMAILS.enterprise;
    if (category === "sales") targetEmail = CONTACT_EMAILS.sales;

    window.location.href = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Name</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" placeholder="Jane Doe" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" placeholder="jane@example.com" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">How can we help?</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors">
          <option value="general">Product / General Inquiry</option>
          <option value="support">Technical / Developer Support</option>
          <option value="enterprise">Business / Organizations</option>
          <option value="sales">Partnerships & Sales</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">Message</label>
        <textarea required rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors resize-y" placeholder="Tell us what you are building or how we can help..." />
      </div>
      <button type="submit" className="w-full rounded-lg bg-white px-6 py-4 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors">Prepare Message</button>
      <p className="text-center text-xs text-neutral-500">This will open your default email client with your message ready to send.</p>
    </form>
  );
}
