import { forwardRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';

const INVALID = 'border-rose-400! focus:ring-rose-500/20!';

export function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? 'text' : 'password'} className={`pr-12 ${className}`} />
    <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      onClick={() => setVisible((value) => !value)} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>;
}

export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span aria-hidden="true" className="text-rose-500 after:content-['_*']" />}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1.5 text-sm font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className = '', ...props }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} aria-describedby={invalid && props.id ? `${props.id}-error` : undefined} className={`input ${invalid ? INVALID : ''} ${className}`} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ invalid, className = '', ...props }, ref) {
  return <textarea ref={ref} rows={3} className={`input py-2.5 ${invalid ? INVALID : ''} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ invalid, className = '', children, ...props }, ref) {
  return (
    <div className="relative min-w-0">
      <select ref={ref} className={`input appearance-none pr-10 ${invalid ? INVALID : ''} ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
});
