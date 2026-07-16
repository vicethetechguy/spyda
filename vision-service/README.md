# Spyda Vision Service

This optional service is the Roboflow Supervision implementation behind
Spyda's replaceable Vision Adapter. It refines candidate object geometry; it
does not replace OCR or multimodal semantic analysis.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8090
```

Configure the Spyda application with:

```text
SPYDA_VISION_SERVICE_URL=http://127.0.0.1:8090
SPYDA_VISION_SERVICE_TOKEN=an-optional-shared-secret
```

Deploy this service separately from the Vercel frontend/API. If it is absent
or unavailable, Spyda automatically falls back to canonical Design Document
and OCR measurements without failing the user analysis.
