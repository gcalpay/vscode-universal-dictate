import * as http from 'node:http';
import * as path from 'node:path';

export function buildMultipartBody(
  boundary: string,
  audioPath: string,
  audio: Buffer,
  language: string
): Buffer {
  const chunks: Buffer[] = [];
  const addField = (name: string, value: string) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`,
        'utf8'
      )
    );
  };

  addField('language', language);
  addField('response_format', 'text');
  addField('no_timestamps', 'true');

  const filename = path.basename(audioPath).replace(/["\r\n]/g, '_');
  chunks.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`,
      'utf8'
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  );

  return Buffer.concat(chunks);
}

type HttpRequestOptions = {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Record<string, string>;
  readonly body?: Buffer;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly maxResponseBytes?: number;
};

type HttpResponse = {
  readonly statusCode: number;
  readonly body: string;
};

export async function request(options: HttpRequestOptions): Promise<HttpResponse> {
  options.signal?.throwIfAborted();
  return await new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (value?: HttpResponse, error?: Error) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      if (error) reject(error); else resolve(value!);
    };
    const req = http.request({ host: options.host, port: options.port,
      path: options.path, method: options.method, headers: options.headers,
      signal: options.signal, ...(options.signal ? { agent: false as const } : {}) }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > (options.maxResponseBytes ?? 8 * 1024 * 1024)) {
          const error = new Error('Local Whisper response exceeded its size limit.');
          finish(undefined, error); req.destroy(error);
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => finish({ statusCode: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', error => finish(undefined, error));
      response.on('aborted', () => finish(undefined, new Error('Local Whisper response was interrupted.')));
    });
    req.on('error', error => finish(undefined, error));
    // A socket inactivity timeout alone does not bound a trickling response.
    deadline = setTimeout(() => req.destroy(new Error('Local Whisper request timed out.')), options.timeoutMs);
    deadline.unref();
    req.end(options.body);
  });
}

export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Preview cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function normalizeTranscript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
