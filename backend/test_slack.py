from dotenv import load_dotenv
import os
import sys

# Load environment variables from .env
load_dotenv()

# Ensure SLACK_WEBHOOK_URL is loaded
webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
if not webhook_url:
    print("Error: SLACK_WEBHOOK_URL is not set in the environment or .env file.")
    sys.exit(1)

import alerts

# Create some dummy predictions with risk > 0.7
dummy_predictions = [
    {"file_path": "src/core/auth.py", "risk_score": 0.95},
    {"file_path": "src/utils/parser.py", "risk_score": 0.88},
    {"file_path": "src/api/routes.py", "risk_score": 0.76},
    {"file_path": "src/models/user.py", "risk_score": 0.72},
    {"file_path": "src/config/settings.py", "risk_score": 0.40}, # Should be ignored
]

print(f"Loaded webhook URL: {webhook_url[:30]}...")
print("Testing Slack alert...")
alerts.send_failure_alert(job_id=999, predictions=dummy_predictions)
print("Done. Check your Slack channel!")
