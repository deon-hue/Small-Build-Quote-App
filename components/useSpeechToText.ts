'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

/**
 * Browser dictation via the Web Speech API — the same mechanism used by ScopeChat and the
 * public get-quote form, extracted so it's not duplicated a third time. `onTranscript` is
 * called with the live (interim + final) transcript on every result, same as those two.
 */
export function useSpeechToText(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<AnySpeechRecognition>(null)

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice input is not supported in this browser. Please use Chrome or Edge.'); return }
    const rec: AnySpeechRecognition = new SR()
    rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true
    rec.onstart = () => setListening(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<unknown>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript).join('')
      onTranscript(transcript)
    }
    rec.onend   = () => { setListening(false); recognitionRef.current = null }
    rec.onerror = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = rec
    rec.start()
  }, [listening, stopListening, onTranscript])

  useEffect(() => () => stopListening(), [stopListening])

  return { listening, toggleMic }
}
