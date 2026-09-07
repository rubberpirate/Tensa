import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { GeminiLiveSession } from './services/geminiLiveService.js';
import { generateCallSummary } from './services/geminiSummaryService.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8001', 10);
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.5-transcribe-live';
const SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || 'gemini-3.5-flash-lite';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Keep track of active live sessions
const activeSessions = new Map();

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tensa-dialer-backend',
    port: PORT,
    models: {
      transcription: LIVE_MODEL,
      summary: SUMMARY_MODEL
    },
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// ── Call Summarization Endpoint (Gemini 3.5 Flash Lite) ─────────────────────
app.post('/api/dialer/summarize', async (req, res) => {
  try {
    const { transcript, callMetadata } = req.body;
    console.log(`📝 [API] Generating summary with ${SUMMARY_MODEL}. Transcript length: ${(transcript || '').length} chars`);
    
    const result = await generateCallSummary({
      transcript: transcript || '',
      callMetadata: callMetadata || {}
    });

    res.json(result);
  } catch (err) {
    console.error('❌ [API] Error generating summary:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ── Fallback HTTP Chunk Upload Endpoint ──────────────────────────────────────
app.post('/api/dialer/upload-chunk', (req, res) => {
  const { sessionId, chunkBase64 } = req.body;
  if (!sessionId || !chunkBase64) {
    return res.status(400).json({ error: 'Missing sessionId or chunkBase64' });
  }

  const session = activeSessions.get(sessionId);
  if (session) {
    const pcmBuffer = Buffer.from(chunkBase64, 'base64');
    session.handleAudioChunk(pcmBuffer);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ── HTTP Server Setup ────────────────────────────────────────────────────────
const server = http.createServer(app);

// ── WebSocket Server for Live Audio & Transcription ──────────────────────────
const wss = new WebSocketServer({
  server,
  path: '/ws/dialer-live'
});

wss.on('connection', async (ws, req) => {
  const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`🔌 [WebSocket] Client connected: ${sessionId} (IP: ${req.socket.remoteAddress})`);

  const session = new GeminiLiveSession(ws, {
    apiKey: process.env.GEMINI_API_KEY,
    model: LIVE_MODEL
  });

  activeSessions.set(sessionId, session);
  await session.start();

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Audio chunk received as binary PCM buffer
      session.handleAudioChunk(data);
    } else {
      // Text control message
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'init') {
          console.log(`⚙️ [WebSocket] Session init for call: ${msg.callId || 'unknown'}`);
          ws.send(JSON.stringify({
            type: 'init_ack',
            sessionId,
            model: LIVE_MODEL
          }));
        } else if (msg.type === 'audio_chunk' && msg.chunk) {
          // Base64 encoded chunk inside JSON
          const pcmBuf = Buffer.from(msg.chunk, 'base64');
          session.handleAudioChunk(pcmBuf);
        } else if (msg.type === 'get_transcript') {
          ws.send(JSON.stringify({
            type: 'transcript_snapshot',
            transcript: session.getTranscript()
          }));
        }
      } catch (err) {
        console.error('❌ [WebSocket] Malformed message:', err);
      }
    }
  });

  ws.on('close', () => {
    console.log(`🔌 [WebSocket] Client disconnected: ${sessionId}`);
    session.close();
    activeSessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`❌ [WebSocket] Client socket error on ${sessionId}:`, err.message);
    session.close();
    activeSessions.delete(sessionId);
  });
});

// ── Server Start ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🛡️  Tensa Dialer Backend Active`);
  console.log(`  📍 HTTP Port: http://localhost:${PORT}`);
  console.log(`  🔌 Live WS:   ws://localhost:${PORT}/ws/dialer-live`);
  console.log(`  🎙️ Live Model: ${LIVE_MODEL}`);
  console.log(`  📝 Summary:    ${SUMMARY_MODEL}`);
  console.log(`  🔑 Gemini Key: ${process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Simulation Mode (Key Missing) ⚠️'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down dialer backend...');
  server.close(() => {
    process.exit(0);
  });
});
