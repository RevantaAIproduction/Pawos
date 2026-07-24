import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-6 py-16">
      <SignupForm />
    </div>
  );
}
