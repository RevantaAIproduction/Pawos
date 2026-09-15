import os

# 1. Update contactConfig.ts
config_path = 'src/lib/config/contactConfig.ts'
with open(config_path, 'r', encoding='utf-8') as f:
    config = f.read()

config = config.replace('enterprise: "enterprise@revantaai.com",', 'partnership: "partnership@revantaai.com",\n  billing: "billing@revantaai.com",\n  founder: "founder@revantaai.com",')
with open(config_path, 'w', encoding='utf-8') as f:
    f.write(config)

# 2. Update page.tsx
page_path = 'src/app/support/contact/page.tsx'
page_content = """import React from 'react';
import { Metadata } from 'next';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact | PawOS',
  description: 'Reach the Revanta AI team about PawOS, product questions, technical questions, partnerships, or other legitimate inquiries.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-black text-neutral-300 selection:bg-indigo-500/30 selection:text-white">
      {/* HERO */}
      <header className="relative pt-40 pb-20 px-6 border-b border-neutral-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,40,90,0.15),transparent_50%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-8">
            Let's talk about what you're building.
          </h1>
          <p className="text-2xl text-neutral-400 font-light leading-relaxed max-w-3xl mx-auto">
            Reach the Revanta AI team about PawOS, technical questions, partnerships, enterprise deployments, or general inquiries.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-5 gap-16">
          
          {/* LEFT: Contact Paths */}
          <div className="md:col-span-2 space-y-12">
            <div>
              <h2 className="text-2xl font-medium text-white mb-6">Direct Channels</h2>
              <div className="space-y-8">
                
                <div>
                  <h3 className="text-lg font-medium text-neutral-200 mb-1">Product & General</h3>
                  <p className="text-sm text-neutral-400 mb-2">For general inquiries about PawOS and Revanta AI.</p>
                  <a href="mailto:hello@revantaai.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">hello@revantaai.com</a>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-neutral-200 mb-1">Technical & Support</h3>
                  <p className="text-sm text-neutral-400 mb-2">Developer questions, bug reports, and technical assistance.</p>
                  <a href="mailto:support@revantaai.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">support@revantaai.com</a>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-neutral-200 mb-1">Business & Sales</h3>
                  <p className="text-sm text-neutral-400 mb-2">Enterprise deployments, team rollouts, and pricing.</p>
                  <a href="mailto:sales@revantaai.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">sales@revantaai.com</a>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-neutral-200 mb-1">Partnerships</h3>
                  <p className="text-sm text-neutral-400 mb-2">Integration partnerships and ecosystem collaboration.</p>
                  <a href="mailto:partnership@revantaai.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">partnership@revantaai.com</a>
                </div>

              </div>
            </div>
          </div>

          {/* RIGHT: Contact Form (Mailto Builder) */}
          <div className="md:col-span-3 bg-neutral-950 border border-neutral-900 rounded-2xl p-8 md:p-12 shadow-xl">
            <h2 className="text-2xl font-medium text-white mb-2">Send a Message</h2>
            <p className="text-sm text-neutral-500 mb-8">Fill out the form below to prepare an email directly to our team.</p>
            <ContactForm />
          </div>

        </div>
      </main>
    </div>
  );
}
"""
with open(page_path, 'w', encoding='utf-8') as f:
    f.write(page_content)


# 3. Update ContactForm.tsx
form_path = 'src/app/support/contact/ContactForm.tsx'
form_content = """"use client";

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
    const body = `${message}\n\n— ${name}${email ? ` (${email})` : ""}`;
    
    let targetEmail: string = CONTACT_EMAILS.hello;
    if (category === "support") targetEmail = CONTACT_EMAILS.support;
    if (category === "sales") targetEmail = CONTACT_EMAILS.sales;
    if (category === "partnership") targetEmail = CONTACT_EMAILS.partnership;

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
          <option value="sales">Business & Sales</option>
          <option value="partnership">Partnerships</option>
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
"""
with open(form_path, 'w', encoding='utf-8') as f:
    f.write(form_content)

print("Updated emails to match exactly.")