import React, { useState, useRef, useCallback, useEffect } from 'react';
// FIX: The 'LiveSession' type is not exported from the '@google/genai' package.
import { GoogleGenAI, LiveServerMessage, Modality, GenerateContentResponse } from '@google/genai';
import type { TranscriptMessage } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audioUtils';

// FIX: Add minimal type definitions for Web Speech API to fix compile error on line 148.
// This is necessary because the default TS DOM lib might not include these interfaces.
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
  readonly length: number;
}

interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionResult;
  readonly length: number;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition {
  lang: string;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}


// Polyfill for SpeechRecognition
// FIX: Rename `SpeechRecognition` to `SpeechRecognitionAPI` to avoid shadowing the built-in `SpeechRecognition` type,
// and use `(window as any)` for cross-browser compatibility.
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const GOOGLE_COLORS = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58'];

const content = {
  en: {
    standard: {
      title: '🇮🇳 Civic Sense Guru',
      description: 'Your AI guide to becoming a better citizen',
    },
    quick: {
      title: '⚡️ Quick Response',
      description: 'Fast answers for your general questions',
    },
    deep: {
      title: '🧠 Deep Thinking',
      description: 'In-depth analysis for complex problems',
    },
    welcomeTitle: 'Welcome!',
    welcomeBody: 'Select a mode and tap the mic to begin your conversation about Indian civic sense.',
    statusConnecting: 'Connecting...',
    statusListening: 'Listening... Tap to stop.',
    statusRecording: 'Recording... Tap to stop.',
    statusProcessing: 'Processing...',
    statusAnalyzing: 'Analyzing your question...',
    statusGeneratingAudio: 'Generating audio response...',
    statusIdle: 'Tap to start conversation',
    errorSession: 'An error occurred during the session.',
    errorStart: 'Failed to start the session.',
    errorApiKey: 'API_KEY environment variable not set.',
    errorBrowserSupport: 'Speech recognition is not supported in this browser.',
    thinking: 'Thinking...',
  },
  hi: {
    standard: {
      title: '🇮🇳 नागरिक शास्त्र गुरु',
      description: 'एक बेहतर नागरिक बनने के लिए आपका AI गाइड',
    },
    quick: {
      title: '⚡️ त्वरित प्रतिक्रिया',
      description: 'आपके सामान्य प्रश्नों के लिए तेज़ उत्तर',
    },
    deep: {
      title: '🧠 गहन चिंतन',
      description: 'जटिल समस्याओं के लिए गहन विश्लेषण',
    },
    welcomeTitle: 'आपका स्वागत है!',
    welcomeBody: 'एक मोड चुनें और भारतीय नागरिक शास्त्र के बारे में अपनी बातचीत शुरू करने के लिए माइक पर टैप करें।',
    statusConnecting: 'कनेक्ट हो रहा है...',
    statusListening: 'सुन रहा हूँ... रोकने के लिए टैप करें।',
    statusRecording: 'रिकॉर्डिंग... रोकने के लिए टैप करें।',
    statusProcessing: 'प्रोसेस हो रहा है...',
    statusAnalyzing: 'आपके प्रश्न का विश्लेषण हो रहा है...',
    statusGeneratingAudio: 'ऑडियो प्रतिक्रिया उत्पन्न हो रही है...',
    statusIdle: 'बातचीत शुरू करने के लिए टैप करें',
    errorSession: 'सत्र के दौरान एक त्रुटि हुई।',
    errorStart: 'सत्र शुरू करने में विफल।',
    errorApiKey: 'API_KEY एनवायरनमेंट वैरिएबल सेट नहीं है।',
    errorBrowserSupport: 'इस ब्राउज़र में स्पीच रिकग्निशन समर्थित नहीं है।',
    thinking: 'सोच रहा हूँ...',
  }
};

