# → RocketLab — CAD + Flight Simulator

An OpenRocket-inspired model rocket simulator you run in the browser. **Build**
a rocket from components in a lightweight 2D CAD view, watch its **stability**
(CG/CP/caliber margin) update live, pick a **motor**, then **launch** and watch
an animated flight with real-time telemetry.

No install, no build step, no dependencies — it's plain HTML + JS + Canvas.

---

## How to run

**Option A — just open it:**
Open `index.html` in a browser. (Because it uses ES modules, some browsers need
it served over `http://` rather than `file://`. If the page is blank, use Option B.)

**Option B — tiny local server (recommended):**
```bash
# Python (any version 3)
python3 -m http.server 8000
# then open http://localhost:8000
