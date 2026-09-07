import React from 'react';
import { cn } from '../../lib/utils';

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark';
}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg p-1 select-none',
        variant === 'dark'
          ? 'bg-slate-950/80 border border-slate-800/90 text-slate-400'
          : 'bg-slate-100 text-slate-500 border border-slate-200/70',
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'default' | 'dark';
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, active, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        variant === 'dark'
          ? active
            ? 'bg-slate-800 text-slate-100 shadow-xs border border-slate-700/80 font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          : active
            ? 'bg-white text-slate-900 shadow-xs font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50',
        className
      )}
      {...props}
    />
  )
);
TabsTrigger.displayName = 'TabsTrigger';
