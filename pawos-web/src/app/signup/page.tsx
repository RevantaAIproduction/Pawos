import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[440px] flex-col justify-center px-4 py-16">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
