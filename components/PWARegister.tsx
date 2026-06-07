'use client'
import { useEffect } from 'react'

/** Registers the service worker silently. Drop this into the root layout. */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {/* silent */})
    }
  }, [])
  return null
}
