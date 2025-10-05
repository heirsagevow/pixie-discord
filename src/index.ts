import { DiscordBot } from "./core/discord.js";
import { AIEngine } from "./core/ai-engine.js";
import { aiConfig } from "./utils/config.js";

async function main() {
  try {
    // Initialize AI Engine
    const aiEngine = new AIEngine();
    await aiEngine.initialize(aiConfig as any);

    // Initialize Discord Bot
    const bot = new DiscordBot();
    bot.setAIEngine(aiEngine);

    // Start the bot
    await bot.start();

    // Handle shutdown gracefully
    process.on("SIGINT", async () => {
      console.log("\nReceived SIGINT. Shutting down gracefully...");
      await bot.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nReceived SIGTERM. Shutting down gracefully...");
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

main();