const systemInstructions = {
    en: {
      standard: "You are a friendly and knowledgeable AI guide named 'Civic Mitra'. Your job is to teach users about Indian civic sense through conversation in English. When the user talks to you, you must respond in English. Discuss topics like: cleanliness in public places (e.g., not littering), respecting public property, proper queuing etiquette, traffic rules for pedestrians, responsible use of public transport like buses and metros, and being considerate of others (e.g., speaking softly). Your tone should always be positive, encouraging, and patient. Use simple examples from everyday life in India to explain your points. Keep your answers short and clear.",
      quick: "You are a helpful and very fast AI assistant. Provide concise and accurate answers in English. Keep responses brief and to the point.",
      deep: "You are a powerful AI with advanced reasoning capabilities. Analyze complex problems thoroughly and provide detailed, well-structured answers in English. Take your time to think to ensure your response is comprehensive."
    },
    hi: {
        standard: "Aap ek friendly aur knowledgeable AI guide hain jiska naam 'Civic Mitra' hai. Aapka kaam hai users ko Bharatiya nagarik shastra (Indian civic sense) ke baare mein Hindi mein batchit karke sikhana. Jab user aapse baat kare, aapko Hindi mein hi jawab dena hai. In vishayon par baat karein: saarvajanik sthalon par safai (jaise kachra na failana), saarvajanik sampatti ka samman karna, line mein lagne ka sahi tarika, paidal chalne walon ke liye traffic ke niyam, bus aur metro jaise saarvajanik parivahan ka jimmedari se upyog karna, aur doosron ka dhyan rakhna (jaise dheemi awaaz mein baat karna). Aapka lehja hamesha positive, encouraging aur patient hona chahiye. Apni baaton ko samjhane ke liye Bharat ki rozmarra ki zindagi se saral udaharan dein. Apne jawab chote aur saaf rakhein.",
        quick: "Aap ek sahayak aur bahut tez AI sahayak hain. Sankshipt aur sateek jawab Hindi mein dein. Jawab chote aur mudde par rakhein.",
        deep: "Aap ek shaktishali AI hain jiske paas unnat tark kshamata hai. Jatil samasyaon ka gehrai se vishleshan karein aur Hindi mein vistrit, susangathit jawab pradan karein. Yah sunishchit karne ke liye ki aapka jawab vyapak hai, sochne ke liye apna samay lein."
    }
};

type Mode = 'standard' | 'quick' | 'deep';
type SessionState = 'idle' | 'connecting' | 'live' | 'recording' | 'processing';
type ProcessingStep = 'idle' | 'generatingText' | 'generatingAudio';
type Theme = 'light' | 'dark';

const ColorizedText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\s+)/);
  let wordIndex = 0;
  return (
    <p className="text-gray-800 dark:text-gray-100">
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={i}>{part}</span>;
        }
        if (part.length > 0) {
          const color = GOOGLE_COLORS[wordIndex % GOOGLE_COLORS.length];
          wordIndex++;
          return <span key={i} style={{ color }}>{part}</span>;
        }
        return null;
      })}
    </p>
  );
};

// --- SVG Icons ---
const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1h2v1a5 5 0 0 0 10 0v-1z"></path>
    <path d="M12 18.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5.5z"></path>
  </svg>
);

const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h12v12H6z"></path>
  </svg>
);

const AiIcon: React.FC = () => (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2zM6 8a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2zm12 0a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2zM7 15.222C7 14.547 7.547 14 8.222 14h7.556C16.453 14 17 14.547 17 15.222v2.556c0 .675-.547 1.222-1.222 1.222H8.222C7.547 19 7 18.453 7 17.778v-2.556z"/>
        </svg>
    </div>
);

const SunIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM12 9a3 3 0 1 1-3 3 3 3 0 0 1 3-3zM12 2a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V3a1 1 0 0 0-1-1zm0 18a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 4.22a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM18.36 18.36a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM2 12a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zm18 0a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 19.78a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41zM19.78 4.22a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41z"></path>
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
  </svg>
);

