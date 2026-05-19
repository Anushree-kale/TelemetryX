/**
 * @param {number} diff - value in B minus value in A
 * @param {number} baseForPct - A's value; used as denominator for % change
 * @param {'lower_better' | 'higher_better' | 'neutral'} sentiment
 * @param {(d: number, sign: string) => string} formatDelta
 * @param {boolean} showPct
 */
export function renderVarianceDeltas(
  diff,
  baseForPct,
  sentiment,
  formatDelta,
  showPct = true,
) {
  const sign = diff > 0 ? "+" : "";
  let cls = "neutral-delta";
  if (sentiment === "lower_better") {
    cls = diff > 0 ? "negative-delta" : diff < 0 ? "positive-delta" : "neutral-delta";
  } else if (sentiment === "higher_better") {
    cls = diff > 0 ? "positive-delta" : diff < 0 ? "negative-delta" : "neutral-delta";
  }

  const pctText =
    showPct && baseForPct > 0
      ? `${diff > 0 ? "+" : ""}${((diff / baseForPct) * 100).toFixed(1)}%`
      : "—";

  return { cls, deltaText: formatDelta(diff, sign), pctText };
}
