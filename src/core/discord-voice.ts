import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  VoiceConnection,
  AudioPlayer,
} from "@discordjs/voice";
import { VoiceBasedChannel } from "discord.js";
import { VoiceProcessor } from "./voice-processor.js";
import { AIEngine } from "./ai-engine.js";
import { Readable } from "stream";
import prism from "prism-media";

export class DiscordVoiceManager {
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private voiceProcessor: VoiceProcessor;
  private aiEngine: AIEngine | null = null;
  private isListening = false;
  private activeStreams: Map<string, NodeJS.ReadableStream> = new Map();

  constructor(voiceProcessor: VoiceProcessor) {
    this.voiceProcessor = voiceProcessor;
  }

  setAIEngine(engine: AIEngine): void {
    this.aiEngine = engine;
  }

  /**
   * Join a voice channel
   */
  async joinChannel(channel: VoiceBasedChannel): Promise<void> {
    try {
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      // Wait for connection to be ready
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);

      // Create audio player
      this.player = createAudioPlayer();
      this.connection.subscribe(this.player);

      // Setup event listeners
      this.setupConnectionListeners();
      this.setupPlayerListeners();

      console.log(`✅ Joined voice channel: ${channel.name}`);

      // Start listening for voice
      this.startListening();
    } catch (error) {
      console.error("Failed to join voice channel:", error);
      throw error;
    }
  }

  /**
   * Leave voice channel
   */
  async leaveChannel(): Promise<void> {
    try {
      this.stopListening();

      if (this.player) {
        this.player.stop();
        this.player = null;
      }

      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }

      console.log("✅ Left voice channel");
    } catch (error) {
      console.error("Error leaving voice channel:", error);
      throw error;
    }
  }

  /**
   * Setup connection event listeners
   */
  private setupConnectionListeners(): void {
    if (!this.connection) return;

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log("⚠️ Disconnected from voice channel");
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        this.connection?.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log("❌ Voice connection destroyed");
      this.stopListening();
    });

    this.connection.on("error", (error) => {
      console.error("Voice connection error:", error);
    });
  }

  /**
   * Setup audio player listeners
   */
  private setupPlayerListeners(): void {
    if (!this.player) return;

    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log("🔇 Player idle");
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      console.log("🔊 Playing audio");
    });

    this.player.on("error", (error) => {
      console.error("Audio player error:", error);
    });
  }

  /**
   * Start listening for voice input
   */
  private startListening(): void {
    if (!this.connection || this.isListening) return;

    this.isListening = true;
    console.log("👂 Started listening for voice input");

    // Listen to voice receiver
    const receiver = this.connection.receiver;

    receiver.speaking.on("start", (userId) => {
      console.log(`🎤 User ${userId} started speaking`);
      this.handleUserSpeaking(userId);
    });

    receiver.speaking.on("end", (userId) => {
      console.log(`🔇 User ${userId} stopped speaking`);
      this.handleUserStoppedSpeaking(userId);
    });
  }

  /**
   * Stop listening for voice input
   */
  private stopListening(): void {
    this.isListening = false;
    this.activeStreams.clear();
    console.log("👂 Stopped listening for voice input");
  }

  /**
   * Handle user speaking
   */
  private handleUserSpeaking(userId: string): void {
    if (!this.connection || !this.aiEngine) return;

    try {
      // Subscribe to user's audio stream
      const audioStream = this.connection.receiver.subscribe(userId, {
        end: {
          behavior: "manual" as any,
        },
      });

      // Create opus decoder
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      const pcmStream = audioStream.pipe(decoder);
      this.activeStreams.set(userId, pcmStream);

      console.log(`📡 Subscribed to user ${userId} audio stream`);
    } catch (error) {
      console.error("Error subscribing to user audio:", error);
    }
  }

  /**
   * Handle user stopped speaking
   */
  private async handleUserStoppedSpeaking(userId: string): Promise<void> {
    const audioStream = this.activeStreams.get(userId);
    if (!audioStream || !this.aiEngine) return;

    try {
      console.log(`🎯 Processing audio from user ${userId}`);

      // Process the complete voice interaction
      const responseAudio = await this.voiceProcessor.processVoiceInteraction(
        audioStream,
        async (transcription) => {
          // AI processing
          const aiResponse = await this.aiEngine!.generateResponse(
            userId,
            transcription
          );
          return aiResponse.text;
        }
      );

      // Play response
      await this.playAudio(responseAudio);
    } catch (error) {
      console.error("Error processing voice interaction:", error);
    } finally {
      this.activeStreams.delete(userId);
    }
  }

  /**
   * Play audio in voice channel
   */
  async playAudio(audioBuffer: Buffer): Promise<void> {
    if (!this.player) {
      throw new Error("Audio player not initialized");
    }

    try {
      // Create readable stream from buffer
      const stream = Readable.from(audioBuffer);

      // Create audio resource
      const resource = createAudioResource(stream, {
        inputType: "ogg/opus" as any,
      });

      // Play audio
      this.player.play(resource);

      // Wait for playback to finish
      await entersState(this.player, AudioPlayerStatus.Idle, 60000);
    } catch (error) {
      console.error("Error playing audio:", error);
      throw error;
    }
  }

  /**
   * Check if connected to voice
   */
  isConnected(): boolean {
    return (
      this.connection?.state.status === VoiceConnectionStatus.Ready &&
      this.isListening
    );
  }

  /**
   * Get current connection
   */
  getConnection(): VoiceConnection | null {
    return this.connection;
  }
}
