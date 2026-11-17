import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Copy, ExternalLink, MessageCircle, UserRound } from 'lucide-react';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Field, Select, Textarea } from '../ui/FormControls.jsx';
import { formatCurrency, formatMonth, getErrorMessage } from '../../utils/format.js';
import { createReminderMessage, createWhatsAppUrl } from '../../utils/reminders.js';

export default function ReminderPreviewModal({ item, owner, initialActivity, onClose, onActivitySaved }) {
  const fixedRecipient = item.sourceType === 'Rent' ? item.residents[0] : null;
  const initialRecipient = fixedRecipient || item.residents.find((candidate) => candidate._id === String(initialActivity?.recipientId));
  const [recipientId, setRecipientId] = useState(initialRecipient?._id || '');
  const [activity, setActivity] = useState(initialActivity || null);
  const [message, setMessage] = useState(initialActivity && initialRecipient ? createReminderMessage(item, initialRecipient, owner) : '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);

  const recipient = item.residents.find((candidate) => candidate._id === recipientId);
  const canPrepare = Boolean(recipient && !busy);
  const prepared = Boolean(activity && message);

  const prepare = async () => {
    if (!recipient || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post('/reminders/activity', {
        sourceType: item.sourceType,
        sourceId: item.bill._id,
        recipientId: recipient._id,
      });
      setActivity(data.data);
      setMessage(createReminderMessage(item, recipient, owner));
      onActivitySaved?.(item, data.data);
      if (data.duplicateWarning) {
        toast('A reminder for this bill and recipient was prepared recently. Review its history before continuing.');
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openWhatsApp = async () => {
    if (!activity || !recipient || busy) return;
    let url;
    try {
      url = createWhatsAppUrl(recipient.phone, message);
    } catch (err) {
      setFormError(err.message);
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setFormError('The browser blocked the new tab. Allow pop-ups to open WhatsApp, then try again.');
      return;
    }
    popup.opener = null;
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.patch(`/reminders/activity/${activity._id}`, { action: 'opened' });
      setActivity(data.data);
      onActivitySaved?.(item, data.data);
      popup.location.href = url;
      toast.success('WhatsApp opened. The reminder has not been sent or delivered.');
    } catch (err) {
      popup.close();
      setFormError(`Could not complete the WhatsApp open action: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Reminder message copied');
    } catch {
      setFormError('Could not access the clipboard. Select and copy the message manually.');
    }
  };

  const confirmOwnerSent = async () => {
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.patch(`/reminders/activity/${activity._id}`, { action: 'confirmed' });
      setActivity(data.data);
      onActivitySaved?.(item, data.data);
      setConfirmSent(false);
      toast.success('Saved as owner-reported sent, not provider-verified.');
    } catch (err) {
      setFormError(getErrorMessage(err));
      setConfirmSent(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title="WhatsApp reminder preview" onClose={onClose} dismissable={!busy} size="lg">
        <div className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Billing record</p>
              <p className="mt-1 font-bold text-slate-900">{item.sourceType} · Room {item.room.roomNumber} · {formatMonth(item.bill.month)}</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-700">Outstanding</p>
              <p className="mt-1 font-bold text-orange-900">{formatCurrency(item.bill.balance)}</p>
            </div>
          </div>

          {item.sourceType === 'Electricity' ? (
            <Field label="Choose the responsible recipient for this room bill" htmlFor="recipient" hint="Electricity is billed to the room. Select an active current resident; no resident is assumed.">
              <Select
                id="recipient"
                value={recipientId}
                onChange={(event) => {
                  setRecipientId(event.target.value);
                  setActivity(null);
                  setMessage('');
                }}
              >
                <option value="">Select an active resident</option>
                {item.residents.map((resident) => (
                  <option key={resident._id} value={resident._id}>{resident.fullName} · {resident.phone}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <UserRound size={17} className="text-slate-500" />
              <span className="font-semibold text-slate-900">{recipient?.fullName}</span>
              <span className="text-slate-500">· {recipient?.phone}</span>
            </div>
          )}

          {!prepared ? (
            <button type="button" className="btn-primary w-full" disabled={!canPrepare} onClick={prepare}>
              {busy ? 'Preparing...' : 'Prepare message preview'}
            </button>
          ) : (
            <>
              {activity.duplicateWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  A reminder for this bill and recipient was prepared recently. Review the activity history before proceeding.
                </div>
              )}
              <Field label="Message (editable before opening WhatsApp)" htmlFor="message">
                <Textarea id="message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} className="min-h-64 whitespace-pre-wrap" />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-secondary flex-1" onClick={copyMessage} disabled={!message}>
                  <Copy size={17} /> Copy message
                </button>
                <button type="button" className="btn-accent flex-1" onClick={openWhatsApp} disabled={busy || !message || activity.status === 'Owner-reported sent'}>
                  <ExternalLink size={17} /> Open in WhatsApp
                </button>
              </div>
              <div className="rounded-xl bg-teal-50 p-3 text-xs leading-relaxed text-teal-900">
                WhatsApp opens with this message prefilled. You must review it and manually press Send. Opening WhatsApp does not confirm delivery.
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="text-sm">
                  <p className="font-semibold text-slate-800">Activity status: {activity.status}</p>
                  {activity.status === 'Owner-reported sent' && <p className="text-xs text-slate-500">Owner-reported only; not verified by WhatsApp.</p>}
                </div>
                {activity.status === 'WhatsApp opened' && (
                  <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setConfirmSent(true)}>
                    I manually sent it
                  </button>
                )}
              </div>
              {activity.status === 'Owner-reported sent' && (
                <p className="text-xs text-amber-700">A reminder was recently marked owner-reported sent. Wait for the duplicate-warning interval before preparing another message for this same bill and recipient.</p>
              )}
              <p className="flex items-center gap-1 text-xs text-slate-400"><MessageCircle size={14} /> No automatic or bulk sending is enabled.</p>
            </>
          )}
        </div>
      </Modal>

      {confirmSent && (
        <ConfirmDialog
          title="Confirm you sent this reminder?"
          message="This will be recorded as owner-reported sent. It is not a WhatsApp delivery or read receipt."
          confirmText="Confirm owner-reported sent"
          loading={busy}
          tone="warning"
          onConfirm={confirmOwnerSent}
          onCancel={() => setConfirmSent(false)}
        />
      )}
    </>
  );
}
