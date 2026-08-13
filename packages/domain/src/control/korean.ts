/**
 * 한국어 조사 "으로"/"로" 선택. 마지막 글자에 받침이 있으면 "으로"를 붙이고,
 * 받침이 없거나 받침이 ㄹ이면 "로"를 붙인다(예: "과장으로", "팀장으로", "실장으로").
 * 완성형 한글(가~힣) 범위 밖의 글자로 끝나면(숫자, 영문 등) 그냥 "로"를 붙인다.
 */
export function withEuroParticle(word: string): string {
  const lastChar = word.at(-1);
  if (!lastChar) return `${word}로`;

  const code = lastChar.charCodeAt(0);
  const HANGUL_BASE = 0xac00;
  const HANGUL_LAST = 0xd7a3;
  if (code < HANGUL_BASE || code > HANGUL_LAST) return `${word}로`;

  // 완성형 한글 코드 = BASE + (초성 * 21 + 중성) * 28 + 종성. 종성 0 = 받침 없음, 8 = ㄹ.
  const finalConsonantIndex = (code - HANGUL_BASE) % 28;
  const hasBatchim = finalConsonantIndex !== 0;
  const isRieul = finalConsonantIndex === 8;

  return hasBatchim && !isRieul ? `${word}으로` : `${word}로`;
}
