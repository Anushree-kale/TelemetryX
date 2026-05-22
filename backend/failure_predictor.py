import logging
import os
from typing import Any
import database

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "failure_model.pth")

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch (torch) is not available. Falling back to the weighted heuristic model for failure prediction.")


if TORCH_AVAILABLE:
    class LSTMFailurePredictor(nn.Module):
        def __init__(self, input_dim: int = 3, hidden_dim: int = 8, output_dim: int = 1, num_layers: int = 1):
            super().__init__()
            self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
            self.fc = nn.Linear(hidden_dim, output_dim)
            self.sigmoid = nn.Sigmoid()

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x shape: (batch_size, seq_len, input_dim)
            lstm_out, _ = self.lstm(x)
            # Take the output of the last time step
            last_out = lstm_out[:, -1, :]
            out = self.fc(last_out)
            return self.sigmoid(out)


    # Initialize a single global model instance to avoid instantiation overhead during prediction loops
    torch.manual_seed(42)
    GLOBAL_MODEL = LSTMFailurePredictor(input_dim=3, hidden_dim=8, num_layers=1)
    if os.path.exists(MODEL_PATH):
        try:
            GLOBAL_MODEL.load_state_dict(torch.load(MODEL_PATH, weights_only=True))
            logger.info(f"Loaded failure model from {MODEL_PATH}")
        except Exception as e:
            logger.error(f"Failed to load failure model: {e}")
    GLOBAL_MODEL.eval()
else:
    GLOBAL_MODEL = None



def train_failure_model(historical_data: Any) -> None:
    """Trains PyTorch LSTM model to predict failure risk heuristic."""
    if not TORCH_AVAILABLE:
        logger.warning("Torch not available. Cannot train.")
        return
        
    X = []
    y = []
    
    for file_path, history in historical_data.items():
        if len(history) < 3:
            continue
            
        seq_data = []
        for h in history:
            seq_data.append([
                float(h.get("churn_90d") or 0.0),
                float(h.get("cyclomatic_complexity") or 0.0),
                float(h.get("days_since_last_commit") or 0.0)
            ])
            
        last_h = history[-1]
        churn = float(last_h.get("churn_90d") or 0.0)
        complexity = float(last_h.get("cyclomatic_complexity") or 0.0)
        days_since_last_commit = float(last_h.get("days_since_last_commit") or 0.0)
        
        churn_score = min(churn / 20.0, 1.0)
        complexity_score = min(complexity / 15.0, 1.0)
        recency_score = max(0.0, 1.0 - (days_since_last_commit / 90.0))
        heuristic_score = (churn_score * 0.45) + (complexity_score * 0.40) + (recency_score * 0.15)
        
        X.append(seq_data)
        y.append(heuristic_score)
        
    if not X:
        logger.warning("No valid sequences found for training failure model.")
        return
        
    optimizer = torch.optim.Adam(GLOBAL_MODEL.parameters(), lr=0.01)
    criterion = nn.MSELoss()
    
    GLOBAL_MODEL.train()
    epochs = 50
    for epoch in range(epochs):
        total_loss = 0.0
        for seq, target in zip(X, y):
            x_tensor = torch.tensor([seq], dtype=torch.float32)
            y_tensor = torch.tensor([[target]], dtype=torch.float32)
            
            optimizer.zero_grad()
            output = GLOBAL_MODEL(x_tensor)
            loss = criterion(output, y_tensor)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
        if (epoch + 1) % 10 == 0:
            logger.info(f"Epoch {epoch + 1}/{epochs}, Loss: {total_loss / len(X):.4f}")
            
    GLOBAL_MODEL.eval()
    torch.save(GLOBAL_MODEL.state_dict(), MODEL_PATH)
    logger.info(f"Trained and saved failure model to {MODEL_PATH}")
    print(f"Trained failure model on {len(X)} files → {MODEL_PATH}")


def predict_failures(job_id: int) -> None:
    """Computes failure predictions for a job and saves them to the database.
    
    Uses an LSTM model over historical job metric sequences if torch is installed
    and sufficient history exists. Otherwise, uses a high-fidelity weighted heuristic fallback.
    """
    modules = database.get_job_modules_raw(job_id)
    if not modules:
        logger.warning(f"No modules found for job {job_id}. Skipping failure predictions.")
        return

    file_paths = [m["file_path"] for m in modules]
    bulk_history = database.get_bulk_file_metric_history(file_paths, job_id)

    predictions = []
    use_torch = TORCH_AVAILABLE

    for m in modules:
        file_path = m["file_path"]
        module_id = m["id"]

        # Fetch history (limited to 10 completed jobs, chronological order)
        history = bulk_history.get(file_path, [])

        # 1. Base Metrics
        churn = float(m.get("churn_90d") or 0.0)
        complexity = float(m.get("cyclomatic_complexity") or 0.0)
        days_since_last_commit = float(m.get("days_since_last_commit") or 0.0)

        # 2. Weighted Heuristic Fallback Calculation
        # Normalize features
        churn_score = min(churn / 20.0, 1.0)
        complexity_score = min(complexity / 15.0, 1.0)
        recency_score = max(0.0, 1.0 - (days_since_last_commit / 90.0))

        # Weighting: 45% Churn, 40% Complexity, 15% Recency of commits
        heuristic_score = (churn_score * 0.45) + (complexity_score * 0.40) + (recency_score * 0.15)
        risk_score = heuristic_score

        # 3. Apply PyTorch LSTM if available and sequence length >= 3
        if use_torch:
            try:
                if len(history) >= 3:
                    seq_data = []
                    for h in history:
                        seq_data.append([
                            float(h.get("churn_90d") or 0.0),
                            float(h.get("cyclomatic_complexity") or 0.0),
                            float(h.get("days_since_last_commit") or 0.0)
                        ])

                    with torch.no_grad():
                        x_tensor = torch.tensor([seq_data], dtype=torch.float32)
                        output = GLOBAL_MODEL(x_tensor)
                        lstm_score = float(output.item())
                        # Blend 30% LSTM contribution with 70% heuristic baseline to keep score stable
                        risk_score = 0.7 * heuristic_score + 0.3 * lstm_score
            except Exception as e:
                logger.error(f"Error during LSTM prediction for {file_path}: {e}", exc_info=True)
                # Fall back to pure heuristic score

        # Risk Classification Banding
        if risk_score >= 0.7:
            risk_level = "high"
        elif risk_score >= 0.4:
            risk_level = "medium"
        else:
            risk_level = "low"

        predictions.append({
            "module_id": module_id,
            "file_path": file_path,
            "risk_score": round(risk_score, 4),
            "risk_level": risk_level
        })

    database.insert_failure_predictions(job_id, predictions)
    logger.info(f"Successfully generated failure predictions for job {job_id} ({len(predictions)} modules).")
