import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BedDouble, DoorOpen, DoorClosed, Users, IndianRupee, Wallet, Clock, Zap, UserPlus, PlusCircle,
  CalendarClock, Building2, CheckCircle2,
} from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import StatCard from '../components/ui/StatCard.jsx';
import Panel from '../components/ui/Panel.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { currentMonth, formatCompact, formatCurrency, formatDate, formatMonth } from '../utils/format.js';

const COLORS = { billed: '#243b6b', collected: '#14b8a6', pending: '#f97316' };

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get('/dashboard', { params: { month } })).data.data,
    [month]
  );

  const header = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatMonth(month)}</p>
      </div>
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        className="input w-auto"
        aria-label="Select month"
      />
    </div>
  );

  if (loading && !data) return <>{header}<DashboardSkeleton /></>;
  if (error && !data) return <>{header}<ErrorState message={error} onRetry={reload} /></>;

  const { rooms, residents, rent, electricity, outstanding, recentPayments, pendingRent, upcomingDeadlines } = data;

  const barData = [
    { name: 'Rent', Billed: rent.billed, Collected: rent.collected, Pending: rent.pending },
    { name: 'Electricity', Billed: electricity.billed, Collected: electricity.collected, Pending: electricity.pending },
  ];
  const pieData = [
    { name: 'Occupied', value: rooms.occupied, color: '#14b8a6' },
    { name: 'Vacant', value: rooms.vacant, color: '#cbd5e1' },
  ];

  return (
    <div className={loading ? 'opacity-70 transition' : 'transition'}>
      {header}

      {/* Quick actions */}
      <div className="mb-5 grid grid-cols-3 gap-2 sm:flex sm:gap-3">
        <Link to="/residents" className="btn-primary flex-col !gap-1 py-2 text-xs sm:flex-row sm:text-sm"><UserPlus size={18} /> Add resident</Link>
        <Link to="/rooms" className="btn-secondary flex-col !gap-1 py-2 text-xs sm:flex-row sm:text-sm"><PlusCircle size={18} /> Add room</Link>
        <Link to="/rent" className="btn-accent flex-col !gap-1 py-2 text-xs sm:flex-row sm:text-sm"><IndianRupee size={18} /> Record payment</Link>
      </div>

      {/* Rooms and residents */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={BedDouble} label="Total Rooms" value={rooms.total} tone="navy" />
        <StatCard icon={DoorClosed} label="Occupied Rooms" value={rooms.occupied} tone="teal" />
        <StatCard icon={DoorOpen} label="Vacant Rooms" value={rooms.vacant} tone="orange" />
        <StatCard icon={Users} label="Active Residents" value={residents.active} tone="emerald" />
      </div>

      {/* Money */}
      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 p-5 text-white lg:col-span-1">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-500/25" />
          <p className="relative text-sm font-medium text-navy-100">Total Outstanding (all months)</p>
          <p className="relative mt-1 text-3xl font-extrabold">{formatCurrency(outstanding.total)}</p>
          <div className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-navy-200">Rent</p>
              <p className="font-bold">{formatCurrency(outstanding.rent)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-navy-200">Electricity</p>
              <p className="font-bold">{formatCurrency(outstanding.electricity)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <StatCard icon={Wallet} label="Monthly Rent Billed" value={formatCurrency(rent.billed)} tone="navy" />
          <StatCard icon={CheckCircle2} label="Rent Collected" value={formatCurrency(rent.collected)} tone="emerald" />
          <StatCard icon={Clock} label="Pending Rent" value={formatCurrency(rent.pending)} tone="orange" />
          <StatCard
            icon={Zap}
            label="Electricity Bills"
            value={formatCurrency(electricity.billed)}
            sub={`${formatCurrency(electricity.collected)} collected · ${formatCurrency(electricity.pending)} pending`}
            tone="teal"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Panel title={`Billing overview · ${formatMonth(month)}`} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={formatCompact} width={52} />
                <Tooltip formatter={(v) => formatCurrency(v)} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Billed" fill={COLORS.billed} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Collected" fill={COLORS.collected} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Pending" fill={COLORS.pending} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Room occupancy">
          {rooms.total === 0 ? (
            <EmptyState icon={Building2} title="No rooms yet" text="Add your first room to see occupancy." />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">
                      {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-5 text-sm">
                {pieData.map((d) => (
                  <span key={d.name} className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name} <b className="text-slate-900">{d.value}</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Residents with pending rent" to="/rent">
          {pendingRent.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All rent is paid" text="No pending rent right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingRent.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{r.resident?.fullName}</p>
                    <p className="truncate text-xs text-slate-500">Room {r.room?.roomNumber} · {formatMonth(r.month)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold text-slate-900">{formatCurrency(r.balance)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming deadlines">
          {upcomingDeadlines.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No upcoming deadlines" text="Unpaid bills that are not yet overdue appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingDeadlines.map((d) => (
                <li key={`${d.type}-${d._id}`} className="flex items-center gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${d.type === 'rent' ? 'bg-navy-50 text-navy-700' : 'bg-teal-50 text-teal-600'}`}>
                    {d.type === 'rent' ? <IndianRupee size={17} /> : <Zap size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">
                      {d.type === 'rent' ? d.resident?.fullName : `Room ${d.room?.roomNumber} electricity`}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {d.type === 'rent' ? `Room ${d.room?.roomNumber} · ` : ''}Due {formatDate(d.dueDate)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-slate-900">{formatCurrency(d.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent payments" to="/payments">
          {recentPayments.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments yet" text="Recorded rent and electricity payments appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentPayments.map((p, i) => (
                <li key={`${p.recordId}-${i}`} className="flex items-center gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${p.type === 'rent' ? 'bg-navy-50 text-navy-700' : 'bg-teal-50 text-teal-600'}`}>
                    {p.type === 'rent' ? <IndianRupee size={17} /> : <Zap size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">
                      {p.type === 'rent' ? p.resident?.fullName : `Room ${p.room?.roomNumber} electricity`}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.type === 'rent' ? `Room ${p.room?.roomNumber} · ` : ''}{p.method} · {formatDate(p.paidOn)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 lg:col-span-2" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}