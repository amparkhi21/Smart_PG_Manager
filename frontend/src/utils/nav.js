import {
  LayoutDashboard, DoorOpen, Users, CalendarCheck, IndianRupee, Zap, History, MessageCircle, Settings, ChartNoAxesCombined, Utensils, ClipboardList, Phone, Bell,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', short: 'Rooms', icon: DoorOpen },
  { to: '/requests', label: 'Requests', short: 'Requests', icon: ClipboardList },
  { to: '/residents', label: 'Residents', short: 'Residents', icon: Users },
  { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: CalendarCheck },
  { to: '/mess-management', label: 'Mess Management', short: 'Mess', icon: Utensils },
  { to: '/community', label: 'Community', short: 'Community', icon: MessageCircle },
  { to: '/notice-board', label: 'Notice Board', short: 'Notices', icon: MessageCircle },
  { to: '/rent', label: 'Rent Management', short: 'Rent', icon: IndianRupee },
  { to: '/electricity', label: 'Electricity Bills', short: 'Electricity', icon: Zap },
  { to: '/payments', label: 'Payment History', short: 'Payments', icon: History },
  { to: '/emergency-contacts', label: 'Emergency Contacts', short: 'Contacts', icon: Phone },
  { to: '/notifications', label: 'Notifications', short: 'Notifications', icon: Bell },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: ChartNoAxesCombined },
  { to: '/reminders', label: 'Reminders', short: 'Reminders', icon: MessageCircle },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

// Shown in the mobile bottom bar; everything else goes under "More"
export const MOBILE_PRIMARY = ['/', '/rooms', '/residents', '/rent'];
