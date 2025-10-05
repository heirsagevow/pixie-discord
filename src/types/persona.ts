export interface Memory {
  type: 'conversation' | 'event' | 'emotion';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ChatRules {
  allowed_topics: string[];
  forbidden_topics: string[];
  response_style: string[];
  conversation_guidelines: string[];
}

export interface Behavior {
  personality_traits: string[];
  emotional_range: string[];
  interaction_preferences: string[];
  conversation_style: string[];
}

export interface PersonaMetadata {
  id: string;
  name: string;
  role: string;
  background: string;
  speech_patterns: string[];
  chat_rules: ChatRules;
  behavior: Behavior;
  memories?: Memory[];
  voice_settings?: {
    language_code: string;
  };
}
