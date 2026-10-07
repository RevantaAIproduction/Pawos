import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Pages that show only the sign-in screen: no site navbar or footer (see Nav.tsx / Footer.tsx). */
export const AUTH_PAGE_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/device", "/auth/device/complete"];

export function isAuthPagePath(pathname: string | null | undefined): boolean {
  return !!pathname && AUTH_PAGE_PATHS.includes(pathname);
}

/**
 * The clean sign-in page: the PawOS logo at the top left, the form in the middle, and the
 * Terms / Privacy line at the bottom — nothing else.
 */
export function AuthLayout({ children, footer = "account" }: { children: ReactNode; footer?: "account" | "none" }) {
  return (
    <div className="flex min-h-dvh flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header>
        <Link href="/" className="inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" data-testid="auth-logo">
          <Image src="/logo-icon.png" alt="" width={24} height={24} className="rounded-md" priority />
          PawOS
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12">{children}</div>
      {footer === "account" && (
        <p className="text-center text-xs leading-relaxed text-neutral-500">
          By continuing, you agree to the
          <br />
          <Link href="/terms" className="hover:text-neutral-300 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="hover:text-neutral-300 hover:underline">
            Privacy Policy
          </Link>
        </p>
      )}
    </div>
  );
}
