import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terra - Infrastructure as Code Platform",
  description: "Connect your GitHub repo and deploy with AI-powered infrastructure configs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
