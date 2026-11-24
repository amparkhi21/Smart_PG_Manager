import {
  LayoutDashboard, DoorOpen, Users, CalendarCheck, IndianRupee, Zap, History, MessageCircle, Settings, ChartNoAxesCombined, Utensils, ClipboardList, Phone,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', short: 'Rooms', icon: DoorOpen },
  { to: '/residents', label: 'Residents', short: 'Residents', icon: Users },
  { to: '/mess-management', label: 'Mess Management', short: 'Mess', icon: Utensils },
  { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: CalendarCheck },
  { to: '/community', label: 'Community', short: 'Community', icon: MessageCircle },
  { to: '/notice-board', label: 'Notice Board', short: 'Notices', icon: MessageCircle },
  { to: '/rent', label: 'Rent Management', short: 'Rent', icon: IndianRupee },
  { to: '/electricity', label: 'Electricity Bills', short: 'Electricity', icon: Zap },
  { to: '/requests', label: 'Requests', short: 'Requests', icon: ClipboardList },
  { to: '/payments', label: 'Payment History', short: 'Payments', icon: History },
  { to: '/emergency-contacts', label: 'Resident Contacts', short: 'Contacts', icon: Phone },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: ChartNoAxesCombined },
  { to: '/reminders', label: 'Reminders', short: 'Reminders', icon: MessageCircle },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

// Shown in the mobile bottom bar; everything else goes under "More"
export const MOBILE_PRIMARY = NAV.slice(0, 4).map(({ to }) => to);
