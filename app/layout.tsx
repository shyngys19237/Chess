import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: "MateMind — Play bots. Review like a coach.",
  description:
    "A Chess.com-inspired chess MVP with Stockfish-powered bots, engine-derived game review, and optional Supabase account persistence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className="h-full antialiased">
      <body className="site-body">
        <AuthProvider>
          <Navbar />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
