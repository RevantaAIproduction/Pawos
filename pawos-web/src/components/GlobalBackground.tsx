"use client";
import { usePathname } from "next/navigation";
import { HeroAnimation } from "./HeroAnimation";

export function GlobalBackground() {
  const pathname = usePathname();
  if (pathname?.startsWith("/docs")) return null;
  return <HeroAnimation />;
}
