import math
import random
import logging
from typing import Any

logger = logging.getLogger(__name__)

def calibrate_noise(epsilon: float, delta: float, sensitivity: float) -> float:
    """Computes Gaussian noise scale (sigma) using the standard Gaussian mechanism."""
    if epsilon <= 0:
        raise ValueError("Epsilon must be greater than 0")
    if delta <= 0 or delta >= 1:
        raise ValueError("Delta must be in (0, 1)")
    return sensitivity * math.sqrt(2 * math.log(1.25 / delta)) / epsilon

def perturb_metrics(metrics: list[dict[str, Any]], epsilon: float = 1.0, delta: float = 1e-5) -> list[dict[str, Any]]:
    """Perturbs the numerical metrics of each file using Gaussian noise.
    
    Logs pre-perturbed vs. post-perturbed values at INFO level to ensure
    verification is falsifiable.
    """
    sensitivities = {
        "cyclomatic_complexity": 5.0,
        "cognitive_complexity": 5.0,
        "lines_of_code": 100.0,
        "function_count": 10.0,
        "churn_90d": 20.0,
        "test_coverage_ratio": 0.2,
        "max_fn_complexity": 5.0,
        "fan_out": 5.0,
        "unique_author_count": 2.0,
        "top_author_pct": 0.2,
        "bug_fix_ratio": 0.2,
        "days_since_last_commit": 15.0,
    }

    domain_bounds = {
        "cyclomatic_complexity": (1.0, None),
        "cognitive_complexity": (1.0, None),
        "lines_of_code": (1, None),
        "function_count": (0, None),
        "churn_90d": (0, None),
        "test_coverage_ratio": (0.0, 1.0),
        "max_fn_complexity": (0, None),
        "fan_out": (0, None),
        "unique_author_count": (1, None),
        "top_author_pct": (0.0, 1.0),
        "bug_fix_ratio": (0.0, 1.0),
        "days_since_last_commit": (0, None),
    }

    perturbed_list = []
    for item in metrics:
        new_item = {**item}
        file_path = item.get("file_path", "unknown")
        
        for key, sensitivity in sensitivities.items():
            if key in item and item[key] is not None:
                pre_val = float(item[key])
                sigma = calibrate_noise(epsilon, delta, sensitivity)
                noise = random.gauss(0, sigma)
                raw_post_val = pre_val + noise
                
                low, high = domain_bounds[key]
                post_val = raw_post_val
                if low is not None:
                    post_val = max(low, post_val)
                if high is not None:
                    post_val = min(high, post_val)
                
                if isinstance(item[key], int):
                    post_val = int(round(post_val))
                else:
                    post_val = round(post_val, 4)
                
                new_item[key] = post_val
                
                logger.info(
                    f"[DP Perturbation] File: {file_path} | Metric: {key} | "
                    f"Pre: {pre_val} | Post: {post_val} (noise: {noise:.4f}, sigma: {sigma:.4f})"
                )
                
        perturbed_list.append(new_item)
    return perturbed_list
