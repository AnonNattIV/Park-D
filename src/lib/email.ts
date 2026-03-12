import 'server-only';

type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

type BrevoRecipient = {
  email: string;
  name?: string;
};

type BrevoPayload = {
  sender: {
    name: string;
    email: string;
  };
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent: string;
};

function normalizeRecipients(value: string | string[]): BrevoRecipient[] {
  const rawList = Array.isArray(value) ? value : [value];
  const recipients = rawList
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email }));

  return recipients;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBrevoEndpoint(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (/\/v3\/smtp\/email$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/v3/smtp/email`;
}

function resolveBrevoEndpoints(): string[] {
  const candidates = [
    process.env.BREVO_API_URL || '',
    process.env.BREVO_API_BASE_URL || '',
    'https://api.brevo.com/v3/smtp/email',
    'https://api.sendinblue.com/v3/smtp/email',
  ]
    .map(normalizeBrevoEndpoint)
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of candidates) {
    if (!seen.has(url)) {
      seen.add(url);
      unique.push(url);
    }
  }

  return unique;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isRetriableStatus(statusCode: number): boolean {
  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode === 525) {
    return true;
  }
  return statusCode >= 500 && statusCode <= 599;
}

function clipText(value: string, maxLength = 320): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function postToBrevo(
  url: string,
  apiKey: string,
  payload: BrevoPayload,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isBrevoMailConfigured(): boolean {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  return Boolean(apiKey && senderEmail);
}

export async function sendTransactionalEmail(input: SendMailInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim() || '';
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || '';
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Park:D';

  if (!apiKey || !senderEmail) {
    throw new Error(
      'Brevo mail is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL environment variables.'
    );
  }

  const to = normalizeRecipients(input.to);
  if (to.length === 0) {
    throw new Error('At least one recipient email is required.');
  }

  const payload: BrevoPayload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to,
    subject: input.subject,
    htmlContent: input.html,
    textContent: input.text || stripHtmlToText(input.html),
  };

  const endpoints = resolveBrevoEndpoints();
  const timeoutMs = Math.max(readNumberEnv('BREVO_SEND_TIMEOUT_MS', 15000), 3000);
  const retryCount = Math.max(readNumberEnv('BREVO_SEND_RETRY_COUNT', 2), 0);
  const maxAttemptsPerEndpoint = retryCount + 1;

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= maxAttemptsPerEndpoint; attempt += 1) {
      try {
        const response = await postToBrevo(endpoint, apiKey, payload, timeoutMs);
        if (response.ok) {
          return;
        }

        const responseText = clipText((await response.text()).replace(/\s+/g, ' ').trim());
        const status = response.status;
        const errorMessage = `Brevo send failed via ${endpoint} (attempt ${attempt}/${maxAttemptsPerEndpoint}) status ${status}: ${responseText || 'Unknown error'}`;

        // Permanent auth/validation errors should fail fast.
        if ([400, 401, 403, 404].includes(status)) {
          throw new Error(errorMessage);
        }

        errors.push(errorMessage);
        if (!isRetriableStatus(status)) {
          break;
        }

        if (attempt < maxAttemptsPerEndpoint) {
          await sleep(300 * attempt);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = `Brevo send network failure via ${endpoint} (attempt ${attempt}/${maxAttemptsPerEndpoint}): ${clipText(message)}`;
        errors.push(errorMessage);

        if (attempt < maxAttemptsPerEndpoint) {
          await sleep(300 * attempt);
          continue;
        }
      }
    }
  }

  throw new Error(
    `Brevo send failed after retries. ${errors.length > 0 ? errors.join(' | ') : 'Unknown error'}`
  );
}
