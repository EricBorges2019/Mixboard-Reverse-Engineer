/**
 * Reads the pixel size from a PNG header.
 * Precondition: none; `bytes` may be any buffer.
 * Postcondition: returns {w, h} for a PNG, otherwise null.
 */
export function readPngSize(bytes: Buffer): { w: number; h: number } | null {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}
