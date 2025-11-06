
export interface TranscriptMessage {
  speaker: 'user' | 'model';
  text: string;
  isFinal: boolean;
  // Fix: Add timestamp property to TranscriptMessage. The property is used when creating messages but was missing in the type definition.
  timestamp: number;
}

export interface Conversation {
  id: string;
  timestamp: number;
  title: string;
  messages: TranscriptMessage[];
}