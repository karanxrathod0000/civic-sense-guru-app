
export interface TranscriptMessage {
  speaker: 'user' | 'model';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface Conversation {
  id: string;
  timestamp: number;
  title: string;
  messages: TranscriptMessage[];
  topicId?: TopicId;
}

// --- New Gamification & Profile Types ---

export type TopicId = 'traffic' | 'hygiene' | 'waste' | 'transport' | 'democracy';

export interface TopicProgress {
    completed: number;
    total: 10;
}

export type LearningProgress = Record<TopicId, TopicProgress>;

export interface StreakData {
    current: number;
    longest: number;
    lastVisit: string; // ISO string
}

export interface Badge {
    id: string;
    name: string;
    description: string;
    earnedDate: string; // ISO string
    icon: string; // Emoji
}

export interface UserProfile {
    username: string;
    points: number;
}

export interface LeaderboardEntry {
    id: string;
    username: string;
    points: number;
    streak: number;
    isCurrentUser?: boolean;
}
