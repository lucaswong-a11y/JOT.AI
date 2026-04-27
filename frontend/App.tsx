
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Mic, Square, FileText, Settings as SettingsIcon, Plus, 
  MessageSquare, Sparkles, Trash2, ChevronLeft, 
  ChevronRight, Calendar, Search,
  X, LogIn, User, LayoutDashboard, BarChart3, Users,
  MapPin, ListTodo, Users2, Info, ArrowRight, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MeetingSession, TranscriptionSegment, AppSettings } from './types';
import { connectLiveTranscription, encodeAudio, generateSummary } from './services/gemini';
import { AUDIO_CONFIG, SYSTEM_INSTRUCTIONS, SUPPORTED_LANGUAGES } from './constants';
import InsightsView from './components/InsightsView';

const DEFAULT_SETTINGS: AppSettings = {
  microphoneId: 'default',
  language: 'en-US',
  aiInstruction: SYSTEM_INSTRUCTIONS.TRANSCRIPTION,
  privacy: {
    gpsAuthorized: false,
    storageAuthorized: true,
  }
};

const App: React.FC = () => {
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [activeSession, setActiveSession] = useState<MeetingSession | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('Meetings');
  
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const activeSessionRef = useRef<MeetingSession | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // Timer Logic
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    const savedSessions = localStorage.getItem('jot_sessions');
    const savedSettings = localStorage.getItem('jot_settings');
    if (savedSessions) setSessions(JSON.parse(savedSessions));
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    navigator.mediaDevices.enumerateDevices().then(devices => {
      setAvailableMics(devices.filter(d => d.kind === 'audioinput'));
    }).catch(err => console.error("Device enumeration error:", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('jot_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('jot_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startNewMeeting = () => {
    const newSession: MeetingSession = {
      id: Date.now().toString(),
      title: `Meeting ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString().split('T')[0],
      venue: '',
      agenda: '',
      attendance: '',
      transcription: [],
      notes: '',
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSession(newSession);
    setActiveTab('Meetings');
  };

  const handleTranscription = useCallback((text: string, isUser: boolean) => {
    setActiveSession(prev => {
      if (!prev) return null;
      const lastSegment = prev.transcription[prev.transcription.length - 1];
      const speaker = isUser ? 'User' : 'Model';
      
      if (lastSegment && lastSegment.speaker === speaker) {
        const updatedTranscription = [...prev.transcription];
        updatedTranscription[updatedTranscription.length - 1] = {
          ...lastSegment,
          text: lastSegment.text + text
        };
        return { ...prev, transcription: updatedTranscription };
      }

      const newSegment: TranscriptionSegment = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        timestamp: Date.now(),
        speaker
      };
      return { ...prev, transcription: [...prev.transcription, newSegment] };
    });
  }, []);

const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    
    // 1. 斷開音訊處理器
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // 2. 徹底關閉麥克風硬體 (修正原本斷掉的地方)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // 3. 關閉音訊上下文
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // 4. 更新 Session 狀態
    const current = activeSessionRef.current;
    if (current) {
      setSessions(prev => prev.map(s => s.id === current.id ? current : s));
    }
  }, []);

  // 這裡補齊 App 元件剩下的渲染邏輯和關閉括號
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 這裡應該接著你的 UI 程式碼... 
          由於你的貼文斷在邏輯處，請確保下方有對應的 return (JSX) 
          以及元件結尾的 } 和 export default App; */}
      <h1 className="p-4">JOT.AI 正在運行</h1>
    </div>
  );
};

export default App;
