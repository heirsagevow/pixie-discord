# 🎤 Pixie - Real-time Voice AI Discord Bot

Discord bot dengan kemampuan voice AI real-time. Pixie bisa mendengarkan suara kamu, memproses dengan AI, dan menjawab dengan suara yang natural!

## ✨ Features

- 🎤 **Real-time Voice Processing** - Dengar dan respon langsung tanpa delay
- 🤖 **Multi AI Engine** - Support Gemini, OpenAI, dan Anthropic
- 🗣️ **Natural TTS** - Text-to-Speech dengan Google Cloud TTS (suara Indonesia!)
- 👂 **Smart STT** - Speech-to-Text dengan Google Cloud Speech
- 🎯 **Voice Activity Detection (VAD)** - Otomatis detect kapan kamu ngomong
- 💬 **Persona System** - Personality yang konsisten (default: Pixie)
- 🧠 **Context Awareness** - Bot ingat percakapan sebelumnya
- 🌐 **Bilingual** - Support Bahasa Indonesia & English

## 🏗️ Architecture

```
User Voice → Discord.js → Opus Decoder → PCM Audio
                                            ↓
                                  Voice Activity Detection
                                            ↓
                                   Google Speech-to-Text
                                            ↓
                                       AI Engine (Gemini/OpenAI/Anthropic)
                                            ↓
                                   Google Text-to-Speech
                                            ↓
Discord Voice ← Audio Player ← Opus Audio ←
```

**Kenapa tanpa LiveKit?**
- LiveKit client SDK untuk browser, ga cocok di Node.js
- Direct connection lebih efisien & latency rendah
- Google Cloud STT/TTS free tier cukup generous
- Arsitektur lebih simple & maintainable

## 🚀 Setup

### 1. Prerequisites

- Node.js 18+
- pnpm (atau npm/yarn)
- Discord Bot Token
- Google Cloud Project dengan Speech-to-Text & Text-to-Speech API enabled
- API Key untuk AI engine (Gemini/OpenAI/Anthropic)

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Google Cloud Setup

#### a. Create Google Cloud Project
1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Create new project
3. Enable APIs:
   - Cloud Speech-to-Text API
   - Cloud Text-to-Speech API

#### b. Create Service Account
1. Go to IAM & Admin → Service Accounts
2. Create Service Account dengan roles:
   - Cloud Speech Client
   - Cloud Text-to-Speech Client
3. Create & download JSON key
4. Save as `google-credentials.json` di root project

#### c. Set Environment Variable
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"
```

### 4. Discord Bot Setup

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to Bot → Create Bot
4. Copy token
5. Enable intents:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
6. Go to OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Permissions: 
     - Send Messages
     - Connect
     - Speak
     - Use Voice Activity
7. Copy URL dan invite bot ke server

### 5. Configuration

Copy `.env.example` ke `.env` dan isi:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_server_id

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
GOOGLE_PROJECT_ID=your-project-id

# AI Engine (pilih salah satu atau lebih)
DEFAULT_AI_MODEL=gemini
GEMINI_API_KEYS=your_gemini_key_1,your_gemini_key_2
```

### 6. Run

Development mode:
```bash
pnpm dev
```

Production:
```bash
pnpm build
pnpm start
```

## 📝 Commands

| Command | Description |
|---------|-------------|
| `/join` | Bot join ke voice channel kamu |
| `/leave` | Bot leave dari voice channel |
| `/ai <engine>` | Ganti AI engine (gemini/openai/anthropic) |
| `/vad <enabled>` | Enable/disable Voice Activity Detection |
| `/info` | Info tentang bot |
| `/help` | Lihat semua command |

## 🎯 Usage

1. Join voice channel
2. Ketik `/join`
3. Mulai ngomong! Bot akan:
   - Mendengarkan suara kamu
   - Detect kapan kamu selesai ngomong (VAD)
   - Transcribe suara ke text (STT)
   - Proses dengan AI
   - Jawab dengan suara (TTS)

## 💰 Free Tier Limits

