import WebSocket from 'ws';

/**
 * Gemini Live API Transcription Service
 * 
 * Manages live bidirectional streaming of 16kHz 16-bit PCM audio chunks to 
 * Gemini Live API (gemini-3.5-transcribe-live) and forwards real-time text
 * transcripts back to the frontend dialer client.
 */

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.5-transcribe-live';
const FALLBACK_MODEL = 'gemini-2.0-flash-exp';

// Realistic sample dialog for fallback simulation when API key is missing or quota is exceeded
const SIMULATED_SCAMMER_LINES = [
  "Hello? Good day, this is Agent Miller from the Global Fraud Prevention Unit.",
  "We have detected an unauthorized wire transfer attempt of $4,850 on your primary account.",
  "To stop this fraudulent withdrawal and secure your funds, we need immediate identity confirmation.",
  "A six-digit one-time security verification code has just been dispatched to your mobile device.",
  "Please read the six digits aloud to me immediately so we can block the transaction."
];

export class GeminiLiveSession {
  constructor(clientWs, options = {}) {
    this.clientWs = clientWs;
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || DEFAULT_MODEL;
    this.geminiWs = null;
    this.isGeminiReady = false;
    this.fullTranscript = '';
    this.audioBufferQueue = [];
    this.isClosed = false;

    // Simulation fallback state
    this.simulatedMode = !this.apiKey || this.apiKey.trim() === '';
    this.simStep = 0;
    this.chunkCount = 0;
    this.lastSimTime = Date.now();
  }

  async start() {
    if (this.simulatedMode) {
      console.log('ℹ️ [GeminiLive] Running in simulation mode (No GEMINI_API_KEY detected).');
      this.sendToClient({
        type: 'status',
        status: 'simulated_ready',
        model: this.model,
        note: 'Live transcription active (Simulated fallback - configure GEMINI_API_KEY in .env for live cloud transcription)'
      });
      return;
    }

    try {
      await this.connectToGemini(this.model);
    } catch (err) {
      console.warn(`⚠️ [GeminiLive] Failed connecting to ${this.model}, falling back to simulation:`, err.message);
      this.simulatedMode = true;
      this.sendToClient({
        type: 'status',
        status: 'simulated_fallback',
        model: this.model,
        error: err.message
      });
    }
  }

  connectToGemini(modelName) {
    return new Promise((resolve, reject) => {
      const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      
      console.log(`🔌 [GeminiLive] Connecting to Gemini Live API with model ${modelName}...`);
      this.geminiWs = new WebSocket(endpoint);

      const connTimeout = setTimeout(() => {
        if (!this.isGeminiReady) {
          reject(new Error('Gemini WebSocket connection timed out after 10s'));
        }
      }, 10000);

      this.geminiWs.on('open', () => {
        console.log('✅ [GeminiLive] WebSocket opened to Google Gemini Live API');
        
        // Initial setup payload to configure speech-to-text / transcription session
        const setupPayload = {
          setup: {
            model: `models/${modelName}`,
            generationConfig: {
              responseModalities: ["TEXT"]
            },
            systemInstruction: {
              parts: [{
                text: "You are an automated real-time phone call transcription engine. Transcribe every spoken utterance verbatim into clear text as it is spoken. Do not add commentary or conversing responses."
              }]
            }
          }
        };

        this.geminiWs.send(JSON.stringify(setupPayload));
      });

      this.geminiWs.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());

          // Gemini setup acknowledgment
          if (response.setupComplete) {
            clearTimeout(connTimeout);
            this.isGeminiReady = true;
            console.log(`🎯 [GeminiLive] Session ready with model: ${modelName}`);
            this.sendToClient({
              type: 'status',
              status: 'ready',
              model: modelName
            });

            // Flush buffered chunks
            while (this.audioBufferQueue.length > 0) {
              const chunk = this.audioBufferQueue.shift();
              this.sendAudioChunkToGemini(chunk);
            }
            resolve();
            return;
          }

          // Handle incoming speech-to-text transcription parts
          if (response.serverContent?.modelTurn?.parts) {
            for (const part of response.serverContent.modelTurn.parts) {
              if (part.text) {
                this.fullTranscript += part.text;
                this.sendToClient({
                  type: 'transcript_delta',
                  delta: part.text,
                  fullTranscript: this.fullTranscript,
                  timestamp: Date.now()
                });
              }
            }
          }

          if (response.serverContent?.turnComplete) {
            this.sendToClient({
              type: 'turn_complete',
              fullTranscript: this.fullTranscript,
              timestamp: Date.now()
            });
          }
        } catch (err) {
          console.error('❌ [GeminiLive] Failed to parse Gemini response:', err);
        }
      });

      this.geminiWs.on('error', (err) => {
        clearTimeout(connTimeout);
        console.error('❌ [GeminiLive] Gemini WS error:', err.message);
        if (!this.isGeminiReady) {
          reject(err);
        }
      });

      this.geminiWs.on('close', (code, reason) => {
        console.log(`🔌 [GeminiLive] Gemini WS closed (code: ${code}, reason: ${reason})`);
        this.isGeminiReady = false;
      });
    });
  }

  /**
   * Handle incoming 16kHz 16-bit PCM chunk from frontend
   * @param {Buffer|ArrayBuffer} pcmBuffer 
   */
  handleAudioChunk(pcmBuffer) {
    if (this.isClosed) return;
    this.chunkCount++;

    if (this.simulatedMode) {
      this.handleSimulatedChunk();
      return;
    }

    if (!this.isGeminiReady) {
      if (this.audioBufferQueue.length < 50) {
        this.audioBufferQueue.push(pcmBuffer);
      }
      return;
    }

    this.sendAudioChunkToGemini(pcmBuffer);
  }

  sendAudioChunkToGemini(pcmBuffer) {
    if (!this.geminiWs || this.geminiWs.readyState !== WebSocket.OPEN) return;

    try {
      const base64Data = Buffer.isBuffer(pcmBuffer) 
        ? pcmBuffer.toString('base64') 
        : Buffer.from(pcmBuffer).toString('base64');

      const realtimeMsg = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Data
            }
          ]
        }
      };

      this.geminiWs.send(JSON.stringify(realtimeMsg));
    } catch (err) {
      console.error('❌ [GeminiLive] Error sending audio chunk to Gemini:', err.message);
    }
  }

  /**
   * Generates incremental simulated transcription synchronized with audio chunks
   */
  handleSimulatedChunk() {
    const now = Date.now();
    // Emit a new chunk transcript sentence roughly every 2.5 seconds of audio streaming
    if (now - this.lastSimTime > 2400 && this.simStep < SIMULATED_SCAMMER_LINES.length) {
      const sentence = SIMULATED_SCAMMER_LINES[this.simStep];
      this.simStep++;
      this.lastSimTime = now;

      const prefix = this.fullTranscript ? ' ' : '';
      this.fullTranscript += prefix + sentence;

      this.sendToClient({
        type: 'transcript_delta',
        delta: prefix + sentence,
        fullTranscript: this.fullTranscript,
        model: 'gemini-3.5-transcribe-live (simulated)',
        timestamp: now
      });
    }
  }

  sendToClient(payload) {
    if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      try {
        this.clientWs.send(JSON.stringify(payload));
      } catch (err) {
        console.error('❌ [GeminiLive] Failed sending to client:', err.message);
      }
    }
  }

  getTranscript() {
    return this.fullTranscript;
  }

  close() {
    this.isClosed = true;
    if (this.geminiWs) {
      try {
        this.geminiWs.close();
      } catch (_) {}
      this.geminiWs = null;
    }
  }
}
