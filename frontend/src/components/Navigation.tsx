import React from 'react';
import { Shield, Activity, FileText, ArrowRight, PhoneCall } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { TabsList, TabsTrigger } from './ui/tabs';

interface NavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isConnected?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPath, onNavigate, isConnected }) => {
  const isSocPage = currentPath === '/soc';

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-15 flex items-center justify-between">
        {/* Brand & Logo */}
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer text-left bg-transparent border-0 p-0 select-none group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm sm:text-base text-slate-900 tracking-tight">
                Project Tensa
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 text-slate-600 bg-slate-100 border-slate-200">
                SIH 2026
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5">
              Voice Cloning & Telecom Deepfake Defense
            </p>
          </div>
        </button>

        {/* Center Mode Switcher Tabs */}
        <div className="flex items-center">
          <TabsList className="bg-slate-100/90 border border-slate-200/80 h-8 p-0.5">
            <TabsTrigger
              active={currentPath === '/'}
              onClick={() => onNavigate('/')}
              className="gap-1.5 px-3 py-1 text-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger
              active={currentPath === '/dialer'}
              onClick={() => onNavigate('/dialer')}
              className="gap-1.5 px-3 py-1 text-xs"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
              <span>Phone Dialer</span>
            </TabsTrigger>
            <TabsTrigger
              active={currentPath === '/soc'}
              onClick={() => onNavigate('/soc')}
              className="gap-1.5 px-3 py-1 text-xs"
            >
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span>Live SOC</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Right Action / Status */}
        <div className="flex items-center gap-2.5">
          {isSocPage ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-600 shadow-2xs">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px] font-mono">
                {isConnected ? 'Engine Online' : 'Connecting...'}
              </span>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => onNavigate('/soc')}
              className="gap-1.5 h-8 text-xs font-semibold shadow-xs"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Launch Live SOC</span>
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
};

