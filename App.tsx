import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import type { TranscriptMessage, Conversation } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audioUtils';

// Minimal type definitions for Web Speech API
interface SpeechRecognitionAlternative { readonly transcript: string; }
interface SpeechRecognitionResult { readonly isFinal: boolean; readonly [index: number]: SpeechRecognitionAlternative; readonly length: number; }
interface SpeechRecognitionResultList { readonly [index: number]: SpeechRecognitionResult; readonly length: number; }
interface SpeechRecognitionEvent { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
interface SpeechRecognition { lang: string; interimResults: boolean; onresult: (event: SpeechRecognitionEvent) => void; onend: () => void; start: () => void; stop: () => void; }

const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const GOOGLE_COLORS = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58'];

const content = {
  en: {
    standard: { title: '🇮🇳 Civic Sense Guru', description: 'Your AI guide to becoming a better citizen' },
    quick: { title: '⚡️ Quick Response', description: 'Fast answers for your general questions' },
    deep: { title: '🧠 Deep Thinking', description: 'In-depth analysis for complex problems' },
    welcomeTitle: 'Welcome!',
    welcomeBody: 'Select a mode, pick a topic, or tap the mic to begin your conversation about Indian civic sense.',
    statusConnecting: 'Connecting...',
    statusListening: 'Listening... Tap to stop.',
    statusRecording: 'Recording... Tap to stop.',
    statusProcessing: 'Processing...',
    statusAnalyzing: 'Analyzing your question...',
    statusGeneratingAudio: 'Generating audio response...',
    statusSpeaking: 'Speaking...',
    statusIdle: 'Tap to start conversation',
    errorSession: 'An error occurred during the session.',
    errorStart: 'Failed to start the session. Check microphone permissions.',
    errorApiKey: 'API_KEY environment variable not set.',
    errorBrowserSupport: 'Speech recognition is not supported in this browser.',
    thinking: 'Thinking...',
    history: 'History',
    newChat: 'New Chat',
    clearHistory: 'Clear History',
    clearHistoryConfirm: 'Are you sure you want to clear all history?',
    downloadChat: 'Download Chat',
    retry: 'Retry',
    topics: {
        traffic: 'Traffic Rules',
        hygiene: 'Public Hygiene',
        waste: 'Waste Management',
        transport: 'Public Transport',
        democracy: 'Voting & Democracy',
    }
  },
  hi: {
    standard: { title: '🇮🇳 नागरिक शास्त्र गुरु', description: 'एक बेहतर नागरिक बनने के लिए आपका AI गाइड' },
    quick: { title: '⚡️ त्वरित प्रतिक्रिया', description: 'आपके सामान्य प्रश्नों के लिए तेज़ उत्तर' },
    deep: { title: '🧠 गहन चिंतन', description: 'जटिल समस्याओं के लिए गहन विश्लेषण' },
    welcomeTitle: 'आपका स्वागत है!',
    welcomeBody: 'एक मोड चुनें, एक विषय चुनें, या भारतीय नागरिक शास्त्र के बारे में अपनी बातचीत शुरू करने के लिए माइक पर टैप करें।',
    statusConnecting: 'कनेक्ट हो रहा है...',
    statusListening: 'सुन रहा हूँ... रोकने के लिए टैप करें।',
    statusRecording: 'रिकॉर्डिंग... रोकने के लिए टैप करें।',
    statusProcessing: 'प्रोसेस हो रहा है...',
    statusAnalyzing: 'आपके प्रश्न का विश्लेषण हो रहा है...',
    statusGeneratingAudio: 'ऑडियो प्रतिक्रिया उत्पन्न हो रही है...',
    statusSpeaking: 'बोल रहा हूँ...',
    statusIdle: 'बातचीत शुरू करने के लिए टैप करें',
    errorSession: 'सत्र के दौरान एक त्रुटि हुई।',
    errorStart: 'सत्र शुरू करने में विफल। माइक्रोफ़ोन अनुमतियों की जाँच करें।',
    errorApiKey: 'API_KEY एनवायरनमेंट वैरिएबल सेट नहीं है।',
    errorBrowserSupport: 'इस ब्राउज़र में स्पीच रिकग्निशन समर्थित नहीं है।',
    thinking: 'सोच रहा हूँ...',
    history: 'इतिहास',
    newChat: 'नई चैट',
    clearHistory: 'इतिहास साफ़ करें',
    clearHistoryConfirm: 'क्या आप वाकई सारा इतिहास साफ़ करना चाहते हैं?',
    downloadChat: 'चैट डाउनलोड करें',
    retry: 'पुनः प्रयास करें',
    topics: {
        traffic: 'यातायात के नियम',
        hygiene: 'सार्वजनिक स्वच्छता',
        waste: 'कचरा प्रबंधन',
        transport: 'सार्वजनिक परिवहन',
        democracy: 'मतदान और लोकतंत्र',
    }
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
type SessionState = 'idle' | 'connecting' | 'live' | 'recording' | 'processing' | 'speaking';
type ProcessingStep = 'idle' | 'generatingText' | 'generatingAudio';
type Theme = 'light' | 'dark';

// --- SVG Icons ---
const MicIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1h2v1a5 5 0 0 0 10 0v-1z"></path><path d="M12 18.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5.5z"></path></svg>;
const StopIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>;
const AiIcon = () => <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md"><svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2zM6 8a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2zm12 0a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2zM7 15.222C7 14.547 7.547 14 8.222 14h7.556C16.453 14 17 14.547 17 15.222v2.556c0 .675-.547 1.222-1.222 1.222H8.222C7.547 19 7 18.453 7 17.778v-2.556z"/></svg></div>;
const SunIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM12 9a3 3 0 1 1-3 3 3 3 0 0 1 3-3zM12 2a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V3a1 1 0 0 0-1-1zm0 18a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 4.22a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM18.36 18.36a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM2 12a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zm18 0a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 19.78a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41zM19.78 4.22a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41z"></path></svg>;
const MoonIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>;
const MenuIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"></path></svg>;
const DownloadIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>;
const RetryIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>;
const TrafficIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>;
const HygieneIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22M12 6l7.5 13h-15"></path></svg>;
const WasteIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>;
const TransportIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"></path></svg>;
const DemocracyIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10h5l-4 7h3l-4 7-4-7h3l-4-7h5m-1-4H4v2h2v13h2V8h2V6H8V4H6v2H4V4h7V2z"></path></svg>;

const ColorizedText = ({ text }) => {
  const parts = text.split(/(\s+)/);
  let wordIndex = 0;
  return <p className="text-gray-800 dark:text-gray-100">{parts.map((part, i) => {
    if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
    if (part.length > 0) {
      const color = GOOGLE_COLORS[wordIndex % GOOGLE_COLORS.length];
      wordIndex++;
      return <span key={i} style={{ color }}>{part}</span>;
    }
    return null;
  })}</p>;
};

const App = () => {
  const [language, setLanguage] = useState<'en' | 'hi'>('hi');
  const [mode, setMode] = useState<Mode>('standard');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
        const savedTheme = localStorage.getItem('civic-sense-guru-theme');
        if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    } catch (e) { console.error("Could not read theme from localStorage", e); }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [history, setHistory] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
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
  const lastUserMessageRef = useRef<string | null>(null);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript, isThinking, error]);
  
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('civic-sense-guru-theme', theme);
    } catch (e) {
      console.error("Could not save theme to localStorage", e);
    }
  }, [theme]);
  
  useEffect(() => {
    if (!aiRef.current) {
        if (!process.env.API_KEY) { setError(content[language].errorApiKey); return; }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }, [language]);

  useEffect(() => {
    try { const saved = localStorage.getItem('civic-sense-guru-history'); if (saved) setHistory(JSON.parse(saved)); } 
    catch (e) { console.error("Failed to load history:", e); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('civic-sense-guru-history', JSON.stringify(history)); } 
    catch (e) { console.error("Failed to save history:", e); }
  }, [history]);

  useEffect(() => {
    if (!currentConversationId || transcript.length === 0) return;
    const update = (prev) => {
      const exists = prev.some(c => c.id === currentConversationId);
      const title = transcript[0].text.slice(0, 40) + (transcript[0].text.length > 40 ? '...' : '');
      if (!exists) {
        const newConversation = { id: currentConversationId, timestamp: Date.now(), title, messages: transcript };
        return [newConversation, ...prev];
      } else {
        return prev.map(c => c.id === currentConversationId ? { ...c, messages: transcript, title } : c);
      }
    };
    setHistory(update);
  }, [transcript, currentConversationId]);

  const disconnect = useCallback(() => {
    setSessionState('idle'); setProcessingStep('idle'); setIsThinking(false);
    sessionRef.current?.close(); sessionRef.current = null;
    scriptProcessorRef.current?.disconnect(); scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect(); mediaStreamSourceRef.current = null;
    if (inputAudioContextRef.current?.state !== 'closed') { inputAudioContextRef.current?.close().catch(console.error); inputAudioContextRef.current = null; }
    recognitionRef.current?.stop(); recognitionRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (outputAudioContextRef.current?.state !== 'closed') { outputAudioContextRef.current?.close().catch(console.error); outputAudioContextRef.current = null; }
    audioSourcesRef.current.forEach(source => source.stop()); audioSourcesRef.current.clear();
  }, []);

  const startNewConversation = useCallback(() => {
    disconnect();
    setCurrentConversationId(null);
    setTranscript([]);
    setError(null);
    setIsHistoryOpen(false);
  }, [disconnect]);

  const loadConversation = useCallback((id) => {
    disconnect();
    const conversation = history.find(c => c.id === id);
    if (conversation) {
      setCurrentConversationId(conversation.id);
      setTranscript(conversation.messages);
    }
    setIsHistoryOpen(false);
  }, [history, disconnect]);
  
  const clearHistory = useCallback(() => {
    if (window.confirm(content[language].clearHistoryConfirm)) {
      setHistory([]);
      startNewConversation();
    }
  }, [language, startNewConversation]);

  const handleLanguageChange = (lang) => { setLanguage(lang); startNewConversation(); };
  const handleModeChange = (newMode) => { setMode(newMode); startNewConversation(); };
  
  const processUserTurn = useCallback(async (userText) => {
    lastUserMessageRef.current = userText;
    setSessionState('processing');
    setProcessingStep('generatingText');
    
    try {
      if (!aiRef.current) throw new Error("AI client not initialized.");
      if (mode === 'deep') setIsThinking(true);

      const modelName = mode === 'quick' ? 'gemini-flash-lite-latest' : 'gemini-2.5-pro';
      const config: { systemInstruction: string; thinkingConfig?: { thinkingBudget: number }; } = { systemInstruction: systemInstructions[language][mode] };
      if (mode === 'deep') config.thinkingConfig = { thinkingBudget: 32768 };
      
      const response = await aiRef.current.models.generateContent({ model: modelName, contents: userText, config });

      if (mode === 'deep') setIsThinking(false);
      const modelResponseText = response.text;
      setTranscript(prev => [...prev, { speaker: 'model', text: modelResponseText, isFinal: true }]);

      setProcessingStep('generatingAudio');
      setSessionState('speaking');
      const ttsResponse = await aiRef.current.models.generateContent({
        model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: modelResponseText }] }], config: { responseModalities: [Modality.AUDIO] }
      });
      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
          const outputCtx = outputAudioContextRef.current?.state !== 'closed' ? outputAudioContextRef.current : new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          outputAudioContextRef.current = outputCtx;
          const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
          const sourceNode = outputCtx.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(outputCtx.destination);
          sourceNode.start();
          sourceNode.onended = () => { setSessionState('idle'); setProcessingStep('idle'); };
      } else { setSessionState('idle'); setProcessingStep('idle'); }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : content[language].errorSession);
      setSessionState('idle'); setProcessingStep('idle'); setIsThinking(false);
    }
  }, [language, mode]);

  const startLiveConversation = useCallback(async () => {
    setError(null);
    setSessionState('connecting');

    try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        nextStartTimeRef.current = 0;
        audioSourcesRef.current.clear();
        
        if (!aiRef.current) throw new Error("AI Client not initialized");

        const sessionPromise = aiRef.current.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: systemInstructions[language].standard,
            },
            callbacks: {
                onopen: () => {
                    setSessionState('live');
                    const source = inputAudioContextRef.current!.createMediaStreamSource(streamRef.current!);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromise.then((session) => {
                            if (session) session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                        setSessionState('speaking');
                        const outputCtx = outputAudioContextRef.current!;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                            if (audioSourcesRef.current.size === 0) {
                                setSessionState('live');
                            }
                        });
                        
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                },
                onerror: (e: ErrorEvent) => { console.error('Session error:', e); setError(content[language].errorSession); disconnect(); },
                onclose: () => { disconnect(); }
            }
        });
        sessionRef.current = await sessionPromise;
    } catch (err) {
        console.error('Failed to start live session:', err);
        setError(err instanceof Error ? err.message : content[language].errorStart);
        disconnect();
    }
  }, [disconnect, language, mode]);
  
  const startTurnBasedConversation = useCallback(async (initialText = '') => {
    if (!SpeechRecognitionAPI) { setError(content[language].errorBrowserSupport); return; }
    
    if (!currentConversationId) setCurrentConversationId(Date.now().toString());

    if (initialText) {
      setTranscript([{ speaker: 'user', text: initialText, isFinal: true }]);
      await processUserTurn(initialText);
      return;
    }
    
    setSessionState('recording'); setError(null);
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-US';
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let finalTranscript = ''; let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }
      setTranscript(prev => {
        const newTranscript = [...prev]; const last = newTranscript[newTranscript.length - 1];
        const text = (finalTranscript || interimTranscript).trim();
        if (last?.speaker === 'user' && !last.isFinal) last.text = text;
        else if (text) newTranscript.push({ speaker: 'user', text, isFinal: false });
        return newTranscript;
      });
    };
    
    recognition.onend = async () => {
      recognitionRef.current = null;
      setTranscript(prev => {
          const lastMsgIndex = prev.findLastIndex(m => m.speaker === 'user');
          if (lastMsgIndex === -1) { setSessionState('idle'); return prev; }
          const lastMsg = prev[lastMsgIndex];
          if (!lastMsg.text.trim()) { setSessionState('idle'); return prev.slice(0, lastMsgIndex); }
          
          const finalTranscript = [...prev];
          finalTranscript[lastMsgIndex] = { ...lastMsg, isFinal: true };
          processUserTurn(lastMsg.text);
          return finalTranscript;
      });
    };
    recognition.start();
  }, [language, currentConversationId, processUserTurn]);
  
  const handleTopicClick = (topic) => {
    if (sessionState !== 'idle') disconnect();
    const prompt = language === 'hi' ? `मुझे ${topic} के बारे में बताएं` : `Tell me about ${topic}`;
    startTurnBasedConversation(prompt);
  };
  
  const handleButtonClick = () => {
    if (sessionState !== 'idle') {
        disconnect();
    } else {
      if (!currentConversationId) setCurrentConversationId(Date.now().toString());
      if (mode === 'standard') startLiveConversation();
      else startTurnBasedConversation();
    }
  };

  const handleDownloadChat = () => {
    const content = transcript.map(m => `${m.speaker === 'user' ? 'User' : 'Guru'}: ${m.text}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civic-sense-guru-chat-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = () => {
    setError(null);
    if (lastUserMessageRef.current) {
        setTranscript(prev => prev.filter(m => m.speaker !== 'model'));
        processUserTurn(lastUserMessageRef.current);
    }
  };
  
  const getStatusText = () => {
    switch (sessionState) {
        case 'connecting': return content[language].statusConnecting;
        case 'live': return content[language].statusListening;
        case 'speaking': return content[language].statusSpeaking;
        case 'recording': return content[language].statusRecording;
        case 'processing': 
            if (processingStep === 'generatingText') return content[language].statusAnalyzing;
            if (processingStep === 'generatingAudio') return content[language].statusGeneratingAudio;
            return content[language].statusProcessing;
        default: return content[language].statusIdle;
    }
  };
  
  const currentContent = content[language][mode];
  const isTransacting = sessionState !== 'idle';
  const isListening = sessionState === 'live' || sessionState === 'recording';
  const topicContent = content[language].topics;
  const topics = [
      { id: 'traffic', icon: TrafficIcon, text: topicContent.traffic },
      { id: 'hygiene', icon: HygieneIcon, text: topicContent.hygiene },
      { id: 'waste', icon: WasteIcon, text: topicContent.waste },
      { id: 'transport', icon: TransportIcon, text: topicContent.transport },
      { id: 'democracy', icon: DemocracyIcon, text: topicContent.democracy },
  ];

  return (
    <>
     <style>{`
        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .animate-ripple-1 { animation: ripple 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .animate-ripple-2 { animation: ripple 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.25s; }
        .animate-ripple-3 { animation: ripple 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s; }
        .animate-ripple-4 { animation: ripple 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.75s; }
     `}</style>
    <div className="flex h-screen w-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-200 font-sans transition-colors duration-300 overflow-hidden">
      {/* History Panel */}
      <aside className={`absolute lg:relative z-30 h-full w-72 bg-gray-100 dark:bg-gray-900/80 backdrop-blur-lg border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out flex flex-col ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-bold">{content[language].history}</h2>
              <button onClick={startNewConversation} className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-semibold">{content[language].newChat}</button>
          </div>
          <div className="flex-1 overflow-y-auto">
              {history.sort((a,b) => b.timestamp - a.timestamp).map(c => (
                  <button key={c.id} onClick={() => loadConversation(c.id)} className={`w-full text-left px-4 py-3 truncate transition-colors ${currentConversationId === c.id ? 'bg-blue-100 dark:bg-blue-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{c.title}</p>
                      <p className="text-xs text-gray-500">{new Date(c.timestamp).toLocaleString()}</p>
                  </button>
              ))}
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
              <button onClick={clearHistory} className="w-full text-center p-2 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">{content[language].clearHistory}</button>
          </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 relative">
        <header className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-left border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-black/80 backdrop-blur-lg sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsHistoryOpen(!isHistoryOpen)} className="p-3 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 lg:hidden"><MenuIcon c="w-6 h-6"/></button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{currentContent.title}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{currentContent.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-gray-700">
                  {(['standard', 'quick', 'deep'] as Mode[]).map(m => <button key={m} onClick={() => handleModeChange(m)} disabled={isTransacting} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all capitalize ${mode === m ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>{m}</button>)}
              </div>
              <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-gray-700">
                  <button onClick={() => handleLanguageChange('en')} disabled={isTransacting} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${language === 'en' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>English</button>
                  <button onClick={() => handleLanguageChange('hi')} disabled={isTransacting} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${language === 'hi' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-gray-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>हिन्दी</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownloadChat} disabled={transcript.length === 0} title={content[language].downloadChat} className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><DownloadIcon c="w-6 h-6" /></button>
                <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors" aria-label="Toggle theme">{theme === 'dark' ? <SunIcon c="w-6 h-6" /> : <MoonIcon c="w-6 h-6" />}</button>
              </div>
          </div>
        </header>
        
        <main className="flex-1 flex flex-col overflow-y-auto p-6 md:p-8">
          {transcript.length === 0 && !isTransacting && !error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
              <div className="mb-4 text-6xl">🇮🇳</div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200">{content[language].welcomeTitle}</h2>
              <p className="max-w-md mt-2">{content[language].welcomeBody}</p>
            </div>
          ) : (
            <div className="max-w-3xl w-full mx-auto space-y-6">
              {transcript.map((msg, index) => (
                <div key={index} className={`flex items-end gap-3 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.speaker === 'model' && <AiIcon />}
                  <div className={`max-w-md lg:max-w-xl px-5 py-3 rounded-2xl shadow-md ${msg.speaker === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white rounded-bl-none ring-1 ring-gray-200 dark:ring-gray-700'}`}>
                    <div className={!msg.isFinal ? 'opacity-70' : ''}>{msg.speaker === 'model' ? <ColorizedText text={msg.text} /> : <p>{msg.text}</p>}</div>
                  </div>
                </div>
              ))}
              {isThinking && (<div className="flex items-end gap-3 justify-start"><AiIcon /><div className="w-64 max-w-md lg:max-w-lg p-4 rounded-2xl bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 shadow-md space-y-2"><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div><div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div></div></div>)}
              {error && (<div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 text-red-500 ring-1 ring-red-500/20"><RetryIcon c="w-6 h-6 flex-shrink-0" /><div className="flex-1"><p className="font-semibold">An error occurred</p><p className="text-sm">{error}</p></div><button onClick={handleRetry} className="ml-4 px-3 py-1.5 rounded-md bg-red-500 text-white text-sm font-semibold hover:bg-red-600">{content[language].retry}</button></div>)}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </main>

        <footer className="p-4 bg-gray-50/80 dark:bg-black/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col items-center justify-center gap-4">
            {mode !== 'standard' && <div className="flex flex-wrap justify-center gap-2 mb-2">{topics.map(topic => (<button key={topic.id} onClick={() => handleTopicClick(topic.text)} disabled={isTransacting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><topic.icon c="w-5 h-5" />{topic.text}</button>))}</div>}
            <div className="relative">
              {isListening && <>
                  <div className="absolute inset-0 rounded-full bg-blue-400/50 animate-ripple-1"></div>
                  <div className="absolute inset-0 rounded-full bg-red-400/50 animate-ripple-2"></div>
                  <div className="absolute inset-0 rounded-full bg-yellow-400/50 animate-ripple-3"></div>
                  <div className="absolute inset-0 rounded-full bg-green-400/50 animate-ripple-4"></div>
              </>}
              <button onClick={handleButtonClick} disabled={sessionState === 'connecting' || sessionState === 'processing'} className={`relative w-28 h-28 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out shadow-xl transform active:scale-95 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-black ${(sessionState === 'connecting' || sessionState === 'processing') ? 'bg-yellow-500 cursor-not-allowed' : ''} ${(isListening || sessionState === 'speaking') ? 'bg-gradient-to-br from-red-500 to-rose-600 focus:ring-red-300' : ''} ${sessionState === 'idle' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 focus:ring-blue-300' : ''}`}>{isTransacting ? <StopIcon c="w-12 h-12" /> : <MicIcon c="w-14 h-14" />}</button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium h-5">{getStatusText()}</p>
          </div>
        </footer>
      </div>
    </div>
    </>
  );
};

export default App;