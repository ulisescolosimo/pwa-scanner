import type { Metadata } from "next"
import "./globals.css"
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration"
import { Toaster } from "react-hot-toast"

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
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#fff',
              borderRadius: '0.5rem',
              padding: '1rem',
              fontSize: '0.875rem',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
              style: {
                background: '#065f46',
                border: '1px solid #10b981',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
              style: {
                background: '#7f1d1d',
                border: '1px solid #ef4444',
              },
            },
            loading: {
              iconTheme: {
                primary: '#f59e0b',
                secondary: '#fff',
              },
              style: {
                background: '#78350f',
                border: '1px solid #f59e0b',
              },
            },
          }}
        />
        {children}
      </body>
    </html>
  )
}

