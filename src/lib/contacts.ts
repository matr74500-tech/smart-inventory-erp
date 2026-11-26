type PickedContact = { name?: string[]; tel?: string[] };
type ContactPickerApi = {
  select(properties: string[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
};

function getContactPicker(): ContactPickerApi | null {
  if (typeof navigator === "undefined") return null;
  const contacts = (navigator as { contacts?: Partial<ContactPickerApi> }).contacts;
  return contacts && typeof contacts.select === "function" ? (contacts as ContactPickerApi) : null;
}

export function isContactPickerSupported(): boolean {
  return getContactPicker() !== null;
}

export type PhoneContact = { phone: string; name?: string };

/** يجلب جهة اتصال واحدة بها رقم هاتف من دفتر هاتف الجهاز (Contact Picker API). */
export async function pickPhoneContact(): Promise<PhoneContact | null> {
  const picker = getContactPicker();
  if (!picker) return null;
  try {
    const [picked] = await picker.select(["name", "tel"], { multiple: false });
    const phone = picked?.tel?.[0]?.trim();
    if (!phone) return null;
    const name = picked?.name?.[0]?.trim();
    return { phone, ...(name ? { name } : {}) };
  } catch {
    return null;
  }
}
