export type DiffLine = {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
};

const splitLines = (text: string) => (text.length === 0 ? [] : text.split('\n'));

export const computeLineDiff = (previous: string, current: string): DiffLine[] => {
  const previousLines = splitLines(previous);
  const currentLines = splitLines(current);

  const previousLength = previousLines.length;
  const currentLength = currentLines.length;

  const lcs: number[][] = Array.from({ length: previousLength + 1 }, () =>
    Array(currentLength + 1).fill(0),
  );

  for (let i = 1; i <= previousLength; i += 1) {
    for (let j = 1; j <= currentLength; j += 1) {
      if (previousLines[i - 1] === currentLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = previousLength;
  let j = currentLength;

  while (i > 0 && j > 0) {
    if (previousLines[i - 1] === currentLines[j - 1]) {
      result.push({ type: 'unchanged', value: currentLines[j - 1] });
      i -= 1;
      j -= 1;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      result.push({ type: 'removed', value: previousLines[i - 1] });
      i -= 1;
    } else {
      result.push({ type: 'added', value: currentLines[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    result.push({ type: 'removed', value: previousLines[i - 1] });
    i -= 1;
  }

  while (j > 0) {
    result.push({ type: 'added', value: currentLines[j - 1] });
    j -= 1;
  }

  return result.reverse();
};
