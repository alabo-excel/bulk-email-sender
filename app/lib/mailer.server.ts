import nodemailer, { type Transporter } from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

export type ConfigIssue = { key: string; message: string };

export function readSmtpConfig(): {
  config: SmtpConfig | null;
  issues: ConfigIssue[];
} {
  const env = process.env;
  const issues: ConfigIssue[] = [];

  const host = env.SMTP_HOST?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  const pass = env.SMTP_PASS ?? "";
  const fromEmail = (env.MAIL_FROM_EMAIL ?? user).trim();
  const portRaw = env.SMTP_PORT?.trim() ?? "587";
  const port = Number(portRaw);

  if (!host) issues.push({ key: "SMTP_HOST", message: "Missing SMTP host." });
  if (!user) issues.push({ key: "SMTP_USER", message: "Missing SMTP username." });
  if (!pass) issues.push({ key: "SMTP_PASS", message: "Missing SMTP password." });
  if (!Number.isInteger(port) || port <= 0) {
    issues.push({ key: "SMTP_PORT", message: `"${portRaw}" is not a valid port.` });
  }
  if (!fromEmail) {
    issues.push({
      key: "MAIL_FROM_EMAIL",
      message: "Missing sender address (defaults to SMTP_USER).",
    });
  }

  if (issues.length > 0) return { config: null, issues };

  return {
    config: {
      host,
      port,
      // Port 465 is implicit TLS; 587/25 upgrade via STARTTLS.
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
      user,
      pass,
      fromName: env.MAIL_FROM_NAME?.trim() || "",
      fromEmail,
      replyTo: env.MAIL_REPLY_TO?.trim() || "",
    },
    issues,
  };
}

export function formatFrom(config: SmtpConfig): string {
  return config.fromName
    ? `"${config.fromName.replace(/"/g, "")}" <${config.fromEmail}>`
    : config.fromEmail;
}

export function createTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // One connection reused for the whole run, throttled by our own delay.
    pool: true,
    maxConnections: 1,
  });
}

export async function verifyConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  const { config, issues } = readSmtpConfig();
  if (!config) {
    return { ok: false, message: issues.map((i) => i.message).join(" ") };
  }
  const transport = createTransport(config);
  try {
    await transport.verify();
    return { ok: true, message: `Connected to ${config.host}:${config.port}.` };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  } finally {
    transport.close();
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
