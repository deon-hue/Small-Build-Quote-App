'use client'

// Talk instead of typing, for ONE text box: the phone's own speech recognition (useSpeechToText) wired so the spoken words are ADDED to what is
// already in the box. The recogniser hands over everything it has heard in the current "listening session"; the phone restarts a session after a
// pause, so a chunk that no longer continues the last one means a new session began, and what is on screen so far becomes the base the new words
// are added to. Used by the subcontractor portal's note box, "Describe your day" box and "What did you work on?" line.

import { useCallback, useEffect, useRef } from 'react'
import { useSpeechToText } from '@/components/useSpeechToText'

export function useDictatedText(text: string, setText: (t: string) => void) {
  const baseRef = useRef('')
  const lastChunk = useRef('')
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])

  const onSpeech = useCallback((chunk: string) => {
    if (lastChunk.current && !chunk.startsWith(lastChunk.current)) baseRef.current = textRef.current
    lastChunk.current = chunk
    const base = baseRef.current
    setText((base && !/\s$/.test(base) ? base + ' ' : base) + chunk)
  }, [setText])

  const { listening, toggleMic } = useSpeechToText(onSpeech)

  /** Start (words are added after what is there now) or stop listening */
  function talk() {
    if (!listening) { baseRef.current = textRef.current; lastChunk.current = '' }
    toggleMic()
  }
  /** Stop listening if it is on (e.g. when the person starts typing) */
  function stop() { if (listening) toggleMic() }
  /** Forget the words so far (after the box is cleared) */
  function reset() { baseRef.current = ''; lastChunk.current = '' }

  return { listening, talk, stop, reset }
}
