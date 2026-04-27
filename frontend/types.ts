
export interface TranscriptionSegment {
  id: string;
  text: string;
  timestamp: number;
  speaker: 'User' | 'AI';
}

export interface MeetingSession {
  id: string;
  title: string;
  date: string;
  venue?: string;
  agenda?: string;
  attendance?: string;
  transcription: TranscriptionSegment[];
  notes: string;
  summary?: string;
}

export interface AppSettings {
  microphoneId: string;
  language: string;
  aiInstruction: string;
  privacy: {
    gpsAuthorized: boolean;
    storageAuthorized: boolean;
  };
}

// Web Speech API Types
export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}
