"""
Schema-agnostic synthetic data engine for TelemetryX.

Honest naming (no CTGAN/TimeGAN claims):
  - TabularGMMSynthesizer: Gaussian mixture model over numeric columns
  - TimeSeriesLSTMSynthesizer: LSTM next-step regression on numeric time series
"""

from __future__ import annotations

import logging
import random
import warnings
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:
    from scipy.spatial.distance import jensenshannon
    from scipy.stats import ks_2samp

    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning(
        "scipy is not installed. Fidelity validation will use simplified fallbacks. "
        "Install with: pip install scipy"
    )

try:
    from sklearn.mixture import GaussianMixture

    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning(
        "scikit-learn is not installed. TabularGMMSynthesizer will use independent normals."
    )

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim

    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning(
        "torch is not installed. TimeSeriesLSTMSynthesizer will use statistical fallbacks."
    )

if TORCH_AVAILABLE:

    class _LSTMGenerator(nn.Module):
        def __init__(self, input_dim: int, hidden_dim: int, output_dim: int) -> None:
            super().__init__()
            self.lstm = nn.LSTM(input_dim, hidden_dim, batch_first=True)
            self.linear = nn.Linear(hidden_dim, output_dim)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            out, _ = self.lstm(x)
            return self.linear(out)

else:

    class _LSTMGenerator:
        pass


KS_THRESHOLD = 0.2
JS_THRESHOLD = 0.3
TVD_THRESHOLD = 0.3
PASS_RATE_THRESHOLD = 0.75

DEFAULT_TABULAR_COLUMNS = [
    "lines_of_code",
    "cyclomatic_complexity",
    "churn_90d",
    "debt_score",
    "bug_fix_ratio",
]

DEFAULT_SEQUENCE_COLUMNS = [
    "avg_debt_score",
    "total_loc",
    "high_risk_count",
    "avg_test_coverage",
    "file_count",
    "avg_failure_risk",
    "high_risk_roi",
]

INTEGER_LIKE_COLUMNS = frozenset({"lines_of_code", "churn_90d", "file_count", "high_risk_count"})
UNIT_INTERVAL_COLUMNS = frozenset(
    {"bug_fix_ratio", "avg_test_coverage", "avg_failure_risk"}
)


def _default_for_column(column: str) -> float:
    defaults = {
        "lines_of_code": 100.0,
        "cyclomatic_complexity": 2.0,
        "churn_90d": 5.0,
        "debt_score": 10.0,
        "bug_fix_ratio": 0.1,
    }
    return defaults.get(column, 0.0)


def _json_safe_float(val: float | None) -> float | None:
    """Coerce numpy/float scalars to JSON-serializable values (no NaN/Inf)."""
    if val is None:
        return None
    f = float(val)
    if not np.isfinite(f):
        return None
    return f


def _coerce_sample_value(column: str, val: float, as_int: bool) -> int | float:
    if column in INTEGER_LIKE_COLUMNS:
        return max(0, int(round(val)))
    if column in UNIT_INTERVAL_COLUMNS:
        return round(max(0.0, min(1.0, float(val))), 4)
    if as_int:
        return int(round(val))
    return round(float(val), 4)


