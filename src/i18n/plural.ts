/**
 * Serbian noun forms after a number: one for 1, 21, 31… (but not 11);
 * "few" for 2–4, 22–24… (but not 12–14); "many" for everything else.
 * Example: 1 komad, 2 komada, 5 komada; 1 ploča, 3 ploče, 7 ploča.
 */
export function srPlural(n: number, one: string, few: string, many: string): string {
  const whole = Math.abs(Math.trunc(n));
  const mod10 = whole % 10;
  const mod100 = whole % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
