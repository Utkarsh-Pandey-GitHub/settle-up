import type { Dashboard } from "@settleup/contracts";

export function personName(data: Dashboard, id: string, fallback = "Member") {
  if (id === data.account.id) return "You";
  const contact = data.savedContacts.find((person) => person.id === id);
  if (contact) return contact.contactName || contact.name;
  for (const ledger of data.ledgers) {
    const member = ledger.members.find((person) => person.id === id);
    if (member) return member.name;
  }
  return fallback;
}
