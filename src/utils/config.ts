import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "dotenv/config";

export const cfg = createEnv({
  server: {
    // Discord Configuration
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),

    // Deepgram Configuration (for STT & TTS)
    DEEPGRAM_API_KEY: z.string().min(1),

    // Redis Configuration (Optional - for memory)
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    REDIS_PASSWORD: z.string().optional(),

    // AI Model Configuration
    DEFAULT_AI_MODEL: z
      .enum(["gemini", "openai", "anthropic"])
      .default("gemini"),

    // Gemini Configuration (Optional)
    GEMINI_API_KEYS: z
      .string()
      .transform((str) =>
        str
          ? str
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : []
      )
      .optional(),

    // OpenAI Configuration (Optional)
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-3.5-turbo"),

    // Anthropic Configuration (Optional)
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-3-sonnet-20240229"),

    // Persona Settings
    DEFAULT_PERSONA: z.string().default("pixie"),

    // Voice Settings
    TTS_VOICE: z.string().default("aura-asteria-id"), // Deepgram Indonesian voice
    STT_LANGUAGE: z.string().default("id"),

    // VAD Settings
    VAD_ENABLED: z
      .string()
      .transform((v) => v === "true")
      .default(true),
    VAD_SILENCE_THRESHOLD: z
      .string()
      .transform((v) => parseInt(v))
      .default(500),
  },
  runtimeEnv: process.env,
});

// AI Model configurations
export const aiConfig = {
  gemini:
    cfg.GEMINI_API_KEYS && cfg.GEMINI_API_KEYS.length > 0
      ? {
          api_keys: cfg.GEMINI_API_KEYS,
          model_name: "gemini-pro",
          temperature: 0.9,
          max_tokens: 300,
        }
      : null,
  openai: cfg.OPENAI_API_KEY
    ? {
        api_keys: [cfg.OPENAI_API_KEY],
        model_name: cfg.OPENAI_MODEL,
        temperature: 0.9,
        max_tokens: 300,
      }
    : null,
  anthropic: cfg.ANTHROPIC_API_KEY
    ? {
        api_keys: [cfg.ANTHROPIC_API_KEY],
        model_name: cfg.ANTHROPIC_MODEL,
        temperature: 0.9,
        max_tokens: 300,
      }
    : null,
} as const;
