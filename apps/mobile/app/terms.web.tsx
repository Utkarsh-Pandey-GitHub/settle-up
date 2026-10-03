import React from "react";

const sections = [
  ["Using SettleUp", "You must provide accurate account information and use the service only for lawful personal expense tracking and payment requests."],
  ["Financial records", "SettleUp records information you enter. It is not a bank, wallet, lender, payment processor, or financial adviser. Confirm amounts before paying through another app."],
  ["Shared groups", "Group members can see and update shared transactions. Changes are logged. Deleted groups remain read-only so their financial history is preserved."],
  ["Availability", "Network, provider, and maintenance interruptions may occur. Keep independent records when required."],
  ["Your responsibility", "You are responsible for your device, sign-in methods, entries, payment decisions, and compliance with applicable law."],
  ["Changes and contact", "These terms may be updated as the service changes. The effective date identifies the version that applies."],
] as const;

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 72px", color: "#24222B", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Terms and conditions</h1>
      <p style={{ color: "#6B6874", marginBottom: 30 }}>Effective 3 October 2026</p>
      {sections.map(([title, text]) => (
        <section key={title} style={{ borderTop: "1px solid #E5E2EA", padding: "22px 0" }}>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{title}</h2>
          <p style={{ lineHeight: 1.65, margin: 0, color: "#55515E" }}>{text}</p>
        </section>
      ))}
    </main>
  );
}