class TabularGMMSynthesizer:
    """Joint tabular synthesis via Gaussian mixture modeling (not CTGAN / GAN)."""

    def __init__(
        self,
        n_components: int = 3,
        numeric_columns: list[str] | None = None,
        row_id_column: str | None = None,
    ) -> None:
        self.n_components = n_components
        self.metrics = list(numeric_columns or DEFAULT_TABULAR_COLUMNS)
        self.row_id_column = row_id_column
        self.is_fitted = False
        self.gmm = None
        self._min_values: dict[str, float] = {}
        self._max_values: dict[str, float] = {}
        self._types: dict[str, type] = {}
        self._data_stats: dict[str, dict[str, float]] = {}

    def fit(self, data: list[dict[str, Any]]) -> None:
        if not data:
            logger.warning("Empty data provided to TabularGMMSynthesizer.fit()")
            return

        logger.info("Fitting TabularGMMSynthesizer on %s rows, columns=%s", len(data), self.metrics)

        rows_matrix: list[list[float]] = []
        for row in data:
            rows_matrix.append(
                [float(row.get(col) if row.get(col) is not None else _default_for_column(col)) for col in self.metrics]
            )

        matrix = np.array(rows_matrix, dtype=np.float64)

        for idx, col in enumerate(self.metrics):
            self._min_values[col] = float(np.min(matrix[:, idx]))
            self._max_values[col] = float(np.max(matrix[:, idx]))
            sample_vals = [d.get(col) for d in data if d.get(col) is not None]
            if sample_vals and all(isinstance(v, int) for v in sample_vals):
                self._types[col] = int
            else:
                self._types[col] = float

        if SKLEARN_AVAILABLE:
            try:
                n_comp = min(self.n_components, len(data))
                self.gmm = GaussianMixture(
                    n_components=n_comp, covariance_type="full", random_state=42
                )
                self.gmm.fit(matrix)
                logger.info("TabularGMMSynthesizer fitted GMM (%s components).", n_comp)
            except Exception as exc:
                logger.warning("GMM fit failed (%s); using independent normals.", exc)
                self.gmm = None
        else:
            self.gmm = None

        if self.gmm is None:
            self._data_stats = {}
            for col in self.metrics:
                values = [d.get(col) for d in data if d.get(col) is not None]
                if values:
                    self._data_stats[col] = {
                        "mean": float(np.mean(values)),
                        "std": float(np.std(values)) + 1e-8,
                    }
                else:
                    self._data_stats[col] = {"mean": 10.0, "std": 2.0}

        self.is_fitted = True

    def sample(self, num_rows: int) -> list[dict[str, Any]]:
        if not self.is_fitted:
            raise RuntimeError("TabularGMMSynthesizer must be fitted before sampling")

        samples: list[dict[str, Any]] = []

        if SKLEARN_AVAILABLE and self.gmm is not None:
            sampled_x, _ = self.gmm.sample(num_rows)
            for i in range(num_rows):
                sample: dict[str, Any] = {}
                if self.row_id_column:
                    sample[self.row_id_column] = f"synthetic/row_{i}"
                for idx, col in enumerate(self.metrics):
                    val = float(sampled_x[i, idx])
                    val = max(self._min_values[col], min(self._max_values[col], val))
                    sample[col] = _coerce_sample_value(col, val, self._types.get(col) is int)
                samples.append(sample)
        else:
            for i in range(num_rows):
                sample = {}
                if self.row_id_column:
                    sample[self.row_id_column] = f"synthetic/row_{i}"
                for col in self.metrics:
                    stats = self._data_stats[col]
                    val = float(np.random.normal(stats["mean"], stats["std"]))
                    val = max(
                        self._min_values.get(col, 0.0),
                        min(self._max_values.get(col, 10000.0), val),
                    )
                    sample[col] = _coerce_sample_value(col, val, self._types.get(col) is int)
                samples.append(sample)

        return samples


