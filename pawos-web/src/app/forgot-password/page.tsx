import type { Metadata } from "next";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Suspense } from "react";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
