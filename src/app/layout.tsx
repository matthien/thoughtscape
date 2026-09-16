import type { Metadata } from "next";
import { Roboto_Mono, Inter } from "next/font/google";
import "./globals.css";

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  weight: ["400"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "matt's thoughtscape",
  description: "entryway to my opinions about different forms of media",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${robotoMono.variable} ${inter.variable}`}>
      {/* suppressHydrationWarning: something on this machine (extension or
          system software) injects class="vc-init" onto <body> before React
          hydrates, which would otherwise trigger a mismatch warning. This
          only silences attribute comparison on the body element itself. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
