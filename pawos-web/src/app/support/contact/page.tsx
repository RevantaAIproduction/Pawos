import React from 'react';
import { Metadata } from 'next';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact | PawOS',
  description: 'Reach the Revanta AI team about PawOS, product questions, technical questions, or business inquiries.',
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
            Reach the Revanta AI team about PawOS, technical questions, enterprise deployments, or general inquiries.
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
