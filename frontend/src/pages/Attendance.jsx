import { useState } from 'react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import DailyAttendance from '../components/attendance/DailyAttendance.jsx';
import MonthlyReport from '../components/attendance/MonthlyReport.jsx';

export default function Attendance() {
  const [tab, setTab] = useState('Daily');
  // Rooms are only needed for the room filter dropdowns
  const { data: rooms } = useFetch(async () => (await api.get('/rooms')).data.data, []);

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark daily attendance and review the month">
        <SegmentedControl options={['Daily', 'Monthly']} value={tab} onChange={setTab} />
      </PageHeader>

      {/* Daily stays mounted so unsaved edits survive a switch to Monthly */}
      <DailyAttendance rooms={rooms || []} visible={tab === 'Daily'} />
      {tab === 'Monthly' && <MonthlyReport rooms={rooms || []} />}
    </div>
  );
}