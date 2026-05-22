import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:
    from scipy.stats import ks_2samp
    from scipy.spatial.distance import jensenshannon
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning(
        "scipy is not installed. Fidelity validation (KS-test + JS divergence) will be skipped. "
        "Install it with: pip install scipy"
    )

# ─── Thresholds ────────────────────────────────────────────────────────────────
# KS statistic: 0 = identical distributions, 1 = maximally different.
# Values below KS_THRESHOLD mean the synthetic data is statistically close enough.
KS_THRESHOLD = 0.2

# Jensen-Shannon divergence: 0 = identical, 1 = maximally different (base-2 log).
# Sqrt(JS divergence) gives the JS distance in [0, 1].
JS_THRESHOLD = 0.3

# The fraction of metrics that must pass for the overall gate to pass.
PASS_RATE_THRESHOLD = 0.75


class CTGANSynthesizer:
    """Stub mimicking CTGAN/SDV data generators for privacy-preserving synthetic data."""
    def __init__(self):
        self.is_fitted = False
        self._data_stats = {}
        # Store real values per metric for fidelity validation
        self._real_values: dict[str, list[float]] = {}

    def fit(self, data: list[dict[str, Any]]) -> None:
        """Fits on real telemetry data."""
        if not data:
            logger.warning("Empty data provided to CTGANSynthesizer.fit()")
            return
            
        logger.info(f"Fitting CTGANSynthesizer on {len(data)} rows")
        
        # Simple stats extraction for stub
        metrics = ["lines_of_code", "cyclomatic_complexity", "churn_90d", "debt_score", "bug_fix_ratio"]
        for m in metrics:
            values = [d.get(m, 0) for d in data if m in d and d[m] is not None]
            if values:
                self._data_stats[m] = {
                    "mean": float(np.mean(values)),
                    "std": float(np.std(values))
                }
                self._real_values[m] = [float(v) for v in values]
            else:
                self._data_stats[m] = {"mean": 10.0, "std": 2.0}  # Fallback
                self._real_values[m] = []
                
        self.is_fitted = True
        logger.info("CTGANSynthesizer successfully fitted.")

    def sample(self, num_rows: int) -> list[dict[str, Any]]:
        """Generates randomized mock repository records matching realistic profiles."""
        if not self.is_fitted:
            raise RuntimeError("CTGANSynthesizer must be fitted before sampling")
            
        logger.info(f"Sampling {num_rows} synthetic rows")
        samples = []
        for i in range(num_rows):
            sample = {"file_path": f"synthetic/file_{i}.py"}
            for m, stats in self._data_stats.items():
                val = np.random.normal(stats["mean"], stats["std"])
                if m in ["lines_of_code", "churn_90d"]:
                    sample[m] = max(0, int(val))
                elif m in ["cyclomatic_complexity", "debt_score"]:
                    sample[m] = max(0.0, float(val))
                elif m == "bug_fix_ratio":
                    sample[m] = max(0.0, min(1.0, float(val)))
            samples.append(sample)
            
        return samples


