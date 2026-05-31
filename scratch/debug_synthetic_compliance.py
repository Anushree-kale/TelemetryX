import sys
import pathlib
import traceback

backend_dir = str(pathlib.Path(__file__).resolve().parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import database
from privacy import gan_engine

try:
    job_id = 28
    job = database.get_job(job_id)
    print("Job loaded:", job)
    
    real_modules = database.get_job_modules(job_id)
    print("Real modules loaded. Count:", len(real_modules))
    
    print("Fitting CTGAN GMM Synthesizer...")
    ctgan = gan_engine.CTGANSynthesizer(n_components=3)
    ctgan.fit(real_modules)
    synthetic_tabular = ctgan.sample(len(real_modules))
    print("CTGANSynthesizer sampled. Count:", len(synthetic_tabular))
    
    print("Fitting TimeGAN Synthesizer...")
    history = database.get_repo_jobs_history(job["repo_url"])
    print("History loaded. Count:", len(history))
    timegan = gan_engine.TimeGANSynthesizer(epochs=10)
    timegan.fit(history)
    synthetic_time_series = timegan.sample(len(history))
    print("TimeGANSynthesizer sampled. Count:", len(synthetic_time_series))
    
    print("Performing Fidelity validation...")
    validation_report = gan_engine.validate_fidelity(
        real_data=real_modules,
        synthetic_data=synthetic_tabular
    )
    print("Validation report completed successfully!")
    
    # Try serializing the final response dict
    response_dict = {
        "job_id": job_id,
        "repo_url": job["repo_url"],
        "privacy_mode": job.get("privacy_mode", False),
        "validation_report": validation_report,
        "real_history": history,
        "synthetic_history": synthetic_time_series,
        "metrics_sampled": len(synthetic_tabular)
    }
    
    print("Attempting to JSON serialize the response dictionary...")
    serialized = json.dumps(response_dict)
    print("JSON serialization succeeded! Serialized length:", len(serialized))
except Exception as e:
    print("CRASHED with exception:", e)
    traceback.print_exc()
