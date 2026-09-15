import { DomainError, normalizePhone } from "@settleup/domain";

/**
 * Stytch handles OTP generation, SMS delivery, and verification.
 * Uses Basic Auth with project_id:secret.
 * API docs: https://stytch.com/docs/api-reference/consumer/api/otp/via-sms/login-or-create-user
 */
export class StytchOtpProvider {
  constructor(private fetcher: (url: string, options: RequestInit) => Promise<Response> = fetch) {}

  private config() {
    const projectId = process.env.STYTCH_PROJECT_ID;
    const secret = process.env.STYTCH_SECRET;
    if (!projectId || !secret)
      throw new DomainError(
        "OTP_CONFIG",
        "Phone sign-in is not configured yet. Use Truecaller or try again later.",
        503,
      );
    return { projectId, secret };
  }

  private async post<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const { projectId, secret } = this.config();
    const credentials = Buffer.from(`${projectId}:${secret}`).toString(
      "base64",
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const baseUrl = projectId.startsWith("project-test-")
      ? "https://test.stytch.com"
      : "https://api.stytch.com";
    try {
      const response = await this.fetcher(`${baseUrl}${path}`, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429)
        throw new DomainError(
          "RATE_LIMIT",
          "Please wait before requesting or trying another code.",
          429,
        );
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errorType = typeof errJson?.error_type === "string" ? errJson.error_type : "";
        if ([401, 403].includes(response.status))
          throw new DomainError("OTP_CONFIG", "SMS sign-in is unavailable because the server's SMS credentials or permissions need updating. Use Truecaller for now.", 503);
        if (/country|international|allowlist/i.test(errorType))
          throw new DomainError("OTP_COUNTRY_DISABLED", "SMS delivery is not enabled for this country. Enable it in the SMS provider's country allowlist or use Truecaller.", 503);
        if (
          path.includes("authenticate") &&
          [400, 422].includes(response.status)
        )
          throw new DomainError(
            "OTP_INVALID",
            "The code is invalid or expired.",
            401,
          );
        throw new DomainError(
          "OTP_DELIVERY",
          "SMS could not be delivered. Check the phone number, provider country allowlist and messaging balance, or use Truecaller.",
          503,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "OTP_UNAVAILABLE",
        "Phone verification could not connect. Please try again.",
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send an OTP to the given phone number via SMS.
   * Stytch auto-creates a user if the phone number is new.
   * Returns the `phone_id` which must be passed as `method_id` during verification.
   */
  async send(phone: string): Promise<string> {
    const result = await this.post<{
      phone_id: string;
      user_id: string;
      user_created: boolean;
      status_code: number;
    }>("/v1/otps/sms/login_or_create", {
      phone_number: normalizePhone(phone),
      expiration_minutes: 5,
    });
    if (typeof result.phone_id !== "string" || !result.phone_id)
      throw new DomainError(
        "OTP_DELIVERY",
        "Unable to deliver a code. Please try again later.",
        503,
      );
    return result.phone_id;
  }

  /**
   * Verify an OTP code.
   * @param methodId The `phone_id` returned from `send()`.
   * @param code     The 6-digit code entered by the user.
   * @returns The verified phone number in E.164 format.
   */
  async verify(methodId: string, code: string): Promise<string> {
    const result = await this.post<{
      user_id: string;
      user: {
        phone_numbers: Array<{
          phone_id: string;
          phone_number: string;
          verified: boolean;
        }>;
      };
      status_code: number;
    }>("/v1/otps/authenticate", {
      method_id: methodId,
      code,
    });
    // Find the phone number matching the method_id.
    const matched = result.user?.phone_numbers?.find(
      (p) => p.phone_id === methodId,
    );
    if (!matched?.phone_number || matched.verified !== true)
      throw new DomainError(
        "OTP_INVALID",
        "Phone verification was not confirmed.",
        401,
      );
    return normalizePhone(
      matched.phone_number.startsWith("+")
        ? matched.phone_number
        : `+${matched.phone_number}`,
    );
  }
}
