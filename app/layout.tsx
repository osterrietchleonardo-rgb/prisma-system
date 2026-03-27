import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: "--font-jakarta",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "PRISMA IA | Gestión Inmobiliaria Inteligente",
    template: "%s | PRISMA IA"
  },
  description: "Evolución digital para inmobiliarias. Potencia tu gestión comercial con Inteligencia Artificial, sincronización con Tokko y análisis predictivo.",
  keywords: ["Inmobiliaria", "I.A.", "Argentina", "Prop Tech", "CRM Inmobiliario", "Gemini", "Tokko Broker"],
  authors: [{ name: "Prisma IA Team" }],
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "https://prisma-ia.app",
    siteName: "PRISMA IA",
    title: "PRISMA IA | Dashboard Inmobiliario de Nueva Generación",
    description: "Sistemas inteligentes para directores y asesores inmobiliarios.",
    images: ["/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PRISMA IA | Gestión con Inteligencia Artificial",
    description: "Potencia tu inmobiliaria con bots de entrenamiento y consultoría inteligente.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${outfit.variable} font-sans antialiased selection:bg-accent/20 selection:text-accent`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
