'use client';
import { useState, useEffect } from 'react';

export function DownloadPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-download-popup', handleOpen);
    return () => window.removeEventListener('open-download-popup', handleOpen);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-all animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-medium text-white">Coming Soon</h3>
          <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-white transition">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        {!submitted ? (
          <>
            <p className="text-neutral-400 mb-6">PawOS for Windows is currently in closed beta. Leave your email below and we'll notify you the moment it's available for download.</p>
            <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="flex flex-col gap-4">
              <input type="email" required placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition" />
              <button type="submit" className="bg-white text-black font-medium py-3 rounded-lg hover:bg-neutral-200 transition">Notify me</button>
            </form>
          </>
        ) : (
          <div className="text-center py-8 animate-in fade-in duration-300">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 text-green-500 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h4 className="text-xl font-medium text-white mb-2">You're on the list!</h4>
            <p className="text-neutral-400">We'll email you at <span className="text-white">{email}</span> as soon as PawOS for Windows is ready.</p>
          </div>
        )}
      </div>
    </div>
  );
}