class TimeSeriesLSTMSynthesizer:
    """Time-series synthesis via LSTM regression (not TimeGAN / adversarial training)."""

    def __init__(
        self,
        hidden_dim: int = 16,
        epochs: int = 150,
        numeric_columns: list[str] | None = None,
    ) -> None:
        self.hidden_dim = hidden_dim
        self.epochs = epochs
        self.metrics = list(numeric_columns or DEFAULT_SEQUENCE_COLUMNS)
        self.is_fitted = False
        self._min_vals: dict[str, float] = {}
        self._max_vals: dict[str, float] = {}
        self._means: np.ndarray | None = None
        self._stds: np.ndarray | None = None
        self.model: Any = None
        self._fallback_data: list[dict[str, float]] = []

    def fit(self, history_data: list[dict[str, Any]]) -> None:
        if not history_data or len(history_data) < 2:
            logger.warning("Insufficient history for TimeSeriesLSTMSynthesizer — using fallback.")
            self._fit_simple_fallback(history_data or [])
            return

        logger.info("Fitting TimeSeriesLSTMSynthesizer on %s steps.", len(history_data))

        matrix = np.array(
            [[float(step.get(col, 0.0)) for col in self.metrics] for step in history_data],
            dtype=np.float64,
        )
        self._means = np.mean(matrix, axis=0)
        self._stds = np.std(matrix, axis=0) + 1e-8
        normalized = (matrix - self._means) / self._stds

        for idx, col in enumerate(self.metrics):
            self._min_vals[col] = float(np.min(matrix[:, idx]))
            self._max_vals[col] = float(np.max(matrix[:, idx]))

        if TORCH_AVAILABLE:
            try:
                inputs = torch.tensor(normalized[:-1], dtype=torch.float32).unsqueeze(0)
                targets = torch.tensor(normalized[1:], dtype=torch.float32).unsqueeze(0)
                feature_count = len(self.metrics)
                self.model = _LSTMGenerator(feature_count, self.hidden_dim, feature_count)
                optimizer = optim.Adam(self.model.parameters(), lr=0.01)
                criterion = nn.MSELoss()
                self.model.train()
                for _ in range(self.epochs):
                    optimizer.zero_grad()
                    outputs = self.model(inputs)
                    loss = criterion(outputs, targets)
                    loss.backward()
                    optimizer.step()
                self.is_fitted = True
                logger.info("TimeSeriesLSTMSynthesizer LSTM training complete.")
                return
            except Exception as exc:
                logger.warning("LSTM training failed (%s); using statistical fallback.", exc)

        self._fit_simple_fallback(history_data)

    def _fit_simple_fallback(self, history_data: list[dict[str, Any]]) -> None:
        self._fallback_data = [{col: float(step.get(col, 0.0)) for col in self.metrics} for step in history_data]
        for step in history_data:
            for col in self.metrics:
                val = float(step.get(col, 0.0))
                self._min_vals[col] = min(self._min_vals.get(col, float("inf")), val)
                self._max_vals[col] = max(self._max_vals.get(col, float("-inf")), val)
        for col in self.metrics:
            if self._min_vals.get(col) == float("inf"):
                self._min_vals[col] = 0.0
            if self._max_vals.get(col) == float("-inf"):
                self._max_vals[col] = 100.0
        self.model = None
        self.is_fitted = True

    def sample(self, num_steps: int) -> list[dict[str, Any]]:
        if not self.is_fitted:
            raise RuntimeError("TimeSeriesLSTMSynthesizer must be fitted before sampling")

        if self.model is None or not TORCH_AVAILABLE or self._means is None or self._stds is None:
            if not self._fallback_data:
                return [{col: max(0.0, random.gauss(10.0, 2.0)) for col in self.metrics} for _ in range(num_steps)]
            sampled: list[dict[str, Any]] = []
            for i in range(num_steps):
                item = dict(self._fallback_data[i % len(self._fallback_data)])
                for col in self.metrics:
                    walk = random.gauss(0, max(0.2, item[col] * 0.05))
                    item[col] = max(0.0, item[col] + walk)
                sampled.append({col: _coerce_sample_value(col, item[col], col in INTEGER_LIKE_COLUMNS) for col in self.metrics})
            return sampled

        self.model.eval()
        with torch.no_grad():
            feature_count = len(self.metrics)
            current = torch.zeros((1, 1, feature_count), dtype=torch.float32)
            means = torch.tensor(self._means, dtype=torch.float32)
            stds = torch.tensor(self._stds, dtype=torch.float32)
            first_norm = (
                torch.tensor([self._min_vals[col] for col in self.metrics], dtype=torch.float32)
                - means
            ) / stds
            current[0, 0] = first_norm
            norm_steps = [current[0, 0].clone()]
            for _ in range(num_steps - 1):
                pred = self.model(current)
                next_step = pred[:, -1:, :] + torch.randn_like(pred[:, -1:, :]) * 0.05
                norm_steps.append(next_step[0, 0].clone())
                current = torch.cat([current, next_step], dim=1)

            real_steps = torch.stack(norm_steps) * stds + means
            output: list[dict[str, Any]] = []
            for i in range(num_steps):
                step_dict: dict[str, Any] = {}
                for idx, col in enumerate(self.metrics):
                    val = float(real_steps[i, idx].item())
                    val = max(self._min_vals[col] * 0.5, min(self._max_vals[col] * 1.5, val))
                    step_dict[col] = _coerce_sample_value(col, val, col in INTEGER_LIKE_COLUMNS)
                output.append(step_dict)
            return output


