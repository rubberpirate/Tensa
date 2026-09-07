import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warn';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-semibold ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none';

    const variants = {
      default: 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs active:bg-slate-950',
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/80 active:bg-slate-300',
      outline:
        'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs active:bg-slate-100',
      ghost: 'hover:bg-slate-100 hover:text-slate-900 text-slate-600',
      destructive: 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs active:bg-rose-800',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs active:bg-emerald-800',
      warn: 'bg-amber-600 text-white hover:bg-amber-700 shadow-xs active:bg-amber-800',
    };

    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-10 px-6 text-sm',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
