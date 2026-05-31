import logging
import random
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

# Try importing sklearn for Gaussian Mixture Model synthetic generation
try:
    from sklearn.mixture import GaussianMixture
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn is not installed. CTGANSynthesizer will use a simplified normal distribution generator.")

# Try importing torch for LSTM-based TimeGAN sequence generation
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("torch is not installed. TimeGANSynthesizer will use statistical sequence generation fallbacks.")

if TORCH_AVAILABLE:
    class LSTMGenerator(nn.Module):
        def __init__(self, input_dim, hidden_dim, output_dim):
            super().__init__()
            self.lstm = nn.LSTM(input_dim, hidden_dim, batch_first=True)
            self.linear = nn.Linear(hidden_dim, output_dim)

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.linear(out)
else:
    class LSTMGenerator:
        pass


# ─── Thresholds ────────────────────────────────────────────────────────────────
# KS statistic: 0 = identical distributions, 1 = maximally different.
# Values below KS_THRESHOLD mean the synthetic data is statistically close enough.
KS_THRESHOLD = 0.2

# Jensen-Shannon divergence: 0 = identical, 1 = maximally different (base-2 log).
# Sqrt(JS divergence) gives the JS distance in [0, 1].
JS_THRESHOLD = 0.3

# Total Variation Distance: 0 = identical distributions, 1 = completely disjoint.
TVD_THRESHOLD = 0.3

# The fraction of metrics that must pass for the overall gate to pass.
PASS_RATE_THRESHOLD = 0.75


class CTGANSynthesizer:
    """Tabular synthetic data generator leveraging Gaussian Mixture Models to model joint correlations of metrics."""
    def __init__(self, n_components: int = 3):
        self.n_components = n_components
        self.is_fitted = False
        self.metrics = ["lines_of_code", "cyclomatic_complexity", "churn_90d", "debt_score", "bug_fix_ratio"]
        self.gmm = None
        self._min_values = {}
        self._max_values = {}
        self._types = {}

    def fit(self, data: list[dict[str, Any]]) -> None:
        """Fits on real telemetry data."""
        if not data:
            logger.warning("Empty data provided to CTGANSynthesizer.fit()")
            return
            
        logger.info(f"Fitting CTGANSynthesizer on {len(data)} rows")
        
        # Extract numerical data matrix
        X = []
        for d in data:
            row = []
            for m in self.metrics:
                val = d.get(m)
                if val is None:
                    # Provide default fallbacks if missing
                    if m == "lines_of_code": val = 100.0
                    elif m == "cyclomatic_complexity": val = 2.0
                    elif m == "churn_90d": val = 5.0
                    elif m == "debt_score": val = 10.0
                    elif m == "bug_fix_ratio": val = 0.1
                row.append(float(val))
            X.append(row)
            
        X = np.array(X, dtype=np.float64)
        
        # Save bounds & types for post-processing
        for idx, m in enumerate(self.metrics):
            self._min_values[m] = float(np.min(X[:, idx]))
            self._max_values[m] = float(np.max(X[:, idx]))
            sample_vals = [d.get(m) for d in data if d.get(m) is not None]
            if sample_vals and all(isinstance(v, int) for v in sample_vals):
                self._types[m] = int
            else:
                self._types[m] = float
                
        # Fit GMM if sklearn is available, otherwise fall back to simple normals
        if SKLEARN_AVAILABLE:
            try:
                n_comp = min(self.n_components, len(data))
                self.gmm = GaussianMixture(n_components=n_comp, covariance_type='full', random_state=42)
                self.gmm.fit(X)
                logger.info("CTGANSynthesizer successfully fitted GMM joint distribution.")
            except Exception as e:
                logger.warning(f"Error fitting GMM: {e}. Falling back to independent normals.")
                self.gmm = None
        else:
            self.gmm = None
            
        if self.gmm is None:
            # Independent normal distributions fallback
            self._data_stats = {}
            for m in self.metrics:
                values = [d.get(m, 0) for d in data if m in d and d[m] is not None]
                if values:
                    self._data_stats[m] = {
                        "mean": float(np.mean(values)),
                        "std": float(np.std(values)) + 1e-8
                    }
                else:
                    self._data_stats[m] = {"mean": 10.0, "std": 2.0}
                    
        self.is_fitted = True
        logger.info("CTGANSynthesizer fitting completed.")

    def sample(self, num_rows: int) -> list[dict[str, Any]]:
        """Generates randomized mock repository records matching realistic profiles."""
        if not self.is_fitted:
            raise RuntimeError("CTGANSynthesizer must be fitted before sampling")
            
        logger.info(f"Sampling {num_rows} synthetic rows")
        samples = []
        
        if SKLEARN_AVAILABLE and self.gmm is not None:
            sampled_X, _ = self.gmm.sample(num_rows)
            for i in range(num_rows):
                sample = {"file_path": f"synthetic/file_{i}.py"}
                for idx, m in enumerate(self.metrics):
                    val = sampled_X[i, idx]
                    # Clamp within observed bounds
                    val = max(self._min_values[m], min(self._max_values[m], val))
                    
                    # Business logic bounding
                    if m in ["lines_of_code", "churn_90d"]:
                        val = max(0, int(round(val)))
                    elif m in ["cyclomatic_complexity", "debt_score"]:
                        val = max(0.0, float(val))
                    elif m == "bug_fix_ratio":
                        val = max(0.0, min(1.0, float(val)))
                        
                    if self._types.get(m) == int:
                        sample[m] = int(round(val))
                    else:
                        sample[m] = round(float(val), 4)
                samples.append(sample)
        else:
            # Simple fallback sampler
            for i in range(num_rows):
                sample = {"file_path": f"synthetic/file_{i}.py"}
                for m in self.metrics:
                    stats = self._data_stats[m]
                    val = np.random.normal(stats["mean"], stats["std"])
                    # Clamp within bounds
                    val = max(self._min_values.get(m, 0.0), min(self._max_values.get(m, 10000.0), val))
                    
                    if m in ["lines_of_code", "churn_90d"]:
                        sample[m] = max(0, int(round(val)))
                    elif m in ["cyclomatic_complexity", "debt_score"]:
                        sample[m] = max(0.0, float(val))
                    elif m == "bug_fix_ratio":
                        sample[m] = max(0.0, min(1.0, float(val)))
                samples.append(sample)
                
        return samples


