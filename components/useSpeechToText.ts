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
      // e.results grows as you speak — each entry is one recognized phrase, finalised
      // (isFinal) once you pause. Joining every entry with '' (the old behaviour) ran
      // finalised phrases straight into each other with no space, which is what looked
      // "garbled/doubled up" — and re-joining the whole list on every interim tick meant
      // already-settled text kept getting rewritten too. Finalised phrases are joined with
      // a space and never touched again; only the one phrase still being spoken is unstable
      // while the recognizer refines its guess for it.
      let finalText = ''
      let interimText = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript.trim() + ' '
        else interimText += r[0].transcript
      }
      onTranscript((finalText + interimText).trim())
    }
    rec.onend   = () => { setListening(false); recognitionRef.current = null }
    rec.onerror = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = rec
    rec.start()
  }, [listening, stopListening, onTranscript])

  useEffect(() => () => stopListening(), [stopListening])

  return { listening, toggleMic }
}
