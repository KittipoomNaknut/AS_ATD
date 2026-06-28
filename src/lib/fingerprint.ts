// device fingerprint อย่างเบา — แค่ audit, ไม่ใช่ security boundary
export async function deviceHash(): Promise<string> {
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    navigator.language,
    new Date().getTimezoneOffset().toString(),
  ];
  const data = new TextEncoder().encode(parts.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
