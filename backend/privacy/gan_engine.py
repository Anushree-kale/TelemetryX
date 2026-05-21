import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

class CTGANSynthesizer:
    """Stub mimicking CTGAN/SDV data generators for privacy-preserving synthetic data."""
    def __init__(self):
        self.is_fitted = False
        self._data_stats = {}

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
            else:
                self._data_stats[m] = {"mean": 10.0, "std": 2.0} # Fallback
                
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
