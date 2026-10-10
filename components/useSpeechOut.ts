'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { speakableText, speechChunks } from '@/lib/speech-text'

const VOICE_KEY = 'buildos-voice-uri'
const RATE_KEY = 'buildos-voice-rate'
export const SPEECH_RATES = [0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const
const DEFAULT_RATE = 1.15

/**
 * Reading text aloud with the device's own voice (the browser's speech synthesis): free, nothing is sent anywhere. One thing is read at a time;
 * `speakingKey` says which (so its button can show Stop). The voice defaults to a British English one when the device has it, and the choice is
 * remembered on this device. It stops by itself when the screen using it goes away.
 */
export function useSpeechOut() {
  const [supported, setSupported] = useState(false)   // set after the first render, so the server and browser render the same thing
  useEffect(() => { setSupported('speechSynthesis' in window) }, [])
  const [speakingKey, setSpeakingKey] = useState<string | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURIState] = useState<string>('')
  const [rate, setRateState] = useState<number>(DEFAULT_RATE)
  useEffect(() => {
    try { const r = Number(localStorage.getItem(RATE_KEY)); if (r >= 0.5 && r <= 3) setRateState(r) } catch { /* private mode */ }
  }, [])
  const runRef = useRef(0)   // bumped on every start/stop so an old read-out's callbacks can't touch the new one

  useEffect(() => {
    if (!supported) return
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'))
      setVoices(all)
      let saved = ''
      try { saved = localStorage.getItem(VOICE_KEY) ?? '' } catch { /* private mode */ }
      setVoiceURIState(prev => prev || (saved && all.some(v => v.voiceURI === saved) ? saved : (all.find(v => v.lang === 'en-GB') ?? all[0])?.voiceURI ?? ''))
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [supported])

  const stop = useCallback(() => {
    runRef.current++
    if (supported) window.speechSynthesis.cancel()
    setSpeakingKey(null)
  }, [supported])

  useEffect(() => () => { if (supported) { runRef.current++; window.speechSynthesis.cancel() } }, [supported])

  const speak = useCallback((key: string, text: string) => {
    if (!supported) return
    // tapping the same one again stops it
    if (speakingKey === key) { stop(); return }
    window.speechSynthesis.cancel()
    const run = ++runRef.current
    const chunks = speechChunks(speakableText(text))
    if (chunks.length === 0) { setSpeakingKey(null); return }
    const voice = voices.find(v => v.voiceURI === voiceURI)
    setSpeakingKey(key)
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c)
      u.lang = voice?.lang ?? 'en-GB'
      if (voice) u.voice = voice
      u.rate = rate
      const done = () => { if (runRef.current === run && i === chunks.length - 1) setSpeakingKey(null) }
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    })
  }, [supported, speakingKey, voices, voiceURI, rate, stop])

  const setVoice = useCallback((uri: string) => {
    setVoiceURIState(uri)
    try { localStorage.setItem(VOICE_KEY, uri) } catch { /* private mode */ }
  }, [])

  const setRate = useCallback((r: number) => {
    setRateState(r)
    try { localStorage.setItem(RATE_KEY, String(r)) } catch { /* private mode */ }
  }, [])

  return { supported, speakingKey, speak, stop, voices, voiceURI, setVoice, rate, setRate }
}
