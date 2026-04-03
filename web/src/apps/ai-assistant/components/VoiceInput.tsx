import { Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

export default function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('')

      if (event.results[event.results.length - 1].isFinal) {
        onTranscript(transcript)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, onTranscript])

  if (!isSpeechRecognitionSupported()) return null

  return (
    <button
      type="button"
      className="flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer"
      style={{
        background: isListening ? 'rgba(255,59,48,0.15)' : 'transparent',
        color: isListening ? '#ff3b30' : 'var(--vos-text-tertiary)',
      }}
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? '停止录音' : '语音输入'}
    >
      {isListening ? <MicOff size={14} /> : <Mic size={14} />}
    </button>
  )
}
