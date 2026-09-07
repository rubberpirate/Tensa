import React from 'react';
import { Shield, Activity, ArrowRight } from 'lucide-react';

interface NavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPath, onNavigate }) => {
  const isSocPage = currentPath === '/soc';

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Logo */}
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-3 cursor-pointer text-left bg-transparent border-0 p-0"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight">
                Project Tensa
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                SIH 2026
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Voice Cloning & Telecom Deepfake Defense
            </p>
          </div>
        </button>

        {/* Navigation Links (Desktop) */}
        {!isSocPage && (
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#solutions"
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Solutions
            </a>
            <a
              href="#indian-context"
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Indian Context
            </a>
            <a
              href="#architecture"
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Architecture
            </a>
            <a
              href="#compliance"
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              Compliance
            </a>
          </div>
        )}

        {/* Right CTA / Mode Switcher */}
        <div className="flex items-center gap-3">
          {isSocPage ? (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live SOC Active
              </div>
              <button
                onClick={() => onNavigate('/')}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
              >
                ← Back to Overview
              </button>
            </>
          ) : (
            <button
              onClick={() => onNavigate('/soc')}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer shadow-xs"
            >
              <Activity className="w-4 h-4" />
              <span>Launch Live SOC Demo</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};
