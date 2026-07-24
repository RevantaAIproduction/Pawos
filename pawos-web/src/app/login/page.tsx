import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-6 py-16">
      <LoginForm />
    </div>
  );
}
