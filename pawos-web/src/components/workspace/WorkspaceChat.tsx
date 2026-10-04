"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { WebChatAllowance, WebChatMessage } from "../../lib/webChat/webChat";
import { splitAttachment, splitMessage } from "../../lib/webChat/formatMessage";
import { isImageFile, prepareImageForUpload } from "../../lib/webChat/imagePrep";
import { classifySendResponse, newRequestId, processingPollDelayMs, readPendingSend, retryDelayMs, writePendingSend, type PendingSend } from "../../lib/webChat/pendingSend";
import type { CodeChangeReadiness } from "../../lib/webCode/repository";
import type { CodeChangeView } from "../../lib/webCode/codeChange";
import { TaskPanel, useCodeChange } from "./TaskPanel";
import { HandoffSheet } from "./HandoffSheet";
import { RepoPickerSheet } from "./RepoPickerSheet";
import { RepoStatus } from "./RepoStatus";

type Photo = { name: string; url: string };
type LocalMessage = Pick<WebChatMessage, "role" | "content"> & { id: string; pending?: boolean; requiresDesktop?: boolean; photos?: Photo[]; surface?: "web" | "desktop" };
type Connection = "online" | "reconnecting" | "offline";
/**
 * idle: nothing in flight · sending: waiting for the server · processing: the server has the
 * message and is still answering · stalled: automatic retries stopped, the user can retry.
 */
type Phase = "idle" | "sending" | "processing" | "stalled";
type TextAttachment = { name: string; content: string };
type PhotoUpload = { uploadId: string; name: string; previewUrl: string; status: "uploading" | "ready" | "failed"; id?: string; error?: string };
type Notice = { text: string; upgrade: boolean };
/** ask: conversation only · change: make a frontend change in the selected GitHub repository. */
type Mode = "ask" | "change";

interface SendResponse {
  ok?: boolean;
  code?: string;
  message?: string;
  chatId?: string;
  reply?: string;
  recovered?: boolean;
  requiresDesktop?: boolean;
  allowance?: WebChatAllowance;
}

const SEND_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** After this long in the background, the open chat is re-read from the server on return. */
const RESYNC_AFTER_HIDDEN_MS = 30_000;
const TEXT_ACCEPT = "text/*,.md,.json,.yml,.yaml,.toml,.xml,.csv,.log,.sql,.sh,.ps1,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.html,.css,.scss";
// image/* lets a phone offer its camera and photo library alongside files.
const ATTACH_ACCEPT = `image/*,.heic,.heif,${TEXT_ACCEPT}`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const uploadUrl = (id: string) => `/api/web-chat/uploads/${encodeURIComponent(id)}`;

function toLocal(message: WebChatMessage): LocalMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    requiresDesktop: message.requiresDesktop === true,
    surface: message.surface === "desktop" ? "desktop" : "web",
    photos: (message.attachments ?? []).map((photo) => ({ name: photo.name, url: uploadUrl(photo.id) })),
  };
}

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

const URL_PATTERN = /(https:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;

/** Text with its https links clickable (a pull request link, mostly). Still text — never HTML. */
function LinkedText({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 underline underline-offset-2 hover:text-sky-200">
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
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
            <LinkedText text={segment.text} />
          </p>
        )
      )}
    </>
  );
}

function UserMessage({ message }: { message: LocalMessage }) {
  const { text, attachmentName } = splitAttachment(message.content);
  return (
    <div className={`max-w-[85%] min-w-0 rounded-2xl bg-neutral-800 px-4 py-2.5 ${message.pending ? "opacity-70" : ""}`}>
      {(message.photos ?? []).map((photo) => (
        // eslint-disable-next-line @next/next/no-img-element -- the account's own private photo, served by the API
        <img key={photo.url} src={photo.url} alt={photo.name} loading="lazy" className="mb-2 max-h-64 w-auto max-w-full rounded-lg object-contain" />
      ))}
      <p className="whitespace-pre-wrap break-words text-[15px] text-neutral-100 md:text-sm">{text}</p>
      {attachmentName && <p className="mt-1.5 truncate rounded-md bg-neutral-900/70 px-2 py-1 text-xs text-neutral-300">Attached: {attachmentName}</p>}
      {message.pending && <p className="mt-1 text-right text-[11px] text-neutral-400">Sending…</p>}
      {message.surface === "desktop" && <p className="mt-1 text-right text-[11px] text-neutral-400">on PawOS Desktop</p>}
    </div>
  );
}

function DesktopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/**
 * One PawOS Web chat: the thread and the composer, built to work on a phone as well as a desktop
 * browser.
 *
 * The server decides everything that matters — whether the account may send (Paw Go's message
 * cap or the plan's usage allowance), whether it may attach a file or photo, and what the reply
 * is. What this component shows of that is display only.
 *
 * Every send carries a request id, and a note of the unanswered send is kept in sessionStorage
 * (text only). If the connection drops, the tab is suspended or the page reloads before the answer
 * arrives, the same id is sent again: the server returns the stored exchange if it has one, says
 * "processing" if it is still answering, or "not received" — so a retry never produces a second
 * message, a second charge or a second Paw Go message.
 */
export function WorkspaceChat({
  chatId: initialChatId,
  initialMessages,
  initialAllowance,
  canAttach,
  attachAvailableOn,
  canHandoff,
  frontendChanges: initialFrontendChanges,
  promptLimit,
  initialChange,
  openPlan = false,
  maxAttachmentBytes,
  maxImageBytes,
  maxMessageChars,
  planUsage,
}: {
  chatId: string | null;
  initialMessages: WebChatMessage[];
  initialAllowance: WebChatAllowance;
  canAttach: boolean;
  /** When attachments are locked: the lowest plan that includes them. */
  attachAvailableOn: string | null;
  /** Whether "Continue in PawOS Desktop" is offered (server policy). */
  canHandoff: boolean;
  maxAttachmentBytes: number;
  maxImageBytes: number;
  maxMessageChars: number;
  /** Paid tiers: how much of the plan's shared allowance is used. Null when it can't be read. */
  planUsage: { percentUsed: number; limitReached: boolean } | null;
  /** Whether this account can make frontend changes from the web, and where (server-resolved). */
  frontendChanges: CodeChangeReadiness;
  /** Paw Go: the longest prompt accepted (the server enforces it too). Null when there is no line limit. */
  promptLimit: { lines: number; chars: number } | null;
  /** The latest code change in this chat, for the task panel. */
  initialChange: CodeChangeView | null;
  /** Show the task panel even if the change has finished (the user just made it). */
  openPlan?: boolean;
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(initialChatId);
  const [messages, setMessages] = useState<LocalMessage[]>(() => initialMessages.map(toLocal));
  const [allowance, setAllowance] = useState(initialAllowance);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<TextAttachment | null>(null);
  const [photo, setPhoto] = useState<PhotoUpload | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [connection, setConnection] = useState<Connection>("online");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("ask");
  const [frontendChanges, setFrontendChanges] = useState(initialFrontendChanges);
  const [changeId, setChangeId] = useState<string | null>(initialChange?.requestId ?? null);
  const [panelOpen, setPanelOpen] = useState(initialChange !== null && (openPlan || initialChange.state === "running" || initialChange.state === "pushed" || initialChange.state === "fixing"));
  const changeIdRef = useRef<string | null>(null);
  const change = useCodeChange(changeId, initialChange);
  const showPanel = panelOpen && changeId !== null;
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  /** The server has confirmed it holds the pending message (it answered "processing"). */
  const [received, setReceived] = useState(false);

  const chatIdRef = useRef(initialChatId);
  const pendingRef = useRef<{ send: PendingSend; attachment: TextAttachment | null; imageId: string | null; mode: Mode; recoverOnly: boolean } | null>(null);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);
  const hiddenAtRef = useRef<number | null>(null);
  const photoBlobRef = useRef<Blob | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, phase]);

  /** Replaces the thread with what the server has stored — the source of truth after a recovery. */
  const syncFromServer = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/web-chat/chats?chat=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
      const data = response?.ok ? ((await response.json().catch(() => null)) as { messages?: WebChatMessage[]; allowance?: WebChatAllowance } | null) : null;
      if (!aliveRef.current) return;
      if (data?.messages) setMessages(data.messages.map(toLocal));
      if (data?.allowance) setAllowance(data.allowance);
      if (chatIdRef.current !== id) {
        chatIdRef.current = id;
        setChatId(id);
        router.replace(`/app?chat=${id}${changeIdRef.current ? "&plan=1" : ""}`);
      }
      router.refresh();
    },
    [router]
  );

  /**
   * Delivers the pending send and keeps at it, with the same request id, until the server gives a
   * definite answer. A network failure says nothing about whether the server received the message,
   * so the only safe move is to ask again with the same id.
   */
  const deliver = useCallback(async () => {
    const entry = pendingRef.current;
    if (!entry || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase(entry.recoverOnly ? "processing" : "sending");
    const localId = `local-${entry.send.requestId}`;

    let status: number | null = null;
    let data: SendResponse = {};
    let outcome = classifySendResponse(null, {}, entry.recoverOnly);
    let networkAttempt = 0;
    let pollAttempt = 0;
    const stop = (next: Phase) => {
      setPhase(next);
      inFlightRef.current = false;
    };

    while (aliveRef.current) {
      const body = entry.recoverOnly
        ? { requestId: entry.send.requestId, recoverOnly: true }
        : {
            chatId: entry.send.chatId,
            content: entry.send.content,
            requestId: entry.send.requestId,
            attachment: entry.attachment ?? undefined,
            imageId: entry.imageId ?? undefined,
            mode: entry.mode === "change" ? "codeChange" : undefined,
          };
      status = null;
      data = {};
      try {
        const response = await fetch("/api/web-chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        status = response.status;
        data = (await response.json().catch(() => ({}))) as SendResponse;
      } catch {
        status = null;
      }
      if (!aliveRef.current) return;
      outcome = classifySendResponse(status, data, entry.recoverOnly);

      if (outcome === "uncertain") {
        // navigator.onLine is only a hint: "false" is reliable, "true" is not.
        if (navigator.onLine === false) {
          setConnection("offline");
          return stop("stalled"); // the `online` event resumes
        }
        setConnection("reconnecting");
        const delay = retryDelayMs(++networkAttempt);
        if (delay === null) return stop("stalled"); // Retry, `online` or returning to the tab resumes
        await sleep(delay);
        continue;
      }

      setConnection("online");
      networkAttempt = 0;
      if (outcome === "processing") {
        // The server has the message. From now on only ask about it; never send it again.
        entry.recoverOnly = true;
        setReceived(true);
        setPhase("processing");
        const delay = processingPollDelayMs(++pollAttempt);
        if (delay === null) return stop("stalled");
        await sleep(delay);
        continue;
      }
      break;
    }
    inFlightRef.current = false;
    if (!aliveRef.current) return;

    pendingRef.current = null;
    writePendingSend(window.sessionStorage, null);
    setReceived(false);
    setPhase("idle");

    if (outcome === "delivered" && data.chatId && data.reply) {
      setAttachment(null);
      setPhoto(null);
      photoBlobRef.current = null;
      if (data.recovered || entry.recoverOnly) {
        // The server already had this exchange: show exactly what it stored.
        await syncFromServer(data.chatId);
        return;
      }
      setMessages((current) => [
        ...current.map((message) => (message.id === localId ? { ...message, pending: false } : message)),
        { id: `${localId}-reply`, role: "assistant", content: data.reply as string, requiresDesktop: data.requiresDesktop === true },
      ]);
      if (data.allowance) setAllowance(data.allowance);
      if (!chatIdRef.current) {
        chatIdRef.current = data.chatId;
        setChatId(data.chatId);
        // Puts the new chat in the URL and in the sidebar list without losing this thread.
        // `plan=1` keeps the task panel open through the reload of the (now saved) chat.
        router.replace(`/app?chat=${data.chatId}${entry.mode === "change" ? "&plan=1" : ""}`);
      }
      router.refresh();
      return;
    }

    // The server answered and did not store the message: nothing was stored, counted or charged.
    setMessages((current) => current.filter((message) => message.id !== localId));
    setDraft(entry.send.content);
    if (outcome === "notReceived") {
      setNotice({
        text: entry.send.attachmentName ? `Your last message wasn't sent. It's back in the box — attach ${entry.send.attachmentName} again if you need it.` : "Your last message wasn't sent. It's back in the box.",
        upgrade: false,
      });
      return;
    }
    if (data.code === "message_limit_reached") setAllowance((current) => ({ ...current, remaining: 0 }));
    setNotice({ text: data.message ?? "Something went wrong. Please try again.", upgrade: data.code === "message_limit_reached" || data.code === "usage_limit_reached" || data.code === "capability_locked" });
  }, [router, syncFromServer]);

  // After a reload or a restored tab: ask the server whether the unanswered send arrived. Also keep
  // the open chat in step with the server when the page comes back from the background.
  useEffect(() => {
    aliveRef.current = true;
    const saved = readPendingSend(window.sessionStorage);
    if (saved) {
      pendingRef.current = { send: saved, attachment: null, imageId: null, mode: "ask", recoverOnly: true };
      if (saved.chatId === chatIdRef.current) {
        // Shown as pending until the server says what happened to it.
        // Idempotent: effects can run twice (React StrictMode) and must not show it twice.
        const id = `local-${saved.requestId}`;
        setMessages((current) => (current.some((message) => message.id === id) ? current : [...current, { id, role: "user", content: saved.content, pending: true }]));
      }
      void Promise.resolve().then(deliver);
    }
    const resume = () => {
      if (pendingRef.current && !inFlightRef.current) void deliver();
    };
    const resyncIfStale = () => {
      const hiddenFor = hiddenAtRef.current === null ? 0 : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (pendingRef.current) resume();
      else if (hiddenFor > RESYNC_AFTER_HIDDEN_MS && chatIdRef.current && !inFlightRef.current) void syncFromServer(chatIdRef.current);
    };
    const onOffline = () => setConnection("offline");
    const onOnline = () => {
      setConnection(pendingRef.current ? "reconnecting" : "online");
      resume();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAtRef.current = Date.now();
      else resyncIfStale();
    };
    // A page restored from the back/forward cache kept its old state: check it against the server.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      hiddenAtRef.current = 0;
      resyncIfStale();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      aliveRef.current = false;
      uploadAbortRef.current?.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deliver, syncFromServer]);

  // On-screen keyboards: where the browser doesn't resize the page for the keyboard (iOS Safari),
  // keep the composer in view while typing.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      if (document.activeElement === textareaRef.current) formRef.current?.scrollIntoView({ block: "end" });
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);

  const capped = allowance.messageLimit !== null;
  const outOfMessages = capped && allowance.remaining === 0;
  const busy = phase !== "idle";
  const photoBlocking = photo !== null && photo.status !== "ready";
  const changeMode = mode === "change";
  const changeReady = frontendChanges.state === "ready";
  const draftLines = draft.trim() ? draft.trim().split(/\r?\n/).length : 0;
  const promptTooLong = promptLimit !== null && (draftLines > promptLimit.lines || draft.trim().length > promptLimit.chars);

  const send = () => {
    const content = draft.trim();
    if (!content || busy || pendingRef.current || outOfMessages || photoBlocking || promptTooLong || (changeMode && !changeReady)) return;
    const attachmentName = attachment?.name ?? photo?.name ?? null;
    const pending: PendingSend = { requestId: newRequestId(), chatId: chatIdRef.current, content, attachmentName };
    pendingRef.current = { send: pending, attachment, imageId: changeMode ? null : (photo?.id ?? null), mode, recoverOnly: false };
    writePendingSend(window.sessionStorage, pending);
    if (changeMode) {
      // Opened now, from the tap on Send, so browsers (phones too) allow the new tab. It shows the
      // live steps and then the repository's preview deployment.
      window.open(`/app/preview/${encodeURIComponent(pending.requestId)}`, "_blank", "noopener");
      setChangeId(pending.requestId);
      changeIdRef.current = pending.requestId;
      setPanelOpen(true);
      try {
        if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      } catch {
        // notifications are a convenience
      }
    }
    setNotice(null);
    setMessages((current) => [
      ...current,
      {
        id: `local-${pending.requestId}`,
        role: "user",
        content: attachment ? `${content}\n\nAttached file: ${attachment.name}\n\`\`\`\n \n\`\`\`` : content,
        photos: photo ? [{ name: photo.name, url: photo.previewUrl }] : undefined,
        pending: true,
      },
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

  /** Uploads the prepared photo. Safe to call again after a failure: the upload id makes it idempotent. */
  const uploadPhoto = async (current: PhotoUpload) => {
    const blob = photoBlobRef.current;
    if (!blob) return;
    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    // A manual timer, not AbortSignal.any (missing on older iOS), and told apart from a user cancel.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, UPLOAD_TIMEOUT_MS);
    setPhoto({ ...current, status: "uploading", error: undefined });
    const form = new FormData();
    form.append("file", blob, current.name);
    form.append("uploadId", current.uploadId);
    try {
      const response = await fetch("/api/web-chat/uploads", { method: "POST", body: form, signal: controller.signal });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; attachment?: { id: string } };
      if (!aliveRef.current || (controller.signal.aborted && !timedOut)) return;
      if (response.ok && data.ok && data.attachment) setPhoto((value) => (value?.uploadId === current.uploadId ? { ...value, status: "ready", id: data.attachment?.id } : value));
      else setPhoto((value) => (value?.uploadId === current.uploadId ? { ...value, status: "failed", error: data.message ?? "Couldn't upload that photo." } : value));
    } catch {
      if (!aliveRef.current || (controller.signal.aborted && !timedOut)) return; // cancelled by the user
      setPhoto((value) => (value?.uploadId === current.uploadId ? { ...value, status: "failed", error: navigator.onLine === false ? "You're offline." : "The upload was interrupted." } : value));
    } finally {
      clearTimeout(timer);
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
    }
  };

  const removePhoto = () => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    photoBlobRef.current = null;
    setPhoto(null);
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again should work
    if (!file) return;
    setNotice(null);

    if (isImageFile(file)) {
      setAttachment(null);
      removePhoto();
      const blob = await prepareImageForUpload(file);
      if (blob.size > maxImageBytes) {
        setNotice({ text: `Attach a photo of up to ${Math.round(maxImageBytes / (1024 * 1024))} MB.`, upgrade: false });
        return;
      }
      photoBlobRef.current = blob;
      const upload: PhotoUpload = { uploadId: newRequestId(), name: file.name || "photo.jpg", previewUrl: URL.createObjectURL(blob), status: "uploading" };
      setPhoto(upload);
      void uploadPhoto(upload);
      return;
    }

    if (file.size > maxAttachmentBytes) {
      setNotice({ text: `Attach a text file of up to ${Math.round(maxAttachmentBytes / 1000)} KB.`, upgrade: false });
      return;
    }
    const content = await file.text().catch(() => "");
    if (!content.trim() || /[\u0000�]/.test(content)) {
      setNotice({ text: "Attach a photo, or a text or code file.", upgrade: false });
      return;
    }
    removePhoto();
    setAttachment({ name: file.name, content });
  };

  const onAttachClick = () => {
    if (canAttach) fileRef.current?.click();
    else setNotice({ text: attachAvailableOn ? `Photos and file attachments are included in ${attachAvailableOn} and above.` : "Attachments aren't included in your plan.", upgrade: true });
  };

  const empty = messages.length === 0;
  const connectionLabel = connection === "reconnecting" ? "Reconnecting…" : "Offline";
  const connectionDot = connection === "reconnecting" ? "bg-amber-400" : "bg-red-500";
  const closeHandoff = useCallback(() => setHandoffOpen(false), []);
  const closeRepoPicker = useCallback(() => setRepoPickerOpen(false), []);

  const chooseMode = (next: Mode) => {
    if (next === "change" && frontendChanges.state === "locked") {
      setNotice({ text: frontendChanges.availableOn ? `Code changes from the web are included in ${frontendChanges.availableOn} and above.` : "Code changes aren't included in your plan.", upgrade: true });
      return;
    }
    if (next === "change" && photo) removePhoto(); // photos can't be used for changes
    setNotice(null);
    setMode(next);
  };

  const modeButton = (value: Mode, label: string, locked = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => chooseMode(value)}
      disabled={busy}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm transition md:min-h-8 ${mode === value ? "bg-neutral-700 font-medium text-white" : "text-neutral-400 hover:text-white"}`}
    >
      {label}
      {locked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Not included in your plan">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )}
    </button>
  );

  /** In Change mode: the setup steps still to do, or the repository and branch changes go to. */
  const changeStatus = changeMode ? (
    <RepoStatus readiness={frontendChanges} busy={busy} onChooseRepository={() => setRepoPickerOpen(true)} />
  ) : null;
  const handoffButton = "inline-flex min-h-10 items-center gap-1.5 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:bg-neutral-800 md:min-h-8";

  return (
    <div className={showPanel ? "lg:pr-80" : ""}>
    <div className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-3 sm:px-4 md:min-h-dvh ${empty && !showPanel ? "justify-start pt-8 md:pt-20" : "pt-3 md:pt-5"}`}>
      {showPanel && (
        <div className="mb-3 lg:hidden">
          <TaskPanel change={change} onClose={() => setPanelOpen(false)} notify={false} />
        </div>
      )}
      {!empty && chatId && canHandoff && (
        <div className="flex justify-end pb-2">
          <button type="button" onClick={() => setHandoffOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-sm text-neutral-400 transition hover:bg-neutral-800 hover:text-white md:min-h-8">
            <DesktopIcon />
            Continue in PawOS Desktop
          </button>
        </div>
      )}

      {messages.some((message) => message.surface === "desktop") && (
        // One chat history across the account; the capabilities depend on where you continue it.
        <p className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400" data-testid="shared-chat-note">
          This chat is shared with PawOS Desktop. Here on Web and mobile, Paw can chat
          {promptLimit ? " and make small frontend changes" : " and change code in your GitHub repository"}. Working on your computer — files, terminal, tests, local projects — needs PawOS Desktop, which has the full set.
        </p>
      )}
      {!empty && (
        <ol className="min-w-0 flex-1 space-y-6 pb-6" aria-label="Conversation">
          {messages.map((message) => (
            <li key={message.id} className={message.role === "user" ? "flex min-w-0 justify-end" : "min-w-0"}>
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : (
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Paw{message.surface === "desktop" ? " · on PawOS Desktop" : ""}</p>
                  <MessageBody content={message.content} />
                  {message.requiresDesktop && chatId && canHandoff && (
                    <button type="button" onClick={() => setHandoffOpen(true)} className={`${handoffButton} mt-3`}>
                      <DesktopIcon />
                      Continue in PawOS Desktop
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {(phase === "sending" || phase === "processing") && (
            <li>
              <p className="mb-1 text-xs font-medium text-neutral-500">Paw</p>
              <p className="text-sm text-neutral-500" role="status">
                {connection === "reconnecting" ? "Reconnecting — your message is safe…" : phase === "processing" || changeMode ? (changeMode ? "Paw is changing your code — follow along in the plan…" : "Paw is still working on your reply…") : "Thinking…"}
              </p>
            </li>
          )}
          <div ref={endRef} />
        </ol>
      )}

      <div className={empty ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : "sticky bottom-0 bg-[#141414] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"}>
        {phase === "stalled" && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100" role="status">
            <span className="min-w-0 flex-1">
              {connection === "offline"
                ? "You're offline. Your message will be sent when you're back."
                : received
                  ? "Your message reached PawOS, but the reply hasn't arrived yet."
                  : "Still can't reach PawOS. Your message hasn't been lost."}
            </span>
            <button type="button" onClick={() => void deliver()} className="min-h-10 rounded-md border border-amber-400/40 px-3 text-sm font-medium text-amber-50 hover:bg-amber-500/20 md:min-h-8">
              {received ? "Check again" : "Retry"}
            </button>
          </div>
        )}

        <div className="rounded-t-xl border border-b-0 border-neutral-800/80 bg-neutral-900/40 px-4 py-2 text-center text-[13px] text-neutral-300" role="status">
          {capped ? (
            <>
              {allowance.messagesUsed} / {allowance.messageLimit} web messages used{allowance.period === "week" ? " this week" : ""}
              {outOfMessages ? "." : ` · ${allowance.remaining} left.`}{" "}
              <Link href="/pricing" className="font-medium text-white underline underline-offset-2">
                {outOfMessages ? "Upgrade" : "See plans"}
              </Link>
              {outOfMessages ? " to keep going." : ""}
            </>
          ) : (
            <>
              {planUsage ? `${planUsage.percentUsed}% of your plan usage used` : "Uses your plan's usage allowance"} · shared with the desktop app.{" "}
              <Link href="/dashboard" className="font-medium text-white underline underline-offset-2">
                Details
              </Link>
            </>
          )}
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="rounded-b-xl border border-neutral-800/80 bg-neutral-900/60 p-3">
          <label htmlFor="workspace-message" className="sr-only">
            Message Paw
          </label>
          <div role="radiogroup" aria-label="What Paw should do" className="mb-2 inline-flex rounded-lg bg-neutral-800/60 p-0.5">
            {modeButton("ask", "Ask")}
            {modeButton("change", promptLimit ? "Small change" : "Change code", frontendChanges.state === "locked")}
          </div>
          {changeStatus}
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
          {photo && (
            <div className="mb-2 flex items-center gap-3 rounded-md bg-neutral-800/70 p-1.5 pr-0 text-sm text-neutral-200" data-testid="photo-attachment">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the photo being attached */}
              <img src={photo.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{photo.name}</span>
                <span className={`block text-xs ${photo.status === "failed" ? "text-red-300" : "text-neutral-400"}`} role="status">
                  {photo.status === "uploading" ? "Uploading…" : photo.status === "ready" ? "Ready" : `${photo.error ?? "Upload failed."}`}
                </span>
              </span>
              {photo.status === "failed" && (
                <button type="button" onClick={() => void uploadPhoto(photo)} className="min-h-10 shrink-0 rounded-md px-2 text-sm font-medium text-white hover:bg-neutral-700 md:min-h-8">
                  Retry
                </button>
              )}
              <button
                type="button"
                aria-label={photo.status === "uploading" ? "Cancel upload" : `Remove ${photo.name}`}
                disabled={busy}
                onClick={removePhoto}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-neutral-400 hover:text-white md:h-8 md:w-8"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          {/* 16px text on phones: a smaller font makes iOS zoom the page when the field is focused. */}
          <textarea
            ref={textareaRef}
            id="workspace-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, maxMessageChars))}
            onKeyDown={onKeyDown}
            disabled={busy || outOfMessages}
            rows={empty ? 3 : 2}
            enterKeyHint="enter"
            placeholder={outOfMessages ? "Upgrade to keep chatting" : changeMode ? (promptLimit ? "Describe a small change — e.g. change the heading to …" : "Describe the change — e.g. make the header sticky on mobile") : "Ask Paw to explain, plan or review"}
            className="max-h-[40dvh] w-full resize-none bg-transparent text-base text-neutral-100 placeholder-neutral-600 focus:outline-none disabled:opacity-60 md:text-sm"
          />
          <div className="mt-1 flex items-center gap-2">
            {/* Plans without attachments (Paw Go) get no attach control at all — messages only. */}
            {canAttach && <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={onPickFile} className="hidden" tabIndex={-1} aria-hidden="true" />}
            {canAttach && (
            <button
              type="button"
              onClick={onAttachClick}
              disabled={busy || outOfMessages || changeMode}
              aria-label={canAttach ? "Attach a photo or file" : "Attach a photo or file (not included in your plan)"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-neutral-800 disabled:opacity-50 md:h-8 md:w-8 ${canAttach ? "text-neutral-300" : "text-neutral-600"}`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" />
              </svg>
            </button>
            )}
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-neutral-500">
              {/* Connection state only when there is something to say. */}
              {connection !== "online" ? (
                <>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionDot}`} aria-hidden="true" />
                  <span className="truncate" role="status" data-testid="connection-state">
                    {connectionLabel}
                  </span>
                </>
              ) : (
                <span className="truncate">{changeMode
                    ? `${promptLimit ? "Small frontend changes" : "Frontend and backend code"} · pushed to ${frontendChanges.state === "ready" ? frontendChanges.repository.defaultBranch : "your branch"}`
                    : "Chat only — work runs in PawOS Desktop"}</span>
              )}
            </span>
            <button
              type="submit"
              disabled={busy || outOfMessages || photoBlocking || promptTooLong || (changeMode && !changeReady) || !draft.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 md:h-8 md:w-8"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </form>

        {promptTooLong && promptLimit && (
          <p role="alert" className="mt-3 text-sm text-amber-300" data-testid="prompt-limit">
            On Paw Go, PawOS Web accepts short prompts only — up to {promptLimit.lines} lines ({promptLimit.chars} characters). Try a small request like &ldquo;change the heading to …&rdquo;.{" "}
            <Link href="/pricing" className="font-medium text-amber-200 underline underline-offset-2">
              Upgrade
            </Link>{" "}
            for longer ones.
          </p>
        )}

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
              <p className="mt-0.5 text-sm text-neutral-400">
                On the web Paw talks things through
                {frontendChanges.state === "locked" ? "" : promptLimit ? ", and makes small frontend changes (text, headings, buttons) in a GitHub repository" : ", and changes code in a GitHub repository and pushes it"}. In the desktop app it reads your code, runs commands and works on your machine.
              </p>
            </div>
            <Link href="/docs" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 px-3 text-sm font-medium text-black hover:bg-white md:min-h-8">
              Read the docs
            </Link>
          </div>
        )}
      </div>

      {handoffOpen && chatId && <HandoffSheet chatId={chatId} onClose={closeHandoff} />}
      {repoPickerOpen && (
        <RepoPickerSheet
          current={frontendChanges.state === "ready" ? frontendChanges.repository : null}
          onClose={closeRepoPicker}
          onSelected={(readiness) => {
            setFrontendChanges(readiness);
            setRepoPickerOpen(false);
          }}
        />
      )}
    </div>
    {showPanel && (
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-80 overflow-y-auto lg:block" aria-label="Plan for the current change">
        <TaskPanel change={change} onClose={() => setPanelOpen(false)} />
      </aside>
    )}
    </div>
  );
}
