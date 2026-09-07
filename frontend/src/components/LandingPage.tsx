import React, { useState } from 'react';
import {
  Shield,
  Building2,
  UserCheck,
  Zap,
  Activity,
  PhoneCall,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileAudio,
  Radio,
  Cpu,
  Layers,
  Sparkles,
  ChevronRight,
  Scale,
  Database,
  Eye,
  Server
} from 'lucide-react';
import { Button } from './ui/button';
import { TabsList, TabsTrigger } from './ui/tabs';

interface LandingPageProps {
  onLaunchDemo: () => void;
  onLaunchDialer?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchDemo, onLaunchDialer }) => {
  const [activeSegment, setActiveSegment] = useState<'enterprise' | 'consumer'>('enterprise');

  return (
    <div className="w-full bg-slate-50 text-slate-900 font-sans">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 border-b border-slate-200 bg-gradient-to-b from-blue-50/70 via-white to-slate-50">
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
          {/* SIH Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-blue-200 text-xs font-semibold text-blue-900 shadow-sm mb-6">
            <span className="text-base">🇮🇳</span>
            <span>Smart India Hackathon 2026</span>
            <span className="text-slate-300">•</span>
            <span className="text-blue-600 font-bold">Real-Time Voice Integrity Engine</span>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight max-w-4xl">
            Real-Time Voice Cloning Defense for India&apos;s{' '}
            <span className="text-blue-600">Telecom &amp; Financial</span> Ecosystem
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">
            Autonomous, language-agnostic detection engine catching sub-second acoustic deepfakes across 
            8kHz cellular PSTN and HD VoIP before financial fraud or coercive extortion occurs.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            {onLaunchDialer && (
              <Button
                size="lg"
                onClick={onLaunchDialer}
                className="w-full sm:w-auto gap-2 text-sm font-semibold h-11 px-6 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Simulate Phone Call</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            <Button
              size="lg"
              variant={onLaunchDialer ? "outline" : "default"}
              onClick={onLaunchDemo}
              className="w-full sm:w-auto gap-2 text-sm font-semibold h-11 px-6 shadow-xs"
            >
              <Activity className="w-4 h-4 text-blue-600" />
              <span>Launch Live SOC</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const el = document.getElementById('solutions');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto gap-2 text-sm font-semibold h-11 px-6 text-slate-700 bg-white hover:bg-slate-50 border-slate-300"
            >
              <span>Explore Solutions</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Button>
          </div>

          {/* Key Stat Cards Strip */}
          <div className="mt-14 w-full grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm text-left">
              <div className="text-2xl sm:text-3xl font-extrabold text-blue-600">&lt;40 ms</div>
              <div className="text-xs font-bold text-slate-900 mt-1.5">DSP Latency Budget</div>
              <div className="text-xs text-slate-500 mt-0.5">Sub-frame instant screening</div>
            </div>
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm text-left">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">8 kHz</div>
              <div className="text-xs font-bold text-slate-900 mt-1.5">AMR-NB Resilient</div>
              <div className="text-xs text-slate-500 mt-0.5">Survives 2G/3G cellular codecs</div>
            </div>
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm text-left">
              <div className="text-2xl sm:text-3xl font-extrabold text-blue-600">22 Indic</div>
              <div className="text-xs font-bold text-slate-900 mt-1.5">Scheduled Languages</div>
              <div className="text-xs text-slate-500 mt-0.5">Language-agnostic acoustic physics</div>
            </div>
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm text-left">
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600">DPDP &apos;23</div>
              <div className="text-xs font-bold text-slate-900 mt-1.5">Zero-Disk Storage</div>
              <div className="text-xs text-slate-500 mt-0.5">Volatile RAM in-memory ring buffer</div>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section with Interactive Audience Toggle */}
      <section id="solutions" className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
            Engineered for Critical Banking &amp; Everyday Citizens
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600">
            Select an audience below to explore how Project Tensa provides real-time protection across enterprise pipelines and consumer calls.
          </p>
        </div>

        {/* Segment Switcher Toggle */}
        <div className="flex justify-center mb-10">
          <TabsList className="bg-slate-100 border border-slate-200/80 p-1 h-10">
            <TabsTrigger
              active={activeSegment === 'enterprise'}
              onClick={() => setActiveSegment('enterprise')}
              className="gap-2 px-5 py-1.5 text-xs sm:text-sm font-semibold"
            >
              <Building2 className="w-4 h-4" />
              <span>For Enterprise &amp; Banking</span>
            </TabsTrigger>
            <TabsTrigger
              active={activeSegment === 'consumer'}
              onClick={() => setActiveSegment('consumer')}
              className="gap-2 px-5 py-1.5 text-xs sm:text-sm font-semibold"
            >
              <UserCheck className="w-4 h-4" />
              <span>For Citizens &amp; Families</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Dynamic Audience Content */}
        {activeSegment === 'enterprise' ? (
          /* Enterprise View */
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Feature 1: Core Banking Interceptor */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Core Banking Middleware Interceptor
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Integrates directly with Finacle, BaNCS, and treasury systems. Automatically activates a hard 
                  Maker-Checker lock when a telephonic RTGS/NEFT transfer request exhibits synthetic voice probabilities exceeding 70%.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Enforcement: Step-Up Biometric MFA</span>
                  <span className="text-blue-600 font-semibold">Pre-Fund Dispatch Lock</span>
                </div>
              </div>

              {/* Feature 2: Zero-Code CRM Overlay */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Zero-Code Contact Center Overlay
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  A single-line HTML5 micro-frontend widget for Avaya, Genesys, Cisco Finesse, and Salesforce. 
                  Renders dynamic in-call authenticity indicators: Verified Human, Suspicious, or Critical Threat.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Integration: &lt;voice-guard-banner&gt;</span>
                  <span className="text-blue-600 font-semibold">Zero Core Disruption</span>
                </div>
              </div>

              {/* Feature 3: Telecom SIPREC Gateway */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <Server className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Carrier SBC Media Forking (SIPREC)
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  RFC 7865 media replication on Session Border Controllers across Jio, Airtel, Vi, and BSNL networks. 
                  Enriches telecom softswitches with real-time X-Voice-Authenticity SIP headers without inducing call latency.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Standard: RFC 7865 SIPREC</span>
                  <span className="text-blue-600 font-semibold">&lt;20ms Network Jitter</span>
                </div>
              </div>

              {/* Feature 4: Executive Meeting Sentinel */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Executive Meeting Sentinel Bot
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Headless companion bot for Zoom, MS Teams, and Google Meet video conferences. Analyzes multi-speaker 
                  vocal timbres and alerts board members immediately if a participant voice is synthetically driven.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Platforms: Teams, Zoom, Meet</span>
                  <span className="text-blue-600 font-semibold">In-Meeting Private Alert</span>
                </div>
              </div>
            </div>

            {/* Enterprise Code Snippet Preview */}
            <div className="mt-8 p-6 rounded-xl bg-slate-900 text-slate-200 shadow-md">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <span className="text-xs font-mono text-blue-400 font-semibold">
                  3-Line Client Web SDK Integration (Banking CRM &amp; Treasury)
                </span>
                <span className="text-[11px] font-mono text-slate-400">HTML5 Web Component</span>
              </div>
              <pre className="text-xs font-mono overflow-x-auto text-slate-300 leading-relaxed">
                <code>{`<!-- Include Tensa Sentinel Widget in any Banking Web App -->
<script src="https://cdn.tensa.in/v1/sentinel.js"></script>
<voice-guard-widget
  client-id="HDFC_CORP_TREASURY"
  call-session-id="call_active_904"
  on-threat-detected="handleVoiceThreat">
</voice-guard-widget>`}</code>
              </pre>
            </div>
          </div>
        ) : (
          /* Consumer View */
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Feature 1: Digital Arrest Shield */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-red-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-4">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  &quot;Digital Arrest&quot; Scam Defense Shield
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Fraudsters impersonate senior police officers, CBI directors, or Customs officials on WhatsApp and cellular 
                  calls to extort life savings. Tensa flags synthetic acoustic vocoder artifacts within 1.5 seconds and sounds an in-call warning.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Target: CBI / Police Impersonation</span>
                  <span className="text-red-600 font-semibold">Immediate Audible Alert</span>
                </div>
              </div>

              {/* Feature 2: Emergency Distress & Kidnapping */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Emergency Distress / &quot;Virtual Kidnapping&quot; Guard
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Scammers clone children&apos;s voices crying about college accidents or hospital bail to exploit panic. 
                  Tensa validates biological breathing patterns and phase continuity to expose synthesized emotional cues.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Protection: Family Members &amp; Parents</span>
                  <span className="text-blue-600 font-semibold">Biomechanical Jitter Check</span>
                </div>
              </div>

              {/* Feature 3: Senior Citizen Banking Guard */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Senior Citizen Pension &amp; UPI Guard
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Protects elderly citizens from aggressive social engineering coercing them into sharing OTPs or approving 
                  fraudulent UPI payment links during spoofed bank manager phone calls.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Target: Pension &amp; Fixed Deposits</span>
                  <span className="text-blue-600 font-semibold">Automated Call Intercept</span>
                </div>
              </div>

              {/* Feature 4: Audio Note Scanner */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
                  <FileAudio className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  WhatsApp Voice Note &amp; Voicemail Verifier
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Citizens can drag and drop suspicious audio notes received on messaging apps to run an instant 
                  forensic check against generative TTS neural vocoder signatures.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Format: Opus, MP3, WAV, AAC</span>
                  <span className="text-blue-600 font-semibold">Instant Authenticity Report</span>
                </div>
              </div>
            </div>

            {/* Why 2FA Fails in Social Engineering Box */}
            <div className="mt-8 p-6 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-blue-900">
                    Why Traditional 2-Factor Authentication Fails Against Voice Cloning
                  </h4>
                  <p className="mt-1 text-xs text-blue-900/90 leading-relaxed">
                    In coercive voice scams (&quot;Digital Arrest&quot; and CXO fraud), the victim is on a live phone call with who they believe 
                    is a senior officer. The victim authorizes the transaction or reads the OTP themselves. 2FA only verifies password knowledge; 
                    only real-time acoustic signal integrity can prove whether the voice on the other end is a living human.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* The Indian Context & Telecom Bottleneck */}
      <section id="indian-context" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
              Why Western Audio Detectors Fail on Indian Networks
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              Western anti-spoofing models rely on 8kHz–24kHz high-frequency artifacts in clean studio audio. 
              Indian telephony requires detecting deepfakes inside heavily compressed 8kHz baseband channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 mb-4">
                <PhoneCall className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                The 8kHz AMR-NB Codec Bottleneck
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Standard Indian PSTN and 2G/3G cellular networks compress audio using AMR-NB and G.711 with a hard 3.4 kHz cutoff. 
                Tensa detects deepfakes within the <strong>300 Hz – 3400 Hz baseband</strong> via bispectrum bicoherence and phase unwrapping.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 mb-4">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Code-Switching &amp; 22 Languages
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Indian conversations naturally alternate between languages (Hinglish, Tanglish). 
                Tensa extracts <strong>language-agnostic biomechanical vocal tract physics</strong> rather than phonetic models, 
                preventing false alarms when speakers switch languages mid-sentence.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 mb-4">
                <Radio className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Acoustic Environmental Noise
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Indian call backgrounds carry ceiling fan hum (50Hz), traffic rumble, and room reverb. 
                Synthetic voice models often generate an unnatural &quot;acoustic vacuum&quot; (dead silence between words) or looped noise, 
                which our engine isolates from authentic acoustics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cascaded Dual-Tier Architecture */}
      <section id="architecture" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
              Cascaded Dual-Tier Latency Budget Architecture
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              How Project Tensa balances sub-millisecond screening costs with deep neural accuracy across millions of concurrent streams.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-4">
              {/* Tier 1 Box */}
              <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-blue-50 text-blue-600">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Tier-1: Ultra-Fast DSP Heuristics (&lt;40ms)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Runs on commodity CPU without GPU requirement
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600 pl-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Higher-order bispectrum bicoherence deficit detection</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>STFT frame boundary phase discontinuity estimation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Physiological vocal fold micro-tremor (jitter &amp; shimmer)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Classifies ~70% of routine benign calls without GPU cost</span>
                  </li>
                </ul>
              </div>

              {/* Tier 2 Box */}
              <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-indigo-50 text-indigo-600">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Tier-2: Deep Neural Latent Analysis (&lt;180ms)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Selectively activated for high-stakes or anomalous calls
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600 pl-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>AASIST Graph Attention &amp; RawNet3 raw waveform analysis</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Self-supervised speech representations (WavLM / Wav2Vec2)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Neural vocoder checkerboard artifact localization</span>
                  </li>
                </ul>
              </div>

              {/* Bayesian Engine Box */}
              <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-emerald-50 text-emerald-600">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Dynamic Bayesian Evidence Accumulator
                    </h3>
                    <p className="text-xs text-slate-500">
                      Smooth temporal confidence over 2–3 seconds of continuous audio
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  Prevents erratic score jumps by multiplying likelihood ratios across sliding 500ms windows, 
                  solidifying high-confidence decisions for automated transaction locks.
                </p>
              </div>
            </div>

            {/* Visual Architecture Card */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900">Streaming Defense Data Flow</span>
                <span className="text-[11px] font-mono text-blue-600 font-semibold">&lt; 400ms Total Budget</span>
              </div>
              <div className="mt-5 space-y-3 font-mono text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">
                  <span className="text-slate-400 font-semibold mr-2">[01]</span>
                  RTP Audio Stream (500ms PCM Chunks)
                </div>
                <div className="text-center text-slate-400 font-bold">↓</div>
                <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                  <span className="text-blue-500 font-semibold mr-2">[02]</span>
                  Tier-1 Fast DSP Heuristics (Bicoherence &amp; Phase)
                </div>
                <div className="text-center text-slate-400 font-bold">↓</div>
                <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900">
                  <span className="text-indigo-500 font-semibold mr-2">[03]</span>
                  Tier-2 AASIST / WavLM Latent Verification
                </div>
                <div className="text-center text-slate-400 font-bold">↓</div>
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <span className="text-emerald-500 font-semibold mr-2">[04]</span>
                  Bayesian Risk Score (0.00 – 1.00) ➔ Bank Wire Lock
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Regulatory & Compliance Strip */}
      <section id="compliance" className="py-16 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Indian Statutory &amp; Privacy Compliance
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-left">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Scale className="w-4 h-4 text-blue-600 shrink-0" />
                <span>DPDP Act 2023 §8</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Zero raw voice recording persistence. Audio buffers reside ephemerally in RAM and are wiped after feature extraction.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Database className="w-4 h-4 text-blue-600 shrink-0" />
                <span>RBI Payment Security</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Fulfills RBI directives for active fraud monitoring and non-repudiation on high-value telephonic fund transfer advice.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Eye className="w-4 h-4 text-blue-600 shrink-0" />
                <span>CERT-In Directives</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Automated incident logging and alert generation to satisfy mandatory 6-hour synthetic identity cyber reporting.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Radio className="w-4 h-4 text-blue-600 shrink-0" />
                <span>TRAI Telephony Rules</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Seamless non-intrusive integration over telecom trunk lines without degrading network Quality of Service (QoS).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive SOC Sandbox Callout */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-4xl mx-auto text-center p-8 sm:p-12 rounded-2xl bg-white border border-blue-200 shadow-md">
          <div className="inline-flex p-3 rounded-full bg-blue-50 text-blue-600 mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Experience the Live Voice Defense SOC
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Test our real-time 16kHz audio oscilloscope, composite risk gauge, 6-axis explainability radar, 
            banking wire freeze interceptor, and telephony codec toggles right now.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={onLaunchDemo}
              className="w-full sm:w-auto gap-2 px-8 py-3.5 h-12 text-sm font-bold shadow-sm"
            >
              <Activity className="w-4 h-4" />
              <span>Launch Detection SOC Workbench</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-white text-slate-500 text-xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">Project Tensa</div>
              <div>Smart India Hackathon (SIH 2026) Technical Architecture</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <a href="#solutions" className="hover:text-blue-600 transition-colors">Solutions</a>
            <a href="#indian-context" className="hover:text-blue-600 transition-colors">Indian Context</a>
            <a href="#architecture" className="hover:text-blue-600 transition-colors">Architecture</a>
            <button onClick={onLaunchDemo} className="hover:text-blue-600 transition-colors font-semibold text-blue-600 cursor-pointer">
              Launch SOC
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
