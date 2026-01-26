import "./globals.css";
import HeaderWrapper from "../components/HeaderWrapper";

export const metadata = {
  title: "SignalCore",
  description: "Calm, risk-first market perspective.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-ink-900 antialiased">
        <HeaderWrapper />
        <main>{children}</main>
      </body>
    </html>
  );
}