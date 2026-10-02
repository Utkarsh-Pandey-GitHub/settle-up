# SettleUp privacy policy — implementation draft

SettleUp helps you record expenses, shared obligations, repayments, and goals. It does not connect to your bank, hold funds, or confirm whether an external payment succeeded. Before production publication, the operator must add its identity, support contact, applicable retention periods, jurisdictional disclosures, and subprocessors.

## Information used

The service uses a verified phone number for authentication, optional profile information, financial entries you choose to save, shared-ledger memberships, selected contacts, and notification preferences. Only selected contacts are used; we do not upload the full phonebook. Contact discovery is off by default.

Account sessions are stored independently. On native devices, tokens use operating-system secure storage. The last synced dashboard and retryable changes are stored in private app storage so the UI remains useful during a temporary outage. Queued changes are sent to the API after connectivity returns and are removed from the device queue after processing or explicit sign-out. On the browser, real API tokens are kept in memory. The labeled demo stores fictional sample records locally and sends no financial entries to the API.

## Device permissions

- Camera: requested when you enable UPI QR scanning. A payment app opens only after your confirmation.
- Contacts: requested when you choose a contact. Manual entry remains available if permission is declined.
- Notifications: optional and requested from Settings.
- Android SMS: available only in a supported custom build, requested only when you enable review. The app checks a bounded set of recent messages on-device and locally captures newly received financial-looking messages for review. It never sends raw SMS to the server. iOS cannot read your SMS inbox.

SMS suggestions can be inaccurate. Accept, edit, or reject each suggestion. Account-specific salted fingerprints retain the handled decision for seven days. Expired native fingerprints are removed when review runs; expired server fingerprints are deleted by the scheduled cleanup worker. Android process scheduling cannot guarantee an exact deletion instant while the device is off or the app is not running.

SettleUp does not read email. Adding bank-email import would require separate mailbox authorization and an updated privacy disclosure.

## Shared information

Active ledger members can see the ledger's shared records. Your unrelated personal entries are not included. Analytics sharing is opt-in and creates a frozen snapshot of only the chosen scope. Public links can be used by anyone who has the token. Private links require the exact verified recipient phone. Links expire and can be revoked; downloaded copies or screenshots cannot be remotely erased.

Security-relevant shared-link access events record whether access was allowed and the event time. The initial implementation does not store visitor IP addresses in the access-event table. Application logging redacts authorization headers, request bodies and share tokens.

## Export, deletion, and retention

Export your accessible data from Settings. Deleting an account revokes sessions and links and removes the phone identity, profile identifying details, import records, and notification preferences. Unresolved obligations must first be settled or reversed. Shared financial and audit records are retained under an anonymized account so other participants do not lose their history. Free-text notes can contain personal information; the operator needs a documented erasure/redaction process for such requests and must publish legally appropriate retention limits before launch.

Production databases must use encryption at rest and TLS in transit, restricted operator access, backups, and deletion procedures. No advertising SDK or third-party behavioral analytics is included in this repository.

## Bill photos and itemisation

Selecting or capturing a bill is optional. The app sends the selected image to the authenticated SettleUp API, which forwards it to the configured vision model for one-time itemisation. The result remains editable. SettleUp does not attach the image to the transaction or retain it in its database or object storage. The configured model provider may process the image under its own terms, so the production policy must name that provider and its retention terms. Camera permission is requested only when capture is chosen.
