"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { WebChatAllowance, WebChatMessage } from "../../lib/webChat/webChat";
import { splitAttachment, splitMessage } from "../../lib/webChat/formatMessage";
import { newRequestId, readPendingSend, retryDelayMs, writePendingSend, type PendingSend } from "../../lib/webChat/pendingSend";

type LocalMessage = Pick<WebChatMessage, "role" | "content"> & { id: string };
type Connection = "online" | "reconnecting" | "offline";
/** idle: nothing in flight · sending: waiting for the server · stalled: retries ran out, ask the user. */
type Phase = "idle" | "sending" | "stalled";
type Attachment = { name: string; content: string };
type Notice = { text: string; upgrade: boolean };

interface SendResponse {
  ok?: boolean;
  code?: string;
  message?: string;
  chatId?: string;
  reply?: string;
  recovered?: boolean;
  allowance?: WebChatAllowance;
}

const SEND_TIMEOUT_MS = 90_000;
const ATTACH_ACCEPT = "text/*,.md,.json,.yml,.yaml,.toml,.xml,.csv,.log,.sql,.sh,.ps1,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.html,.css,.scss";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function CodeBlock({ language, text }: { language: string | null; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the code can still be selected by hand.
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-neutral-800 bg-[#0f0f0f]">
      <div className="flex items-center justify-between border-b border-neutral-800 pl-3 text-xs text-neutral-500">
        <span>{language ?? "code"}</span>
        <button type="button" onClick={copy} className="min-h-10 px-3 text-neutral-400 hover:text-white md:min-h-8">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Long lines scroll inside the block; they never widen the page. */}
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-neutral-200">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function MessageBody({ content }: { content: string }) {
  return (
    <>
      {splitMessage(content).map((segment, index) =>
        segment.kind === "code" ? (
          <CodeBlock key={index} language={segment.language} text={segment.text} />
        ) : (
          <p key={index} className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-200 md:text-sm">
            {segment.text}
          </p>
        )
      )}
    </>
  );
}

function UserMessage({ content }: { content: string }) {
  const { text, attachmentName } = splitAttachment(content);
  return (
    <div className="max-w-[85%] rounded-2xl bg-neutral-800 px-4 py-2.5">
      <p className="whitespace-pre-wrap break-words text-[15px] text-neutral-100 md:text-sm">{text}</p>
      {attachmentName && <p className="mt-1.5 truncate rounded-md bg-neutral-900/70 px-2 py-1 text-xs text-neutral-300">Attached: {attachmentName}</p>}
    </div>
  );
}

/**
 * One PawOS Web chat: the thread and the composer, built to work on a phone as well as a desktop
 * browser.
 *
 * The server decides everything that matters — whether the account may send (Paw Go's message
 * cap or the plan's usage allowance), whether it may attach a file, and what the reply is. What
 * this component shows of that is display only.
 *
 * Every send carries a request id, and a note of the unanswered send is kept in sessionStorage
 * (text only). If the connection drops, the tab is suspended or the page reloads before the answer
 * arrives, the same id is sent again: the server returns the stored exchange if it already has one,
 * so a retry never produces a second message, a second charge or a second Paw Go message.
 */
export function WorkspaceChat({
  chatId: initialChatId,
  initialMessages,
  initialAllowance,
  canAttach,
  attachAvailableOn,
  maxAttachmentBytes,
  maxMessageChars,
  planUsage,
}: {
  chatId: string | null;
  initialMessages: WebChatMessage[];
  initialAllowance: WebChatAllowance;
  canAttach: boolean;
  /** When attachments are locked: the lowest plan that includes them. */
  attachAvailableOn: string | null;
  maxAttachmentBytes: number;
  maxMessageChars: number;
  /** Paid tiers: how much of the plan's shared allowance is used. Null when it can't be read. */
  planUsage: { percentUsed: number; limitReached: boolean } | null;
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(initialChatId);
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [allowance, setAllowance] = useState(initialAllowance);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [connection, setConnection] = useState<Connection>("online");
  const [notice, setNotice] = useState<Notice | null>(null);

  const chatIdRef = useRef(initialChatId);
  const pendingRef = useRef<{ send: PendingSend; attachment: Attachment | null; recoverOnly: boolean } | null>(null);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, phase]);

  /** Replaces the thread with what the server has stored — the source of truth after a recovery. */
  const syncFromServer = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/web-chat/chats?chat=${encodeURIComponent(id)}`).catch(() => null);
      const data = response?.ok ? ((await response.json().catch(() => null)) as { messages?: WebChatMessage[]; allowance?: WebChatAllowance } | null) : null;
      if (!aliveRef.current) return;
      if (data?.messages) setMessages(data.messages);
      if (data?.allowance) setAllowance(data.allowance);
      if (chatIdRef.current !== id) {
        chatIdRef.current = id;
        setChatId(id);
        router.replace(`/app?chat=${id}`);
      }
      router.refresh();
    },
    [router]
  );

  /**
   * Delivers the pending send and keeps trying, with the same request id, until the server answers.
   * A network failure says nothing about whether the server received the message, so the only safe
   * move is to ask again with the same id.
   */
  const deliver = useCallback(async () => {
    const entry = pendingRef.current;
    if (!entry || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("sending");
    const localId = `local-${entry.send.requestId}`;
    const body = entry.recoverOnly
      ? { requestId: entry.send.requestId, recoverOnly: true }
      : { chatId: entry.send.chatId, content: entry.send.content, requestId: entry.send.requestId, attachment: entry.attachment ?? undefined };

    let response: Response | null = null;
    let data: SendResponse = {};
    for (let attempt = 1; aliveRef.current; attempt++) {
      try {
        response = await fetch("/api/web-chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        data = (await response.json().catch(() => ({}))) as SendResponse;
        // An error page from something in between (no code of ours) is as uncertain as no answer.
        if (response.status < 500 || data.code) break;
      } catch {
        // fall through to the retry below
      }
      response = null;
      if (!aliveRef.current) break;
      // navigator.onLine is only a hint: "false" is reliable, "true" is not.
      if (navigator.onLine === false) {
        setConnection("offline");
        setPhase("stalled");
        inFlightRef.current = false;
        return; // the `online` event resumes
      }
      setConnection("reconnecting");
      const delay = retryDelayMs(attempt);
      if (delay === null) {
        setPhase("stalled");
        inFlightRef.current = false;
        return; // the Retry button, `online` or returning to the tab resumes
      }
      await sleep(delay);
    }
    inFlightRef.current = false;
    if (!aliveRef.current || !response) return;

    setConnection("online");
    pendingRef.current = null;
    writePendingSend(window.sessionStorage, null);
    setPhase("idle");

    if (response.ok && data.ok && data.reply && data.chatId) {
      setAttachment(null);
      if (data.recovered || entry.recoverOnly) {
        // The server already had this exchange: show exactly what it stored.
        await syncFromServer(data.chatId);
        return;
      }
      setMessages((current) => [...current, { id: `${localId}-reply`, role: "assistant", content: data.reply as string }]);
      if (data.allowance) setAllowance(data.allowance);
      if (!chatIdRef.current) {
        chatIdRef.current = data.chatId;
        setChatId(data.chatId);
        // Puts the new chat in the URL and in the sidebar list without losing this thread.
        router.replace(`/app?chat=${data.chatId}`);
      }
      router.refresh();
      return;
    }

    // The server answered and did not accept the message: nothing was stored, counted or charged.
    setMessages((current) => current.filter((message) => message.id !== localId));
    setDraft(entry.send.content);
    if (entry.recoverOnly) {
      setNotice({ text: entry.send.attachmentName ? `Your last message wasn't sent. It's back in the box — attach ${entry.send.attachmentName} again.` : "Your last message wasn't sent. It's back in the box.", upgrade: false });
      return;
    }
    if (data.code === "message_limit_reached") setAllowance((current) => ({ ...current, remaining: 0 }));
    setNotice({ text: data.message ?? "Something went wrong. Please try again.", upgrade: data.code === "message_limit_reached" || data.code === "usage_limit_reached" || data.code === "capability_locked" });
  }, [router, syncFromServer]);

  // After a reload or a restored tab: ask the server whether the unanswered send arrived.
  useEffect(() => {
    aliveRef.current = true;
    const saved = readPendingSend(window.sessionStorage);
    if (saved) {
      pendingRef.current = { send: saved, attachment: null, recoverOnly: true };
      void Promise.resolve().then(deliver);
    }
    const resume = () => {
      if (pendingRef.current && !inFlightRef.current) void deliver();
    };
    const onOffline = () => setConnection("offline");
    const onOnline = () => {
      setConnection(pendingRef.current ? "reconnecting" : "online");
      resume();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aliveRef.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deliver]);

  const capped = allowance.messageLimit !== null;
  const outOfMessages = capped && allowance.remaining === 0;
  const busy = phase !== "idle";

  const send = () => {
    const content = draft.trim();
    if (!content || busy || pendingRef.current || outOfMessages) return;
    const pending: PendingSend = { requestId: newRequestId(), chatId: chatIdRef.current, content, attachmentName: attachment?.name ?? null };
    pendingRef.current = { send: pending, attachment, recoverOnly: false };
    writePendingSend(window.sessionStorage, pending);
    setNotice(null);
    setMessages((current) => [
      ...current,
      { id: `local-${pending.requestId}`, role: "user", content: attachment ? `${content}\n\nAttached file: ${attachment.name}\n\`\`\`\n \n\`\`\`` : content },
    ]);
    setDraft("");
    void deliver();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends with a hardware keyboard. On a touch keyboard Enter makes a new line; the button sends.
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !touch) {
      event.preventDefault();
      send();
    }
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again should work
    if (!file) return;
    if (file.size > maxAttachmentBytes) {
      setNotice({ text: `Attach a text file of up to ${Math.round(maxAttachmentBytes / 1000)} KB.`, upgrade: false });
      return;
    }
    const content = await file.text().catch(() => "");
    if (!content.trim() || /[\u0000�]/.test(content)) {
      setNotice({ text: "Only text and code files can be attached.", upgrade: false });
      return;
    }
    setNotice(null);
    setAttachment({ name: file.name, content });
  };

  const onAttachClick = () => {
    if (canAttach) fileRef.current?.click();
    else setNotice({ text: attachAvailableOn ? `File attachments are included in ${attachAvailableOn} and above.` : "File attachments aren't included in your plan.", upgrade: true });
  };

  const empty = messages.length === 0;
  const connectionLabel = connection === "online" ? "Online" : connection === "reconnecting" ? "Reconnecting…" : "Offline";
  const connectionDot = connection === "online" ? "bg-emerald-500" : connection === "reconnecting" ? "bg-amber-400" : "bg-red-500";

  return (
    <div className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-3 sm:px-4 md:min-h-dvh ${empty ? "justify-start pt-8 md:pt-20" : "pt-5"}`}>
      {!empty && (
        <ol className="flex-1 space-y-6 pb-6" aria-label="Conversation">
          {messages.map((message) => (
            <li key={message.id} className={message.role === "user" ? "flex justify-end" : "min-w-0"}>
              {message.role === "user" ? (
                <UserMessage content={message.content} />
              ) : (
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Paw</p>
                  <MessageBody content={message.content} />
                </div>
              )}
            </li>
          ))}
          {phase === "sending" && (
            <li>
              <p className="mb-1 text-xs font-medium text-neutral-500">Paw</p>
              <p className="text-sm text-neutral-500" role="status">
                {connection === "reconnecting" ? "Reconnecting — your message is safe…" : "Thinking…"}
              </p>
            </li>
          )}
          <div ref={endRef} />
        </ol>
      )}

      <div className={empty ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : "sticky bottom-0 bg-[#141414] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"}>
        {phase === "stalled" && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100" role="status">
            <span>{connection === "offline" ? "You're offline. Your message will be sent when you're back." : "Still can't reach PawOS. Your message hasn't been lost."}</span>
            <button type="button" onClick={() => void deliver()} className="min-h-10 rounded-md border border-amber-400/40 px-3 text-sm font-medium text-amber-50 hover:bg-amber-500/20 md:min-h-8">
              Retry
            </button>
          </div>
        )}

        <div className="rounded-t-xl border border-b-0 border-neutral-800/80 bg-neutral-900/40 px-4 py-2 text-center text-[13px] text-neutral-300" role="status">
          {capped ? (
            outOfMessages ? (
              <>
                {allowance.messagesUsed} / {allowance.messageLimit} web messages used.{" "}
                <Link href="/pricing" className="font-medium text-white underline underline-offset-2">
                  Upgrade
                </Link>{" "}
                to keep going.
              </>
            ) : (
              <>
                {allowance.messagesUsed} / {allowance.messageLimit} web messages used.{" "}
                <Link href="/pricing" className="font-medium text-white underline underline-offset-2">
                  See plans
                </Link>
              </>
            )
          ) : (
            <>
              {planUsage ? `${planUsage.percentUsed}% of your plan usage used` : "Uses your plan's usage allowance"} · shared with the desktop app.{" "}
              <Link href="/dashboard" className="font-medium text-white underline underline-offset-2">
                Details
              </Link>
            </>
          )}
        </div>

        <form onSubmit={onSubmit} className="rounded-b-xl border border-neutral-800/80 bg-neutral-900/60 p-3">
          <label htmlFor="workspace-message" className="sr-only">
            Message Paw
          </label>
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-neutral-800/70 py-1 pl-3 text-sm text-neutral-200">
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button type="button" aria-label={`Remove ${attachment.name}`} disabled={busy} onClick={() => setAttachment(null)} className="flex h-10 w-10 shrink-0 items-center justify-center text-neutral-400 hover:text-white md:h-8 md:w-8">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          {/* 16px text on phones: a smaller font makes iOS zoom the page when the field is focused. */}
          <textarea
            id="workspace-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, maxMessageChars))}
            onKeyDown={onKeyDown}
            disabled={busy || outOfMessages}
            rows={empty ? 3 : 2}
            enterKeyHint="enter"
            placeholder={outOfMessages ? "Upgrade to keep chatting" : "Ask Paw to explain, plan or review"}
            className="max-h-[40dvh] w-full resize-none bg-transparent text-base text-neutral-100 placeholder-neutral-600 focus:outline-none disabled:opacity-60 md:text-sm"
          />
          <div className="mt-1 flex items-center gap-2">
            <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={onPickFile} className="hidden" tabIndex={-1} aria-hidden="true" />
            <button
              type="button"
              onClick={onAttachClick}
              disabled={busy || outOfMessages}
              aria-label={canAttach ? "Attach a text or code file" : "Attach a file (not included in your plan)"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-neutral-800 disabled:opacity-50 md:h-8 md:w-8 ${canAttach ? "text-neutral-300" : "text-neutral-600"}`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" />
              </svg>
            </button>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-neutral-500">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionDot}`} aria-hidden="true" />
              <span className="truncate" role="status">
                {connectionLabel} · chat only
              </span>
            </span>
            <button
              type="submit"
              disabled={busy || outOfMessages || !draft.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 md:h-8 md:w-8"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </form>

        {notice && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {notice.text}{" "}
            {notice.upgrade && (
              <Link href="/pricing" className="font-medium text-red-300 underline underline-offset-2">
                See plans
              </Link>
            )}
          </p>
        )}

        {empty && (
          <div className="mt-6 flex flex-col gap-4 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">PawOS does the work on your desktop</p>
              <p className="mt-0.5 text-sm text-neutral-400">On the web Paw can talk things through. In the desktop app it reads your code, runs commands and makes the changes.</p>
            </div>
            <Link href="/docs" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 px-3 text-sm font-medium text-black hover:bg-white md:min-h-8">
              Read the docs
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
