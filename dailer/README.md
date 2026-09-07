# Tensa Phone Call Simulator & Dialer

This directory documents the mobile phone dialer and calling interface simulation for Project Tensa.

### Implementation Details:
- **Phone Dialer Component**: [`frontend/src/components/PhoneDialer.tsx`](../frontend/src/components/PhoneDialer.tsx)
- **DTMF Audio & Tone Synthesizer**: [`frontend/src/lib/dtmfTones.ts`](../frontend/src/lib/dtmfTones.ts)
- **Dedicated Route**: `/dialer` (accessible from top navigation bar and hero CTA)

### Features:
1. **Realistic 3x4 Keypad**: Clean, flat, gradient-free mobile dial pad with authentic DTMF acoustic tones.
2. **Dual Call Simulation Flows**:
   - **Outgoing Call**: Dials any phone number, plays telephone ringback tone, receiver accepts, and voice analysis streams live.
   - **Incoming Call**: Simulates incoming call (e.g., bank impersonator), plays electronic ringtone, prompts receiver to Accept or Decline.
3. **Real-Time AI Voice Clone Defense**:
   - Audio begins streaming immediately upon call pickup via WebSocket (`/v1/stream/detect`).
   - Displays real-time voice verification badge (Authentic Human vs. AI Voice Clone with % confidence).
   - In-call 6-button controls (Mute, In-Call Keypad, Speakerphone, Hold, Inspect Telemetry, End Call).
   - Real-time animated audio visualizer spectrum on the phone interface.
