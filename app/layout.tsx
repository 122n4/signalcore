import "./globals.css";
import Header from "../components/Header";

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
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}