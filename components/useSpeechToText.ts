'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

/**
 * Browser dictation via the Web Speech API — the same mechanism used by ScopeChat and the
 * public get-quote form, extracted so it's not duplicated a third time. `onTranscript` is
 * called only with finalised phrases (never the unstable in-progress guess) — Android's
 * speech engine revises interim results much more aggressively than desktop Chrome's while
 * you're mid-sentence, which read as "garbled" text flickering as you spoke. Text now lands
 * in chunks as you pause, but never shows something wrong and then silently corrects itself.
 */
export function useSpeechToText(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<AnySpeechRecognition>(null)
  // True while the user wants the mic on — distinct from `listening`/`recognitionRef` so
  // onend can tell "the recognizer stopped itself" apart from "the user clicked stop".
  const wantListeningRef = useRef(false)

  const stopListening = useCallback(() => {
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice input is not supported in this browser. Please use Chrome or Edge.'); return }

    const start = () => {
      const rec: AnySpeechRecognition = new SR()
      rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true
      rec.onstart = () => setListening(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        // e.results grows as you speak — each entry is one recognized phrase, finalised
        // (isFinal) once you pause. Only finalised phrases are surfaced; the one still being
        // spoken is left out entirely rather than shown and then corrected.
        let finalText = ''
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText += r[0].transcript.trim() + ' '
        }
        if (finalText) onTranscript(finalText.trim())
      }
      rec.onend = () => {
        // Android's speech service ends the session after any pause in speech, even with
        // continuous=true (desktop Chrome keeps listening indefinitely) — so the mic would
        // otherwise silently switch off after your first sentence. Restart automatically
        // unless the user actually clicked the mic to turn it off.
        recognitionRef.current = null
        if (wantListeningRef.current) {
          try { start() } catch { setListening(false); wantListeningRef.current = false }
        } else {
          setListening(false)
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        // Fatal errors shouldn't auto-restart into a loop — let onend turn the mic off.
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          wantListeningRef.current = false
        }
      }
      recognitionRef.current = rec
      rec.start()
    }

    wantListeningRef.current = true
    start()
  }, [listening, stopListening, onTranscript])

  useEffect(() => () => stopListening(), [stopListening])

  return { listening, toggleMic }
}
