import { 
  Client, 
  Events, 
  GatewayIntentBits,
  Message,
  ChatInputCommandInteraction,
  Collection,
  REST,
  Routes,
} from "discord.js";
import { cfg } from "../utils/config.js";
import { LiveKitService } from "./livekit.js";
import { AIEngine } from "./ai-engine.js";
import { PersonaMetadata } from "../types/persona.js";
import { 
  joinCommand,
  leaveCommand,
  infoCommand,
  helpCommand,
  aiCommand,
  handleJoinCommand,
  handleLeaveCommand,
  handleInfoCommand,
  handleHelpCommand,
  handleAICommand,
  initializeServices
} from "./commands.js";

export class DiscordBot {
  private readonly client: Client;
  private readonly livekit: LiveKitService;
  private readonly commands: Collection<string, any>;
  private aiEngine: AIEngine | null = null;
  private currentPersona: PersonaMetadata | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.livekit = new LiveKitService();
    this.commands = new Collection();
    
    // Load default persona (pixie)
    this.loadPersona("pixie");
    
    this.setupCommands();
    this.setupEventHandlers();
  }
  
  private async loadPersona(personaId: string): Promise<void> {
    try {
      // Import persona dynamically from the personas directory
      const personaModule = await import(`../personas/${personaId}.json`, { assert: { type: "json" } });
      this.currentPersona = personaModule.default;
      console.log(`Loaded persona: ${this.currentPersona?.name}`);
    } catch (error) {
      console.error(`Failed to load persona ${personaId}:`, error);
      // Set a basic fallback persona if loading fails
      this.currentPersona = {
        id: "pixie",
        name: "Pixie",
        role: "AI Assistant",
        background: "I'm an AI-powered voice assistant.",
        speech_patterns: [],
        chat_rules: {
          allowed_topics: [],
          forbidden_topics: [],
          response_style: [],
          conversation_guidelines: []
        },
        behavior: {
          personality_traits: [],
          emotional_range: [],
          interaction_preferences: [],
          conversation_style: []
        }
      };
    }
    
    // Set persona to AI engine if available
    if (this.aiEngine && this.currentPersona) {
      this.aiEngine.setPersona(this.currentPersona);
    }
  }

  private setupCommands(): void {
    // Initialize services for commands
    initializeServices(this.livekit, this.currentPersona, this.aiEngine);

    // Register all commands
    this.commands.set(joinCommand.name, {
      data: joinCommand,
      execute: handleJoinCommand
    });
    this.commands.set(leaveCommand.name, {
      data: leaveCommand,
      execute: handleLeaveCommand
    });
    this.commands.set(infoCommand.name, {
      data: infoCommand,
      execute: handleInfoCommand
    });
    this.commands.set(helpCommand.name, {
      data: helpCommand,
      execute: handleHelpCommand
    });
    this.commands.set(aiCommand.name, {
      data: aiCommand,
      execute: this.handleAICommandWrapper.bind(this)
    });
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, () => {
      console.log("Discord bot is ready! 🤖");
      console.log(`Logged in as ${this.client.user?.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        await this.handleCommand(interaction);
      } catch (error) {
        console.error("Error handling command:", error);
        const errorMessage = "An error occurred while executing the command.";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });

    this.client.on(Events.MessageCreate, this.handleMessage.bind(this));

    this.client.on(Events.Error, (error) => {
      console.error("Discord client error:", error);
    });
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    
    if (!command) {
      await interaction.reply({ 
        content: "Unknown command",
        ephemeral: true 
      });
      return;
    }
    
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      const errorMessage = "An error occurred while executing the command.";
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private async handleAICommandWrapper(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await handleAICommand(interaction);
    } catch (error) {
      console.error("Error handling AI command:", error);
      await interaction.reply({ 
        content: "Failed to switch AI engine.", 
        ephemeral: true 
      });
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !this.aiEngine) return;

    try {
      const response = await this.aiEngine.generateResponse(
        message.author.id,
        message.content
      );

      // Handle emotional response if available
      const emoji = this.getEmoji(response.emotional_response.emotion);
      
      await message.reply({
        content: `${emoji} ${response.text}`,
        allowedMentions: { repliedUser: true }
      });
    } catch (error) {
      console.error("Error generating AI response:", error);
      await message.reply({
        content: "Sorry, I'm having trouble processing your message right now.",
        allowedMentions: { repliedUser: true }
      });
    }
  }

  private getEmoji(emotion: string): string {
    const emojis: Record<string, string> = {
      happy: "😊",
      sad: "😢",
      angry: "😠",
      confused: "🤔",
      neutral: "🙂"
    };
    return emojis[emotion] || "🤖";
  }

  public setAIEngine(engine: AIEngine): void {
    this.aiEngine = engine;
    
    // Set persona to AI engine
    if (this.currentPersona) {
      this.aiEngine.setPersona(this.currentPersona);
    }
    
    initializeServices(this.livekit, this.currentPersona, this.aiEngine);
  }

  public async start(): Promise<void> {
    const rest = new REST().setToken(cfg.DISCORD_TOKEN);

    try {
      console.log("Started refreshing application (/) commands.");

      // Extract command data for registration
      const commandsData = Array.from(this.commands.values()).map(cmd => cmd.data);

      await rest.put(
        Routes.applicationCommands(cfg.DISCORD_CLIENT_ID),
        { body: commandsData }
      );

      console.log("Successfully reloaded application (/) commands.");
      await this.client.login(cfg.DISCORD_TOKEN);
    } catch (error) {
      console.error("Error starting Discord bot:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.livekit.close();
      this.client.destroy();
      console.log("Discord bot stopped successfully");
    } catch (error) {
      console.error("Error stopping Discord bot:", error);
      throw error;
    }
  }
}
