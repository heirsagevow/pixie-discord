import { AccessToken } from "livekit-server-sdk";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  RemoteTrackPublication,
  Track,
  AudioPresets,
  RoomOptions,
} from "livekit-client";
import { cfg } from "../utils/config.js";

/**
 * LiveKit service for managing voice connections
 */
export class LiveKitService {
  private room: Room | null = null;
  private localParticipant: LocalParticipant | null = null;

  constructor(
    private readonly apiKey: string = cfg.LIVEKIT_API_KEY,
    private readonly apiSecret: string = cfg.LIVEKIT_API_SECRET,
    private readonly url: string = cfg.LIVEKIT_URL
  ) {}

  /**
   * Create an access token for LiveKit room
   */
  private async createToken(participantName: string, roomName: string): Promise<string> {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: participantName,
        name: participantName,
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });
      return at.toJwt();
    } catch (error) {
      console.error("Failed to create LiveKit token:", error);
      throw error;
    }
  }

  /**
   * Join a LiveKit room
   */
  async joinRoom(participantName: string, roomName: string): Promise<void> {
    try {
      // Check if running in Node.js environment (no browser)
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        console.log(`LiveKit connection skipped: Running in Node.js environment`);
        return; // Skip LiveKit connection in Node.js environment
      }
      
      const token = await this.createToken(participantName, roomName);
      
      const roomOptions: RoomOptions = {
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          ...AudioPresets.music,
          noiseSuppression: true,
          echoCancellation: true,
        },
      };

      this.room = new Room(roomOptions);
      await this.room.connect(this.url, token);
      this.localParticipant = this.room.localParticipant;
      
      this.setupRoomListeners();
      console.log(`Connected to room: ${roomName} as ${participantName}`);
    } catch (error) {
      console.error("Failed to connect to LiveKit room:", error);
      // Don't throw error if we're in Node.js, just log it
      if (!(typeof process !== 'undefined' && process.versions && process.versions.node)) {
        throw error;
      }
    }
  }

  /**
   * Setup event listeners for the room
   */
  private setupRoomListeners(): void {
    if (!this.room) return;

    this.room
      .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log("Participant connected:", participant.identity);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log("Participant disconnected:", participant.identity);
      })
      .on(RoomEvent.TrackSubscribed, (
        track: Track,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        console.log("Track subscribed:", track.kind, "from", participant.identity);
      })
      .on(RoomEvent.Disconnected, () => {
        console.log("Disconnected from room");
        this.room = null;
        this.localParticipant = null;
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log("Connection state changed:", state);
      });
  }

  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    try {
      if (this.room) {
        await this.room.disconnect();
        this.room = null;
        this.localParticipant = null;
        console.log("Successfully left the room");
      }
    } catch (error) {
      console.error("Error leaving room:", error);
      throw error;
    }
  }

  /**
   * Check if connected to a room
   */
  isConnected(): boolean {
    return this.room?.state === "connected";
  }

  /**
   * Close the LiveKit service
   */
  async close(): Promise<void> {
    try {
      await this.leaveRoom();
      console.log("LiveKit service closed");
    } catch (error) {
      console.error("Error closing LiveKit service:", error);
      throw error;
    }
  }
}
