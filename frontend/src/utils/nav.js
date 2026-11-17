import {
  LayoutDashboard, DoorOpen, Users, CalendarCheck, IndianRupee, Zap, History, MessageCircle, Settings, ChartNoAxesCombined,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', short: 'Rooms', icon: DoorOpen },
  { to: '/residents', label: 'Residents', short: 'Residents', icon: Users },
  { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: CalendarCheck },
  { to: '/rent', label: 'Rent Management', short: 'Rent', icon: IndianRupee },
  { to: '/electricity', label: 'Electricity Bills', short: 'Electricity', icon: Zap },
  { to: '/payments', label: 'Payment History', short: 'Payments', icon: History },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: ChartNoAxesCombined },
  { to: '/reminders', label: 'Reminders', short: 'Reminders', icon: MessageCircle },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

// Shown in the mobile bottom bar; everything else goes under "More"
export const MOBILE_PRIMARY = ['/', '/rooms', '/residents', '/rent'];