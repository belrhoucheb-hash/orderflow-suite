import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TenantSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function loadTenantSmtpConfig(
  supabase: SupabaseClient,
  tenantId: string,
  fallbackFromName?: string,
): Promise<TenantSmtpConfig> {
  const { data, error } = await supabase.rpc("get_integration_credentials_runtime", {
    p_tenant_id: tenantId,
    p_provider: "smtp",
  });
  if (error) throw new Error(`SMTP-config ophalen mislukt: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { enabled?: boolean; credentials?: Record<string, unknown> }
    | null;
  if (!row?.enabled) {
    throw new Error("SMTP is niet geactiveerd voor deze tenant");
  }

  const credentials = asRecord(row.credentials);
  const host = stringValue(credentials, "host");
  const username = stringValue(credentials, "username");
  const password = stringValue(credentials, "password");
  const fromEmail = stringValue(credentials, "fromEmail") || username;
  const fromName = stringValue(credentials, "fromName") || fallbackFromName || "Planning";
  const rawPort = stringValue(credentials, "port");
  const port = Number.parseInt(rawPort || "587", 10);

  if (!host || !username || !password) {
    throw new Error("SMTP-config is onvolledig voor deze tenant");
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("SMTP-poort is ongeldig voor deze tenant");
  }

  return {
    host,
    port,
    username,
    password,
    fromEmail,
    fromName,
  };
}

export async function sendEmailSmtp(params: {
  to: string;
  subject: string;
  body: string;
  config: TenantSmtpConfig;
}): Promise<void> {
  const { to, subject, body, config } = params;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const conn = await Deno.connect({ hostname: config.host, port: config.port });

  async function sendLine(
    line: string,
    active: Deno.Conn | Deno.TlsConn = conn,
  ) {
    await active.write(encoder.encode(line + "\r\n"));
  }

  async function readResponse(
    active: Deno.Conn | Deno.TlsConn = conn,
  ): Promise<string> {
    const buf = new Uint8Array(4096);
    const n = await active.read(buf);
    return n ? decoder.decode(buf.subarray(0, n)) : "";
  }

  try {
    await readResponse();
    await sendLine("EHLO localhost");
    await readResponse();

    let active: Deno.Conn | Deno.TlsConn = conn;
    if (config.port === 587) {
      await sendLine("STARTTLS");
      await readResponse();
      active = await Deno.startTls(conn, { hostname: config.host });
      await sendLine("EHLO localhost", active);
      await readResponse(active);
    }

    await sendLine("AUTH LOGIN", active);
    await readResponse(active);
    await sendLine(btoa(config.username), active);
    await readResponse(active);
    await sendLine(btoa(config.password), active);
    const authResp = await readResponse(active);
    if (!authResp.startsWith("235")) {
      throw new Error("SMTP authenticatie mislukt");
    }

    await sendLine(`MAIL FROM:<${config.fromEmail}>`, active);
    const fromResp = await readResponse(active);
    if (!fromResp.startsWith("2")) {
      throw new Error(`SMTP MAIL FROM afgewezen: ${fromResp.trim()}`);
    }

    await sendLine(`RCPT TO:<${to}>`, active);
    const rcptResp = await readResponse(active);
    if (!rcptResp.startsWith("2")) {
      throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp.trim()}`);
    }

    await sendLine("DATA", active);
    const dataResp = await readResponse(active);
    if (!dataResp.startsWith("3")) {
      throw new Error(`SMTP DATA afgewezen: ${dataResp.trim()}`);
    }

    const emailContent = [
      `From: ${config.fromName} <${config.fromEmail}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
      `.`,
    ].join("\r\n");

    await sendLine(emailContent, active);
    const sendResp = await readResponse(active);
    if (!sendResp.startsWith("2")) {
      throw new Error(`SMTP verzending mislukt: ${sendResp.trim()}`);
    }

    await sendLine("QUIT", active);
    active.close();
  } catch (error) {
    try {
      conn.close();
    } catch {
      /* ignore close errors */
    }
    throw error;
  }
}
