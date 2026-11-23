import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { getErrorMessage } from '../utils/format.js';

// Load only the room being assigned. Occupants come from the same owner-scoped
// room response, rather than a second, potentially stale list of all residents.
export default function useResidentRooms(roomId) {
  const [rooms, setRooms] = useState([]);
  const [details, setDetails] = useState(null);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [roomsAttempt, setRoomsAttempt] = useState(0);
  const [roomAttempt, setRoomAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setRoomsLoading(true); setRoomsError('');
    api.get('/rooms', { signal: controller.signal }).then(({ data }) => {
      if (!data.success || !Array.isArray(data.data)) throw new Error('Invalid room response');
      if (!controller.signal.aborted) setRooms(data.data);
    }).catch((error) => {
      if (!controller.signal.aborted) setRoomsError(getErrorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setRoomsLoading(false); });
    return () => controller.abort();
  }, [roomsAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    setDetails(null); setRoomError('');
    if (!roomId) { setRoomLoading(false); return () => controller.abort(); }
    setRoomLoading(true);
    api.get(`/rooms/${roomId}`, { signal: controller.signal }).then(({ data }) => {
      if (!data.success || !data.data?._id) throw new Error('Invalid room response');
      if (!controller.signal.aborted) setDetails(data.data);
    }).catch((error) => {
      if (!controller.signal.aborted) setRoomError(getErrorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setRoomLoading(false); });
    return () => controller.abort();
  }, [roomId, roomAttempt]);

  const roomReady = details?._id === roomId;
  const selectedRoom = roomReady ? details : rooms.find((room) => room._id === roomId);
  const applyRoom = (room) => {
    // Use committed PUT data immediately. A follow-up GET is not a prerequisite.
    setRooms((current) => current.map((item) => item._id === room._id ? { ...item, ...room } : item));
    setDetails((current) => current?._id === room._id ? { ...current, ...room } : current);
  };
  return {
    rooms, selectedRoom, roomReady, occupants: roomReady ? details.residents || [] : [],
    roomsLoading, roomLoading, roomsError, roomError, applyRoom,
    retryRooms: () => setRoomsAttempt((value) => value + 1),
    retryRoom: () => setRoomAttempt((value) => value + 1),
  };
}
