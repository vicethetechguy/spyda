import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Talk instead of type, with the browser's own speech recognition (Chrome,
 * Edge, Safari, Android). It costs nothing and sends no audio to Spyda. Where
 * the browser has none (Firefox), `supported` is false and the mic is hidden.
 */

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => Recognition

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const callbackRef = useRef(onTranscript)
  const supported = recognitionClass() !== null

  useEffect(() => { callbackRef.current = onTranscript }, [onTranscript])
  useEffect(() => () => recognitionRef.current?.stop(), [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Recognition = recognitionClass()
    if (!Recognition || recognitionRef.current) return
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    let finalText = ''
    recognition.onresult = event => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      callbackRef.current((finalText + interim).replace(/\s+/g, ' ').trim())
    }
    recognition.onerror = event => {
      setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Allow microphone access to talk to Spyda.'
        : event.error === 'no-speech' ? null : 'Voice input stopped. Try again.')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    setError(null)
    setListening(true)
    recognition.start()
  }, [])

  return { supported, listening, error, start, stop }
}
