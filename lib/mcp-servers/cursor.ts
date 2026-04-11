export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const j = JSON.parse(raw) as { o?: number };
    if (typeof j.o === "number" && j.o >= 0) return j.o;
  } catch {
    /* ignore */
  }
  return 0;
}
