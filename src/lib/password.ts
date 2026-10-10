// Readable temporary passwords the admin can read out or text to someone: "kq7m-xr4p-2hwz".
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i

export function generateTempPassword(groups = 3, groupLength = 4): string {
  const bytes = new Uint32Array(groups * groupLength);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) parts.push(chars.slice(g * groupLength, (g + 1) * groupLength).join(''));
  return parts.join('-');
}
