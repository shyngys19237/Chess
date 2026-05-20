import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <div className="page-shell py-8 sm:py-12">
      <AuthForm mode="login" />
    </div>
  );
}