def validate_fidelity(
    real_data: list[dict[str, Any]],
    synthetic_data: list[dict[str, Any]],
    metrics: list[str] | None = None,
    ks_threshold: float = KS_THRESHOLD,
    js_threshold: float = JS_THRESHOLD,
    tvd_threshold: float = TVD_THRESHOLD,
    pass_rate_threshold: float = PASS_RATE_THRESHOLD,
) -> dict[str, Any]:
    """Statistical fidelity gate (KS, JS distance, TVD) over arbitrary numeric columns."""
    if metrics is None:
        metrics = list(DEFAULT_TABULAR_COLUMNS)

    report: dict[str, Any] = {
        "passed": False,
        "pass_rate": 0.0,
        "scipy_available": SCIPY_AVAILABLE,
        "per_metric": {},
        "thresholds": {
            "ks_threshold": ks_threshold,
            "js_threshold": js_threshold,
            "tvd_threshold": tvd_threshold,
            "pass_rate_threshold": pass_rate_threshold,
        },
        "methods": {
            "tabular": "Gaussian mixture model (TabularGMMSynthesizer)",
            "sequence": "LSTM next-step regression (TimeSeriesLSTMSynthesizer)",
            "note": "Not CTGAN/TimeGAN — no adversarial discriminator is used.",
        },
    }

    if not real_data or not synthetic_data:
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
            report["per_metric"][metric] = {"skipped": True, "reason": "insufficient samples"}
            continue

        tested_count += 1

        if SCIPY_AVAILABLE:
            ks_stat, ks_pvalue = ks_2samp(real_vals, synth_vals)
            combined_min = float(min(real_vals.min(), synth_vals.min()))
            combined_max = float(max(real_vals.max(), synth_vals.max()))
            if combined_min == combined_max:
                # Constant (or identical) distributions — histogram distances are undefined.
                js_distance = 0.0
                tvd_distance = 0.0
            else:
                n_bins = max(10, int(np.sqrt(len(real_vals) + len(synth_vals))))
                bins = np.linspace(combined_min, combined_max, n_bins + 1)
                real_hist, _ = np.histogram(real_vals, bins=bins, density=True)
                synth_hist, _ = np.histogram(synth_vals, bins=bins, density=True)
                eps = 1e-10
                real_sum = float((real_hist + eps).sum())
                synth_sum = float((synth_hist + eps).sum())
                if real_sum <= 0 or synth_sum <= 0:
                    js_distance = 0.0
                    tvd_distance = 0.0
                else:
                    real_hist = (real_hist + eps) / real_sum
                    synth_hist = (synth_hist + eps) / synth_sum
                    js_distance = float(jensenshannon(real_hist, synth_hist, base=2))
                    tvd_distance = float(0.5 * np.sum(np.abs(real_hist - synth_hist)))
                    if not np.isfinite(js_distance):
                        js_distance = 0.0
                    if not np.isfinite(tvd_distance):
                        tvd_distance = 0.0
        else:
            real_mean, real_std = real_vals.mean(), real_vals.std() + 1e-10
            synth_mean = synth_vals.mean()
            ks_stat = abs(real_mean - synth_mean) / real_std
            ks_pvalue = float("nan")
            js_distance = abs(real_std - synth_vals.std()) / real_std
            tvd_distance = abs(real_mean - synth_mean) / (real_mean + 1e-10)

        metric_passed = bool(
            float(ks_stat) <= ks_threshold
            and js_distance <= js_threshold
            and tvd_distance <= tvd_threshold
        )
        if metric_passed:
            passed_count += 1

        ks_stat_safe = _json_safe_float(ks_stat)
        ks_pvalue_safe = _json_safe_float(ks_pvalue)
        js_safe = _json_safe_float(js_distance)
        tvd_safe = _json_safe_float(tvd_distance)

        report["per_metric"][metric] = {
            "ks_stat": round(ks_stat_safe, 6) if ks_stat_safe is not None else None,
            "ks_pvalue": round(ks_pvalue_safe, 6) if ks_pvalue_safe is not None else None,
            "js_distance": round(js_safe, 6) if js_safe is not None else None,
            "tvd_distance": round(tvd_safe, 6) if tvd_safe is not None else None,
            "passed": metric_passed,
        }

    pass_rate = passed_count / tested_count if tested_count > 0 else 0.0
    report["pass_rate"] = round(float(pass_rate), 4)
    report["passed"] = bool(pass_rate >= pass_rate_threshold)
    return report


# Deprecated aliases — misleading GAN branding
def _deprecated_alias(name: str, replacement: str) -> None:
    warnings.warn(
        f"{name} is deprecated and misnamed; use {replacement} instead. "
        "TelemetryX does not use CTGAN/TimeGAN adversarial training.",
        DeprecationWarning,
        stacklevel=3,
    )


class CTGANSynthesizer(TabularGMMSynthesizer):
    """Deprecated alias for TabularGMMSynthesizer."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        _deprecated_alias("CTGANSynthesizer", "TabularGMMSynthesizer")
        super().__init__(*args, **kwargs)


class TimeGANSynthesizer(TimeSeriesLSTMSynthesizer):
    """Deprecated alias for TimeSeriesLSTMSynthesizer."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        _deprecated_alias("TimeGANSynthesizer", "TimeSeriesLSTMSynthesizer")
        super().__init__(*args, **kwargs)
