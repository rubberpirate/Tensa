import React from 'react';
import type { ThreatLevel, CallContextState } from '../types';
import { ShieldAlert, ShieldCheck, Lock, AlertTriangle, ArrowUpRight } from 'lucide-react';

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
    <div
      className="clean-card"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Transaction Fraud Interceptor
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Automated core banking policy enforcement
          </p>
        </div>
        <div>
          {isLocked ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-danger-text)',
                background: 'var(--color-danger-bg)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-danger-border)',
              }}
            >
              <Lock size={12} /> Hard Intercept Active
            </span>
          ) : isSuspicious ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-warn-text)',
                background: 'var(--color-warn-bg)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-warn-border)',
              }}
            >
              <AlertTriangle size={12} /> Step-Up Verification
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-safe-text)',
                background: 'var(--color-safe-bg)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-safe-border)',
              }}
            >
              <ShieldCheck size={12} /> Verified Call Flow
            </span>
          )}
        </div>
      </div>

      {/* Transaction Details & Context Modifiers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '14px',
          background: 'var(--bg-card-subtle)',
          padding: '16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
            Beneficiary Account
          </label>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
            HDFC •••• 8921 (Apex Corp)
          </div>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
            Wire Transfer Amount
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[50000, 500000, 2500000].map((amt) => {
              const isSelected = context.transactionAmountINR === amt;
              return (
                <button
                  key={amt}
                  onClick={() => onUpdateContext({ transactionAmountINR: amt })}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    border: isSelected
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--border-default)',
                    background: isSelected
                      ? 'var(--color-primary-light)'
                      : '#ffffff',
                    color: isSelected
                      ? 'var(--color-primary)'
                      : 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  ₹{(amt / 100000).toFixed(amt < 100000 ? 1 : 0)}L
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
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
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              border:
                context.callerChannel === 'UNREGISTERED_VOIP'
                  ? '1px solid var(--color-warn)'
                  : '1px solid var(--border-default)',
              background:
                context.callerChannel === 'UNREGISTERED_VOIP'
                  ? 'var(--color-warn-bg)'
                  : '#ffffff',
              color:
                context.callerChannel === 'UNREGISTERED_VOIP'
                  ? 'var(--color-warn-text)'
                  : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            {context.callerChannel === 'REGISTERED_SIP' ? 'SIP Trunk (Verified)' : 'VoIP (+15% Risk)'}
          </button>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
            Call Schedule
          </label>
          <button
            onClick={() => onUpdateContext({ isOffHours: !context.isOffHours })}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              border: context.isOffHours
                ? '1px solid var(--color-warn)'
                : '1px solid var(--border-default)',
              background: context.isOffHours
                ? 'var(--color-warn-bg)'
                : '#ffffff',
              color: context.isOffHours
                ? 'var(--color-warn-text)'
                : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            {context.isOffHours ? 'Off-Hours (+10% Risk)' : 'Standard Hours'}
          </button>
        </div>
      </div>

      {/* Dynamic Action Trigger Banner */}
      <div
        style={{
          padding: '16px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          background: isLocked
            ? 'var(--color-danger-bg)'
            : isSuspicious
            ? 'var(--color-warn-bg)'
            : 'var(--color-safe-bg)',
          border: `1px solid ${
            isLocked
              ? 'var(--color-danger-border)'
              : isSuspicious
              ? 'var(--color-warn-border)'
              : 'var(--color-safe-border)'
          }`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
          {isLocked ? (
            <ShieldAlert size={24} color="var(--color-danger)" />
          ) : isSuspicious ? (
            <AlertTriangle size={24} color="var(--color-warn)" />
          ) : (
            <ShieldCheck size={24} color="var(--color-safe)" />
          )}

          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: isLocked
                  ? 'var(--color-danger-text)'
                  : isSuspicious
                  ? 'var(--color-warn-text)'
                  : 'var(--color-safe-text)',
              }}
            >
              {isLocked
                ? 'Transaction Frozen — High Risk Intercept'
                : isSuspicious
                ? 'Secondary Challenge Enforced'
                : 'Transaction Permitted'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isLocked
                ? `Threat index ${(compositeScore * 100).toFixed(0)}% exceeds safe threshold (${actionRecommended}). Wire dispatch held.`
                : isSuspicious
                ? `Perform agent secondary verification challenge (${actionRecommended}) before authorizing funds.`
                : `Voice biometrics validated within biological confidence limits (${actionRecommended}).`}
            </div>
          </div>
        </div>

        <button
          disabled={isLocked}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 18px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '12px',
            cursor: isLocked ? 'not-allowed' : 'pointer',
            background: isLocked ? '#e2e8f0' : 'var(--color-primary)',
            color: isLocked ? 'var(--text-muted)' : '#ffffff',
            border: 'none',
            boxShadow: isLocked ? 'none' : 'var(--shadow-sm)',
            opacity: isLocked ? 0.6 : 1,
            transition: 'all var(--transition-fast)',
          }}
        >
          {isLocked ? <Lock size={14} /> : <ArrowUpRight size={14} />}
          {isLocked ? 'Frozen' : 'Authorize Wire'}
        </button>
      </div>
    </div>
  );
};
