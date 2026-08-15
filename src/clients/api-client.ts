/**
 * Thin, typed wrapper over Playwright's APIRequestContext.
 *
 * Why a wrapper rather than raw `request.get(...)` in each spec:
 *  - every call is timed, so latency assertions (Annexe D) need no extra plumbing;
 *  - every call is attached to the report in redacted form, so a failure is
 *    diagnosable without re-running;
 *  - `Idempotency-Key` handling lives in exactly one place;
 *  - a spec asserts on behaviour, never on transport mechanics.
 */
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { env } from '../support/env.js';
import { safeJson } from '../support/redact.js';

export interface ApiCall<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  raw: APIResponse;
  /** Wall-clock duration in milliseconds, measured client-side. */
  durationMs: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  /** Attach this call to the Playwright report as evidence. */
  testInfo?: TestInfo;
  /** Label used in the report attachment name. */
  label?: string;
}

export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string = env.apiUrl,
  ) {}

  get<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiCall<T>> {
    return this.send<T>('GET', path, options);
  }

  post<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiCall<T>> {
    return this.send<T>('POST', path, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiCall<T>> {
    return this.send<T>('DELETE', path, options);
  }

  private async send<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: RequestOptions,
  ): Promise<ApiCall<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const started = performance.now();

    const raw = await this.request.fetch(url, {
      method,
      headers: { Accept: 'application/json', ...options.headers },
      params: options.params,
      data: options.data as never,
      // The suite asserts on error status codes; it must never throw on 4xx/5xx.
      failOnStatusCode: false,
      timeout: 15_000,
    });

    const durationMs = Math.round(performance.now() - started);
    const body = await parseBody<T>(raw);

    if (options.testInfo) {
      await options.testInfo.attach(
        `${options.label ?? `${method} ${path}`} — ${raw.status()} — ${durationMs}ms`,
        {
          body: safeJson({
            request: { method, url, params: options.params, body: options.data },
            response: { status: raw.status(), headers: raw.headers(), body },
            durationMs,
          }),
          contentType: 'application/json',
        },
      );
    }

    return { status: raw.status(), headers: raw.headers(), body, raw, durationMs };
  }
}

async function parseBody<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  if (text.trim() === '') return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Returning the raw text lets a contract test assert "this was not JSON",
    // which is a real defect class on an API that advertises application/json.
    return text as unknown as T;
  }
}

/** RFC 4122 v4 key, one per logical operation. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
