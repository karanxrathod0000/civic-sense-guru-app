
export interface TranscriptMessage {
  speaker: 'user' | 'model';
  text: string;
  isFinal: boolean;
}

export interface Conversation {
  id: string;
  timestamp: number;
  title: string;
  messages: TranscriptMessage[];
}
