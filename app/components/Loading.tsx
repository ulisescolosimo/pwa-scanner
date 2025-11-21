'use client'

export default function Loading({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
        <p className="text-white text-xl">{message}</p>
      </div>
    </div>
  )
}

