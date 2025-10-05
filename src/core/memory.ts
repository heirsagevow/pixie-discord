import { Redis } from "ioredis";
import { cfg } from "../utils/config.js";

export interface Memory {
  type: "conversation" | "event" | "emotion";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class MemoryService {
  private redis: Redis;
  private readonly maxMemories = 100;
  private isInitialized = false;

  constructor() {
    this.redis = new Redis(cfg.REDIS_URL, {
      password: cfg.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Retrying Redis connection in ${delay}ms...`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on("error", (error: Error) => {
      console.error("Redis connection error:", error);
    });

    this.redis.on("connect", () => {
      console.log("Connected to Redis");
      this.isInitialized = true;
    });
  }

  private getKey(userId: string, type: Memory["type"]): string {
    return `memory:${userId}:${type}`;
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Memory service not initialized");
    }
  }

  async addMemory(
    userId: string,
    memory: Omit<Memory, "timestamp">
  ): Promise<void> {
    await this.ensureConnection();

    try {
      const key = this.getKey(userId, memory.type);
      const fullMemory: Memory = {
        ...memory,
        timestamp: Date.now(),
      };

      await this.redis.lpush(key, JSON.stringify(fullMemory));
      await this.redis.ltrim(key, 0, this.maxMemories - 1);
    } catch (error: unknown) {
      console.error("Failed to add memory:", error);
      throw new Error("Failed to store memory");
    }
  }

  async getMemories(
    userId: string,
    type: Memory["type"],
    limit = 10
  ): Promise<Memory[]> {
    await this.ensureConnection();

    try {
      const key = this.getKey(userId, type);
      const memories = await this.redis.lrange(key, 0, limit - 1);

      return memories
        .map((m: string) => {
          try {
            return JSON.parse(m) as Memory;
          } catch {
            console.warn("Failed to parse memory:", m);
            return null;
          }
        })
        .filter((m): m is Memory => m !== null);
    } catch (error: unknown) {
      console.error("Failed to get memories:", error);
      return [];
    }
  }

  async searchMemories(
    userId: string,
    type: Memory["type"],
    query: string
  ): Promise<Memory[]> {
    await this.ensureConnection();

    try {
      const memories = await this.getMemories(userId, type, this.maxMemories);
      const lowerQuery = query.toLowerCase();

      return memories.filter(
        (m) =>
          m.content.toLowerCase().includes(lowerQuery) ||
          JSON.stringify(m.metadata).toLowerCase().includes(lowerQuery)
      );
    } catch (error: unknown) {
      console.error("Failed to search memories:", error);
      return [];
    }
  }

  async clearMemories(userId: string, type?: Memory["type"]): Promise<void> {
    await this.ensureConnection();

    try {
      if (type) {
        await this.redis.del(this.getKey(userId, type));
      } else {
        const types: Memory["type"][] = ["conversation", "event", "emotion"];
        await Promise.all(
          types.map((t) => this.redis.del(this.getKey(userId, t)))
        );
      }
    } catch (error: unknown) {
      console.error("Failed to clear memories:", error);
      throw new Error("Failed to clear memories");
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
      this.isInitialized = false;
    } catch (error) {
      console.error("Failed to close Redis connection:", error);
      throw new Error("Failed to close memory service");
    }
  }
}

