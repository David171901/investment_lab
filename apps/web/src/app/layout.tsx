import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SidebarNav } from "@/components/sidebar-nav";

// Tipografía del proyecto: Inter, cargada vía next/font y expuesta como la
// variable CSS `--font-sans` que consume Tailwind (`font-sans`) en globals.css.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Investment Lab",
  description: "Laboratorio personal de inversiones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema oscuro forzado a nivel de toda la app (regla de diseño del frontend).
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <div className="flex min-h-full flex-col md:flex-row">
            <SidebarNav />
            <main className="min-w-0 flex-1 md:ml-56">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
