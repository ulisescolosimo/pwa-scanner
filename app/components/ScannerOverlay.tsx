'use client'

import { useEffect, useState } from 'react'

interface ScannerOverlayProps {
    status: 'scanning' | 'success' | 'error' | 'used'
    message?: string
    subMessage?: string
}

export default function ScannerOverlay({ status, message, subMessage }: ScannerOverlayProps) {
    const [showFeedback, setShowFeedback] = useState(false)

    useEffect(() => {
        if (status !== 'scanning') {
            setShowFeedback(true)
            const timer = setTimeout(() => setShowFeedback(false), 2000)
            return () => clearTimeout(timer)
        }
    }, [status])

    return (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            {/* Scanning Frame - Always visible when scanning */}
            {status === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-72 h-72">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white/50 rounded-tl-3xl" />
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white/50 rounded-tr-3xl" />
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white/50 rounded-bl-3xl" />
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white/50 rounded-br-3xl" />

                        {/* Scanning Laser */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-slide-up opacity-50" />

                        {/* Pulse Effect */}
                        <div className="absolute inset-0 border-2 border-primary/30 rounded-3xl animate-pulse" />
                    </div>

                    <div className="absolute bottom-20 text-white/70 text-sm font-medium bg-black/40 px-4 py-2 rounded-full backdrop-blur-md">
                        Apunta el código QR
                    </div>
                </div>
            )}

            {/* Feedback Overlays */}
            {showFeedback && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-300 ${status === 'success' ? 'bg-success/20' :
                        status === 'error' ? 'bg-error/20' :
                            status === 'used' ? 'bg-yellow-500/20' : ''
                    }`}>
                    <div className={`transform transition-all duration-500 ${showFeedback ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                        {/* Icon */}
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 shadow-2xl ${status === 'success' ? 'bg-success text-white' :
                                status === 'error' ? 'bg-error text-white' :
                                    'bg-yellow-500 text-white'
                            }`}>
                            {status === 'success' && (
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                            {status === 'error' && (
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            )}
                            {status === 'used' && (
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            )}
                        </div>

                        {/* Text */}
                        <div className="text-center">
                            <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
                                {message}
                            </h2>
                            {subMessage && (
                                <p className="text-white/90 text-lg font-medium drop-shadow-md">
                                    {subMessage}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
