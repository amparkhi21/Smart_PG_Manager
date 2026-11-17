import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileDown, IndianRupee, Zap, DoorOpen, Users, Wallet } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import MonthYearPicker from '../components/ui/MonthYearPicker.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import { currentMonth, formatCurrency, formatMonth } from '../utils/format.js';
import { downloadCsv, summarizeReport } from '../utils/reports.js';
import { downloadMonthlyReportPdf } from '../utils/pdf.js';

const EXPORTS = [
  ['rooms', 'Rooms'],
  ['residents', 'Residents'],
  ['attendance', 'Attendance (selected month)'],
  ['rent-records', 'Monthly rent records'],
  ['rent-payments', 'Rent payment transactions (all)'],
  ['electricity-bills', 'Electricity bills (all)'],
  ['electricity-payments', 'Electricity payment transactions (all)'],
  ['monthly-summary', 'Monthly financial summary'],
];

export default function Reports() {
  const [month, setMonth] = useState(currentMonth());
  const [exportType, setExportType] = useState('monthly-summary');
  const { data: response, loading, error, reload } = useFetch(
    async () => ({ ...(await api.get('/reports', { params: { month } })).data, month }),
    [month]
  );
  const data = response?.month === month ? response.data : null;
  const report = useMemo(() => (data ? summarizeReport({ ...data, month }) : null), [data, month]);
  const outstanding = useMemo(
    () => data ? [
      ...(data.rentRecords || []).filter((item) => item.month === month && item.balance > 0).map((item) => ({
        id: `rent-${item._id}`,
        kind: 'Rent',
        label: `${item.resident?.fullName || 'Resident'} · Room ${item.room?.roomNumber || '-'}`,
        balance: item.balance,
      })),
      ...(data.electricityBills || []).filter((item) => item.month === month && item.balance > 0).map((item) => ({
        id: `electricity-${item._id}`,
        kind: 'Electricity',
        label: `Room ${item.room?.roomNumber || '-'}`,
        balance: item.balance,
      })),
    ] : [],
    [data, month]
  );

  const exportCsv = () => {
    try {
      downloadCsv(exportType, data, month);
    } catch (exportError) {
      toast.error(exportError.message || 'Could not export CSV');
    }
  };
  const exportPdf = async () => {
    try {
      await downloadMonthlyReportPdf({ data, report });
    } catch (exportError) {
      toast.error(exportError.message || 'Could not create report');
    }
  };

  return (
    <div>
      <PageHeader title="Financial Reports" subtitle={formatMonth(month)}>
        <MonthYearPicker value={month} onChange={setMonth} disabled={loading} />
        <button className="btn-secondary" disabled={!data} onClick={exportPdf}><FileDown size={17} /> Download PDF</button>
      </PageHeader>

      {loading && !data ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24" />)}</div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !report ? (
        <div className="card"><EmptyState title="Report unavailable" text="Select a billing month to load its report." /></div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            Billing totals are grouped by the selected bill month. “Collected against billing month” includes payments recorded on those bills regardless of payment date; “Payments received” uses transaction dates in {formatMonth(month)} (Asia/Kolkata). Outstanding values are current balances on the selected month’s records. Occupancy is current.
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Wallet} label="Rent billed" value={formatCurrency(report.rentBilled)} tone="navy" />
            <StatCard icon={IndianRupee} label="Rent collected against bill month" value={formatCurrency(report.rentCollected)} tone="emerald" />
            <StatCard icon={Wallet} label="Current rent outstanding" value={formatCurrency(report.rentOutstanding)} tone="orange" />
            <StatCard icon={Zap} label="Electricity billed" value={formatCurrency(report.electricityBilled)} tone="navy" />
            <StatCard icon={IndianRupee} label="Electricity collected against bill month" value={formatCurrency(report.electricityCollected)} tone="emerald" />
            <StatCard icon={Zap} label="Current electricity outstanding" value={formatCurrency(report.electricityOutstanding)} tone="orange" />
            <StatCard icon={IndianRupee} label="Combined collected against bill month" value={formatCurrency(report.combinedCollected)} tone="teal" />
            <StatCard icon={IndianRupee} label="Payments received in selected month" value={formatCurrency(report.totalReceivedInMonth)} tone="emerald" />
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <StatCard icon={DoorOpen} label="Rooms occupied (current)" value={`${report.occupancy.occupiedRooms} / ${report.occupancy.rooms}`} tone="navy" />
            <StatCard icon={Users} label="Active residents (current)" value={report.occupancy.activeResidents} sub={`${report.occupancy.vacantRooms} vacant rooms · ${report.occupancy.beds} beds`} tone="teal" />
          </div>

          <section className="card mb-5 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Outstanding dues · {formatMonth(month)}</h2>
                <p className="text-xs text-slate-500">Current balance on bills for this billing month.</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Select aria-label="CSV export type" value={exportType} onChange={(event) => setExportType(event.target.value)} className="min-w-0 flex-1 sm:w-64">
                  {EXPORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <button className="btn-accent shrink-0" disabled={!data} onClick={exportCsv}><Download size={16} /> CSV</button>
              </div>
            </div>
            {outstanding.length ? (
              <ul className="divide-y divide-slate-100">
                {outstanding.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.kind}</p>
                    </div>
                    <span className="shrink-0 font-bold text-orange-700">{formatCurrency(item.balance)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-5 text-center text-sm text-slate-500">No outstanding balances for this billing month.</p>}
          </section>
          <p className="text-xs text-slate-400">Room and resident exports omit phone numbers, email addresses, and emergency contacts. Payment exports include receipt references based on the stored transaction IDs.</p>
        </>
      )}
    </div>
  );
}
