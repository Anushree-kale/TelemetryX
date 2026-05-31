import requests
import json

try:
    # Let's get the list of jobs first to find a completed job id
    res = requests.get("http://localhost:8000/repos")
    print("Repos:", res.json())
    
    # Let's get the modules list or jobs history
    res = requests.get("http://localhost:8000/modules")
    modules = res.json().get("modules", [])
    if modules:
        job_id = modules[0]["job_id"]
        print(f"Testing synthetic-compliance for Job ID: {job_id}")
        res_comp = requests.get(f"http://localhost:8000/jobs/{job_id}/synthetic-compliance")
        print("Status code:", res_comp.status_code)
        if res_comp.status_code == 200:
            print("Successfully fetched compliance metrics!")
            print(json.dumps(res_comp.json(), indent=2)[:500])
        else:
            print("Error response:", res_comp.text)
    else:
        print("No completed jobs found in database.")
except Exception as e:
    print("Failed to query API server:", e)
