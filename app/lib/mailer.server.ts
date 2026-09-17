import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { isValidEmail } from "./contacts";

const privateNetworks = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateNetworks.addSubnet(address, prefix);

/** What the client sends: connection details, with the password as ciphertext. */
export type SenderConnection = { email: string; name: string; host: string; port: number };
/** What createTransport needs: the same, with the password already decrypted. */
export type SenderInput = SenderConnection & { password: string };
export function validateSender(value: unknown): value is SenderConnection {
  if (!value || typeof value !== "object") return false;
  const sender = value as SenderConnection;
  return typeof sender.email === "string" && sender.email.length <= 254 && isValidEmail(sender.email)
    && typeof sender.name === "string" && sender.name.length <= 200 && !/[\r\n]/.test(sender.name)
    && typeof sender.host === "string" && sender.host.length <= 253 && /^[a-zA-Z0-9.-]+$/.test(sender.host)
    // The password is ciphertext here and is validated separately by the vault.
    && [465, 587].includes(sender.port);
}
export async function createTransport(sender: SenderInput) {
  const addresses = await lookup(sender.host, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => privateNetworks.check(address))) throw new Error("SMTP host must resolve to a public mail server.");
  return nodemailer.createTransport({
    host: addresses[0].address, port: sender.port, secure: sender.port === 465,
    requireTLS: true, tls: { servername: sender.host, minVersion: "TLSv1.2" },
    auth: { user: sender.email, pass: sender.password },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}
