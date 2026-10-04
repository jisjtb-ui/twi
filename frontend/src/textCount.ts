/**
 * X の文字数カウント（簡易版）。日本語などは1文字＝2、半角英数は1、URL は 23 として数える。
 * 上限は通常アカウントで 280（日本語のみなら140文字）。
 */
const URL_RE = /https?:\/\/\S+/g;

function weight(cp: number): number {
  if (
    (cp >= 0x0000 && cp <= 0x10ff) ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  ) {
    return 1;
  }
  return 2;
}

export function weightedLength(text: string): number {
  let total = 0;
  const withoutUrls = text.replace(URL_RE, () => {
    total += 23;
    return "";
  });
  for (const ch of withoutUrls.normalize("NFC")) total += weight(ch.codePointAt(0)!);
  return total;
}

export const MAX_WEIGHTED_LENGTH = 280;
