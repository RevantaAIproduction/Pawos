import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs — PawOS" };

const SECTIONS = [
  {
    title: "Getting started",
    body: "Install PawOS, sign in or continue as a guest, and say hello to your companion from the desktop overlay.",
  },
  {
    title: "Coding Intelligence Runtime",
    body: "Paw Go is for planning and analysis; Paw Pro unlocks full code generation, terminal execution, and the live Coding Canvas.",
  },
  {
    title: "Companion Studio",
    body: "Upload your own 3D model (GLB, GLTF, VRM, FBX, or OBJ), or start from the default Paw — then customize voice, personality, and behavior, all inside PawOS.",
  },
  {
    title: "Pairing a mobile device",
    body: "Generate a pairing code from Settings → Devices to link a future PawOS mobile companion to your account.",
  },
  {
    title: "Communication Intelligence",
    body: "PawOS can capture meetings and calls, then turn them into searchable memory with action items and follow-ups.",
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold">Documentation</h1>
      <p className="mt-4 text-neutral-400">
        This is an early skeleton of PawOS's documentation site — full guides are still being written.
      </p>

      <div className="mt-12 space-y-8">
        {SECTIONS.map((s) => (
          <div key={s.title} className="border-b border-neutral-800 pb-8">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-neutral-400">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
