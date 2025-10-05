import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { Transform } from "stream";
import { cfg } from "../utils/config.js";

interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

export class VoiceProcessor {
  private deepgram: ReturnType<typeof createClient>;
  private audioBuffer: AudioChunk[] = [];
  private isProcessing = false;
  private silenceThreshold = 500;
  private lastAudioTime = 0;
  private vadEnabled = true;

  constructor() {
    this.deepgram = createClient(cfg.DEEPGRAM_API_KEY);
  }

  /**
   * Simple VAD based on audio energy
   */
  private detectSpeech(audioData: Buffer): boolean {
    if (!this.vadEnabled) return true;

    let sum = 0;
    for (let i = 0; i < audioData.length; i += 2) {
      const sample = audioData.readInt16LE(i);
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / (audioData.length / 2));

    return rms > 1000;
  }

  /**
   * Process incoming audio stream from Discord using Deepgram
   */
  async processAudioStream(
    audioStream: NodeJS.ReadableStream
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let transcription = "";
      let hasReceivedData = false;

      const deepgramLive = this.deepgram.listen.live({
        model: "nova-2",
        language: "id", // Indonesian
        smart_format: true,
        punctuate: true,
        interim_results: false,
        encoding: "linear16",
        sample_rate: 48000,
        channels: 1,
      });

      deepgramLive.on(LiveTranscriptionEvents.Open, () => {
        console.log("🎤 Deepgram connection opened");
      });

      deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript && transcript.length > 0) {
          hasReceivedData = true;
          transcription += transcript + " ";
          console.log("📝 Partial transcript:", transcript);
        }
      });

      deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram error:", error);
        reject(error);
      });

      deepgramLive.on(LiveTranscriptionEvents.Close, () => {
        console.log("🔚 Deepgram connection closed");
        if (hasReceivedData && transcription.trim()) {
          resolve(transcription.trim());
        } else if (!hasReceivedData) {
          reject(new Error("No speech detected"));
        }
      });

      // Apply VAD and pipe to Deepgram
      const vadStream = new Transform({
        transform: (chunk: Buffer, encoding, callback) => {
          try {
            if (this.detectSpeech(chunk)) {
              this.lastAudioTime = Date.now();
              this.audioBuffer.push({
                data: chunk,
                timestamp: Date.now(),
              });
              // Send audio to Deepgram (type assertion for compatibility)
              (deepgramLive.send as any)(chunk);
              callback();
            } else {
              const silenceDuration = Date.now() - this.lastAudioTime;
              if (
                silenceDuration > this.silenceThreshold &&
                this.audioBuffer.length > 0
              ) {
                // End of speech detected, finish stream
                deepgramLive.finish();
                callback();
              } else {
                callback();
              }
            }
          } catch (error) {
            callback(error as Error);
          }
        },
      });

      audioStream.pipe(vadStream);

      // Timeout
      setTimeout(() => {
        if (!hasReceivedData) {
          deepgramLive.finish();
          reject(new Error("Speech timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Text to speech using Deepgram Aura
   */
  async textToSpeech(
    text: string,
    voice: string = "aura-asteria-id" // Indonesian voice
  ): Promise<Buffer> {
    try {
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: voice,
          encoding: "opus",
          sample_rate: 48000,
        }
      );

      // Get audio stream
      const stream = await response.getStream();
      if (!stream) {
        throw new Error("No audio stream received");
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error("TTS Error:", error);
      throw error;
    }
  }

  /**
   * Process complete voice interaction
   */
  async processVoiceInteraction(
    audioStream: NodeJS.ReadableStream,
    onTranscription: (text: string) => Promise<string>,
    voice: string = "aura-asteria-id"
  ): Promise<Buffer> {
    this.isProcessing = true;

    try {
      console.log("🎤 Listening for speech...");
      const transcription = await this.processAudioStream(audioStream);
      console.log("📝 Transcribed:", transcription);

      console.log("🤖 Processing with AI...");
      const aiResponse = await onTranscription(transcription);
      console.log("💬 AI Response:", aiResponse);

      console.log("🔊 Converting to speech...");
      const audioBuffer = await this.textToSpeech(aiResponse, voice);
      console.log("✅ Voice processing complete");

      return audioBuffer;
    } finally {
      this.isProcessing = false;
      this.audioBuffer = [];
    }
  }

  setVAD(enabled: boolean): void {
    this.vadEnabled = enabled;
  }

  setSilenceThreshold(ms: number): void {
    this.silenceThreshold = ms;
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}