class TimeGANSynthesizer:
    """Time-series synthetic generator leveraging PyTorch LSTM models to learn and recreate trend trajectories."""
    def __init__(self, hidden_dim: int = 16, epochs: int = 150):
        self.hidden_dim = hidden_dim
        self.epochs = epochs
        self.is_fitted = False
        self.metrics = [
            "avg_debt_score", 
            "total_loc", 
            "high_risk_count", 
            "avg_test_coverage", 
            "file_count", 
            "avg_failure_risk", 
            "burnout_score", 
            "high_risk_roi"
        ]
        self._min_vals = {}
        self._max_vals = {}
        self._means = []
        self._stds = []
        self._historical_len = 0
        self.model = None

    def fit(self, history_data: list[dict[str, Any]]) -> None:
        """Trains an LSTM sequence model on historical trends."""
        if not history_data or len(history_data) < 2:
            logger.warning("Insufficient history data to fit TimeGANSynthesizer. Need at least 2 time steps.")
            self._fit_simple_fallback(history_data)
            return
            
        logger.info(f"Fitting TimeGANSynthesizer on {len(history_data)} historical time steps")
        self._historical_len = len(history_data)
        
        # Prepare matrix
        X = []
        for h in history_data:
            row = []
            for m in self.metrics:
                row.append(float(h.get(m, 0.0)))
            X.append(row)
            
        X = np.array(X, dtype=np.float64)
        
        # Normalize data
        self._means = np.mean(X, axis=0)
        self._stds = np.std(X, axis=0) + 1e-8
        X_norm = (X - self._means) / self._stds
        
        # Save min/max bounds
        for idx, m in enumerate(self.metrics):
            self._min_vals[m] = float(np.min(X[:, idx]))
            self._max_vals[m] = float(np.max(X[:, idx]))
            
        # Fit PyTorch LSTM if available
        if TORCH_AVAILABLE:
            try:
                inputs = torch.tensor(X_norm[:-1], dtype=torch.float32).unsqueeze(0) # (1, seq_len-1, num_features)
                targets = torch.tensor(X_norm[1:], dtype=torch.float32).unsqueeze(0) # (1, seq_len-1, num_features)
                
                num_features = len(self.metrics)
                self.model = LSTMGenerator(num_features, self.hidden_dim, num_features)
                optimizer = optim.Adam(self.model.parameters(), lr=0.01)
                criterion = nn.MSELoss()
                
                self.model.train()
                for epoch in range(self.epochs):
                    optimizer.zero_grad()
                    outputs = self.model(inputs)
                    loss = criterion(outputs, targets)
                    loss.backward()
                    optimizer.step()
                    
                self.is_fitted = True
                logger.info("TimeGANSynthesizer PyTorch model successfully trained.")
            except Exception as e:
                logger.warning(f"Error training PyTorch LSTM: {e}. Falling back to statistical transition model.")
                self._fit_simple_fallback(history_data)
        else:
            self._fit_simple_fallback(history_data)

    def _fit_simple_fallback(self, history_data: list[dict[str, Any]]) -> None:
        self._fallback_data = []
        for h in history_data:
            self._fallback_data.append({m: float(h.get(m, 0.0)) for m in self.metrics})
            for m in self.metrics:
                self._min_vals[m] = min(self._min_vals.get(m, float('inf')), float(h.get(m, 0.0)))
                self._max_vals[m] = max(self._max_vals.get(m, float('-inf')), float(h.get(m, 0.0)))
        
        for m in self.metrics:
            if self._min_vals.get(m) == float('inf'): self._min_vals[m] = 0.0
            if self._max_vals.get(m) == float('-inf'): self._max_vals[m] = 100.0
            
        self.is_fitted = True
        logger.info("TimeGANSynthesizer fitted with simple statistical fallback.")

    def sample(self, num_steps: int) -> list[dict[str, Any]]:
        """Generates a synthetic time-series trajectories for repository metric trends."""
        if not self.is_fitted:
            raise RuntimeError("TimeGANSynthesizer must be fitted before sampling")
            
        if self.model is None or not TORCH_AVAILABLE:
            logger.info("Sampling using statistical fallback sequence generator")
            if not hasattr(self, "_fallback_data") or not self._fallback_data:
                return [
                    {m: max(0.0, random.gauss(10.0, 2.0)) for m in self.metrics}
                    for _ in range(num_steps)
                ]
            
            sampled = []
            for i in range(num_steps):
                idx = i % len(self._fallback_data)
                item = {**self._fallback_data[idx]}
                for m in self.metrics:
                    walk = random.gauss(0, max(0.2, item[m] * 0.05))
                    item[m] = max(0.0, item[m] + walk)
                sampled.append(item)
            return sampled
            
        logger.info(f"Sampling {num_steps} synthetic time-series steps using PyTorch LSTM")
        self.model.eval()
        with torch.no_grad():
            num_features = len(self.metrics)
            current_step = torch.zeros((1, 1, num_features), dtype=torch.float32)
            first_step_norm = (np.array([self._min_vals[m] for m in self.metrics]) - self._means) / self._stds
            current_step[0, 0] = torch.tensor(first_step_norm, dtype=torch.float32)
            
            sampled_norm = [current_step[0, 0].numpy()]
            for _ in range(num_steps - 1):
                pred = self.model(current_step)
                next_step = pred[:, -1:, :]
                # Add high-fidelity stochastic perturbation
                noise = torch.randn_like(next_step) * 0.05
                next_step = next_step + noise
                sampled_norm.append(next_step[0, 0].numpy())
                current_step = torch.cat([current_step, next_step], dim=1)
                
            sampled_norm = np.array(sampled_norm)
            sampled_real = sampled_norm * self._stds + self._means
            
            samples = []
            for i in range(num_steps):
                step_dict = {}
                for idx, m in enumerate(self.metrics):
                    val = sampled_real[i, idx]
                    val = max(self._min_vals[m] * 0.5, min(self._max_vals[m] * 1.5, val))
                    
                    if m in ["file_count", "high_risk_count"]:
                        val = max(0, int(round(val)))
                    elif m in ["avg_test_coverage", "avg_failure_risk", "burnout_score"]:
                        val = max(0.0, min(1.0, float(val)))
                    else:
                        val = max(0.0, float(val))
                    step_dict[m] = round(val, 4)
                samples.append(step_dict)
                
            return samples


