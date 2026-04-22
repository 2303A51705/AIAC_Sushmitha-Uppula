# 🚦 Smart Traffic Multi-Agent AI System
## Confidence-Based Arbitration — Fully Working System

---

## System Explanation

A production-ready web system that simulates traffic agents (vehicles) competing for traffic signal priority. An AI arbitration engine scores every agent using deterministic formulas and grants the green light to the highest-priority vehicle.

**Key Properties:**
- **Deterministic**: Same input → same output. Always.
- **Reproducible**: No random values anywhere.
- **Fault-tolerant**: Works fully even if backend is offline (frontend fallback).
- **GitHub Pages ready**: Frontend is pure HTML/CSS/JS.

---

## 🧮 Formula Explanation

All formulas are identical in frontend (`app.js`) and backend (`main.py`).

```
confidence = 0.5 × urgency + 0.3 × (speed ÷ 100) + 0.2 × type_weight
priority   = confidence × urgency
decision   = agent with max(priority)
```

### Type Weights

| Vehicle Type | Weight |
|---|---|
| 🚑 Ambulance | 1.0 |
| 🚌 Bus       | 0.7 |
| 🚗 Car       | 0.5 |
| 🏍 Bike      | 0.4 |

### Example

```
Agent: Ambulance, speed=80, urgency=9
  confidence = 0.5×9 + 0.3×(80/100) + 0.2×1.0
             = 4.5 + 0.24 + 0.2
             = 4.94
  priority   = 4.94 × 9 = 44.46
```

---

## 📁 File Structure

```
ROOT LEVEL (GitHub Pages / Render):
  index.html    → Full dashboard UI
  app.js        → Deterministic logic + fetch + fallback
  style.css     → Production stylesheet
  main.py       → FastAPI backend (Render/Railway)
  requirements.txt → Python dependencies
  README.md
```

---

## ⚙️ Local Setup

### Frontend (no server needed)
Open `index.html` directly in a browser — it runs standalone.

### Backend
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

---

## 🌐 Deployment

### Frontend → GitHub Pages

1. Push `index.html`, `app.js`, `style.css` to a GitHub repo
2. Go to **Settings → Pages → Branch: main / root**
3. Site will be live at `https://USERNAME.github.io/REPO/`

### Backend → Render

1. Push `main.py` + `requirements.txt` to GitHub
2. Create a **Web Service** on [Render](https://render.com)
3. Set:
   - **Build**: `pip install -r requirements.txt`
   - **Start**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Copy the deployed URL (e.g. `https://my-traffic-api.onrender.com`)

### Backend → Railway

1. Same repo, connect to Railway
2. Railway auto-detects Python
3. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

---

## 🔗 API Configuration

After deploying the backend, update `app.js` line 15:

```javascript
const API_URL = "https://YOUR_DEPLOYED_BACKEND_URL";
// e.g. "https://smart-traffic-api.onrender.com"
```

Then push updated `app.js` to GitHub Pages.

---

## 🔌 API Reference

### `GET /health`
Health check. Used by frontend to detect API availability.

```json
{ "status": "ok", "service": "Smart Traffic AI Backend" }
```

### `POST /decision`

**Request:**
```json
[
  { "id": 1, "type": "Car",       "speed": 60, "urgency": 5 },
  { "id": 2, "type": "Ambulance", "speed": 80, "urgency": 9 }
]
```

**Response:**
```json
{
  "selected": {
    "id": "2", "type": "Ambulance",
    "speed": 80, "urgency": 9,
    "type_weight": 1.0,
    "confidence": 4.94,
    "priority": 44.46,
    "rank": 1
  },
  "ranking": [ {...}, {...} ],
  "formula": {
    "confidence": "0.5×urgency + 0.3×(speed/100) + 0.2×type_weight",
    "priority": "confidence × urgency",
    "decision": "argmax(priority)"
  },
  "agents_in": 2
}
```

### `GET /weights`
Returns type weights.

### `POST /score`
Score a single agent with formula breakdown.

---

## 🧪 Testing

### Same input → same output
```bash
curl -X POST http://localhost:8000/decision \
  -H "Content-Type: application/json" \
  -d '[{"id":1,"type":"Ambulance","speed":80,"urgency":9},{"id":2,"type":"Car","speed":60,"urgency":5}]'
# Run 10x — result is identical every time
```

### Frontend self-test
Open browser console after loading `index.html`:
```
[SELF-TEST PASSED] confidence=4.94 ✓
```

### Backend offline test
Disconnect from internet → click **Run Simulation** → frontend fallback activates, system keeps working.

---

## 🛡 Error Handling

| Scenario | Behavior |
|---|---|
| Backend offline | Frontend fallback computes same formulas |
| API returns error | Caught, fallback triggered, user notified |
| Empty agent list | Validation error shown |
| Invalid speed/urgency | Input validation prevents submission |
| Network timeout | 5-second timeout, then fallback |

---

## 📜 License
MIT
