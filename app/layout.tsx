import type { Metadata } from "next"
import "./globals.css"
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration"

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
        {children}
      </body>
    </html>
  )
}

