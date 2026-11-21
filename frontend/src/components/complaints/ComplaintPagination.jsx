export default function ComplaintPagination({ pagination, loading, onPage, label }) {
  if (!pagination?.total) return null;
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} {label === 'Complaint history pages' ? 'activities' : 'complaints'}</p>
    <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button><button type="button" className="btn-secondary" disabled={loading || !pagination.hasMore} onClick={() => onPage(pagination.page + 1)}>Next</button></div>
  </nav>;
}