### Google Cloud (per bulan)
- **Speech-to-Text**: 60 menit gratis
- **Text-to-Speech**: 1 juta karakter (Standard voices)
- Setelah limit: ~$0.006 per 15 detik (STT), $4 per 1M chars (TTS)

### AI Engines
- **Gemini**: 60 requests/menit (free tier)
- **OpenAI**: Pay per use (~$0.0015/1K tokens untuk GPT-3.5)
- **Anthropic**: Pay per use (~$0.008/1K tokens untuk Claude Sonnet)

**Tips menghemat quota:**
- Gunakan VAD untuk filter noise
- Set `VAD_SILENCE_THRESHOLD` yang pas
- Pakai multiple Gemini API keys untuk rotation
- Monitor usage di Google Cloud Console

## 🔧 Configuration

### Voice Settings

```env
# Bahasa untuk TTS (Text-to-Speech)
TTS_LANGUAGE=id-ID

# Voice name (cek available voices di Google Cloud)
TTS_VOICE_NAME=id-ID-Standard-A

# Bahasa untuk STT (Speech-to-Text)
STT_LANGUAGE=id-ID
```

Available Indonesian voices:
- `id-ID-Standard-A` (Female)
- `id-ID-Standard-B` (Male)
- `id-ID-Standard-C` (Male)
- `id-ID-Standard-D` (Female)
- `id-ID-Wavenet-A` (Female, premium)
- `id-ID-Wavenet-B` (Male, premium)
- `id-ID-Wavenet-C` (Male, premium)
- `id-ID-Wavenet-D` (Female, premium)

### VAD Settings

```env
# Enable/disable Voice Activity Detection
VAD_ENABLED=true

# Berapa lama silence sebelum processing (ms)
VAD_SILENCE_THRESHOLD=500
```

## 🎭 Persona Customization

Edit `src/personas/pixie.json` untuk customize personality:

```json
{
  "name": "Pixie",
  "personality": {
    "core_traits": {
      "kindness": 0.95,
      "curiosity": 0.85,
      "playfulness": 0.65
    }
  },
  "speech_patterns": {
    "tone": "warm, thoughtful, poetic",
    "signature_phrases": [
      "hmm... kamu kelihatan capek, mau aku temani sebentar?"
    ]
  }
}
```

## 🐛 Troubleshooting

### Bot tidak join voice channel
- Cek bot permissions (Connect, Speak, Use Voice Activity)
- Pastikan bot di server yang sama

### STT tidak working
- Cek `GOOGLE_APPLICATION_CREDENTIALS` path
- Verify Google Cloud Speech-to-Text API enabled
- Cek quota di Google Cloud Console

### TTS tidak working
- Cek Google Cloud Text-to-Speech API enabled
- Verify voice name tersedia untuk language code
- Cek quota

### Audio quality jelek
- Opus encoder settings di `voice-processor.ts`
- Check network latency
- Coba adjust VAD threshold

### AI tidak respond
- Cek API key valid
- Verify quota/rate limits
- Check logs untuk error details

## 📚 Project Structure

```
src/
├── core/
│   ├── ai-engine.ts          # AI engine abstraction
│   ├── discord.ts             # Main Discord bot
│   ├── discord-voice.ts       # Voice connection manager
│   ├── voice-processor.ts     # STT/TTS/VAD processing
│   ├── commands.ts            # Slash commands
│   └── memory.ts              # Optional: Redis memory
├── personas/
│   └── pixie.json            # Persona configuration
├── types/
│   ├── ai-models.ts          # AI types
│   └── persona.ts            # Persona types
├── utils/
│   └── config.ts             # Environment config
└── index.ts                  # Entry point
```

## 🚧 Roadmap

- [ ] Support more AI models (Claude Opus, GPT-4)
- [ ] Improve VAD with Silero VAD model
- [ ] Multi-language persona switching
- [ ] Voice cloning support
- [ ] Conversation history export
- [ ] Web dashboard for monitoring

## 📄 License

ISC

## 🙏 Credits

- Discord.js for Discord API
- Google Cloud for STT/TTS
- Gemini/OpenAI/Anthropic for AI processing
- Prism Media for audio processing

---

Made with 💫 by [Your Name]