import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "RewindOps AI — The Undo Layer for MCP-Powered Agents",
  description:
    "Built with Google Cloud Agent Builder and Gemini 3. Intercepts risky tool calls, checkpoints MongoDB state, previews blast radius, and enables one-click rollback.",
  icons: {
    icon: "/favicon.svg",
  },
};

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!clerkKey) {
    return (
      <html lang="en" className="h-full">
        <body className="antialiased h-full m-0 p-0 overflow-hidden">{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" className="h-full">
      <body className="antialiased h-full m-0 p-0 overflow-hidden">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "#0f172a",
              colorText: "#e2e8f0",
              colorTextOnPrimaryBackground: "#ffffff",
              colorTextSecondary: "#94a3b5",
              colorInputBackground: "#1e293b",
              colorInputText: "#e2e8f0",
              colorNeutral: "#e2e8f0",
              colorDanger: "#f43f5e",
            },
            layout: {
              unsafe_disableDevelopmentModeWarnings: true,
            },
            elements: {
              socialButtonsBlockButton: {
                backgroundColor: "#1e293b",
                color: "#e2e8f0",
                borderColor: "#334155",
                "&:hover": {
                  backgroundColor: "#334155",
                },
              },
              socialButtonsBlockButtonText: {
                color: "#e2e8f0",
              },
              card: {
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
              },
              headerTitle: {
                color: "#f8fafc",
              },
              headerSubtitle: {
                color: "#94a3b8",
              },
              dividerLine: {
                backgroundColor: "#334155",
              },
              dividerText: {
                color: "#64748b",
              },
              formFieldLabel: {
                color: "#cbd5e1",
              },
              footerActionLink: {
                color: "#818cf8",
                "&:hover": {
                  color: "#a5b4fc",
                },
              },
              formButtonPrimary: {
                backgroundColor: "#6366f1",
                "&:hover": {
                  backgroundColor: "#4f46e5",
                },
              },
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
