"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCompanionReply } from "../../lib/site-companion/respond";
import { trackEvent } from "../analytics/Analytics";
import { getStoredConsent } from "../analytics/CookieConsent";
import { MiniCompanionCanvas } from "../companion-preview/MiniCompanionCanvas";

type Message = {
  role: "assistant" | "user";
  text: string;
  href?: string;
  linkLabel?: string;
};

const GREETING: Message = {
  text: "Hi! Welcome to PawOS. What can I do for you?",
  role: "assistant",
};

const OPENING_SUGGESTIONS = [
  "Download PawOS",
  "Show pricing",
  "How does it work?",
  "How does the companion work?",
  "Why do I need this?",
];

export function SiteCompanion() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [cookieBannerVisible, setCookieBannerVisible] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    const sync = () => setCookieBannerVisible(getStoredConsent() === null);
    sync();
    window.addEventListener("pawos-consent-changed", sync);
    return () => window.removeEventListener("pawos-consent-changed", sync);
  }, []);

  useEffect(() => {
    const openFromExternal = () => handleOpen();
    window.addEventListener("pawos-open-site-companion", openFromExternal);
    return () => window.removeEventListener("pawos-open-site-companion", openFromExternal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpen() {
    setOpen(true);
    if (messages.length === 0) {
      setMessages([GREETING]);
      trackEvent("site_companion_opened");
    }
  }

  function send(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    const reply = getCompanionReply(text);
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: reply.text, href: reply.href, linkLabel: reply.linkLabel },
    ]);
    setInput("");
    trackEvent("site_companion_message_sent");
  }

  return (
    <div
      className={`fixed right-6 z-[80] flex flex-col items-end gap-3 transition-[bottom] ${
        cookieBannerVisible ? "bottom-40 sm:bottom-32" : "bottom-6"
      }`}
    >
      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-900">
                <MiniCompanionCanvas />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100">Paw</p>
                <p className="text-xs text-neutral-500">PawOS website guide</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-blue-500 text-white" : "bg-neutral-900 text-neutral-200"
                  }`}
                >
                  <p>{m.text}</p>
                  {m.href && m.linkLabel && (
                    <Link
                      href={m.href}
                      className="mt-2 inline-block text-xs font-semibold text-blue-300 underline underline-offset-2 hover:text-blue-200"
                      onClick={() => setOpen(false)}
                    >
                      {m.linkLabel} →
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {OPENING_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-neutral-800 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about PawOS…"
              aria-label="Message"
              className="flex-1 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-40"
              disabled={input.trim().length === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 11.5L21 3l-8.5 18-2.2-7.3L3 11.5z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Chat with Paw"
          className="paw-breathe flex h-14 w-14 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 shadow-xl transition hover:scale-105 hover:border-blue-500/50"
        >
          <Image src="/logo-icon.png" alt="" width={36} height={36} className="paw-blink rounded-full" />
        </button>
      )}
    </div>
  );
}
