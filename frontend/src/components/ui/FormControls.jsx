import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const INVALID = 'border-rose-400! focus:ring-rose-500/20!';

export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${invalid ? INVALID : ''} ${className}`} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ invalid, className = '', ...props }, ref) {
  return <textarea ref={ref} rows={3} className={`input py-2.5 ${invalid ? INVALID : ''} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ invalid, className = '', children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={`input appearance-none pr-10 ${invalid ? INVALID : ''} ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
});