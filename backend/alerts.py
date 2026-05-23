import os
import requests
import logging

logger = logging.getLogger(__name__)

def send_failure_alert(job_id: int, predictions: list[dict]) -> None:
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        return
    
    high_risk = [p for p in predictions if p.get("risk_score", 0) > 0.7]
    if not high_risk:
        return
        
    high_risk.sort(key=lambda x: x.get("risk_score", 0), reverse=True)
    count = len(high_risk)
    
    top_3 = high_risk[:3]
    top_files_str = "\n".join(f"- {p['file_path']} (Risk: {p['risk_score']})" for p in top_3)
    
    message = {
        "text": f"🚨 *High Failure Risk Detected* 🚨\nFound {count} files with high failure risk (>0.7) for job #{job_id}!\n\n*Top risky files:*\n{top_files_str}"
    }
    
    try:
        response = requests.post(webhook_url, json=message, timeout=5)
        response.raise_for_status()
        logger.info(f"Successfully sent Slack alert for job {job_id}")
    except Exception as e:
        logger.error(f"Failed to send Slack alert for job {job_id}: {e}")
