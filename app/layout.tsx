import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
}

export const metadata: Metadata = {
  title: "PWA Scanner - Control de Entradas",
  description: "Aplicación PWA para control de entradas en eventos",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PWA Scanner"
  },
  icons: {
    icon: [
      { url: "/icons/android/android-launchericon-192-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/android/android-launchericon-512-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/ios/180.png", sizes: "180x180", type: "image/png" }
    ]
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ServiceWorkerRegistration />
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  )
}

