export const CONTACT_CATEGORIES = ['PG Owner', 'Caretaker', 'Security', 'Maintenance', 'Medical', 'Police', 'Fire', 'Other'];

export function normalizeContactPhone(value) {
  if (typeof value !== 'string' || value.length > 50) return null;
  const compact = value.replace(/[\s().-]/g, '');
  if (/^[1-9]\d{2,5}$/.test(compact)) return compact;
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return /^\+[1-9]\d{9,14}$/.test(compact) ? compact : null;
}
export function contactValidation(contact) {
  if (!contact.name.trim() || contact.name.trim().length > 100) return 'Enter a contact name of up to 100 characters.';
  if (!CONTACT_CATEGORIES.includes(contact.category)) return 'Choose a contact category.';
  if (!normalizeContactPhone(contact.phone)) return 'Enter a valid phone number or a 3–6 digit helpline.';
  if (contact.description.trim().length > 1000) return 'Keep the description within 1000 characters.';
  return '';
}
export function filterContacts(contacts, search, category) {
  const term = search.trim().toLowerCase();
  return contacts.filter((contact) => (!category || contact.category === category)
    && (!term || [contact.name, contact.category, contact.phone, contact.description].join(' ').toLowerCase().includes(term)));
}
