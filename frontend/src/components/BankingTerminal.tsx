import React from 'react';
import type { ThreatLevel, CallContextState } from '../types';
import { ShieldAlert, ShieldCheck, Lock, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface BankingTerminalProps {
  threatLevel: ThreatLevel;
  compositeScore: number;
  actionRecommended: string;
  context: CallContextState;
  onUpdateContext: (ctx: Partial<CallContextState>) => void;
}

export const BankingTerminal: React.FC<BankingTerminalProps> = ({
  threatLevel,
  compositeScore,
  actionRecommended,
  context,
  onUpdateContext,
}) => {
  const isLocked = threatLevel === 'RED';
  const isSuspicious = threatLevel === 'AMBER';

  return (
    <Card className="flex flex-col justify-between h-full bg-white border-slate-200/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between p-5 sm:p-6 pb-3">
        <div>
          <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-slate-900">
            Transaction Fraud Interceptor
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Automated core banking policy & real-time fund hold engine
          </CardDescription>
        </div>
        <div>
          {isLocked ? (
            <Badge variant="destructive" className="gap-1.5 text-xs px-2.5 py-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Hard Intercept Active</span>
            </Badge>
          ) : isSuspicious ? (
            <Badge variant="warning" className="gap-1.5 text-xs px-2.5 py-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Step-Up Verification</span>
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1.5 text-xs px-2.5 py-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Call Flow</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col justify-between flex-1 gap-4 p-5 sm:p-6 pt-0">
        {/* Context Controls Grid (2x2 for left rail) */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Beneficiary Account
            </label>
            <div className="font-mono text-xs font-bold text-slate-900 truncate">
              HDFC •••• 8921 (Apex Corp)
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Wire Amount (INR)
            </label>
            <div className="flex gap-1">
              {[50000, 500000, 2500000].map((amt) => {
                const isSelected = context.transactionAmountINR === amt;
                return (
                  <button
                    key={amt}
                    onClick={() => onUpdateContext({ transactionAmountINR: amt })}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer border active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none',
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    )}
                  >
                    ₹{(amt / 100000).toFixed(amt < 100000 ? 1 : 0)}L
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Telephony Ingestion
            </label>
            <button
              onClick={() =>
                onUpdateContext({
                  callerChannel:
                    context.callerChannel === 'REGISTERED_SIP'
                      ? 'UNREGISTERED_VOIP'
                      : 'REGISTERED_SIP',
                })
              }
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer border w-full text-left truncate active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none',
                context.callerChannel === 'UNREGISTERED_VOIP'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              )}
            >
              {context.callerChannel === 'REGISTERED_SIP'
                ? 'SIP Trunk (Verified)'
                : 'VoIP (+15% Risk)'}
            </button>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Call Schedule
            </label>
            <button
              onClick={() => onUpdateContext({ isOffHours: !context.isOffHours })}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer border w-full text-left truncate active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none',
                context.isOffHours
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              )}
            >
              {context.isOffHours ? 'Off-Hours (+10% Risk)' : 'Standard Hours'}
            </button>
          </div>
        </div>

        {/* Dynamic Action Trigger Banner */}
        <div
          className={cn(
            'p-2.5 rounded-lg flex items-center justify-between gap-2 border transition-colors',
            isLocked
              ? 'bg-rose-50/80 border-rose-200 text-rose-900'
              : isSuspicious
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isLocked ? (
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            ) : isSuspicious ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold leading-tight">
                {isLocked
                  ? 'Transaction Frozen — High Risk Intercept'
                  : isSuspicious
                  ? 'Secondary Challenge Enforced'
                  : 'Transaction Permitted'}
              </div>
              <div className="text-[10px] opacity-85 leading-tight truncate mt-0.5">
                {isLocked
                  ? `Threat score ${Math.round(compositeScore * 100)}% exceeded. Wire held.`
                  : isSuspicious
                  ? `Policy challenge: ${actionRecommended}`
                  : `Voice biometrics verified (${actionRecommended})`}
              </div>
            </div>
          </div>

          <Button
            disabled={isLocked}
            variant={isLocked ? 'secondary' : 'default'}
            size="sm"
            className={cn(
              'shrink-0 h-7 text-xs px-2.5 gap-1',
              !isLocked && 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
            )}
          >
            {isLocked ? <Lock className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
            <span>{isLocked ? 'Frozen' : 'Authorize Wire'}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BankingTerminal;
