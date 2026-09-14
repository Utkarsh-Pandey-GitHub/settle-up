import { DomainError, normalizePhone } from "@settleup/domain";

// Supabase generates and verifies the code; SMS delivery is configured in its dashboard.
export class SupabaseOtpProvider {
  constructor(private fetcher: typeof fetch = fetch) {}
  private config() {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!base || !key) throw new DomainError("OTP_CONFIG", "Phone sign-in is not configured yet. Use Truecaller or try again later.", 503);
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
      throw new DomainError("OTP_CONFIG", "Configure a valid HTTPS Supabase project URL.", 503);
    return { base, key };
  }
  private async post(path: "otp" | "verify", body: Record<string, unknown>) {
    const { base, key } = this.config();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetcher(`${base}/auth/v1/${path}`, {
        method: "POST", redirect: "error",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal,
      });
      if (response.status === 429) throw new DomainError("RATE_LIMIT", "Please wait before requesting or trying another code.", 429);
      if (!response.ok) {
        if (path === "verify" && [400, 403, 422].includes(response.status))
          throw new DomainError("OTP_INVALID", "The code is invalid or expired.", 401);
        throw new DomainError("OTP_DELIVERY", "Phone verification is unavailable. Check your SMS provider configuration or use Truecaller.", 503);
      }
      return await response.json() as { user?: { id?: string; phone?: string; phone_confirmed_at?: string } };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("OTP_UNAVAILABLE", "Phone verification could not connect. Please try again.", 503);
    } finally { clearTimeout(timer); }
  }
  async send(phone: string) {
    await this.post("otp", { phone: normalizePhone(phone), channel: "sms", create_user: true });
  }
  async verify(phone: string, code: string) {
    const { user } = await this.post("verify", { phone: normalizePhone(phone), token: code, type: "sms" });
    if (!user?.id || !user.phone || !user.phone_confirmed_at || !Number.isFinite(Date.parse(user.phone_confirmed_at)))
      throw new DomainError("OTP_INVALID", "Phone verification was not confirmed.", 401);
    const verified = normalizePhone(user.phone.startsWith("+") ? user.phone : `+${user.phone}`);
    if (verified !== normalizePhone(phone)) throw new DomainError("OTP_INVALID", "Phone verification did not match this request.", 401);
    // Provider tokens are never exposed or stored. SettleUp keeps its existing sessions/IDs.
    return verified;
  }
}