def validate_fidelity(
    real_data: list[dict[str, Any]],
    synthetic_data: list[dict[str, Any]],
    metrics: list[str] | None = None,
    ks_threshold: float = KS_THRESHOLD,
    js_threshold: float = JS_THRESHOLD,
    tvd_threshold: float = TVD_THRESHOLD,
    pass_rate_threshold: float = PASS_RATE_THRESHOLD,
) -> dict[str, Any]:
    """Validates synthetic data fidelity against real data using three statistical checks.

    Runs three complementary tests for each numeric metric:
      - **KS test** (Kolmogorov-Smirnov): Detects distributional differences
        across the full CDF — sensitive to location and shape shifts.
      - **JS divergence** (Jensen-Shannon): Measures symmetric information-theoretic
        divergence between probability density estimates — sensitive to tail behaviour.
      - **Total Variation Distance (TVD)**: Directly quantifies the total absolute distance 
        between the binned probability distributions.

    A metric *passes* if its KS statistic <= ks_threshold, JS distance <= js_threshold,
    and TVD distance <= tvd_threshold. The overall gate passes when at least
    pass_rate_threshold fraction of metrics pass.
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
            "tvd_threshold": tvd_threshold,
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

            # ── Jensen-Shannon & TVD ──────────────────────────────────────
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
            
            # Total Variation Distance: 0.5 * sum(|p - q|)
            tvd_distance = float(0.5 * np.sum(np.abs(real_hist - synth_hist)))
        else:
            # ── Fallback ──────────────────────────────────────────────────────
            real_mean, real_std = real_vals.mean(), real_vals.std() + 1e-10
            synth_mean, synth_std = synth_vals.mean(), synth_vals.std() + 1e-10
            ks_stat = abs(real_mean - synth_mean) / real_std
            ks_pvalue = float("nan")
            js_distance = abs(real_std - synth_std) / real_std
            tvd_distance = abs(real_mean - synth_mean) / (real_mean + 1e-10)

        metric_passed = bool(
            float(ks_stat) <= ks_threshold
            and js_distance <= js_threshold
            and tvd_distance <= tvd_threshold
        )

        if metric_passed:
            passed_count += 1

        report["per_metric"][metric] = {
            "ks_stat": round(float(ks_stat), 6),
            "ks_pvalue": round(float(ks_pvalue), 6) if not np.isnan(ks_pvalue) else None,
            "js_distance": round(float(js_distance), 6),
            "tvd_distance": round(float(tvd_distance), 6),
            "passed": metric_passed,
        }

        status = "✅ PASS" if metric_passed else "❌ FAIL"
        logger.info(
            f"[FidelityGate] {status} | metric='{metric}' | "
            f"KS={ks_stat:.4f} (≤{ks_threshold}) | "
            f"JS={js_distance:.4f} (≤{js_threshold}) | "
            f"TVD={tvd_distance:.4f} (≤{tvd_threshold})"
        )

    pass_rate = passed_count / tested_count if tested_count > 0 else 0.0
    gate_passed = bool(pass_rate >= pass_rate_threshold)

    report["pass_rate"] = round(float(pass_rate), 4)
    report["passed"] = gate_passed

    logger.info(
        f"[FidelityGate] Overall: {'✅ PASSED' if gate_passed else '❌ FAILED'} | "
        f"{passed_count}/{tested_count} metrics passed ({pass_rate:.0%})"
    )

    return report
