import logging
import os
from typing import Any

import database

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "failure_model.pth")

try:
    import torch
    import torch.nn as nn
    from torch.nn.utils.rnn import pack_padded_sequence
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning(
        "PyTorch (torch) is not available. Falling back to the weighted heuristic model for failure prediction."
    )


def _normalize_step(metrics: dict[str, Any]) -> list[float]:
    churn = float(metrics.get("churn_90d") or 0.0)
    complexity = float(metrics.get("cyclomatic_complexity") or 0.0)
    days = float(metrics.get("days_since_last_commit") or 0.0)
    test_coverage = float(metrics.get("test_coverage_ratio") or 0.0)
    fan_out = float(metrics.get("fan_out") or 0.0)
    function_count = float(metrics.get("function_count") or 0.0)
    max_fn_complexity = float(metrics.get("max_fn_complexity") or 0.0)
    unique_authors_30d = float(metrics.get("unique_authors_30d") or 0.0)

    return [
        min(churn / 20.0, 1.0),
        min(complexity / 15.0, 1.0),
        max(0.0, 1.0 - (days / 90.0)),
        1.0 - min(1.0, max(0.0, test_coverage)),
        min(fan_out / 20.0, 1.0),
        min(function_count / 50.0, 1.0),
        min(max_fn_complexity / 15.0, 1.0),
        min(unique_authors_30d / 5.0, 1.0),
    ]


def heuristic_risk_score(metrics: dict[str, Any]) -> float:
    scores = _normalize_step(metrics)
    churn_score = scores[0]
    complexity_score = scores[1]
    recency_score = scores[2]
    coverage_score = scores[3]
    fan_out_score = scores[4]
    func_count_score = scores[5]
    max_fn_comp_score = scores[6]
    authors_30d_score = scores[7]

    return (
        (churn_score * 0.25)
        + (complexity_score * 0.20)
        + (recency_score * 0.10)
        + (coverage_score * 0.15)
        + (fan_out_score * 0.05)
        + (func_count_score * 0.05)
        + (max_fn_comp_score * 0.10)
        + (authors_30d_score * 0.10)
    )


def _history_to_tensor(history: list[dict[str, Any]]) -> "torch.Tensor":
    seq = [_normalize_step(h) for h in history]
    return torch.tensor([seq], dtype=torch.float32)


if TORCH_AVAILABLE:

    class LSTMFailurePredictor(nn.Module):
        def __init__(
            self,
            input_dim: int = 8,
            hidden_dim: int = 16,
            output_dim: int = 1,
            num_layers: int = 1,
        ):
            super().__init__()
            self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
            self.fc = nn.Linear(hidden_dim, output_dim)
            self.sigmoid = nn.Sigmoid()

        def forward(
            self, x: torch.Tensor, lengths: "torch.Tensor | None" = None
        ) -> torch.Tensor:
            if lengths is not None:
                packed = pack_padded_sequence(
                    x, lengths.cpu(), batch_first=True, enforce_sorted=False
                )
                _, (h_n, _) = self.lstm(packed)
                last_out = h_n[-1]
            else:
                lstm_out, _ = self.lstm(x)
                last_out = lstm_out[:, -1, :]
            return self.sigmoid(self.fc(last_out))

    torch.manual_seed(42)
    GLOBAL_MODEL = LSTMFailurePredictor(input_dim=8, hidden_dim=16, num_layers=1)
    MODEL_TRAINED = False
else:
    GLOBAL_MODEL = None
    MODEL_TRAINED = False


def load_failure_model() -> bool:
    """Load trained weights from disk. Returns True if a trained checkpoint was loaded."""
    global MODEL_TRAINED
    if not TORCH_AVAILABLE:
        return False
    if not os.path.exists(MODEL_PATH):
        MODEL_TRAINED = False
        return False
    try:
        GLOBAL_MODEL.load_state_dict(torch.load(MODEL_PATH, map_location="cpu", weights_only=True))
        GLOBAL_MODEL.eval()
        MODEL_TRAINED = True
        logger.info("Loaded failure model from %s", MODEL_PATH)
        return True
    except Exception as e:
        logger.error("Failed to load failure model: %s", e)
        MODEL_TRAINED = False
        return False


