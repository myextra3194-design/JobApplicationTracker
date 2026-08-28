/**
 * Blob helpers. Deliberately defensive about `Blob.prototype.arrayBuffer`: it is
 * missing on some engine/build combinations (jsdom being the one that caught it here),
 * and a tracker that cannot read back a saved CV is worse than one with no
 * attachments at all.
 */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const Reader = globalThis.FileReader;
    if (!Reader) {
      reject(new Error('neither Blob.arrayBuffer() nor FileReader is available in this environment'));
      return;
    }
    const reader = new Reader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('failed to read attachment bytes'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function writeBytesToBlob(bytes: Uint8Array, mimeType: string): Promise<Blob> {
  // Copy into a fresh ArrayBuffer: Blob takes ownership of the buffer it is handed.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType });
}

/** Human-readable size for the attachment list. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const rendered = exponent === 0 ? `${value}` : value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rendered.replace(/\.0$/, '')} ${units[exponent]}`;
}
