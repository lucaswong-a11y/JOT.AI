
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Mic, Square, FileText, Settings as SettingsIcon, Plus, 
  MessageSquare, Sparkles, Trash2, ChevronLeft, 
  ChevronRight, Calendar, Search,
  X, LogIn, User, LayoutDashboard, BarChart3, Users,
  MapPin, ListTodo, Users2, Info, ArrowRight, Clock, Globe, 
  AlertCircle, Loader2, Database, Shield, Check, Play, Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MeetingSession, TranscriptionSegment, AppSettings, SpeechRecognition, SpeechRecognitionEvent } from './types';
import { generateSummary } from './services/gemini';
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
  // --- State Management ---
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
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [exportReady, setExportReady] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState('audio/webm');
  
  // --- Mic Test State ---
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const testAudioContextRef = useRef<AudioContext | null>(null);
  const testAnalyserRef = useRef<AnalyserNode | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testAnimationRef = useRef<number | null>(null);

  // --- Refs ---
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeSessionRef = useRef<MeetingSession | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    setExportReady(false);
    setAudioBlobUrl(null);
    recordedChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, [activeSession?.id]);

  // --- Recording Timer ---
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

  // --- Persistence & Device Discovery ---
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

  // --- Helper Functions ---
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
    setError(null);
    setExportReady(false);
    setAudioBlobUrl(null);
  };

  const stopAudioRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopAudioRecorder();
    setIsRecording(false);
    setInterimText('');
    setExportReady(true);
    
    const current = activeSessionRef.current;
    if (current) {
      setSessions(prev => prev.map(s => s.id === current.id ? current : s));
    }
  }, []);

  const getTranscriptText = (session: MeetingSession) => {
    const metadata = [
      `Title: ${session.title}`,
      `Date: ${new Date(session.date).toLocaleDateString()}`,
      `Venue: ${session.venue || 'Not specified'}`,
      `Agenda: ${session.agenda || 'Not specified'}`,
      `Attendance: ${session.attendance || 'Not specified'}`,
      '',
      'Transcription:',
      ''
    ].join('\n');

    const transcript = session.transcription.map(segment => {
      const time = new Date(segment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${segment.speaker}: ${segment.text}`;
    }).join('\n');

    const notes = session.notes ? `\n\nNotes:\n${session.notes}\n` : '\n';
    return `${metadata}${transcript}${notes}`;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscriptTxt = () => {
    if (!activeSession) return;
    const text = getTranscriptText(activeSession);
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${activeSession.title || 'transcript'}.txt`);
  };

  const createPDFBlob = (content: string) => {
    const lines = content.split('\n').flatMap(line => {
      const width = 90;
      return line.length <= width ? [line] : line.match(new RegExp(`.{1,${width}}`, 'g')) || [];
    });
    const escapedLines = lines.map(line => line.replace(/([()\\])/g, '\\$1'));
    const streamLines = ['BT', '/F1 12 Tf', '50 780 Td', ...escapedLines.map((line, index) => `${index === 0 ? '' : 'T*'} (${line}) Tj`), 'ET'];
    const streamBody = streamLines.filter(Boolean).join('\n');
    const encoder = new TextEncoder();
    const streamLength = encoder.encode(streamBody).length;
    const objects = [
      '%PDF-1.3\n',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
      `4 0 obj << /Length ${streamLength} >> stream\n${streamBody}\nendstream endobj\n`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n'
    ];
    let offset = 0;
    const xrefPositions = [0];
    for (const obj of objects) {
      xrefPositions.push(offset);
      offset += encoder.encode(obj).length;
    }
    const body = objects.join('');
    const xref = ['xref', '0 6', '0000000000 65535 f'];
    xrefPositions.slice(1).forEach(pos => xref.push(pos.toString().padStart(10, '0') + ' 00000 n'));
    const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
    return new Blob([body + xref.join('\n') + '\n' + trailer], { type: 'application/pdf' });
  };

  const downloadTranscriptPdf = () => {
    if (!activeSession) return;
    const text = getTranscriptText(activeSession);
    downloadBlob(createPDFBlob(text), `${activeSession.title || 'transcript'}.pdf`);
  };

  const downloadTranscriptDocx = () => {
    if (!activeSession) return;
    const text = getTranscriptText(activeSession)
      .split('\n')
      .map(line => line === '' ? '<br/>' : `${line}<br/>`)
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${text}</body></html>`;
    downloadBlob(new Blob([html], { type: 'application/msword' }), `${activeSession.title || 'transcript'}.docx`);
  };

  const downloadAudioFile = () => {
    if (!audioBlobUrl || !mediaRecorderRef.current) return;
    const blob = new Blob(recordedChunksRef.current, { type: audioMimeType });
    const extension = audioMimeType.includes('mp3') ? 'mp3' : audioMimeType.includes('ogg') ? 'ogg' : 'webm';
    downloadBlob(blob, `${activeSession?.title || 'meeting-audio'}.${extension}`);
  };

  const handleDownloadAudio = () => {
    if (!audioBlobUrl && !recordedChunksRef.current.length) return;
    downloadAudioFile();
  };

  const handleSummary = async () => {
    const sessionToAnalyze = activeSessionRef.current;
    if (!sessionToAnalyze || sessionToAnalyze.transcription.length === 0) {
      setError("No transcription data found to analyze.");
      return;
    }

    setIsSummarizing(true);
    setError(null);
    
    try {
      const transcriptText = sessionToAnalyze.transcription.map(t => t.text).join(' ');
      const summary = await generateSummary(transcriptText, sessionToAnalyze.notes);
      
      const updated = { ...sessionToAnalyze, summary };
      setActiveSession(updated);
      setSessions(prev => prev.map(s => s.id === sessionToAnalyze.id ? updated : s));
    } catch (err: any) {
      console.error("Summary error:", err);
      setError(`AI Analysis failed. Please ensure your Vercel backend is configured.`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const endMeetingAndAnalyze = async () => {
    stopRecording();
    setTimeout(() => {
      handleSummary();
    }, 800);
  };

  const initiateRecording = async (selectedLanguage: string) => {
    setShowLanguageModal(false);
    setError(null);
    setSettings(prev => ({ ...prev, language: selectedLanguage }));
    
    if (!activeSession) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Your browser does not support Speech Recognition. Please use Chrome or Safari.");
      return;
    }

    try {
      // start audio capture
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const constraints = { audio: settings.microphoneId === 'default' ? true : { deviceId: { exact: settings.microphoneId } } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        const mimeType = MediaRecorder.isTypeSupported('audio/mp3')
          ? 'audio/mp3'
          : MediaRecorder.isTypeSupported('audio/mpeg')
          ? 'audio/mpeg'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : '';

        if (mimeType) {
          setAudioMimeType(mimeType);
          try {
            recordedChunksRef.current = [];
            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = (event) => {
              if (event.data.size > 0) recordedChunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: mimeType });
              const url = URL.createObjectURL(blob);
              setAudioBlobUrl(url);
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
          } catch (recErr) {
            console.warn('Audio recording is not supported with this format.', recErr);
          }
        }
      }

      const recognition = new SpeechRecognition() as SpeechRecognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedLanguage;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setActiveSession(prev => {
            if (!prev) return null;
            const newSegment: TranscriptionSegment = {
              id: Math.random().toString(36).substr(2, 9),
              text: finalTranscript.trim(),
              timestamp: Date.now(),
              speaker: 'User'
            };
            return { ...prev, transcription: [...prev.transcription, newSegment] };
          });
        }
        setInterimText(interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error !== 'no-speech') {
          setError(`Microphone error: ${event.error}`);
          stopRecording();
        }
      };

      recognition.onend = () => {
        if (isRecordingRef.current) {
          recognition.start();
        }
      };

      recognitionRef.current = recognition;
      isRecordingRef.current = true;
      recognition.start();
      setIsRecording(true);
      setExportReady(false);
      setAudioBlobUrl(null);
      
    } catch (err) {
      console.error("Failed to start recognition:", err);
      setError("Failed to initialize local speech recognition.");
    }
  };

  // --- Mic Test Logic ---
  const toggleMicTest = async () => {
    if (isTestingMic) {
      stopMicTest();
      return;
    }
    try {
      const constraints = { audio: settings.microphoneId === 'default' ? true : { deviceId: { exact: settings.microphoneId } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      testAudioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      testAnalyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!testAnalyserRef.current) return;
        testAnalyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setMicLevel(average);
        testAnimationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      setIsTestingMic(true);
    } catch (err) {
      console.error('Mic test failed:', err);
      alert("Could not access microphone for testing.");
    }
  };

  const stopMicTest = () => {
    if (testAnimationRef.current) cancelAnimationFrame(testAnimationRef.current);
    if (testStreamRef.current) testStreamRef.current.getTracks().forEach(t => t.stop());
    if (testAudioContextRef.current) testAudioContextRef.current.close().catch(() => {});
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const updateActiveSessionField = (field: keyof MeetingSession, value: string) => {
    if (!activeSession) return;
    const updated = { ...activeSession, [field]: value };
    setActiveSession(updated);
    setSessions(prev => prev.map(s => s.id === activeSession.id ? updated : s));
  };

  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const isNewMeeting = activeSession && activeSession.transcription.length === 0 && !isRecording;

  return (
    <div className="flex flex-col h-screen bg-white text-slate-900 overflow-hidden">
      {/* Top Navigation */}
      <nav className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0 z-30 bg-white">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => { setActiveSession(null); setActiveTab('Meetings'); }}>
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
              <FileText className="text-white w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">jot</h1>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {[
              { name: 'Meetings', icon: LayoutDashboard },
              { name: 'Insights', icon: BarChart3 },
              { name: 'Team', icon: Users }
            ].map((item) => (
              <button
                key={item.name}
                disabled={isSummarizing}
                onClick={() => { setActiveTab(item.name); if (item.name !== 'Meetings') setActiveSession(null); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === item.name ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'
                } disabled:opacity-50`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsLoggedIn(!isLoggedIn)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-100 hover:bg-slate-50 transition-all">
            {isLoggedIn ? <><div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center"><User className="w-3 h-3" /></div><span>Alex J.</span></> : <><LogIn className="w-3.5 h-3.5" /><span>Login</span></>}
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors">
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <AnimatePresence>
          {activeTab === 'Meetings' && sidebarOpen && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="border-r border-slate-100 flex flex-col overflow-hidden bg-[#fbfbfc]">
              <div className="p-5 shrink-0">
                <button onClick={startNewMeeting} disabled={isSummarizing} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all disabled:opacity-50">
                  <Plus className="w-4 h-4" /> New Meeting
                </button>
              </div>
              <div className="px-4 mb-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-slate-200" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-1">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent</div>
                {filteredSessions.map(session => (
                  <div key={session.id} onClick={() => !isSummarizing && setActiveSession(session)} className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${activeSession?.id === session.id ? 'bg-white shadow-sm border border-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-200/50'} ${isSummarizing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-bold truncate">{session.title}</span>
                      <span className="text-[10px] opacity-60">{new Date(session.date).toLocaleDateString()}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSessions(prev => prev.filter(s => s.id !== session.id)); if (activeSession?.id === session.id) setActiveSession(null); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col min-w-0 relative bg-white">
          {activeTab === 'Meetings' ? (
            <>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-5 -left-3 z-30 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50">
                {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {activeSession ? (
                <>
                  <header className="h-20 border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
                    <div className="flex flex-col">
                      <input type="text" value={activeSession.title} onChange={(e) => updateActiveSessionField('title', e.target.value)} className="text-xl font-bold bg-transparent border-none focus:ring-0 p-0 text-slate-900" />
                      <div className="flex items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(activeSession.date).toLocaleDateString()}</span>
                        {isRecording && <span className="flex items-center gap-1.5 text-red-500 font-black"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> {formatTime(recordingTime)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isRecording ? (
                        <>
                          <button onClick={stopRecording} className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"><Square className="w-3 h-3" /> Stop Recording</button>
                          <button onClick={endMeetingAndAnalyze} className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all bg-red-500 text-white recording-indicator shadow-lg shadow-red-100"><Square className="w-3 h-3 fill-current" /> End & Analyze</button>
                        </>
                      ) : !isNewMeeting && (
                        <button onClick={() => setShowLanguageModal(true)} disabled={isSummarizing} className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"><Mic className="w-3 h-3" /> Resume</button>
                      )}
                      <button onClick={handleSummary} disabled={isSummarizing || activeSession.transcription.length === 0} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-2 rounded-full text-xs font-bold hover:bg-slate-50 disabled:opacity-40">
                        <Sparkles className={`w-3 h-3 text-indigo-500 ${isSummarizing ? 'animate-spin' : ''}`} /> Summary
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 flex overflow-hidden relative">
                    <AnimatePresence>
                      {isSummarizing && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
                          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100"><Loader2 className="text-white w-8 h-8 animate-spin" /></div>
                          <div className="text-center"><h3 className="text-lg font-bold text-slate-900">AI is analyzing...</h3><p className="text-xs text-slate-400 font-medium">Generating your meeting summary and action items.</p></div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex-1 flex flex-col border-r border-slate-100 relative">
                      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {isNewMeeting ? (
                          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex items-center justify-center">
                            <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 space-y-4">
                              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                                <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"><Info className="text-white w-4 h-4" /></div>
                                <div><h2 className="text-base font-bold text-slate-900">Meeting Setup</h2><p className="text-[10px] text-slate-400 font-medium">Quickly define the context before recording.</p></div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-2.5 h-2.5" /> Date</label>
                                  <input type="date" value={activeSession.date} onChange={(e) => updateActiveSessionField('date', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-200 transition-all" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin className="w-2.5 h-2.5" /> Venue</label>
                                  <input type="text" placeholder="Location..." value={activeSession.venue || ''} onChange={(e) => updateActiveSessionField('venue', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-200 transition-all" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Users2 className="w-2.5 h-2.5" /> Attendance</label>
                                <input type="text" placeholder="Participants..." value={activeSession.attendance || ''} onChange={(e) => updateActiveSessionField('attendance', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-200 transition-all" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ListTodo className="w-2.5 h-2.5" /> Agenda</label>
                                <textarea placeholder="Key topics..." value={activeSession.agenda || ''} onChange={(e) => updateActiveSessionField('agenda', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-200 transition-all h-16 resize-none" />
                              </div>
                              <div className="pt-2 flex justify-end">
                                <button onClick={() => setShowLanguageModal(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all active:scale-95"><Mic className="w-3.5 h-3.5" /> Start Recording <ArrowRight className="w-3 h-3" /></button>
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-8">
                              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><MessageSquare className="w-4 h-4" /> Live Transcription</div>
                              {isRecording && <div className="flex items-center gap-2 text-red-500 text-[10px] font-black uppercase tracking-widest"><Clock className="w-3 h-3" /> {formatTime(recordingTime)}</div>}
                            </div>
                            
                            {error && <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 text-red-600 mb-6"><AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><div className="text-xs font-medium"><p className="font-bold mb-1">System Message</p><p>{error}</p></div></div>}
                            
                            {activeSession.transcription.map((segment) => (
                              <div key={segment.id} className="flex flex-col items-start">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${segment.speaker === 'User' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600'}`}>{segment.speaker}</span>
                                  <span className="text-[9px] font-bold text-slate-300">{new Date(segment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed text-sm font-medium pl-1">{segment.text}</p>
                              </div>
                            ))}
                            
                            {interimText && (
                              <div className="flex flex-col items-start opacity-50">
                                <div className="flex items-center gap-2 mb-1.5"><span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">User</span></div>
                                <p className="text-slate-700 leading-relaxed text-sm font-medium pl-1 italic">{interimText}...</p>
                              </div>
                            )}
                            
                            {isRecording && <div className="flex items-center gap-3 pl-1"><div className="flex gap-1">{[0, 1, 2].map(i => <motion.div key={i} animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }} className="w-1 bg-indigo-400 rounded-full" />)}</div><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Listening</span></div>}
                            
                            {/* 💡 修正關鍵：移除了原本卡在這裡的多餘 </div>，讓整個結構保持完整 */}
                            
                            {exportReady && !isRecording && (
                              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">Export your session</p>
                                    <p className="text-xs text-slate-500">Download transcript and audio after stopping recording.</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <button onClick={downloadTranscriptTxt} className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-700 hover:border-slate-300">Download TXT</button>
                                  <button onClick={downloadTranscriptPdf} className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-700 hover:border-slate-300">Download PDF</button>
                                  <button onClick={downloadTranscriptDocx} className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-700 hover:border-slate-300">Download DOCX</button>
                                  <button onClick={handleDownloadAudio} disabled={!audioBlobUrl} className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-700 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed">Download Audio {audioMimeType.includes('mp3') ? '(MP3)' : ''}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-[400px] flex flex-col bg-[#fbfbfc]">
                      <div className="border-b border-slate-100 bg-white shrink-0">
                        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meeting Info</span></div>
                        <div className="p-6 space-y-4">
                          <div className="flex items-start gap-3"><MapPin className="w-4 h-4 text-slate-300 mt-0.5" /><div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Venue</p><p className="text-xs font-bold text-slate-700">{activeSession.venue || 'Not specified'}</p></div></div>
                          <div className="flex items-start gap-3"><Users2 className="w-4 h-4 text-slate-300 mt-0.5" /><div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Attendance</p><p className="text-xs font-bold text-slate-700">{activeSession.attendance || 'Not specified'}</p></div></div>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notes</span></div>
                        <textarea placeholder="Meeting notes..." value={activeSession.notes} onChange={(e) => updateActiveSessionField('notes', e.target.value)} className="flex-1 p-6 bg-transparent resize-none focus:ring-0 border-none text-sm leading-relaxed text-slate-700 font-medium" />
                      </div>
                      {activeSession.summary && (
                        <div className="h-1/3 border-t border-slate-100 flex flex-col bg-white overflow-hidden">
                          <div className="px-6 py-3 border-b border-slate-50 text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Summary</div>
                          <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">{activeSession.summary}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12"><div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6"><FileText className="w-8 h-8 text-slate-300" /></div><h2 className="text-2xl font-bold text-slate-900 mb-2">Capture the moment.</h2><p className="text-slate-400 text-sm mb-8 max-w-xs">Start a new meeting to begin real-time transcription and AI analysis.</p><button onClick={startNewMeeting} className="bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all">New Meeting</button></div>
              )}
            </>
          ) : activeTab === 'Insights' ? (
            <InsightsView sessions={sessions} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-300 font-bold uppercase tracking-widest text-xs">Coming Soon</div>
          )}
        </main>
      </div>

      {/* Language Selection Modal */}
      <AnimatePresence>
        {showLanguageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLanguageModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Globe className="text-indigo-600 w-4 h-4" /><h2 className="text-sm font-bold text-slate-900">Transcription Language</h2></div>
                <button onClick={() => setShowLanguageModal(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {SUPPORTED_LANGUAGES.map(lang => (
                  <button key={lang.code} onClick={() => initiateRecording(lang.code)} className="flex items-center justify-between p-3 rounded-xl border border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group">
                    <div className="text-left"><div className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">{lang.label}</div><div className="text-[9px] text-slate-400 font-medium">{lang.native}</div></div>
                    <ArrowRight className="w-3 h-3 text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowSettings(false); stopMicTest(); }} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between"><h2 className="text-lg font-bold">Settings</h2><button onClick={() => { setShowSettings(false); stopMicTest(); }} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-4 h-4 text-slate-400" /></button></div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <section className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audio</div>
                  <div className="flex gap-3">
                    <select value={settings.microphoneId} onChange={(e) => setSettings(s => ({ ...s, microphoneId: e.target.value }))} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-bold outline-none">
                      <option value="default">Default Mic</option>
                      {availableMics.map(mic => <option key={mic.deviceId} value={mic.deviceId}>{mic.label || 'Microphone'}</option>)}
                    </select>
                    <button onClick={toggleMicTest} className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isTestingMic ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{isTestingMic ? 'Stop' : 'Test'}</button>
                  </div>
                  {isTestingMic && <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><motion.div className="h-full bg-indigo-500" animate={{ width: `${Math.min(100, micLevel * 1.5)}%` }} /></div>}
                </section>
                <section className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Language</div>
                  <div className="grid grid-cols-3 gap-2">
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <button key={lang.code} onClick={() => setSettings(s => ({ ...s, language: lang.code }))} className={`p-3 rounded-xl border text-left transition-all ${settings.language === lang.code ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}><div className="text-[10px] font-bold">{lang.label}</div><div className="text-[9px] opacity-60">{lang.native}</div></button>
                    ))}
                  </div>
                </section>
                <section className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Privacy & Storage</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm"><MapPin className="w-5 h-5 text-slate-400" /></div>
                        <div><p className="text-sm font-bold text-slate-700">Location Access</p><p className="text-[10px] text-slate-400 font-medium">Tag meetings with your current location</p></div>
                      </div>
                      <button onClick={() => setSettings(s => ({ ...s, privacy: { ...s.privacy, gpsAuthorized: !s.privacy.gpsAuthorized } }))} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${settings.privacy.gpsAuthorized ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{settings.privacy.gpsAuthorized ? 'Authorized' : 'Authorize'}</button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm"><Database className="w-5 h-5 text-slate-400" /></div>
                        <div><p className="text-sm font-bold text-slate-700">Local Storage</p><p className="text-[10px] text-slate-400 font-medium">Store meeting data on this device</p></div>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-600 text-[10px] font-bold uppercase tracking-widest"><Check className="w-4 h-4" /> Active</div>
                    </div>
                  </div>
                </section>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end"><button onClick={() => { setShowSettings(false); stopMicTest(); }} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold">Save</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
