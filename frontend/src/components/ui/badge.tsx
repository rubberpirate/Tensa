import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 select-none';

  const variants = {
    default: 'border-transparent bg-slate-900 text-white shadow-xs',
    secondary: 'border-slate-200 bg-slate-100 text-slate-800',
    destructive: 'border-rose-200 bg-rose-50 text-rose-700',
    outline: 'border-slate-200 text-slate-700 bg-white shadow-2xs',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  };

  return <div className={cn(baseStyles, variants[variant], className)} {...props} />;
};
