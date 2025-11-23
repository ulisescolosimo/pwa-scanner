'use client'

import { useState, FormEvent } from 'react'
import { useTicketStore } from '@/lib/ticketStore'

interface LoginProps {
  onSuccess: () => void
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setAdminKey } = useTicketStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/tickets/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({ mode: 'ping' })
      })

      if (response.ok) {
        setAdminKey(password)
        onSuccess()
      } else {
        setError('Clave incorrecta')
        // Shake animation trigger
        const form = document.getElementById('login-form')
        form?.classList.add('animate-shake')
        setTimeout(() => form?.classList.remove('animate-shake'), 500)
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/20 blur-[100px] animate-pulse-ring" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-purple-900/20 blur-[80px]" />
      </div>

      <div className="w-full max-w-sm z-10 animate-fade-in">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-gradient-to-tr from-primary to-purple-600 rounded-2xl mx-auto mb-6 shadow-lg shadow-primary/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Scanner
          </h1>
          <p className="text-gray-400 text-lg">
            Control de Acceso
          </p>
        </div>

        <form id="login-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className="relative group">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 bg-surface-light/50 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-lg text-center tracking-widest backdrop-blur-sm group-hover:bg-surface-light/70"
                placeholder="CLAVE DE ACCESO"
                autoFocus
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="text-error text-center text-sm font-medium animate-fade-in bg-error/10 py-2 rounded-lg border border-error/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full bg-white text-black hover:bg-gray-100 disabled:bg-gray-600 disabled:text-gray-400 font-bold py-4 px-6 rounded-2xl transition-all transform active:scale-[0.98] text-lg shadow-lg shadow-white/5"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Verificando...</span>
              </div>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-12">
          v2.0 • Premium Edition
        </p>
      </div>
    </div>
  )
}

