// Type declarations for src/lib/backup-format.mjs
export declare const FORMAT_NAME: string;
export declare const CURRENT_SCHEMA_VERSION: number;
export declare const MAGIC: Buffer;
export declare function canonicalize(value: unknown): string;
export declare function sha256Hex(data: string | Buffer): string;
export declare function buildPayload(opts: {
  data: Record<string, Array<{ id: string; [key: string]: unknown }>>;
  startedAt: string;
  endedAt: string;
  pinPepper: string;
  keyVersion?: number;
}): Record<string, unknown>;
export declare function serializePayload(payload: unknown): Buffer;
export declare function encryptBuffer(plain: Buffer, keyHex: string, keyVersion?: number): Buffer;
export declare function decryptBuffer(
  enc: Buffer,
  keyHex: string
): { keyVersion: number; plain: Buffer };
export declare function validatePayload(payload: unknown): {
  ok: boolean;
  errors: string[];
  counts: Record<string, number>;
};
export declare function parseAndVerify(
  enc: Buffer,
  keyHex: string
): { payload: Record<string, unknown>; keyVersion: number };
