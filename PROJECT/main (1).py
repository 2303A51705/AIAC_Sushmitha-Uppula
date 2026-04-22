"""
Smart Traffic Multi-Agent AI System — FastAPI Backend
main.py

Deterministic confidence-based arbitration.

Formulas (MUST match frontend app.js exactly):
  confidence = 0.5 * urgency + 0.3 * (speed / 100) + 0.2 * type_weight
  priority   = confidence * urgency
  decision   = argmax(priority)

Run: uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List
from enum import Enum

# ── Config ────────────────────────────────────────────────────────────────────

PORT = int(os.getenv("PORT", 8000))

TYPE_WEIGHTS: dict[str, float] = {
    "Ambulance": 1.0,
    "Bus":       0.7,
    "Car":       0.5,
    "Bike":      0.4,
}

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Smart Traffic Multi-Agent AI System",
    description="Confidence-Based Arbitration — Deterministic Engine",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────

class VehicleType(str, Enum):
    Ambulance = "Ambulance"
    Bus       = "Bus"
    Car       = "Car"
    Bike      = "Bike"


class AgentIn(BaseModel):
    id:      str | int
    type:    VehicleType
    speed:   float = Field(..., ge=1, le=300, description="km/h")
    urgency: int   = Field(..., ge=1, le=10,  description="1–10")

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v):
        return str(v)


class AgentScored(BaseModel):
    id:         str
    type:       str
    speed:      float
    urgency:    int
    type_weight: float
    confidence: float
    priority:   float
    rank:       int


class DecisionResponse(BaseModel):
    selected:  AgentScored
    ranking:   List[AgentScored]
    formula:   dict
    agents_in: int


# ── Core Logic ────────────────────────────────────────────────────────────────

def compute_confidence(agent: AgentIn) -> float:
    """
    DETERMINISTIC. Same as frontend formula.
    confidence = 0.5×urgency + 0.3×(speed/100) + 0.2×type_weight
    """
    w = TYPE_WEIGHTS[agent.type]
    return 0.5 * agent.urgency + 0.3 * (agent.speed / 100.0) + 0.2 * w


def arbitrate(agents: List[AgentIn]) -> DecisionResponse:
    """Full arbitration pipeline — deterministic, reproducible."""
    if not agents:
        raise ValueError("No agents provided")

    scored = []
    for a in agents:
        conf = round(compute_confidence(a), 6)
        pri  = round(conf * a.urgency, 6)
        scored.append({
            "id":          a.id,
            "type":        a.type,
            "speed":       a.speed,
            "urgency":     a.urgency,
            "type_weight": TYPE_WEIGHTS[a.type],
            "confidence":  conf,
            "priority":    pri,
        })

    # Sort: primary = priority desc, tie-break = confidence desc, urgency desc
    scored.sort(key=lambda x: (-x["priority"], -x["confidence"], -x["urgency"]))

    for i, s in enumerate(scored):
        s["rank"] = i + 1

    winner = scored[0]

    return DecisionResponse(
        selected=AgentScored(**winner),
        ranking=[AgentScored(**s) for s in scored],
        formula={
            "confidence": "0.5×urgency + 0.3×(speed/100) + 0.2×type_weight",
            "priority":   "confidence × urgency",
            "decision":   "argmax(priority)",
        },
        agents_in=len(agents),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Health check — also used by frontend to detect API availability."""
    return {"status": "ok", "service": "Smart Traffic AI Backend"}


@app.post("/decision", response_model=DecisionResponse)
def decision(agents: List[AgentIn]):
    """
    POST /decision
    Input:  [ { "id": 1, "type": "Car", "speed": 60, "urgency": 5 }, ... ]
    Output: { selected: {...}, ranking: [...], formula: {...}, agents_in: N }
    """
    if len(agents) == 0:
        raise HTTPException(status_code=400, detail="Agent list cannot be empty")
    if len(agents) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 agents per request")
    try:
        return arbitrate(agents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/weights")
def get_weights():
    """Return type weights used in confidence formula."""
    return {"weights": TYPE_WEIGHTS, "formula": "confidence = 0.5×u + 0.3×(s/100) + 0.2×w"}


@app.post("/score")
def score_single(agent: AgentIn):
    """Score a single agent (utility endpoint)."""
    conf = round(compute_confidence(agent), 6)
    pri  = round(conf * agent.urgency, 6)
    return {
        "id": agent.id, "type": agent.type,
        "speed": agent.speed, "urgency": agent.urgency,
        "type_weight": TYPE_WEIGHTS[agent.type],
        "confidence": conf, "priority": pri,
        "breakdown": {
            "urgency_term":    round(0.5 * agent.urgency, 6),
            "speed_term":      round(0.3 * (agent.speed / 100), 6),
            "type_term":       round(0.2 * TYPE_WEIGHTS[agent.type], 6),
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
