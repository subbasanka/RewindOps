import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RewindOps AI — The Undo Layer for MCP-Powered Agents",
  description:
    "Built with Google Cloud Agent Builder and Gemini 3. Intercepts risky tool calls, checkpoints MongoDB state, previews blast radius, and enables one-click rollback.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="antialiased h-full m-0 p-0 overflow-hidden">{children}</body>
    </html>
  );
}
