import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "dotenv/config";

export const cfg = createEnv({
  server: {
    // Discord Configuration
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),
    
    // LiveKit Configuration
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),
    LIVEKIT_URL: z.string().url(),
    
    // Redis Configuration
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    REDIS_PASSWORD: z.string().optional(),
    
    // AI Model Configuration
    DEFAULT_AI_MODEL: z.enum(["gemini", "openai", "anthropic", "local"]).default("gemini"),
    
    // Gemini Configuration (Optional)
    GEMINI_API_KEYS: z
      .string()
      .transform((str) => str ? str.split(",").map((s) => s.trim()).filter(Boolean) : [])
      .optional(),
    
    // OpenAI Configuration (Optional)
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-3.5-turbo"),
    
    // Anthropic Configuration (Optional)
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-2"),
    
    // Persona Settings
    DEFAULT_PERSONA: z.string().default("pixie"),
    
    // Optional local model settings
    LOCAL_MODEL_PATH: z.string().optional(),
    LOCAL_MODEL_TYPE: z.string().optional(),
  },
  runtimeEnv: process.env,
});

// AI Model configurations
export const aiConfig = {
  gemini: cfg.GEMINI_API_KEYS ? {
    api_keys: cfg.GEMINI_API_KEYS,
    model_name: "gemini-pro",
    temperature: 0.9,
    max_tokens: 300,
  } : null,
  openai: cfg.OPENAI_API_KEY ? {
    api_keys: [cfg.OPENAI_API_KEY],
    model_name: cfg.OPENAI_MODEL,
    temperature: 0.9,
    max_tokens: 300,
  } : null,
  anthropic: cfg.ANTHROPIC_API_KEY ? {
    api_keys: [cfg.ANTHROPIC_API_KEY],
    model_name: cfg.ANTHROPIC_MODEL,
    temperature: 0.9,
    max_tokens: 300,
  } : null,
  local: cfg.LOCAL_MODEL_PATH ? {
    model_path: cfg.LOCAL_MODEL_PATH,
    model_type: cfg.LOCAL_MODEL_TYPE,
  } : null,
} as const;
