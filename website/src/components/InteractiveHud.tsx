import React, { useState, useEffect } from 'react';
import type { HudTab } from '../types';
import {
  Navigation,
  AlertTriangle,
  PhoneCall,
  MapPin,
  CornerUpLeft,
  Radio,
  Battery,
  Wifi,
  ShieldAlert,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';

interface InteractiveHudProps {
  panelTitle?: string;
  defaultTab?: HudTab;
}

export const InteractiveHud: React.FC<InteractiveHudProps> = ({
  panelTitle = "Interactive HUD Preview",
  defaultTab = 'nav'
}) => {
  const [activeTab, setActiveTab] = useState<HudTab>(defaultTab);

  // SOS Countdown state
  const [sosSeconds, setSosSeconds] = useState<number>(10);
  const [sosCancelled, setSosCancelled] = useState<boolean>(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (activeTab === 'sos' && !sosCancelled && sosSeconds > 0) {
      timer = setInterval(() => {
        setSosSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeTab, sosCancelled, sosSeconds]);

  const resetSos = () => {
    setSosCancelled(false);
    setSosSeconds(10);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Title Bar & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-heading font-semibold text-lg text-hud-text flex items-center gap-2">
            <Radio className="w-4 h-4 text-hud-primary animate-pulse" />
            {panelTitle}
          </h3>
          <p className="text-xs text-hud-muted">
            Simulated SSD1306 birdbath optic optical projection
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface border border-hud-border">
          <button
            onClick={() => setActiveTab('nav')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'nav'
                ? 'bg-hud-primary text-background font-bold shadow-hud-cyan'
                : 'text-hud-muted hover:text-hud-text hover:bg-surface-hover'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Navigation</span>
          </button>

          <button
            onClick={() => setActiveTab('hazard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'hazard'
                ? 'bg-hud-warning text-background font-bold shadow-hud-warning'
                : 'text-hud-muted hover:text-hud-text hover:bg-surface-hover'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Hazard Alert</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('sos');
              resetSos();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'sos'
                ? 'bg-hud-hazard text-white font-bold shadow-hud-hazard'
                : 'text-hud-muted hover:text-hud-text hover:bg-surface-hover'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>SOS</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'map'
                ? 'bg-hud-purple text-white font-bold'
                : 'text-hud-muted hover:text-hud-text hover:bg-surface-hover'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Hazard Map</span>
          </button>
        </div>
      </div>

      {/* Simulated Helmet HUD Screen Shell */}
      <div className="relative rounded-2xl bg-black border-2 border-hud-border/80 overflow-hidden shadow-2xl">
        {/* Subtle corner crosshairs for tactical HUD appearance */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-hud-primary/40 pointer-events-none" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-hud-primary/40 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-hud-primary/40 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-hud-primary/40 pointer-events-none" />

        {/* Top Telemetry Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-hud-border/40 text-[11px] font-mono text-hud-muted bg-surface/30">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-hud-safe">
              <span className="w-2 h-2 rounded-full bg-hud-safe animate-ping" />
              <span>LINKED (ESP32-S3)</span>
            </span>
            <span className="hidden sm:inline text-hud-muted/50">|</span>
            <span className="hidden sm:inline">GPS FIX 9 SAT</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-hud-primary">
              <Wifi className="w-3.5 h-3.5" />
              <span>BLE 4.2ms</span>
            </span>
            <span className="flex items-center gap-1 text-hud-text">
              <Battery className="w-3.5 h-3.5 text-hud-safe" />
              <span>88%</span>
            </span>
          </div>
        </div>

        {/* Display Viewport Content */}
        <div className="p-6 sm:p-10 min-h-[320px] flex items-center justify-center bg-radial-vignette relative">

          {/* TAB 1: NAVIGATION MODE */}
          {activeTab === 'nav' && (
            <div className="w-full flex flex-col md:flex-row items-center justify-between gap-8 animate-in fade-in duration-200">
              <div className="flex items-center gap-6">
                {/* Glowing Turn Indicator */}
                <div className="relative w-24 h-24 rounded-2xl bg-hud-primary/10 border-2 border-hud-primary/50 flex items-center justify-center shadow-hud-cyan">
                  <CornerUpLeft className="w-14 h-14 text-hud-primary animate-pulse" />
                  <span className="absolute -bottom-2.5 bg-background px-2 py-0.5 rounded text-[10px] font-mono text-hud-primary border border-hud-primary/40">
                    150m
                  </span>
                </div>

                {/* Instruction */}
                <div>
                  <div className="text-xs font-mono text-hud-primary tracking-wider uppercase mb-1">
                    Next Maneuver
                  </div>
                  <h4 className="font-heading font-bold text-2xl sm:text-3xl text-hud-text">
                    TURN LEFT in 150m
                  </h4>
                  <p className="text-sm font-mono text-hud-muted mt-1">
                    Outer Ring Rd → Tech Corridor
                  </p>
                </div>
              </div>

              {/* Speed Telemetry Readout */}
              <div className="flex flex-col items-center md:items-end p-4 rounded-xl bg-surface/50 border border-hud-border">
                <span className="text-[11px] font-mono text-hud-muted uppercase tracking-widest">
                  Live Speed
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-mono text-4xl sm:text-5xl font-bold text-hud-safe">
                    48
                  </span>
                  <span className="font-mono text-xs text-hud-muted">km/h</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-hud-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-hud-safe" />
                  <span>SPEED LIMIT: 60</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HAZARD ALERT MODE */}
          {activeTab === 'hazard' && (
            <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
              <div className="w-full p-6 rounded-2xl bg-hud-hazard/10 border-2 border-hud-hazard shadow-hud-hazard flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-hud-hazard/20 border border-hud-hazard flex items-center justify-center animate-bounce">
                  <AlertTriangle className="w-10 h-10 text-hud-hazard" />
                </div>

                <span className="font-mono text-xs font-bold text-hud-hazard tracking-widest uppercase bg-hud-hazard/20 px-3 py-1 rounded-full border border-hud-hazard/30">
                  ! ROAD HAZARD DETECTED !
                </span>

                <h4 className="font-heading font-bold text-3xl sm:text-4xl text-white tracking-wide">
                  POTHOLE IN LANE
                </h4>

                <p className="font-mono text-base font-semibold text-hud-warning animate-pulse">
                  SLOW DOWN · 35 METERS AHEAD
                </p>

                <div className="w-full pt-3 border-t border-hud-hazard/30 flex items-center justify-between text-xs font-mono text-hud-muted">
                  <span>Confidence: 94.2%</span>
                  <span>Inference: BPI-M4 YOLOv8n</span>
                  <span>Music Ducked -18dB</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOS EMERGENCY CRASH DISPATCH */}
          {activeTab === 'sos' && (
            <div className="w-full max-w-md mx-auto flex flex-col items-center text-center animate-in fade-in duration-200">
              {sosCancelled ? (
                <div className="p-6 rounded-2xl bg-surface/80 border border-hud-safe/40 flex flex-col items-center gap-3">
                  <CheckCircle2 className="w-12 h-12 text-hud-safe" />
                  <h4 className="font-heading font-bold text-xl text-hud-safe">
                    SOS Dispatch Aborted
                  </h4>
                  <p className="text-xs text-hud-muted">
                    False alarm confirmed. Normal navigation resumed.
                  </p>
                  <button
                    onClick={resetSos}
                    className="mt-2 flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-surface border border-hud-border hover:border-hud-primary text-xs font-mono text-hud-text"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Simulation
                  </button>
                </div>
              ) : (
                <div className="w-full p-6 rounded-2xl bg-hud-hazard/10 border-2 border-hud-hazard shadow-hud-hazard flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 text-hud-hazard font-mono text-xs font-bold uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 animate-pulse" />
                    Crash Sensor Triggered (MPU6050)
                  </div>

                  {/* Countdown Circle */}
                  <div className="relative w-28 h-28 rounded-full border-4 border-hud-hazard/40 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-hud-hazard border-t-transparent animate-spin" />
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-4xl font-bold text-white">
                        {sosSeconds}s
                      </span>
                      <span className="text-[10px] font-mono text-hud-hazard uppercase">
                        Dispatching
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-hud-muted max-w-xs">
                    Sending GPS location (12.9716° N, 77.5946° E) to registered emergency contacts.
                  </p>

                  {/* Cancel Button */}
                  <button
                    onClick={() => setSosCancelled(true)}
                    className="w-full py-2.5 rounded-xl bg-hud-hazard hover:bg-hud-hazard/90 text-white font-bold text-sm shadow-hud-hazard transition-transform active:scale-95"
                  >
                    I'M OK — CANCEL SOS
                  </button>

                  {/* Registered Emergency Contacts Chips */}
                  <div className="w-full pt-3 border-t border-hud-hazard/30 flex flex-wrap gap-2 justify-center">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-hud-border text-hud-muted">
                      Mom: +91 98765 43210
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-hud-border text-hud-muted">
                      Emergency Desk: 112
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HAZARD MAP MODE */}
          {activeTab === 'map' && (
            <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
              <div className="relative w-full max-w-lg h-60 rounded-xl bg-surface/70 border border-hud-border overflow-hidden hud-grid-pattern flex items-center justify-center">

                {/* Concentric Radar Circles */}
                <div className="absolute w-48 h-48 rounded-full border border-hud-border/40 pointer-events-none" />
                <div className="absolute w-32 h-32 rounded-full border border-hud-border/30 pointer-events-none" />
                <div className="absolute w-16 h-16 rounded-full border border-hud-primary/20 pointer-events-none" />

                {/* Rider Current Location */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-4 h-4 rounded-full bg-hud-primary shadow-hud-cyan animate-pulse flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-background" />
                  </div>
                  <span className="text-[9px] font-mono text-hud-primary bg-background/80 px-1 rounded mt-1 border border-hud-primary/30">
                    YOU (Live)
                  </span>
                </div>

                {/* Crowdsourced Hazard Pins */}
                <div className="absolute top-12 left-20 flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-hud-hazard shadow-hud-hazard" />
                  <span className="text-[9px] font-mono text-hud-hazard bg-background/90 px-1 rounded border border-hud-hazard/40">
                    Pothole #42
                  </span>
                </div>

                <div className="absolute bottom-12 right-24 flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-hud-warning shadow-hud-warning" />
                  <span className="text-[9px] font-mono text-hud-warning bg-background/90 px-1 rounded border border-hud-warning/40">
                    Debris (5m ago)
                  </span>
                </div>

                <div className="absolute top-16 right-16 flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-hud-hazard shadow-hud-hazard" />
                  <span className="text-[9px] font-mono text-hud-hazard bg-background/90 px-1 rounded border border-hud-hazard/40">
                    Deep Crater
                  </span>
                </div>

                {/* Map HUD Legend Overlay */}
                <div className="absolute bottom-2 left-2 text-[10px] font-mono text-hud-muted bg-background/80 px-2 py-0.5 rounded border border-hud-border">
                  RADIUS: 1.5 KM · 3 HAZARDS CACHED
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Bottom Hardware Status Footer */}
        <div className="px-6 py-2.5 bg-surface/50 border-t border-hud-border/40 flex flex-wrap items-center justify-between text-[10px] font-mono text-hud-muted gap-2">
          <span>BH1750 AMBIENT: 420 LUX (DAY MODE)</span>
          <span>OPTICS: BIRDBATH 55% TRANSPARENCY</span>
          <span>LATENCY: 12ms</span>
        </div>
      </div>
    </div>
  );
};
