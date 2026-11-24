import { Navigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Notifications() {
  const { identity } = useNotifications();
  return <Navigate replace to={`${identity.role === 'owner' ? '/' : '/resident/dashboard'}?notifications=all`} />;
}
