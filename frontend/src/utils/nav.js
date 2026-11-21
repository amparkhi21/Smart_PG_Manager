import {
  LayoutDashboard, DoorOpen, Users, CalendarCheck, IndianRupee, Zap, History, MessageCircle, Settings, ChartNoAxesCombined, ArrowLeftRight, Utensils, ClipboardList, Phone, Bell,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: 'Rooms', short: 'Rooms', icon: DoorOpen },
  { to: '/room-change-requests', label: 'Room Change Requests', short: 'Room Changes', icon: ArrowLeftRight },
  { to: '/residents', label: 'Residents', short: 'Residents', icon: Users },
  { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: CalendarCheck },
  { to: '/mess-management', label: 'Mess Management', short: 'Mess', icon: Utensils },
  { to: '/community', label: 'Community', short: 'Community', icon: MessageCircle },
  { to: '/notice-board', label: 'Notice Board', short: 'Notices', icon: MessageCircle },
  { to: '/rent', label: 'Rent Management', short: 'Rent', icon: IndianRupee },
  { to: '/electricity', label: 'Electricity Bills', short: 'Electricity', icon: Zap },
  { to: '/payments', label: 'Payment History', short: 'Payments', icon: History },
  { to: '/payment-requests', label: 'Payment Requests', short: 'Requests', icon: IndianRupee },
  { to: '/complaints', label: 'Complaint Management', short: 'Complaints', icon: ClipboardList },
  { to: '/leave-requests', label: 'Leave Management', short: 'Leave', icon: CalendarCheck },
  { to: '/emergency-contacts', label: 'Emergency Contacts', short: 'Contacts', icon: Phone },
  { to: '/notifications', label: 'Notifications', short: 'Notifications', icon: Bell },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: ChartNoAxesCombined },
  { to: '/reminders', label: 'Reminders', short: 'Reminders', icon: MessageCircle },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

// Shown in the mobile bottom bar; everything else goes under "More"
export const MOBILE_PRIMARY = ['/', '/rooms', '/residents', '/rent'];
