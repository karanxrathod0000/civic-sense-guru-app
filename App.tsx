
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

const content = {
  en: {
    standard: { title: '🇮🇳 Civic Sense Guru', description: 'Your AI guide to becoming a better citizen' },
    quick: { title: '⚡️ Quick Response', description: 'Fast answers for your general questions' },
    deep: { title: '🧠 Deep Thinking', description: 'In-depth analysis for complex problems' },
    welcomeTitle: 'Welcome!',
    welcomeBody: 'Select a mode, pick a topic, or tap the mic to begin your conversation about Indian civic sense.',
    statusConnecting: 'Connecting...',
    statusListening: 'Listening...',
    statusRecording: 'Recording...',
    statusProcessing: 'Processing...',
    statusAnalyzing: 'Analyzing...',
    statusGeneratingAudio: 'Generating audio...',
    statusSpeaking: 'Speaking...',
    statusIdle: 'Tap to start',
    errorSession: 'Oops! An error occurred during the session. Please try again.',
    errorStart: 'Failed to start. Check microphone permissions.',
    errorApiKey: 'API_KEY environment variable not set.',
    errorBrowserSupport: 'Speech recognition is not supported in this browser.',
    thinking: 'Thinking...',
    history: 'History',
    newChat: 'New Chat',
    clearHistory: 'Clear History',
    clearHistoryConfirm: 'Are you sure you want to clear all history?',
    startNewConversationConfirm: 'Start a new conversation? Your current chat will be cleared.',
    downloadChat: 'Download Chat',
    retry: 'Retry',
    topics: {
        traffic: 'Traffic Rules',
        hygiene: 'Public Hygiene',
        waste: 'Waste Management',
        transport: 'Public Transport',
        democracy: 'Voting & Democracy',
    },
    suggestions: ['Tell me more', 'Give an example', 'What else?', 'Quiz me']
  },
  hi: {
    standard: { title: '🇮🇳 नागरिक शास्त्र गुरु', description: 'एक बेहतर नागरिक बनने के लिए आपका AI गाइड' },
    quick: { title: '⚡️ त्वरित प्रतिक्रिया', description: 'आपके सामान्य प्रश्नों के लिए तेज़ उत्तर' },
    deep: { title: '🧠 गहन चिंतन', description: 'जटिल समस्याओं के लिए गहन विश्लेषण' },
    welcomeTitle: 'आपका स्वागत है!',
    welcomeBody: 'एक मोड चुनें, एक विषय चुनें, या भारतीय नागरिक शास्त्र के बारे में अपनी बातचीत शुरू करने के लिए माइक पर टैप करें।',
    statusConnecting: 'कनेक्ट हो रहा है...',
    statusListening: 'सुन रहा हूँ...',
    statusRecording: 'रिकॉर्डिंग...',
    statusProcessing: 'प्रोसेस हो रहा है...',
    statusAnalyzing: 'विश्लेषण हो रहा है...',
    statusGeneratingAudio: 'ऑडियो बन रहा है...',
    statusSpeaking: 'बोल रहा हूँ...',
    statusIdle: 'शुरू करने के लिए टैप करें',
    errorSession: 'सत्र के दौरान एक त्रुटि हुई। कृपया पुनः प्रयास करें।',
    errorStart: 'शुरू करने में विफल। माइक्रोफ़ोन अनुमतियों की जाँच करें।',
    errorApiKey: 'API_KEY एनवायरनमेंट वैरिएबल सेट नहीं है।',
    errorBrowserSupport: 'इस ब्राउज़र में स्पीच रिकग्निशन समर्थित नहीं है।',
    thinking: 'सोच रहा हूँ...',
    history: 'इतिहास',
    newChat: 'नई चैट',
    clearHistory: 'इतिहास साफ़ करें',
    clearHistoryConfirm: 'क्या आप वाकई सारा इतिहास साफ़ करना चाहते हैं?',
    startNewConversationConfirm: 'नई बातचीत शुरू करें? आपकी वर्तमान चैट साफ़ हो जाएगी।',
    downloadChat: 'चैट डाउनलोड करें',
    retry: 'पुनः प्रयास करें',
    topics: {
        traffic: 'यातायात के नियम',
        hygiene: 'सार्वजनिक स्वच्छता',
        waste: 'कचरा प्रबंधन',
        transport: 'सार्वजनिक परिवहन',
        democracy: 'मतदान और लोकतंत्र',
    },
    suggestions: ['और बताएं', 'एक उदाहरण दें', 'और क्या?', 'मेरी परीक्षा लें']
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
type Theme = 'light' | 'dark';
interface PinnedMessage extends TranscriptMessage { pinnedAt: number; }
interface VoiceSettings { rate: number; pitch: number; volume: number; }
interface Toast { id: number; message: string; type: 'success' | 'error' | 'info'; }


// --- SVG Icons ---
const MicIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1h2v1a5 5 0 0 0 10 0v-1zM12 18.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5.5z" /></svg>;
const StopIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>;
const UserIcon = () => <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0 shadow-md">👤</div>
const AiIcon = () => <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md">🤖</div>
const SunIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM12 9a3 3 0 1 1-3 3 3 3 0 0 1 3-3zM12 2a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V3a1 1 0 0 0-1-1zm0 18a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 4.22a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM18.36 18.36a1 1 0 0 0-1.41 0 1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41-1.41zM2 12a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zm18 0a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zM4.22 19.78a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41zM19.78 4.22a1 1 0 0 0 0-1.41l-1.41-1.41a1 1 0 0 0-1.41 1.41z" /></svg>;
const MoonIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>;
const MenuIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" /></svg>;
const DownloadIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>;
const RetryIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>;
const TrafficIcon = ({ c }) => <g className={c}>🚦</g>;
const HygieneIcon = ({ c }) => <g className={c}>🧹</g>;
const WasteIcon = ({ c }) => <g className={c}>🗑️</g>;
const TransportIcon = ({ c }) => <g className={c}>🚌</g>;
const DemocracyIcon = ({ c }) => <g className={c}>🗳️</g>;
const NewChatIcon = ({ c }) => <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-4v4h-2v-4H7V9h4V5h2v4h4v2z"/></svg>;
const ShareIcon = ({ c }) => <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>;
const PinIcon = ({ c }) => <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M16 9V4h-2v5h-2V4H8v5H6V4H4v7h2v2h2v-2h2v2h2v-2h2V4h-2v5h-2zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>;
const PinnedIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>;
const CopyIcon = ({ c }) => <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>;
const ChevronDownIcon = ({ c }) => <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>;
const SearchIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>;
const SettingsIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" /></svg>;
const CloseIcon = ({ c }) => <svg className={c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>;


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
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [history, setHistory] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [isPinnedPanelOpen, setIsPinnedPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({ rate: 1.0, pitch: 1.0, volume: 0.8 });
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any | null>(null); 
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const statusRef = useRef(sessionState);

  const addToast = (message, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useEffect(() => { statusRef.current = sessionState; }, [sessionState]);

  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (container) {
      const isScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isScrolledToBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      const handleScroll = () => {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        setShowScrollDown(!isAtBottom);
      };
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [transcript, isThinking, error]);
  
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') { root.classList.add('dark'); } else { root.classList.remove('dark'); }
    try { localStorage.setItem('civic-sense-guru-theme', theme); } catch (e) { console.error("Could not save theme to localStorage", e); }
  }, [theme]);
  
  useEffect(() => {
    if (!aiRef.current) {
        if (!process.env.API_KEY) { setError(content[language].errorApiKey); return; }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }, [language]);

  useEffect(() => {
    try {
        const savedHistory = localStorage.getItem('civic-sense-guru-history'); if (savedHistory) setHistory(JSON.parse(savedHistory));
        const onboardingSeen = localStorage.getItem('civic-sense-guru-onboarding-seen'); if (!onboardingSeen) setShowOnboarding(true);
        const savedPins = localStorage.getItem('civic-sense-guru-pinned-messages'); if(savedPins) setPinnedMessages(JSON.parse(savedPins));
        const savedVoiceSettings = localStorage.getItem('civic-sense-guru-voice-settings'); if(savedVoiceSettings) setVoiceSettings(JSON.parse(savedVoiceSettings));
    } catch (e) { console.error("Failed to load from localStorage:", e); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('civic-sense-guru-history', JSON.stringify(history)); } 
    catch (e) { console.error("Failed to save history:", e); }
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem('civic-sense-guru-pinned-messages', JSON.stringify(pinnedMessages)); } 
    catch (e) { console.error("Failed to save pinned messages:", e); }
  }, [pinnedMessages]);

  useEffect(() => {
    if (!currentConversationId || transcript.length === 0) return;
    const update = (prev) => {
      const exists = prev.some(c => c.id === currentConversationId);
      const title = transcript.find(m => m.speaker === 'user')?.text.slice(0, 40) + '...' || 'New Chat';
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
    setSessionState('idle'); setIsThinking(false); setSuggestions([]);
    sessionRef.current?.close(); sessionRef.current = null;
    scriptProcessorRef.current?.disconnect(); scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect(); mediaStreamSourceRef.current = null;
    if (inputAudioContextRef.current?.state !== 'closed') { inputAudioContextRef.current?.close().catch(console.error); inputAudioContextRef.current = null; }
    recognitionRef.current?.stop(); recognitionRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (outputAudioContextRef.current?.state !== 'closed') { outputAudioContextRef.current?.close().catch(console.error); outputAudioContextRef.current = null; gainNodeRef.current = null; }
    audioSourcesRef.current.forEach(source => source.stop()); audioSourcesRef.current.clear();
  }, []);

  const startNewConversation = useCallback(() => {
    if (transcript.length > 0 && !window.confirm(content[language].startNewConversationConfirm)) return;
    disconnect();
    setCurrentConversationId(null);
    setTranscript([]);
    setError(null);
    setIsHistoryOpen(false);
    addToast('New conversation started', 'success');
  }, [disconnect, language, transcript.length]);

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
  
  const playAudio = async (base64Audio) => {
    let outputCtx = outputAudioContextRef.current;
    if (!outputCtx || outputCtx.state === 'closed') {
      outputCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputCtx;
    }

    if(!gainNodeRef.current || gainNodeRef.current.context !== outputCtx) {
        gainNodeRef.current = outputCtx.createGain();
        gainNodeRef.current.connect(outputCtx.destination);
    }
    gainNodeRef.current.gain.value = voiceSettings.volume;

    const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
    const sourceNode = outputCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = voiceSettings.rate;
    // Note: pitch is implicitly handled by playbackRate in Web Audio API
    sourceNode.connect(gainNodeRef.current);
    return sourceNode;
  }

  const processUserTurn = useCallback(async (userText) => {
    lastUserMessageRef.current = userText;
    setSessionState('processing');
    setSuggestions([]);
    
    try {
      if (!aiRef.current) throw new Error("AI client not initialized.");
      if (mode === 'deep') setIsThinking(true);

      const modelName = mode === 'quick' ? 'gemini-flash-lite-latest' : 'gemini-2.5-pro';
      const config: { systemInstruction: string; thinkingConfig?: { thinkingBudget: number }; } = { systemInstruction: systemInstructions[language][mode] };
      if (mode === 'deep') config.thinkingConfig = { thinkingBudget: 32768 };
      
      const response = await aiRef.current.models.generateContent({ model: modelName, contents: userText, config });

      if (mode === 'deep') setIsThinking(false);
      const modelResponseText = response.text;
      setTranscript(prev => [...prev, { speaker: 'model', text: modelResponseText, isFinal: true, timestamp: Date.now() }]);

      setSessionState('speaking');
      const ttsResponse = await aiRef.current.models.generateContent({
        model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: modelResponseText }] }], config: { responseModalities: [Modality.AUDIO] }
      });
      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
          const sourceNode = await playAudio(base64Audio);
          sourceNode.start();
          sourceNode.onended = () => { 
            if (statusRef.current === 'speaking') {
                setSessionState('idle'); 
                setSuggestions(content[language].suggestions);
            }
          };
      } else { setSessionState('idle'); setSuggestions(content[language].suggestions); }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : content[language].errorSession);
      addToast(err instanceof Error ? err.message : content[language].errorSession, 'error');
      setSessionState('idle'); setIsThinking(false);
    }
  }, [language, mode, voiceSettings]);

  const startLiveConversation = useCallback(async () => {
    setError(null);
    setSessionState('connecting');

    try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        gainNodeRef.current = outputAudioContextRef.current.createGain();
        gainNodeRef.current.gain.value = voiceSettings.volume;
        gainNodeRef.current.connect(outputAudioContextRef.current.destination);

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
                        const outputCtx = outputAudioContextRef.current;
                         if (!outputCtx || outputCtx.state === 'closed') {
                            console.warn('Audio context closed during live session, skipping audio playback.');
                            return;
                        }
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const source = await playAudio(base64Audio);
                        
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                            if (audioSourcesRef.current.size === 0) {
                                setSessionState('live');
                            }
                        });
                        
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += source.buffer.duration / voiceSettings.rate;
                        audioSourcesRef.current.add(source);
                    }
                },
                onerror: (e: ErrorEvent) => { console.error('Session error:', e); setError(content[language].errorSession); addToast(content[language].errorSession, 'error'); disconnect(); },
                onclose: () => { disconnect(); }
            }
        });
        sessionRef.current = await sessionPromise;
    } catch (err) {
        console.error('Failed to start live session:', err);
        setError(err instanceof Error ? err.message : content[language].errorStart);
        addToast(err instanceof Error ? err.message : content[language].errorStart, 'error');
        disconnect();
    }
  }, [disconnect, language, voiceSettings]);
  
  const startTurnBasedConversation = useCallback(async (initialText = '') => {
    if (!SpeechRecognitionAPI) { setError(content[language].errorBrowserSupport); return; }
    if (!currentConversationId) setCurrentConversationId(Date.now().toString());

    if (initialText) {
      setTranscript([{ speaker: 'user', text: initialText, isFinal: true, timestamp: Date.now() }]);
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
        else if (text) newTranscript.push({ speaker: 'user', text, isFinal: false, timestamp: Date.now() });
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
          finalTranscript[lastMsgIndex] = { ...lastMsg, isFinal: true, timestamp: Date.now() };
          processUserTurn(lastMsg.text);
          return finalTranscript;
      });
    };
    recognition.start();
  }, [language, currentConversationId, processUserTurn]);

  const handleSuggestionClick = (suggestion) => {
      if (sessionState !== 'idle') return;
      startTurnBasedConversation(suggestion);
  };
  
  const handleTopicClick = (topic) => {
    if (sessionState !== 'idle') disconnect();
    const prompt = language === 'hi' ? `मुझे ${topic} के बारे में बताएं` : `Tell me about ${topic}`;
    startTurnBasedConversation(prompt);
  };
  
  const handleButtonClick = () => {
    if (sessionState !== 'idle') { disconnect(); } 
    else {
      if (!currentConversationId) setCurrentConversationId(Date.now().toString());
      if (mode === 'standard') startLiveConversation();
      else startTurnBasedConversation();
    }
  };

  const handleDownloadChat = () => {
    const content = transcript.map(m => `[${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${m.speaker === 'user' ? 'User' : 'Guru'}: ${m.text}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civic-sense-chat-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('Chat exported successfully!', 'success');
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => addToast('Link copied to clipboard!', 'success'))
      .catch(() => addToast('Failed to copy link.', 'error'));
  };

  const handlePinMessage = (message: TranscriptMessage) => {
    if (pinnedMessages.length >= 10) {
      addToast('You can only pin up to 10 messages.', 'error');
      return;
    }
    if (pinnedMessages.some(p => p.timestamp === message.timestamp)) {
        addToast('Message already pinned.', 'info');
        return;
    }
    const newPin: PinnedMessage = { ...message, pinnedAt: Date.now() };
    setPinnedMessages(prev => [...prev, newPin].sort((a,b) => b.pinnedAt - a.pinnedAt));
    addToast('Message pinned!', 'success');
  };

  const handleUnpinMessage = (timestamp: number) => {
    setPinnedMessages(prev => prev.filter(p => p.timestamp !== timestamp));
    addToast('Message unpinned.', 'success');
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
        case 'processing': return content[language].statusAnalyzing;
        default: return content[language].statusIdle;
    }
  };

  const closeOnboarding = () => {
      setShowOnboarding(false);
      try { localStorage.setItem('civic-sense-guru-onboarding-seen', 'true'); } catch(e) { console.error(e); }
  }
  
  const currentContent = content[language][mode];
  const isTransacting = sessionState !== 'idle';
  const topicContent = content[language].topics;
  const topics = [
      { id: 'traffic', icon: TrafficIcon, text: topicContent.traffic },
      { id: 'hygiene', icon: HygieneIcon, text: topicContent.hygiene },
      { id: 'waste', icon: WasteIcon, text: topicContent.waste },
      { id: 'transport', icon: TransportIcon, text: topicContent.transport },
      { id: 'democracy', icon: DemocracyIcon, text: topicContent.democracy },
  ];

  const MicStateClasses = {
    idle: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    connecting: 'bg-gradient-to-br from-yellow-400 to-amber-500',
    live: 'bg-gradient-to-br from-green-400 to-emerald-500',
    recording: 'bg-gradient-to-br from-green-400 to-emerald-500',
    processing: 'bg-gradient-to-br from-yellow-400 to-amber-500',
    speaking: 'bg-gradient-to-br from-purple-500 to-fuchsia-600',
  };

  const ToastContainer = () => (
    <div className="fixed top-5 right-5 z-[100] space-y-2">
      {toasts.map(toast => (
        <div key={toast.id} className={`flex items-center gap-3 px-4 py-2 rounded-lg shadow-lg text-white animate-slideInUp ${
          toast.type === 'success' ? 'bg-green-500' :
          toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToasts(p => p.filter(t => t.id !== toast.id))}><CloseIcon c="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );

  const VoiceSettingsModal = ({ isOpen, onClose }) => {
    const [localSettings, setLocalSettings] = useState(voiceSettings);
    useEffect(() => setLocalSettings(voiceSettings), [isOpen]);

    const handleSave = () => {
        setVoiceSettings(localSettings);
        localStorage.setItem('civic-sense-guru-voice-settings', JSON.stringify(localSettings));
        addToast('Settings saved!', 'success');
        onClose();
    };

    const handleReset = () => {
        const defaults = { rate: 1.0, pitch: 1.0, volume: 0.8 };
        setLocalSettings(defaults);
    };

    const handleTest = async () => {
        if (!aiRef.current) return;
        addToast('Generating test audio...', 'info');
        const ttsResponse = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: "This is a test of the current voice settings." }] }], config: { responseModalities: [Modality.AUDIO] }
        });
        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if(base64Audio) {
            // Temporarily use local settings for playback test
            const tempGainValue = gainNodeRef.current?.gain.value;
            const tempRateValue = audioSourcesRef.current.values().next().value?.playbackRate.value;
            
            let outputCtx = outputAudioContextRef.current;
            if (!outputCtx || outputCtx.state === 'closed') {
              outputCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
              outputAudioContextRef.current = outputCtx;
            }
             if(!gainNodeRef.current || gainNodeRef.current.context !== outputCtx) {
                gainNodeRef.current = outputCtx.createGain();
                gainNodeRef.current.connect(outputCtx.destination);
            }
            gainNodeRef.current.gain.value = localSettings.volume;
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
            const sourceNode = outputCtx.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.playbackRate.value = localSettings.rate;
            sourceNode.connect(gainNodeRef.current);
            sourceNode.start();
            sourceNode.onended = () => {
                if (tempGainValue !== undefined) gainNodeRef.current.gain.value = tempGainValue;
            };
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 text-left animate-slideInUp" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Voice Settings</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700"><CloseIcon c="w-5 h-5" /></button>
                </div>
                <div className="space-y-6">
                    <div>
                        <label htmlFor="rate" className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300"><span>Speaking Speed</span><span>{localSettings.rate.toFixed(1)}x</span></label>
                        <input id="rate" type="range" min="0.5" max="2.0" step="0.1" value={localSettings.rate} onChange={e => setLocalSettings(s => ({...s, rate: parseFloat(e.target.value)}))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                    </div>
                    <div>
                        <label htmlFor="pitch" className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300"><span>Voice Pitch</span><span>{localSettings.pitch.toFixed(1)}</span></label>
                        <input id="pitch" type="range" min="0.5" max="2.0" step="0.1" value={localSettings.pitch} onChange={e => setLocalSettings(s => ({...s, pitch: parseFloat(e.target.value)}))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                    </div>
                    <div>
                        <label htmlFor="volume" className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300"><span>Volume</span><span>{Math.round(localSettings.volume * 100)}%</span></label>
                        <input id="volume" type="range" min="0" max="1" step="0.01" value={localSettings.volume} onChange={e => setLocalSettings(s => ({...s, volume: parseFloat(e.target.value)}))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                    </div>
                </div>
                <div className="mt-8 flex gap-3">
                    <button onClick={handleReset} className="w-full px-4 py-2 rounded-lg font-semibold bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">Reset</button>
                    <button onClick={handleTest} className="w-full px-4 py-2 rounded-lg font-semibold bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">Test</button>
                    <button onClick={handleSave} className="w-full px-4 py-2 rounded-lg font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors">Apply</button>
                </div>
            </div>
        </div>
    );
  };
  
   const PinnedMessagesPanel = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full h-[70vh] flex flex-col p-6 text-left animate-slideInUp" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Pinned Messages</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700"><CloseIcon c="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto pr-2">
                    {pinnedMessages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-500">No messages pinned yet.</div>
                    ) : (
                        <div className="space-y-4">
                            {pinnedMessages.map(msg => (
                                <div key={msg.timestamp} className="bg-gray-100 dark:bg-slate-700 p-4 rounded-lg">
                                    <p className="text-gray-800 dark:text-gray-200">{msg.text}</p>
                                    <div className="flex justify-between items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        <span>Pinned on {new Date(msg.pinnedAt).toLocaleDateString()}</span>
                                        <button onClick={() => handleUnpinMessage(msg.timestamp)} className="text-red-500 hover:underline">Unpin</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };

  return (
    <>
     <style>{`
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .animate-pulse-logo { animation: pulse 2.5s infinite; }
        @keyframes breathe { 0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(0,0,0,0.2); } 50% { transform: scale(1.03); box-shadow: 0 10px 25px rgba(0,0,0,0.3); } }
        .animate-breathe { animation: breathe 4s ease-in-out infinite; }
        @keyframes slideInUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-slideInUp { animation: slideInUp 0.5s ease-out forwards; }
        .slide-in-stagger > * { animation-delay: calc(var(--stagger-index) * 80ms); }
     `}</style>
    <div className={`flex h-screen w-screen font-sans transition-colors duration-500 overflow-hidden ${theme === 'light' ? 'bg-gradient-to-br from-white to-sky-100 text-[#1e293b]' : 'bg-gradient-to-br from-slate-900 to-slate-800 text-gray-200'}`}>
      <aside className={`absolute lg:relative z-40 h-full w-72 bg-white/70 dark:bg-slate-900/70 backdrop-blur-lg border-r border-gray-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800 flex-shrink-0">
              <h2 className="text-xl font-bold">History</h2>
              <button onClick={startNewConversation} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-sm font-semibold active:scale-95 transition-all">New Chat</button>
          </div>
          <div className="flex-1 overflow-y-auto">
              {history.sort((a,b) => b.timestamp - a.timestamp).map(c => (
                  <button key={c.id} onClick={() => loadConversation(c.id)} className={`w-full text-left px-4 py-3 truncate transition-colors ${currentConversationId === c.id ? 'bg-blue-100 dark:bg-blue-900/50' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{c.title}</p>
                      <p className="text-xs text-gray-500">{new Date(c.timestamp).toLocaleString()}</p>
                  </button>
              ))}
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex-shrink-0">
              <button onClick={clearHistory} className="w-full text-center p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 active:scale-95 transition-colors">Clear History</button>
          </div>
      </aside>

      <div className="flex flex-col flex-1 relative">
        <header className="p-3 flex justify-between items-center gap-4 border-b border-gray-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsHistoryOpen(!isHistoryOpen)} className="p-3 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 lg:hidden active:scale-95 transition-transform"><MenuIcon c="w-6 h-6"/></button>
            <div className="flex items-center gap-2">
                <div className="text-2xl animate-pulse-logo">🇮🇳</div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{currentContent.title}</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{currentContent.description}</p>
                </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-1 p-1 bg-gray-200 dark:bg-slate-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-slate-700">
                  {(['standard', 'quick', 'deep'] as Mode[]).map(m => <button key={m} onClick={() => handleModeChange(m)} disabled={isTransacting} className={`px-3 py-1 rounded-md text-sm font-semibold transition-all capitalize ${mode === m ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>{m}</button>)}
              </div>
              <div className="hidden sm:flex items-center gap-1 p-1 bg-gray-200 dark:bg-slate-900 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-slate-700">
                  <button onClick={() => handleLanguageChange('en')} disabled={isTransacting} className={`px-2 py-1 rounded-md text-sm font-semibold transition-all ${language === 'en' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>EN</button>
                  <button onClick={() => handleLanguageChange('hi')} disabled={isTransacting} className={`px-2 py-1 rounded-md text-sm font-semibold transition-all ${language === 'hi' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white' : 'text-gray-500 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>HI</button>
              </div>
              <div className="flex items-center gap-2">
                <button title="Search (Coming Soon)" className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-slate-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-700 transition-colors active:scale-95"><SearchIcon c="w-5 h-5" /></button>
                <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-slate-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-700 transition-colors active:scale-95" aria-label="Toggle theme">{theme === 'dark' ? <SunIcon c="w-5 h-5" /> : <MoonIcon c="w-5 h-5" />}</button>
                 <div className={`w-3 h-3 rounded-full transition-colors ${error ? 'bg-red-500' : (isTransacting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500')}`} title={error ? 'Error' : (isTransacting ? 'Connected' : 'Idle')}></div>
              </div>
          </div>
        </header>
        
        <main ref={transcriptContainerRef} className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 relative">
          {transcript.length === 0 && !isTransacting && !error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 animate-fadeIn">
              <div className="mb-4 text-6xl">🇮🇳</div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200">{content[language].welcomeTitle}</h2>
              <p className="max-w-md mt-2">{content[language].welcomeBody}</p>
            </div>
          ) : (
            <div className="max-w-3xl w-full mx-auto space-y-6">
              {transcript.map((msg, index) => (
                <div key={index} className={`flex items-end gap-3 animate-slideInUp ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.speaker === 'model' && <AiIcon />}
                  <div className={`relative group max-w-md lg:max-w-xl px-4 py-3 rounded-2xl shadow-md ${msg.speaker === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 dark:bg-slate-700 dark:text-white rounded-bl-none'}`}>
                    <p className={!msg.isFinal ? 'opacity-70' : ''}>{msg.text}</p>
                    <span className={`text-xs mt-1 block text-right ${msg.speaker === 'user' ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="absolute -top-3 -right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {msg.speaker === 'model' && <button onClick={() => handlePinMessage(msg)} className="p-1.5 bg-gray-300 dark:bg-slate-600 rounded-full active:scale-95"><PinIcon c="w-4 h-4" /></button>}
                      <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 bg-gray-300 dark:bg-slate-600 rounded-full active:scale-95"><CopyIcon c="w-4 h-4" /></button>
                    </div>
                  </div>
                   {msg.speaker === 'user' && <UserIcon />}
                </div>
              ))}
              {isThinking && (<div className="flex items-end gap-3 justify-start"><AiIcon /><div className="w-64 max-w-md lg:max-w-lg p-4 rounded-2xl bg-white dark:bg-slate-700 shadow-md space-y-2"><div className="h-3 bg-gray-200 dark:bg-slate-600 rounded-full animate-pulse"></div><div className="h-3 w-5/6 bg-gray-200 dark:bg-slate-600 rounded-full animate-pulse"></div></div></div>)}
              {error && (<div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 text-red-500 ring-1 ring-red-500/20"><RetryIcon c="w-6 h-6 flex-shrink-0" /><div className="flex-1"><p className="font-semibold">Oops, something went wrong!</p><p className="text-sm">{error}</p></div><button onClick={handleRetry} className="ml-4 px-3 py-1.5 rounded-md bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95">{content[language].retry}</button></div>)}
            </div>
          )}
          {showScrollDown && <button onClick={() => transcriptContainerRef.current?.scrollTo({ top: transcriptContainerRef.current.scrollHeight, behavior: 'smooth' })} className="absolute bottom-24 right-8 z-10 w-12 h-12 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform"><ChevronDownIcon c="w-6 h-6" /></button>}
        </main>

        <footer className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border-t border-gray-200/50 dark:border-slate-800/50">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex flex-wrap justify-center gap-2 mb-2 slide-in-stagger">
              {transcript.length === 0 && !isTransacting ? topics.map((topic, i) => (<button key={topic.id} style={{ '--stagger-index': i }} onClick={() => handleTopicClick(topic.text)} disabled={isTransacting} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 rounded-full shadow-sm ring-1 ring-gray-200 dark:ring-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-1 active:scale-95 animate-slideInUp"><svg className="w-5 h-5" viewBox="0 0 24 24"><topic.icon c="text-[20px]" /></svg>{topic.text}</button>))
              : suggestions.map((s, i) => <button key={i} style={{ '--stagger-index': i }} onClick={() => handleSuggestionClick(s)} className="px-3 py-2 text-sm font-medium bg-gray-200 dark:bg-slate-700 rounded-full hover:bg-gray-300 dark:hover:bg-slate-600 active:scale-95 transition-all animate-slideInUp">{s}</button>)
              }
            </div>
            <div className="relative">
              <button onClick={handleButtonClick} disabled={sessionState === 'connecting'} className={`relative w-24 h-24 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out shadow-xl transform active:scale-95 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-black ${MicStateClasses[sessionState]} ${sessionState === 'idle' ? 'animate-breathe' : ''}`}>{isTransacting ? <StopIcon c="w-10 h-10" /> : <MicIcon c="w-12 h-12" />}</button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium h-5">{getStatusText()}</p>
             <div className="hidden sm:flex text-xs text-gray-400 dark:text-gray-500 items-center gap-4">
                 <span>About</span><span>|</span><span>Help</span><span>|</span><span>Privacy</span><span className="font-bold">|</span><span>Made with ❤️ in India</span><span>|</span><span>v1.0.0</span>
            </div>
          </div>
        </footer>
      </div>
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-4">
          <button onClick={() => setIsSettingsOpen(true)} title="Voice Settings" className="w-14 h-14 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform"><SettingsIcon c="w-6 h-6" /></button>
          <button onClick={() => setIsPinnedPanelOpen(true)} title="Pinned Messages" className="w-14 h-14 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform"><PinnedIcon c="w-6 h-6" /></button>
          <button onClick={handleShare} title="Share Chat" className="w-14 h-14 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform"><ShareIcon c="w-6 h-6" /></button>
          <button onClick={handleDownloadChat} disabled={transcript.length === 0} title="Export Chat" className="w-14 h-14 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"><DownloadIcon c="w-6 h-6" /></button>
          <button onClick={startNewConversation} title="New Chat" className="w-14 h-14 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:scale-110 active:scale-100 transition-transform"><NewChatIcon c="w-6 h-6" /></button>
      </div>

       {showOnboarding && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-fadeIn">
            {onboardingStep === 0 && <>
              <h2 className="text-2xl font-bold mb-2">Welcome to Civic Sense Guru!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">Your personal AI guide to becoming a better citizen.</p>
              <button onClick={() => setOnboardingStep(1)} className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-600 transition-colors">Let's Get Started</button>
            </>}
            {onboardingStep === 1 && <>
              <MicIcon c="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Tap the Mic</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">Press the large microphone button to start a voice conversation at any time.</p>
              <button onClick={() => setOnboardingStep(2)} className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-600 transition-colors">Next</button>
            </>}
             {onboardingStep === 2 && <>
              <div className="flex justify-center gap-2 mb-4">
                <span className="px-3 py-1 bg-gray-200 dark:bg-slate-700 rounded-full text-sm">Standard</span>
                <span className="px-3 py-1 bg-gray-200 dark:bg-slate-700 rounded-full text-sm">Quick</span>
                <span className="px-3 py-1 bg-gray-200 dark:bg-slate-700 rounded-full text-sm">Deep</span>
              </div>
              <h2 className="text-xl font-bold mb-2">Choose Your Mode</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">Switch between conversation modes or languages using the toggles in the header.</p>
              <button onClick={() => setOnboardingStep(3)} className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-600 transition-colors">Next</button>
            </>}
            {onboardingStep === 3 && <>
              <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">Try asking: "What are some basic traffic rules for pedestrians?"</p>
              <button onClick={closeOnboarding} className="w-full bg-green-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-600 transition-colors">Start Learning</button>
            </>}
             <button onClick={closeOnboarding} className="text-xs text-gray-400 hover:underline mt-4">Skip Tutorial</button>
          </div>
        </div>
      )}
      <ToastContainer />
      <VoiceSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PinnedMessagesPanel isOpen={isPinnedPanelOpen} onClose={() => setIsPinnedPanelOpen(false)} />
    </div>
    </>
  );
};

export default App;