def validate_fidelity(
    real_data: list[dict[str, Any]],
    synthetic_data: list[dict[str, Any]],
    metrics: list[str] | None = None,
    ks_threshold: float = KS_THRESHOLD,
    js_threshold: float = JS_THRESHOLD,
    pass_rate_threshold: float = PASS_RATE_THRESHOLD,
) -> dict[str, Any]:
    """Validates synthetic data fidelity against real data using statistical tests.

    Runs two complementary tests for each numeric metric:
      - **KS test** (Kolmogorov-Smirnov): Detects distributional differences
        across the full CDF — sensitive to location and shape shifts.
      - **JS divergence** (Jensen-Shannon): Measures symmetric information-theoretic
        divergence between probability density estimates — sensitive to tail behaviour.

    A metric *passes* if both its KS statistic is below ``ks_threshold`` AND
    its JS distance is below ``js_threshold``.  The overall gate passes when at
    least ``pass_rate_threshold`` fraction of metrics pass.

    Args:
        real_data: List of dicts from the live telemetry pipeline.
        synthetic_data: List of dicts produced by ``CTGANSynthesizer.sample()``.
        metrics: Metric keys to test. Defaults to the five core GAN metrics.
        ks_threshold: Maximum acceptable KS statistic (default 0.2).
        js_threshold: Maximum acceptable JS distance (default 0.3).
        pass_rate_threshold: Minimum fraction of metrics that must pass (default 0.75).

    Returns:
        A dict with keys:
          - ``passed`` (bool): True if overall gate passes.
          - ``pass_rate`` (float): Fraction of metrics that individually passed.
          - ``scipy_available`` (bool): Whether scipy was used for real statistics.
          - ``per_metric`` (dict): Per-metric breakdown with ks_stat, ks_pvalue,
            js_distance, and passed flag.
          - ``thresholds`` (dict): The threshold values used.
    """
    if metrics is None:
        metrics = ["lines_of_code", "cyclomatic_complexity", "churn_90d", "debt_score", "bug_fix_ratio"]

    report: dict[str, Any] = {
        "passed": False,
        "pass_rate": 0.0,
        "scipy_available": SCIPY_AVAILABLE,
        "per_metric": {},
        "thresholds": {
            "ks_threshold": ks_threshold,
            "js_threshold": js_threshold,
            "pass_rate_threshold": pass_rate_threshold,
        },
    }

    if not real_data or not synthetic_data:
        logger.warning("validate_fidelity: empty real or synthetic data — skipping checks.")
        report["warning"] = "Empty input — validation skipped."
        return report

    passed_count = 0
    tested_count = 0

    for metric in metrics:
        real_vals = np.array(
            [float(d[metric]) for d in real_data if metric in d and d[metric] is not None],
            dtype=np.float64,
        )
        synth_vals = np.array(
            [float(d[metric]) for d in synthetic_data if metric in d and d[metric] is not None],
            dtype=np.float64,
        )

        if len(real_vals) < 2 or len(synth_vals) < 2:
            logger.warning(f"validate_fidelity: not enough data for metric '{metric}' — skipping.")
            report["per_metric"][metric] = {"skipped": True, "reason": "insufficient samples"}
            continue

        tested_count += 1

        if SCIPY_AVAILABLE:
            # ── KS test ────────────────────────────────────────────────────────
            ks_stat, ks_pvalue = ks_2samp(real_vals, synth_vals)

            # ── Jensen-Shannon divergence ──────────────────────────────────────
            # Bin both distributions on the same edges for a fair comparison.
            combined_min = min(real_vals.min(), synth_vals.min())
            combined_max = max(real_vals.max(), synth_vals.max())
            n_bins = max(10, int(np.sqrt(len(real_vals) + len(synth_vals))))
            bins = np.linspace(combined_min, combined_max, n_bins + 1)

            real_hist, _ = np.histogram(real_vals, bins=bins, density=True)
            synth_hist, _ = np.histogram(synth_vals, bins=bins, density=True)

            # Add small epsilon to avoid zero-probability bins (smoothing)
            eps = 1e-10
            real_hist = real_hist + eps
            synth_hist = synth_hist + eps

            # Normalise to proper probability distributions
            real_hist = real_hist / real_hist.sum()
            synth_hist = synth_hist / synth_hist.sum()

            # jensenshannon returns the JS *distance* (sqrt of divergence), range [0, 1]
            js_distance = float(jensenshannon(real_hist, synth_hist, base=2))
        else:
            # ── Fallback: simple mean/std comparison ──────────────────────────
            # Not as rigorous but avoids a hard dependency crash.
            real_mean, real_std = real_vals.mean(), real_vals.std() + 1e-10
            synth_mean, synth_std = synth_vals.mean(), synth_vals.std() + 1e-10
            ks_stat = abs(real_mean - synth_mean) / real_std   # Normalised mean shift proxy
            ks_pvalue = float("nan")
            js_distance = abs(real_std - synth_std) / real_std  # Normalised std shift proxy

        metric_passed = ks_stat <= ks_threshold and js_distance <= js_threshold
        if metric_passed:
            passed_count += 1

        report["per_metric"][metric] = {
            "ks_stat": round(float(ks_stat), 6),
            "ks_pvalue": round(float(ks_pvalue), 6) if not np.isnan(ks_pvalue) else None,
            "js_distance": round(float(js_distance), 6),
            "passed": metric_passed,
        }

        status = "✅ PASS" if metric_passed else "❌ FAIL"
        logger.info(
            f"[FidelityGate] {status} | metric='{metric}' | "
            f"KS={ks_stat:.4f} (≤{ks_threshold}) | "
            f"JS={js_distance:.4f} (≤{js_threshold})"
        )

    pass_rate = passed_count / tested_count if tested_count > 0 else 0.0
    gate_passed = pass_rate >= pass_rate_threshold

    report["pass_rate"] = round(pass_rate, 4)
    report["passed"] = gate_passed

    logger.info(
        f"[FidelityGate] Overall: {'✅ PASSED' if gate_passed else '❌ FAILED'} | "
        f"{passed_count}/{tested_count} metrics passed ({pass_rate:.0%})"
    )

    return report
