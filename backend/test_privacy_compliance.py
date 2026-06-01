import unittest
import numpy as np
from privacy import dp_engine
from privacy import gan_engine, synthesis_engine

class TestPrivacyCompliance(unittest.TestCase):
    def test_pii_stripping_and_anonymization(self):
        # Jan 1, 2026 was a Thursday.
        # Preceding Monday was Dec 29, 2025 (1766966400)
        t1 = 1767225600 # Jan 1, 2026 00:00:00 UTC
        t2 = 1767312000 # Jan 2, 2026 00:00:00 UTC
        
        anonymized = dp_engine.strip_pii_and_anonymize([t1, t2])
        self.assertEqual(len(anonymized), 2)
        # Verify both aligned to Monday Dec 29, 2025 midnight UTC
        self.assertEqual(anonymized[0], 1766966400)
        self.assertEqual(anonymized[1], 1766966400)

    def test_k_anonymity_contributor_data(self):
        metrics = [
            {
                "file_path": "src/module_a.py",
                "unique_author_count": 1,
                "top_author_pct": 0.9,
                "lines_of_code": 150
            },
            {
                "file_path": "src/module_b.py",
                "unique_author_count": 5,
                "top_author_pct": 0.4,
                "lines_of_code": 500
            }
        ]
        
        # Enforce k-anonymity with k=3
        perturbed = dp_engine.perturb_metrics(metrics, epsilon=1.0, delta=1e-5, k=3)
        self.assertEqual(len(perturbed), 2)
        
        # module_a had unique_author_count = 1 (< k=3). It should be redacted/anonymized to 0.
        self.assertEqual(perturbed[0]["unique_author_count"], 0)
        self.assertEqual(perturbed[0]["top_author_pct"], 0.0)
        
        # module_b had unique_author_count = 5 (>= k=3). It should NOT be zeroed out.
        self.assertNotEqual(perturbed[1]["unique_author_count"], 0)
        self.assertNotEqual(perturbed[1]["top_author_pct"], 0.0)

    def test_tabular_gmm_synthesizer(self):
        data = [
            {
                "lines_of_code": 100,
                "cyclomatic_complexity": 2.5,
                "churn_90d": 4,
                "debt_score": 15.0,
                "bug_fix_ratio": 0.2,
            }
            for _ in range(20)
        ]

        synth = synthesis_engine.TabularGMMSynthesizer(n_components=2, row_id_column="id")
        synth.fit(data)
        self.assertTrue(synth.is_fitted)

        samples = synth.sample(5)
        self.assertEqual(len(samples), 5)
        for row in samples:
            self.assertIn("id", row)
            self.assertIn("lines_of_code", row)

    def test_ctgan_tabular_synthesizer(self):
        data = [
            {
                "lines_of_code": 100,
                "cyclomatic_complexity": 2.5,
                "churn_90d": 4,
                "debt_score": 15.0,
                "bug_fix_ratio": 0.2
            }
            for _ in range(20)
        ]
        
        ctgan = gan_engine.CTGANSynthesizer(n_components=2)
        ctgan.fit(data)
        self.assertTrue(ctgan.is_fitted)
        
        samples = ctgan.sample(5)
        self.assertEqual(len(samples), 5)
        for s in samples:
            self.assertIn("lines_of_code", s)
            self.assertIn("cyclomatic_complexity", s)
            self.assertIn("churn_90d", s)
            self.assertIn("debt_score", s)
            self.assertIn("bug_fix_ratio", s)
            # Verify data bounds and types
            self.assertIsInstance(s["lines_of_code"], int)
            self.assertIsInstance(s["cyclomatic_complexity"], float)

    def test_time_series_lstm_synthesizer(self):
        history = [
            {
                "avg_debt_score": 10.0 + i,
                "total_loc": 1000 + i * 100,
                "high_risk_count": i // 3,
                "avg_test_coverage": 0.4 + i * 0.01,
                "file_count": 10 + i,
                "avg_failure_risk": 0.2 + i * 0.02,
                "burnout_score": 0.15 + i * 0.01,
                "high_risk_roi": 5.0 + i,
            }
            for i in range(10)
        ]

        synth = synthesis_engine.TimeSeriesLSTMSynthesizer(epochs=10)
        synth.fit(history)
        self.assertTrue(synth.is_fitted)
        sampled = synth.sample(5)
        self.assertEqual(len(sampled), 5)

    def test_timegan_time_series_synthesizer(self):
        history = [
            {
                "avg_debt_score": 10.0 + i,
                "total_loc": 1000 + i * 100,
                "high_risk_count": i // 3,
                "avg_test_coverage": 0.4 + i * 0.01,
                "file_count": 10 + i,
                "avg_failure_risk": 0.2 + i * 0.02,
                "burnout_score": 0.15 + i * 0.01,
                "high_risk_roi": 5.0 + i
            }
            for i in range(10)
        ]
        
        timegan = gan_engine.TimeGANSynthesizer(epochs=10)
        timegan.fit(history)
        self.assertTrue(timegan.is_fitted)
        
        sampled = timegan.sample(5)
        self.assertEqual(len(sampled), 5)
        for s in sampled:
            self.assertIn("avg_debt_score", s)
            self.assertIn("total_loc", s)
            self.assertIn("high_risk_count", s)
            self.assertIn("avg_test_coverage", s)
            self.assertIn("file_count", s)

    def test_fidelity_validation_gate(self):
        real = [
            {
                "lines_of_code": 100 + i * 5,
                "cyclomatic_complexity": 2.0 + i * 0.1,
                "churn_90d": i,
                "debt_score": 15.0 + i,
                "bug_fix_ratio": 0.1 + i * 0.02
            }
            for i in range(15)
        ]
        
        synthetic = [
            {
                "lines_of_code": 105 + i * 5,
                "cyclomatic_complexity": 2.1 + i * 0.1,
                "churn_90d": i + 1,
                "debt_score": 16.0 + i,
                "bug_fix_ratio": 0.12 + i * 0.02
            }
            for i in range(15)
        ]
        
        report = gan_engine.validate_fidelity(real, synthetic)
        self.assertIn("passed", report)
        self.assertIn("pass_rate", report)
        self.assertIn("per_metric", report)
        
        for metric, stats in report["per_metric"].items():
            self.assertIn("ks_stat", stats)
            self.assertIn("js_distance", stats)
            self.assertIn("tvd_distance", stats)
            self.assertIn("passed", stats)

if __name__ == "__main__":
    unittest.main()
