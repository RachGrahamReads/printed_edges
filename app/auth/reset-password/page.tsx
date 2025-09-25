import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";

function ResetPasswordContent() {
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <ResetPasswordForm />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="container flex h-screen w-screen flex-col items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}