import { SlashCommandBuilder } from "discord.js";
import { 
  CommandInteraction, 
  GuildMember,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  SlashCommandStringOption,
  VoiceBasedChannel
} from "discord.js";
import { LiveKitService } from "./livekit.js";
import {  AIModelType } from "../types/ai-models.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { PersonaMetadata } from "../types/persona.js";
import { AIEngine } from "./ai-engine.js";

// Service instances will be injected from DiscordBot
let livekitService: LiveKitService | null = null;
let currentPersona: PersonaMetadata | null = null;
let aiEngine: AIEngine | null = null;

export function initializeServices(
  livekit: LiveKitService,
  persona: PersonaMetadata | null = null,
  ai: AIEngine | null = null
) {
  livekitService = livekit;
  currentPersona = persona;
  aiEngine = ai;
}

export const joinCommand = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join a voice channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Connect);

export const leaveCommand = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Leave the current voice channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Connect);

export const infoCommand = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Get information about Pixie");

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show available commands");

export const aiCommand = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Configure AI engine")
  .addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("engine")
      .setDescription("Choose AI engine")
      .setRequired(true)
      .addChoices(
        { name: "Gemini", value: "gemini" },
        { name: "OpenAI", value: "openai" },
        { name: "Anthropic", value: "anthropic" }
      )
  );

async function validateMemberAndVoice(
  interaction: CommandInteraction
): Promise<{ member: GuildMember; voiceChannel?: VoiceBasedChannel } | null> {
  if (!(interaction.member instanceof GuildMember)) {
    await interaction.reply({ 
      content: "This command can only be used in a server.", 
      ephemeral: true 
    });
    return null;
  }

  return { 
    member: interaction.member,
    voiceChannel: interaction.member.voice.channel ?? undefined
  };
}

export async function handleJoinCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const validation = await validateMemberAndVoice(interaction);
    if (!validation) return;

    const { member, voiceChannel } = validation;
    if (!voiceChannel) {
      await interaction.reply({ 
        content: "❌ You need to be in a voice channel first!", 
        ephemeral: true 
      });
      return;
    }

    // Connect to Discord voice channel
    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      await interaction.reply({ 
        content: `✅ Joined **${voiceChannel.name}**! Ready to chat!` 
      });

      // Connect to LiveKit if available
      if (livekitService) {
        try {
          await livekitService.joinRoom(
            member.id,
            `${voiceChannel.guild.id}-${voiceChannel.id}`
          );
        } catch (livekitError) {
          console.error("⚠️ LiveKit connection failed, but Discord voice connected:", livekitError);
        }
      }

    } catch (err) {
      console.error("❌ Error connecting to Discord voice channel:", err);
      await interaction.reply({ 
        content: "❌ Failed to join voice channel. Please check bot permissions.", 
        ephemeral: true 
      });
    }

  } catch (error) {
    console.error("❌ Failed to join voice channel:", error);
    await interaction.reply({ 
      content: "❌ Failed to join voice channel.", 
      ephemeral: true 
    });
  }
}

export async function handleLeaveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const validation = await validateMemberAndVoice(interaction);
    if (!validation) return;

    // Disconnect from Discord voice channel
    const guild = interaction.guild;
    if (guild && guild.members.me?.voice.channel) {
      await guild.members.me.voice.disconnect();
    }

    // Also disconnect from LiveKit if available
    if (livekitService) {
      try {
        await livekitService.leaveRoom();
      } catch (livekitError) {
        console.error("LiveKit disconnection failed, but Discord voice disconnected:", livekitError);
        // Continue even if LiveKit fails
      }
    }

    await interaction.reply({ content: "Left the voice channel! See you later! 👋" });
  } catch (error) {
    console.error("Failed to leave voice channel:", error);
    await interaction.reply({ 
      content: "Failed to leave voice channel.", 
      ephemeral: true 
    });
  }
}

export async function handleInfoCommand(interaction: CommandInteraction): Promise<void> {
  try {
    const info = [
      "🎵 **About Pixie** 🎵",
      "",
      "I'm your AI-powered voice assistant!",
      currentPersona ? [
        `\nCurrent Persona: ${currentPersona.name}`,
        `Role: ${currentPersona.role}`,
        `Style: ${currentPersona.speech_patterns.join(", ")}`
      ].join("\n") : "",
      aiEngine ? `\nAI Engine: ${aiEngine.getActiveModel()}` : "",
      "\nI can chat with you in voice channels and help with various tasks.",
      "\nUse `/help` to see all available commands!"
    ].filter(Boolean).join("\n");

    await interaction.reply({
      content: info,
      ephemeral: true
    });
  } catch (error) {
    console.error("Failed to show info:", error);
    await interaction.reply({ 
      content: "Failed to show info.", 
      ephemeral: true 
    });
  }
}

export async function handleHelpCommand(interaction: CommandInteraction): Promise<void> {
  try {
    const helpMessage = `
🎮 **Available Commands** 🎮

• /join - Join your voice channel
• /leave - Leave the current voice channel
• /info - Get information about me
• /ai - Configure AI engine (Gemini/OpenAI/Anthropic)
• /help - Show this help message

Need more help? Feel free to ask!
    `.trim();

    await interaction.reply({
      content: helpMessage,
      ephemeral: true
    });
  } catch (error) {
    console.error("Failed to show help:", error);
    await interaction.reply({ 
      content: "Failed to show help message.", 
      ephemeral: true 
    });
  }
}

export async function handleAICommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const engine = interaction.options.getString("engine", true) as AIModelType;
    
    if (!aiEngine) {
      await interaction.reply({ 
        content: "AI service is not available.", 
        ephemeral: true 
      });
      return;
    }

    const success = await aiEngine.switchModel(engine);
    if (!success) {
      await interaction.reply({ 
        content: "Failed to switch AI engine. The selected engine might not be available.", 
        ephemeral: true 
      });
      return;
    }

    await interaction.reply({ 
      content: `Switched to ${aiEngine.getActiveModel()}! Ready to chat with the new AI engine!`,
      ephemeral: true 
    });
  } catch (error) {
    console.error("Failed to switch AI engine:", error);
    await interaction.reply({ 
      content: "Failed to switch AI engine.", 
      ephemeral: true 
    });
  }
}