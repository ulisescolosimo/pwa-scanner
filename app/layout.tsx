import type { Metadata } from "next"
import "./globals.css"
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "PWA Scanner - Control de Entradas",
  description: "Aplicación PWA para control de entradas en eventos",
  manifest: "/manifest.webmanifest",
  themeColor: "#0a0a0a",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
        <meta name="theme-color" content="#0a0a0a" />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  )
}

