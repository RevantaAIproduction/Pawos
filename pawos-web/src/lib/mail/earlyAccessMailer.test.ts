import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  getTransporter: vi.fn(),
}));

vi.mock("./waitlistMailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./waitlistMailer")>()),
  getTransporter: mocks.getTransporter,
  getFrom: () => "PawOS <no-reply@revantaai.com>",
}));

import {
  EARLY_ACCESS_EMAIL_SUBJECT,
  PAWOS_STORE_URL,
  buildEarlyAccessConfirmationEmail,
  sendEarlyAccessConfirmation,
} from "./earlyAccessMailer";

describe("buildEarlyAccessConfirmationEmail", () => {
  it("uses the exact subject and Microsoft Store URL", () => {
    expect(EARLY_ACCESS_EMAIL_SUBJECT).toBe("You're in — PawOS Early Access");
    expect(PAWOS_STORE_URL).toBe("https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN");
  });

  it("renders the plain-text body exactly", () => {
    expect(buildEarlyAccessConfirmationEmail("Ada Lovelace").text).toBe(
      [
        "Hi Ada Lovelace,",
        "",
        "Thanks for joining the PawOS Early Access program.",
        "",
        "You can download PawOS from the Microsoft Store:",
        "",
        "Download PawOS",
        "https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN",
        "",
        "We're excited to have you try PawOS and see how it fits into your engineering workflow.",
        "",
        "— PawOS Team",
      ].join("\n")
    );
  });

  it("links the HTML button to the store URL, with & encoded for the attribute", () => {
    const { html } = buildEarlyAccessConfirmationEmail("Ada");
    expect(html).toContain('href="https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&amp;gl=IN"');
    expect(html).toContain("Download PawOS");
    expect(html).toContain("Hi Ada,");
    expect(html).toContain("— PawOS Team");
  });

  it("escapes HTML in the name and keeps it on one line", () => {
    const { html, text } = buildEarlyAccessConfirmationEmail('<img src=x onerror="a()">\nEve');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;a()&quot;&gt; Eve");
    expect(text.split("\n")[0]).toBe('Hi <img src=x onerror="a()"> Eve,');
  });
});

describe("sendEarlyAccessConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMail.mockResolvedValue({});
    mocks.getTransporter.mockReturnValue({ sendMail: mocks.sendMail });
  });

  it("sends one email to the registrant through the existing transporter", async () => {
    const result = await sendEarlyAccessConfirmation("Ada Lovelace", "ada@example.com");
    expect(result).toEqual({ ok: true });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({
      from: "PawOS <no-reply@revantaai.com>",
      to: "ada@example.com",
      subject: "You're in — PawOS Early Access",
    });
    expect(mail.text).toContain("Hi Ada Lovelace,");
    expect(mail.html).toContain("Hi Ada Lovelace,");
  });

  it("reports failure without throwing when SMTP isn't configured", async () => {
    mocks.getTransporter.mockReturnValue(null);
    const result = await sendEarlyAccessConfirmation("Ada", "ada@example.com");
    expect(result.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("reports failure without throwing when the send is rejected", async () => {
    mocks.sendMail.mockRejectedValue(new Error("EAUTH 535"));
    expect(await sendEarlyAccessConfirmation("Ada", "ada@example.com")).toEqual({ ok: false, message: "EAUTH 535" });
  });
});
