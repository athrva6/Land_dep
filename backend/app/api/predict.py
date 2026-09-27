
import os
import sys
from pathlib import Path
from typing import Dict, Any, List

import joblib
import pandas as pd
from fastapi import APIRouter
from app.schemas.prediction import PredictionRequest

router = APIRouter()

# Dynamically add AI_prediction/ai_insights to sys.path
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[3]

if not (PROJECT_ROOT / "AI_prediction" / "ai_insights").exists():
    PROJECT_ROOT = CURRENT_FILE.parents[2]

AI_INSIGHTS_PATH = PROJECT_ROOT / "AI_prediction" / "ai_insights"
if str(AI_INSIGHTS_PATH) not in sys.path:
    sys.path.insert(0, str(AI_INSIGHTS_PATH))

from insights import generate_insights
from app.utils.act_timeline import calculate_act_timeline

# Load ML models with absolute paths
ML_DIR = Path(__file__).resolve().parent.parent / "ml"
risk_model = joblib.load(ML_DIR / "delay_risk_model.pkl")
delay_model = joblib.load(ML_DIR / "delay_days_model.pkl")
preprocessor = joblib.load(ML_DIR / "land_preprocessor.pkl")


def get_risk_level(probability: float) -> str:
    if probability <= 25:
        return "Low"
    elif probability <= 50:
        return "Medium"
    elif probability <= 75:
        return "High"
    else:
        return "Critical"


@router.post("/predict")
def predict(data: PredictionRequest):
    # 1. Prepare features from request
    feature_dict = data.get_feature_dict()
    project_df = pd.DataFrame([feature_dict])

    # 2. Run ML models
    project_processed = preprocessor.transform(project_df)

    risk_probability = float(risk_model.predict_proba(project_processed)[0][1])
    risk_percentage = round(risk_probability * 100, 2)
    risk_level = get_risk_level(risk_percentage)

    raw_delay = float(delay_model.predict(project_processed)[0])
    predicted_delay = int(round(max(0.0, raw_delay)))

    # 3. Calculate RFCTLARR Dynamic Timeline Layer
    act_timeline = calculate_act_timeline(
        current_stage=data.project_status,
        predicted_ml_delay_days=predicted_delay,
        sia_start_date=data.sia_start_date,
        sia_completion_date=data.sia_completion_date,
        preliminary_notification_date=data.preliminary_notification_date,
        declaration_date=data.declaration_date,
        award_date=data.award_date,
        planned_duration_months=data.planned_duration_months or 24
    )

    # 4. Generate AI Insights & Recommendations
    ai_results = generate_insights(
        data=feature_dict,
        delay_probability=risk_percentage,
        predicted_delay_days=predicted_delay
    )

    top_factors = ai_results.get("top_contributing_factors", [])
    top_risk_factor_names = [f["factor"] for f in top_factors] if top_factors else ["Land Acquisition Progress"]

    # Calculate SHAP-like feature impacts for explainability visualization
    severity_weights = {
        "Critical": 0.35,
        "High": 0.25,
        "Medium": 0.15,
        "Low": 0.05
    }
    shap_values: Dict[str, float] = {}
    for f in top_factors:
        factor_name = f.get("factor", "")
        sev = f.get("severity", "Medium")
        shap_values[factor_name] = round(severity_weights.get(sev, 0.15) * (risk_percentage / 100.0), 3)

    if not shap_values:
        shap_values = {"Land Acquisition Progress": 0.25, "Compensation Pending": 0.20}

    # 5. Construct unified response compatible with frontend & RFCTLARR Engine
    ai_priority = ai_results.get("prediction_summary", {}).get("overall_action_priority", "MONITOR")
    ai_summary = ai_results.get("ai_summary", "")
    recommended_actions = ai_results.get("recommended_actions", [])

    return {
        # Standard backend naming
        "delay_probability": float(risk_percentage),
        "risk_level": risk_level,
        "predicted_delay_days": predicted_delay,
        "expected_delay_days": predicted_delay,
        "ml_delay_days": predicted_delay,

        # Frontend camelCase naming
        "delayProbability": round(risk_percentage / 100.0, 4),
        "riskLevel": risk_level,
        "expectedDelayDays": predicted_delay,
        "mlDelayDays": predicted_delay,
        "topRiskFactors": top_risk_factor_names,
        "top_risk_factors": top_risk_factor_names,
        "shapValues": shap_values,
        "shap_values": shap_values,

        # RFCTLARR Act Timeline Engine Fields (both snake_case and camelCase)
        "expected_legal_days": act_timeline["expected_legal_days"],
        "expectedLegalDays": act_timeline["expected_legal_days"],
        "legal_deadline_date": act_timeline["legal_deadline_date"],
        "legalDeadlineDate": act_timeline["legalDeadlineDate"],
        "days_remaining": act_timeline["days_remaining"],
        "daysRemaining": act_timeline["daysRemaining"],
        "projected_completion_days": act_timeline["projected_completion_days"],
        "projectedCompletionDays": act_timeline["projected_completion_days"],
        "delay_beyond_act_days": act_timeline["delay_beyond_act_days"],
        "delayBeyondActDays": act_timeline["delay_beyond_act_days"],
        "delay_beyond_act_months": act_timeline["delay_beyond_act_months"],
        "delayBeyondActMonths": act_timeline["delay_beyond_act_months"],
        "current_stage": act_timeline["current_stage"],
        "currentStage": act_timeline["current_stage"],
        "act_compliance": act_timeline["act_compliance"],
        "actCompliance": act_timeline["act_compliance"],
        "stage_timeline": act_timeline["stage_timeline"],
        "stageTimeline": act_timeline["stage_timeline"],
        "legal_timeline_comparison": act_timeline["legal_timeline_comparison"],
        "legalTimelineComparison": act_timeline["legal_timeline_comparison"],

        # AI Insights & Recommendations
        "ai_priority": ai_priority,
        "aiPriority": ai_priority,
        "ai_summary": ai_summary,
        "aiSummary": ai_summary,
        "top_contributing_factors": top_factors,
        "recommended_actions": recommended_actions,
        "prediction_summary": ai_results.get("prediction_summary", {})
    }

