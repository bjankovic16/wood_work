export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/**
 * Evaluates simple arithmetic typed into a measurement field, e.g. "600+18"
 * or "(2400-36)/4". A decimal comma is accepted. Returns null for anything else.
 */
export function evaluateExpression(input: string): number | null {
  const src = input.replace(/,/g, '.').replace(/\s+/g, '');
  if (!src || !/^[0-9+\-*/().]+$/.test(src)) return null;
  let i = 0;

  const parseExpr = (): number => {
    let value = parseTerm();
    while (src[i] === '+' || src[i] === '-') {
      const op = src[i++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (src[i] === '*' || src[i] === '/') {
      const op = src[i++];
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  };

  const parseFactor = (): number => {
    if (src[i] === '-') {
      i++;
      return -parseFactor();
    }
    if (src[i] === '+') {
      i++;
      return parseFactor();
    }
    if (src[i] === '(') {
      i++;
      const value = parseExpr();
      if (src[i] !== ')') throw new Error('Missing )');
      i++;
      return value;
    }
    const match = /^(\d+(\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (!match) throw new Error('Number expected');
    i += match[0].length;
    return parseFloat(match[0]);
  };

  try {
    const value = parseExpr();
    return i === src.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
