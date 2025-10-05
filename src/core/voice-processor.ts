import speech from "@google-cloud/speech";
import textToSpeech from "@google-cloud/text-to-speech";
import { Transform, PassThrough } from "stream";

interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

export class VoiceProcessor {
  private speechClient: speech.SpeechClient;
  private ttsClient: textToSpeech.TextToSpeechClient;
  private audioBuffer: AudioChunk[] = [];
  private isProcessing = false;
  private silenceThreshold = 500; // ms of silence before processing
  private lastAudioTime = 0;
  private vadEnabled = true;

  constructor() {
    this.speechClient = new speech.SpeechClient();
    this.ttsClient = new textToSpeech.TextToSpeechClient();
  }

  /**
   * Simple VAD based on audio energy
   */
  private detectSpeech(audioData: Buffer): boolean {
    if (!this.vadEnabled) return true;

    // Calculate audio energy (simple RMS)
    let sum = 0;
    for (let i = 0; i < audioData.length; i += 2) {
      const sample = audioData.readInt16LE(i);
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / (audioData.length / 2));

    // Threshold for speech detection (adjust based on testing)
    return rms > 1000;
  }

  /**
   * Process incoming audio stream from Discord
   */
  async processAudioStream(
    audioStream: NodeJS.ReadableStream
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const recognizeStream = this.speechClient
        .streamingRecognize({
          config: {
            encoding: "LINEAR16",
            sampleRateHertz: 48000,
            languageCode: "id-ID",
            alternativeLanguageCodes: ["en-US"],
            enableAutomaticPunctuation: true,
            model: "latest_short",
            useEnhanced: true,
          },
          interimResults: false,
        } as any)
        .on("error", (error) => {
          console.error("STT Error:", error);
          reject(error);
        })
        .on("data", (data: any) => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            const transcription = data.results[0].alternatives[0].transcript;
            if (transcription) {
              resolve(transcription);
            }
          }
        });

      // Audio stream is already PCM from Discord (after prism-media decoding)
      // Just apply VAD and pipe to Google Speech
      const vadStream = new Transform({
        transform: (chunk: Buffer, encoding, callback) => {
          try {
            // VAD check
            if (this.detectSpeech(chunk)) {
              this.lastAudioTime = Date.now();
              this.audioBuffer.push({
                data: chunk,
                timestamp: Date.now(),
              });
              callback(null, chunk);
            } else {
              // Check if we should process buffered audio
              const silenceDuration = Date.now() - this.lastAudioTime;
              if (
                silenceDuration > this.silenceThreshold &&
                this.audioBuffer.length > 0
              ) {
                // Flush buffer to recognition
                const combinedBuffer = Buffer.concat(
                  this.audioBuffer.map((chunk) => chunk.data)
                );
                this.audioBuffer = [];
                callback(null, combinedBuffer);
                return;
              }
              callback();
            }
          } catch (error) {
            callback(error as Error);
          }
        },
      });

      audioStream.pipe(vadStream).pipe(recognizeStream);

      // Timeout if no speech detected
      setTimeout(() => {
        if (!this.isProcessing) {
          recognizeStream.destroy();
          reject(new Error("Speech timeout"));
        }
      }, 10000); // 10 second timeout
    });
  }

  /**
   * Convert text to speech using Google TTS
   */
  async textToSpeech(
    text: string,
    languageCode: string = "id-ID",
    voiceName?: string
  ): Promise<Buffer> {
    try {
      const [response] = await this.ttsClient.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode,
          name: voiceName || "id-ID-Standard-A",
          ssmlGender: "FEMALE",
        },
        audioConfig: {
          audioEncoding: "OGG_OPUS",
          sampleRateHertz: 48000,
          pitch: 0,
          speakingRate: 1.0,
        },
      } as any);

      if (!response.audioContent) {
        throw new Error("No audio content received from TTS");
      }

      return Buffer.from(response.audioContent as Uint8Array);
    } catch (error) {
      console.error("TTS Error:", error);
      throw error;
    }
  }

  /**
   * Process a complete voice interaction
   */
  async processVoiceInteraction(
    audioStream: NodeJS.ReadableStream,
    onTranscription: (text: string) => Promise<string>,
    languageCode: string = "id-ID"
  ): Promise<Buffer> {
    this.isProcessing = true;

    try {
      // Step 1: Speech to Text
      console.log("🎤 Listening for speech...");
      const transcription = await this.processAudioStream(audioStream);
      console.log("📝 Transcribed:", transcription);

      // Step 2: AI Processing
      console.log("🤖 Processing with AI...");
      const aiResponse = await onTranscription(transcription);
      console.log("💬 AI Response:", aiResponse);

      // Step 3: Text to Speech
      console.log("🔊 Converting to speech...");
      const audioBuffer = await this.textToSpeech(aiResponse, languageCode);
      console.log("✅ Voice processing complete");

      return audioBuffer;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Enable/disable VAD
   */
  setVAD(enabled: boolean): void {
    this.vadEnabled = enabled;
  }

  /**
   * Set silence threshold for VAD
   */
  setSilenceThreshold(ms: number): void {
    this.silenceThreshold = ms;
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}