def _pad_batch(sequences: list[list[list[float]]]) -> tuple["torch.Tensor", "torch.Tensor"]:
    max_len = max(len(s) for s in sequences)
    batch_size = len(sequences)
    padded = torch.zeros(batch_size, max_len, 8, dtype=torch.float32)
    lengths = torch.zeros(batch_size, dtype=torch.long)
    for i, seq in enumerate(sequences):
        lengths[i] = len(seq)
        padded[i, : len(seq), :] = torch.tensor(seq, dtype=torch.float32)
    return padded, lengths


def train_failure_model(historical_data: dict[str, list[dict[str, Any]]]) -> int:
    """Train the LSTM on normalized metric sequences; labels match the heuristic risk score."""
    global MODEL_TRAINED
    if not TORCH_AVAILABLE:
        logger.warning("Torch not available. Cannot train.")
        return 0

    sequences: list[list[list[float]]] = []
    targets: list[float] = []

    for history in historical_data.values():
        if len(history) < 3:
            continue
        sequences.append([_normalize_step(h) for h in history])
        targets.append(heuristic_risk_score(history[-1]))

    if not sequences:
        logger.warning("No valid sequences found for training failure model.")
        return 0

    y_all = torch.tensor(targets, dtype=torch.float32).unsqueeze(1)
    optimizer = torch.optim.Adam(GLOBAL_MODEL.parameters(), lr=0.005)
    criterion = nn.MSELoss()

    GLOBAL_MODEL.train()
    epochs = 80
    batch_size = 32

    for epoch in range(epochs):
        perm = torch.randperm(len(sequences))
        epoch_loss = 0.0
        batches = 0
        for start in range(0, len(sequences), batch_size):
            idx = perm[start : start + batch_size].tolist()
            batch_seqs = [sequences[i] for i in idx]
            batch_y = y_all[idx]

            x_batch, lengths = _pad_batch(batch_seqs)
            optimizer.zero_grad()
            output = GLOBAL_MODEL(x_batch, lengths)
            loss = criterion(output, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            batches += 1

        if (epoch + 1) % 20 == 0:
            logger.info("Epoch %s/%s, Loss: %.4f", epoch + 1, epochs, epoch_loss / max(batches, 1))

    GLOBAL_MODEL.eval()
    torch.save(GLOBAL_MODEL.state_dict(), MODEL_PATH)
    MODEL_TRAINED = True
    logger.info("Trained and saved failure model to %s", MODEL_PATH)
    print(f"Trained failure model on {len(sequences)} sequences -> {MODEL_PATH}")
    return len(sequences)


def train_failure_model_from_db(min_steps: int = 3) -> int:
    historical = database.get_historical_metric_sequences(min_steps=min_steps)
    return train_failure_model(historical)


def predict_failures(job_id: int) -> None:
    """Compute failure predictions for a job and persist them."""
    if TORCH_AVAILABLE and not MODEL_TRAINED:
        load_failure_model()

    modules = database.get_job_modules_raw(job_id)
    if not modules:
        logger.warning("No modules found for job %s. Skipping failure predictions.", job_id)
        return

    file_paths = [m["file_path"] for m in modules]
    bulk_history = database.get_bulk_file_metric_history(file_paths, job_id)

    predictions = []
    use_lstm = TORCH_AVAILABLE and MODEL_TRAINED
    lstm_weight = 0.55 if use_lstm else 0.0

    for m in modules:
        file_path = m["file_path"]
        module_id = m["id"]
        history = bulk_history.get(file_path, [])

        heuristic_score = heuristic_risk_score(m)
        risk_score = heuristic_score

        if use_lstm and len(history) >= 3:
            try:
                with torch.no_grad():
                    output = GLOBAL_MODEL(_history_to_tensor(history))
                    lstm_score = float(output.item())
                    risk_score = (1.0 - lstm_weight) * heuristic_score + lstm_weight * lstm_score
            except Exception as e:
                logger.error(
                    "Error during LSTM prediction for %s: %s", file_path, e, exc_info=True
                )

        if risk_score >= 0.7:
            risk_level = "high"
        elif risk_score >= 0.4:
            risk_level = "medium"
        else:
            risk_level = "low"

        predictions.append(
            {
                "module_id": module_id,
                "file_path": file_path,
                "risk_score": round(risk_score, 4),
                "risk_level": risk_level,
            }
        )

    database.insert_failure_predictions(job_id, predictions)
    logger.info(
        "Generated failure predictions for job %s (%s modules, lstm=%s).",
        job_id,
        len(predictions),
        use_lstm,
    )


load_failure_model()
