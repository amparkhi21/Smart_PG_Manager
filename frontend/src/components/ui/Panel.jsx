import { Link } from 'react-router-dom';

// A titled card used for dashboard lists and charts
export default function Panel({ title, to, linkText = 'View all', children, className = '' }) {
  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-bold text-slate-900">{title}</h2>
        {to && (
          <Link to={to} className="text-sm font-semibold text-teal-600 hover:text-teal-700">
            {linkText}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}