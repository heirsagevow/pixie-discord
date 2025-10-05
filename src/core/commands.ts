import { SlashCommandBuilder } from "discord.js";
import {
  CommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  SlashCommandStringOption,
  SlashCommandBooleanOption,
  VoiceBasedChannel,
} from "discord.js";
import { DiscordVoiceManager } from "./discord-voice.js";
import { AIModelType } from "../types/ai-models.js";
import { PersonaMetadata } from "../types/persona.js";
import { AIEngine } from "./ai-engine.js";
import { VoiceProcessor } from "./voice-processor.js";

// Service instances will be injected from DiscordBot
let voiceManager: DiscordVoiceManager | null = null;
let currentPersona: PersonaMetadata | null = null;
let aiEngine: AIEngine | null = null;
let voiceProcessor: VoiceProcessor | null = null;

export function initializeServices(
  voice: DiscordVoiceManager,
  persona: PersonaMetadata | null = null,
  ai: AIEngine | null = null,
  processor: VoiceProcessor | null = null
) {
  voiceManager = voice;
  currentPersona = persona;
  aiEngine = ai;
  voiceProcessor = processor;
}

export const joinCommand = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join your voice channel and start listening")
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

export const vadCommand = new SlashCommandBuilder()
  .setName("vad")
  .setDescription("Configure Voice Activity Detection")
  .addBooleanOption((option: SlashCommandBooleanOption) =>
    option
      .setName("enabled")
      .setDescription("Enable or disable VAD")
      .setRequired(true)
  );

async function validateMemberAndVoice(
  interaction: CommandInteraction
): Promise<{ member: GuildMember; voiceChannel?: VoiceBasedChannel } | null> {
  if (!(interaction.member instanceof GuildMember)) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return null;
  }

  return {
    member: interaction.member,
    voiceChannel: interaction.member.voice.channel ?? undefined,
  };
}

export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const validation = await validateMemberAndVoice(interaction);
    if (!validation) return;

    const { member, voiceChannel } = validation;
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ Kamu harus masuk ke voice channel dulu ya!",
        ephemeral: true,
      });
      return;
    }

    if (!voiceManager) {
      await interaction.reply({
        content: "❌ Voice service tidak tersedia.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      await voiceManager.joinChannel(voiceChannel);

      await interaction.editReply({
        content: `✅ Aku udah masuk ke **${voiceChannel.name}**! Sekarang kita bisa ngobrol lewat voice~ 🎤💫`,
      });
    } catch (err) {
      console.error("❌ Error connecting to voice channel:", err);
      await interaction.editReply({
        content: "❌ Gagal masuk ke voice channel. Coba cek permission bot ya!",
      });
    }
  } catch (error) {
    console.error("❌ Failed to join voice channel:", error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: "❌ Gagal masuk ke voice channel.",
      });
    } else {
      await interaction.reply({
        content: "❌ Gagal masuk ke voice channel.",
        ephemeral: true,
      });
    }
  }
}

export async function handleLeaveCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const validation = await validateMemberAndVoice(interaction);
    if (!validation) return;

    if (!voiceManager) {
      await interaction.reply({
        content: "❌ Voice service tidak tersedia.",
        ephemeral: true,
      });
      return;
    }

    await voiceManager.leaveChannel();

    await interaction.reply({
      content: "Sampai jumpa lagi~ 👋✨",
    });
  } catch (error) {
    console.error("Failed to leave voice channel:", error);
    await interaction.reply({
      content: "Gagal keluar dari voice channel.",
      ephemeral: true,
    });
  }
}

export async function handleInfoCommand(
  interaction: CommandInteraction
): Promise<void> {
  try {
    const voiceStatus = voiceManager?.isConnected()
      ? "🟢 Connected"
      : "🔴 Not connected";

    const info = [
      "✨ **Tentang Pixie** ✨",
      "",
      "Aku adalah AI companion yang bisa ngobrol sama kamu lewat voice!",
      currentPersona
        ? [
            `\n**Persona**: ${currentPersona.name}`,
            `**Role**: ${currentPersona.role}`,
            `**Background**: ${currentPersona.background}`,
          ].join("\n")
        : "",
      aiEngine ? `\n**AI Engine**: ${aiEngine.getActiveModel()}` : "",
      `**Voice Status**: ${voiceStatus}`,
      "\nAku bisa:",
      "• Mendengarkan suara kamu secara real-time",
      "• Memproses dengan AI dan menjawab dengan natural",
      "• Mengingat konteks percakapan kita",
      "\nGunakan `/help` untuk lihat semua command!",
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.reply({
      content: info,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to show info:", error);
    await interaction.reply({
      content: "Failed to show info.",
      ephemeral: true,
    });
  }
}

export async function handleHelpCommand(
  interaction: CommandInteraction
): Promise<void> {
  try {
    const helpMessage = `
✨ **Command yang Tersedia** ✨

🎤 **Voice Commands**
• \`/join\` - Aku akan masuk ke voice channel kamu
• \`/leave\` - Aku akan keluar dari voice channel
• \`/vad <enabled>\` - Aktifkan/nonaktifkan Voice Activity Detection

🤖 **AI Commands**
• \`/ai <engine>\` - Ganti AI engine (Gemini/OpenAI/Anthropic)
• \`/info\` - Info tentang aku
• \`/help\` - Lihat pesan ini

💡 **Tips:**
• Pastikan bot punya permission untuk join & speak di voice channel
• Gunakan VAD untuk deteksi suara otomatis
• Aku bisa ngerti bahasa Indonesia dan English!

Butuh bantuan lain? Langsung aja tanya! 💫
    `.trim();

    await interaction.reply({
      content: helpMessage,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to show help:", error);
    await interaction.reply({
      content: "Failed to show help message.",
      ephemeral: true,
    });
  }
}

export async function handleAICommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const engine = interaction.options.getString("engine", true) as AIModelType;

    if (!aiEngine) {
      await interaction.reply({
        content: "❌ AI service tidak tersedia.",
        ephemeral: true,
      });
      return;
    }

    const success = await aiEngine.switchModel(engine);
    if (!success) {
      await interaction.reply({
        content:
          "❌ Gagal ganti AI engine. Engine yang dipilih mungkin tidak tersedia.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `✅ Berhasil ganti ke ${aiEngine.getActiveModel()}! Siap ngobrol dengan AI engine baru! 🤖`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to switch AI engine:", error);
    await interaction.reply({
      content: "❌ Gagal ganti AI engine.",
      ephemeral: true,
    });
  }
}

export async function handleVADCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const enabled = interaction.options.getBoolean("enabled", true);

    if (!voiceProcessor) {
      await interaction.reply({
        content: "❌ Voice processor tidak tersedia.",
        ephemeral: true,
      });
      return;
    }

    voiceProcessor.setVAD(enabled);

    await interaction.reply({
      content: enabled
        ? "✅ Voice Activity Detection diaktifkan! Aku akan otomatis detect kapan kamu ngomong."
        : "✅ Voice Activity Detection dinonaktifkan. Aku akan proses semua audio.",
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to configure VAD:", error);
    await interaction.reply({
      content: "❌ Gagal konfigurasi VAD.",
      ephemeral: true,
    });
  }
}
