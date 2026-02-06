// app/layout.tsx
import "./globals.css";
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "SignalCore",
  description: "Goal-based investing, institutional discipline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}