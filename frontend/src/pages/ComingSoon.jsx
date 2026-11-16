import { Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';

// Placeholder for modules that are built in a later step. It makes no fake promises.
export default function ComingSoon({ title, step }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold text-slate-900">{title}</h1>
      <div className="card">
        <EmptyState
          icon={Construction}
          title="Not built yet"
          text={`This screen is part of frontend step ${step}. The backend API for it is already ready.`}
          action={<Link to="/" className="btn-primary">Back to dashboard</Link>}
        />
      </div>
    </div>
  );
}