const App: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'hi'>('hi');
  const [mode, setMode] = useState<Mode>('standard');
  const [theme, setTheme] = useState<Theme>('light');
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  // FIX: Use 'any' for the session ref since 'LiveSession' type is not exported.
  const sessionRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isThinking]);
  
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'dark' ? 'light' : 'dark');
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    if (!aiRef.current) {
        if (!process.env.API_KEY) {
            setError(content[language].errorApiKey);
            return;
        }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }, [language]);
  
  const disconnect = useCallback(() => {
    setSessionState('idle');
    setProcessingStep('idle');
    setIsThinking(false);

    // Live session cleanup
    sessionRef.current?.close();
    sessionRef.current = null;
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    
    // Recognition cleanup
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }

    // General cleanup
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
  }, []);

  const resetState = useCallback(() => {
    if (sessionState !== 'idle') {
      disconnect();
    }
    setTranscript([]);
    setError(null);
  }, [sessionState, disconnect]);
  
  const handleLanguageChange = (lang: 'en' | 'hi') => {
    resetState();
    setLanguage(lang);
  };

  const handleModeChange = (newMode: Mode) => {
    resetState();
    setMode(newMode);
  };
  
  const startLiveConversation = useCallback(async () => {
    setSessionState('connecting');
    setError(null);
    setTranscript([]);
    
    try {
        if (!aiRef.current) throw new Error("AI client not initialized.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        inputAudioContextRef.current = inputAudioContext;
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputAudioContextRef.current = outputAudioContext;

        const sessionPromise = aiRef.current.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: systemInstructions[language][mode],
            },
            callbacks: {
              onopen: () => {
                setSessionState('live');
                const source = inputAudioContext.createMediaStreamSource(stream);
                mediaStreamSourceRef.current = source;
                const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                scriptProcessorRef.current = scriptProcessor;
                scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                  const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                  const pcmBlob = createBlob(inputData);
                  sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
              },
              onmessage: async (message: LiveServerMessage) => {
                  if (message.serverContent) {
                    setTranscript(prev => {
                      const newTranscript = [...prev];
                      const process = (transcription: any, speaker: 'user' | 'model') => {
                        if (!transcription) return;
                        const last = newTranscript[newTranscript.length - 1];
                        if (last?.speaker === speaker && !last.isFinal) {
                            last.text += transcription.text;
                        } else {
                            newTranscript.push({ speaker, text: transcription.text, isFinal: false });
                        }
                        if (transcription.isFinal) last.isFinal = true;
                      };
                      process(message.serverContent.inputTranscription, 'user');
                      process(message.serverContent.outputTranscription, 'model');
                      if (message.serverContent.turnComplete) return newTranscript.map(t => ({ ...t, isFinal: true }));
                      return newTranscript;
                    });
      
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                      const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                      const sourceNode = outputAudioContext.createBufferSource();
                      sourceNode.buffer = audioBuffer;
                      sourceNode.connect(outputAudioContext.destination);
                      sourceNode.start(nextStartTimeRef.current);
                      nextStartTimeRef.current += audioBuffer.duration;
                      audioSourcesRef.current.add(sourceNode);
                      sourceNode.onended = () => audioSourcesRef.current.delete(sourceNode);
                    }
                  }
              },
              onerror: (e) => {
                  console.error(e);
                  setError(content[language].errorSession);
                  disconnect();
              },
              onclose: () => {
                  disconnect();
              },
            },
        });
        sessionRef.current = await sessionPromise;
    } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : content[language].errorStart);
        disconnect();
    }
  }, [disconnect, language, mode]);
  
  const startTurnBasedConversation = useCallback(async () => {
    if (!SpeechRecognitionAPI) {
      setError(content[language].errorBrowserSupport);
      return;
    }

    setSessionState('recording');
    setError(null);

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-US';
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      setTranscript(prev => {
        const newTranscript = [...prev];
        const last = newTranscript[newTranscript.length - 1];
        const text = (finalTranscript || interimTranscript);
        if (last?.speaker === 'user' && !last.isFinal) {
            last.text = text;
        } else if (text) {
            newTranscript.push({ speaker: 'user', text, isFinal: false });
        }
        return newTranscript;
      });
    };
    
    recognition.onend = async () => {
      const lastUserMessage = transcript[transcript.length - 1];
      if (!lastUserMessage || lastUserMessage.speaker !== 'user' || !lastUserMessage.text.trim()) {
        setSessionState('idle');
        return;
      }
      
      setSessionState('processing');
      setProcessingStep('generatingText');
      setTranscript(prev => prev.map(t => t === lastUserMessage ? {...t, isFinal: true} : t));
      
      try {
        if (!aiRef.current) throw new Error("AI client not initialized.");
        if(mode === 'deep') setIsThinking(true);

        const modelName = mode === 'quick' ? 'gemini-flash-lite-latest' : 'gemini-2.5-pro';
        const config: any = { systemInstruction: systemInstructions[language][mode] };
        if (mode === 'deep') config.thinkingConfig = { thinkingBudget: 32768 };
        
        const response = await aiRef.current.models.generateContent({
            model: modelName,
            contents: lastUserMessage.text,
            config,
        });

        if (mode === 'deep') setIsThinking(false);
        const modelResponseText = response.text;
        setTranscript(prev => [...prev, { speaker: 'model', text: modelResponseText, isFinal: true }]);

        setProcessingStep('generatingAudio');

        const ttsResponse: GenerateContentResponse = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: modelResponseText }] }],
            config: { responseModalities: [Modality.AUDIO] }
        });

        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const outputCtx = outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed' 
                ? outputAudioContextRef.current 
                : new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputAudioContextRef.current = outputCtx;
            
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
            const sourceNode = outputCtx.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(outputCtx.destination);
            sourceNode.start();
            sourceNode.onended = () => {
                setSessionState('idle');
                setProcessingStep('idle');
            };
        } else {
            setSessionState('idle');
            setProcessingStep('idle');
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : content[language].errorSession);
        setSessionState('idle');
        setProcessingStep('idle');
        setIsThinking(false);
      }
    };

    recognition.start();
  }, [language, mode, transcript]);

  const handleButtonClick = () => {
    if (sessionState !== 'idle') {
      disconnect();
    } else {
      if (mode === 'standard') {
        startLiveConversation();
      } else {
        startTurnBasedConversation();
      }
    }
  };

  const getStatusText = () => {
    switch (sessionState) {
        case 'connecting': return content[language].statusConnecting;
        case 'live': return content[language].statusListening;
        case 'recording': return content[language].statusRecording;
        case 'processing': 
            if (processingStep === 'generatingText') return content[language].statusAnalyzing;
            if (processingStep === 'generatingAudio') return content[language].statusGeneratingAudio;
            return content[language].statusProcessing;
        case 'idle':
        default: return content[language].statusIdle;
    }
  };
  
  const currentContent = content[language][mode];
  const isTransacting = sessionState !== 'idle';

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-200 font-sans transition-colors duration-300">
      <header className="p-5 flex flex-col sm:flex-row justify-between items-center gap-4 text-left border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-black/80 backdrop-blur-lg sticky top-0 z-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{currentContent.title}</h1>
          <p className="text-gray-500 dark:text-gray-400">{currentContent.description}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-gray-700">
                {(['standard', 'quick', 'deep'] as Mode[]).map(m => (
                    <button key={m} onClick={() => handleModeChange(m)} disabled={isTransacting} className={`px-3 py-1 rounded-md text-sm font-semibold transition-all capitalize ${mode === m ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} ${isTransacting ? 'cursor-not-allowed opacity-50' : ''}`}>
                        {m}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-gray-700">
                <button onClick={() => handleLanguageChange('en')} disabled={isTransacting} className={`px-3 py-1 rounded-md text-sm font-semibold transition-all ${language === 'en' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} ${isTransacting ? 'cursor-not-allowed opacity-50' : ''}`}>English</button>
                <button onClick={() => handleLanguageChange('hi')} disabled={isTransacting} className={`px-3 py-1 rounded-md text-sm font-semibold transition-all ${language === 'hi' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} ${isTransacting ? 'cursor-not-allowed opacity-50' : ''}`}>हिन्दी</button>
            </div>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col overflow-y-auto p-6 md:p-8">
        {transcript.length === 0 && !isTransacting ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <div className="mb-4 text-6xl animate-fade-in-up">🇮🇳</div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200">{content[language].welcomeTitle}</h2>
            <p className="max-w-md mt-2">{content[language].welcomeBody}</p>
          </div>
        ) : (
          <div className="max-w-3xl w-full mx-auto space-y-6">
            {transcript.map((msg, index) => (
              <div key={index} className={`flex items-end gap-3 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.speaker === 'model' && <AiIcon />}
                <div className={`max-w-md lg:max-w-xl px-5 py-3 rounded-2xl shadow-md ${msg.speaker === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white rounded-bl-none ring-1 ring-gray-200 dark:ring-gray-700'}`}>
                  <div className={!msg.isFinal ? 'opacity-70' : ''}>
                    {msg.speaker === 'model' ? <ColorizedText text={msg.text} /> : <p>{msg.text}</p>}
                  </div>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex items-end gap-3 justify-start animate-fade-in">
                <AiIcon />
                <div className="max-w-md lg:max-w-lg px-4 py-2 rounded-2xl bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 shadow-md">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>{content[language].thinking}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </main>

      <footer className="p-4 bg-gray-50/80 dark:bg-black/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="relative">
            {(sessionState === 'live' || sessionState === 'recording') && (
              <div className="absolute -inset-2 bg-red-400/50 rounded-full animate-pulse"></div>
            )}
            {(sessionState === 'connecting' || sessionState === 'processing') && (
              <div className="absolute -inset-2 bg-yellow-400/50 rounded-full animate-pulse"></div>
            )}
            <button
              onClick={handleButtonClick}
              disabled={sessionState === 'connecting' || sessionState === 'processing'}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out shadow-xl transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-black
                ${(sessionState === 'connecting' || sessionState === 'processing') ? 'bg-yellow-500 cursor-not-allowed' : ''}
                ${(sessionState === 'live' || sessionState === 'recording') ? 'bg-gradient-to-br from-red-500 to-rose-600 focus:ring-red-300' : ''}
                ${sessionState === 'idle' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 focus:ring-blue-300' : ''}
              `}
            >
              {isTransacting ? <StopIcon className="w-10 h-10" /> : <MicIcon className="w-12 h-12" />}
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium h-5">{getStatusText()}</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </footer>
    </div>
  );
};

export default App;
