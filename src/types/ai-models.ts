export type EmotionType = 'happy' | 'sad' | 'angry' | 'confused' | 'neutral';

export interface EmotionalResponse {
  emotion: EmotionType;
  intensity: number;
  confidence: number;
}

export interface AIResponse {
  text: string;
  model_name: string;
  emotional_response: EmotionalResponse;
}

export interface ModelConfig {
  api_keys: string[];
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  current_key_index?: number;
  model_path?: string;
  model_type?: string;
}

export type AIModelType = 'gemini' | 'openai' | 'anthropic' | 'local';

export interface AIModel {
  name: string;
  initialize(config: ModelConfig): Promise<void>;
  generateResponse(prompt: string, context?: string[]): Promise<AIResponse>;
  rotateApiKey(): void;
  isAvailable(): boolean;
  getUsage(): { tokens: number; requests: number };
}