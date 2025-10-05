import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIModel, AIResponse, ModelConfig, AIModelType } from "../types/ai-models.js";
import type { PersonaMetadata } from "../types/persona.js";

class GeminiModel implements AIModel {
  private client: GoogleGenerativeAI | null = null;
  private config: ModelConfig | null = null;
  private usage = { tokens: 0, requests: 0 };
  name = "gemini" as const;

  async initialize(config: ModelConfig): Promise<void> {
    if (!config.api_keys?.length) {
      throw new Error("No API keys provided for Gemini model");
    }
    this.config = config;
    this.rotateApiKey();
  }

  private initializeClient(): void {
    if (!this.config?.api_keys?.length) {
      throw new Error("Model not initialized or no API keys available");
    }
    const apiKey = this.config.api_keys[this.config.current_key_index || 0];
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(prompt: string, context: string[] = []): Promise<AIResponse> {
    if (!this.client || !this.config) {
      throw new Error("Model not initialized");
    }

    try {
      const model = this.client.getGenerativeModel({ model: this.config.model_name || "gemini-pro" });
      const result = await model.generateContent([...context, prompt]);
      const response = result.response;
      const text = response.text();
      
      this.usage.requests++;
      // Rough estimation since Gemini doesn't provide token count
      this.usage.tokens += Math.ceil(text.length / 4);

      return {
        text,
        model_name: this.name,
        emotional_response: this.analyzeEmotion(text),
      };
    } catch (error) {
      console.error("Error generating response:", error);
      if (this.isRateLimitError(error)) {
        console.log("Rate limit hit, rotating API key...");
        this.rotateApiKey();
        return this.generateResponse(prompt, context);
      }
      throw error;
    }
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.toLowerCase().includes("quota") || error.message.toLowerCase().includes("rate limit");
    }
    return false;
  }

  private analyzeEmotion(text: string): AIResponse["emotional_response"] {
    const emotions = {
      happy: ["happy", "joy", "excited", "glad", "😊", "😃"],
      sad: ["sad", "sorry", "unfortunate", "regret", "😢", "😔"],
      angry: ["angry", "upset", "frustrated", "annoyed", "😠", "😡"],
      confused: ["confused", "unsure", "maybe", "perhaps", "🤔", "😕"],
      neutral: ["neutral", "okay", "fine", "normal", "🙂", "😐"],
    } as const;

    let maxEmotion: keyof typeof emotions = "neutral";
    let maxCount = 0;
    const textLower = text.toLowerCase();

    for (const [emotion, keywords] of Object.entries(emotions)) {
      const count = keywords.reduce((acc, keyword) => 
        acc + (textLower.match(new RegExp(keyword, "g"))?.length || 0), 0);
      if (count > maxCount) {
        maxCount = count;
        maxEmotion = emotion as keyof typeof emotions;
      }
    }

    return {
      emotion: maxEmotion,
      intensity: Math.min(maxCount / 5, 1),
      confidence: 0.7,
    };
  }

  rotateApiKey(): void {
    if (!this.config?.api_keys?.length) {
      throw new Error("No API keys available");
    }
    this.config.current_key_index = ((this.config.current_key_index || 0) + 1) % this.config.api_keys.length;
    this.initializeClient();
  }

  isAvailable(): boolean {
    return this.client !== null && (this.config?.api_keys?.length || 0) > 0;
  }

  getUsage(): { tokens: number; requests: number } {
    return { ...this.usage };
  }
}

export class AIEngine {
  private models: Map<AIModelType, AIModel> = new Map();
  private activeModel: AIModel | null = null;
  private persona: PersonaMetadata | null = null;
  private conversationHistory: Map<string, string[]> = new Map();
  private readonly maxHistoryPairs = 10;

  constructor() {
    // Register Gemini as default model
    this.registerModel("gemini", new GeminiModel());
  }

  registerModel(type: AIModelType, model: AIModel): void {
    this.models.set(type, model);
  }

  async initialize(config: Partial<Record<AIModelType, ModelConfig | undefined>>, defaultModel: AIModelType = "gemini"): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [type, modelConfig] of Object.entries(config)) {
      const model = this.models.get(type as AIModelType);
      if (model && modelConfig) {
        initPromises.push(model.initialize(modelConfig));
      }
    }

    try {
      await Promise.all(initPromises);
    } catch (error) {
      console.error("Failed to initialize AI models:", error);
      throw new Error("Failed to initialize AI models");
    }

    const defaultModelInstance = this.models.get(defaultModel);
    if (!defaultModelInstance?.isAvailable()) {
      throw new Error(`Default model ${defaultModel} is not available`);
    }
    this.activeModel = defaultModelInstance;
  }

  setPersona(persona: PersonaMetadata): void {
    this.persona = persona;
  }

  private getContextForUser(userId: string): string[] {
    return this.conversationHistory.get(userId) || [];
  }

  private updateContext(userId: string, message: string, response: string): void {
    const history = this.getContextForUser(userId);
    history.push(`User: ${message}`, `Assistant: ${response}`);
    
    // Keep only last N message pairs
    if (history.length > this.maxHistoryPairs * 2) {
      history.splice(0, 2); // Remove oldest Q&A pair
    }
    
    this.conversationHistory.set(userId, history);
  }

  async generateResponse(userId: string, message: string): Promise<AIResponse> {
    if (!this.activeModel) {
      throw new Error("No active AI model");
    }
    if (!this.persona) {
      throw new Error("No persona set");
    }

    const context = [
      `You are ${this.persona.name}, ${this.persona.role}. ${this.persona.background}`,
      `Speaking style: ${this.persona.speech_patterns.join(", ")}`,
      ...this.getContextForUser(userId)
    ];

    try {
      const response = await this.activeModel.generateResponse(message, context);
      this.updateContext(userId, message, response.text);
      return response;
    } catch (error) {
      console.error("Primary model failed:", error);
      
      // Try other available models if primary fails
      for (const model of this.models.values()) {
        if (model !== this.activeModel && model.isAvailable()) {
          try {
            console.log(`Trying fallback model: ${model.name}`);
            const response = await model.generateResponse(message, context);
            this.activeModel = model; // Switch to working model
            this.updateContext(userId, message, response.text);
            return response;
          } catch (fallbackError) {
            console.error(`Fallback model ${model.name} failed:`, fallbackError);
            continue;
          }
        }
      }
      throw new Error("All AI models failed to generate response");
    }
  }

  async switchModel(type: AIModelType): Promise<boolean> {
    const model = this.models.get(type);
    if (model?.isAvailable()) {
      this.activeModel = model;
      return true;
    }
    return false;
  }

  getActiveModel(): string {
    return this.activeModel?.name || "none";
  }

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }
}
