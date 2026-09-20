import base64
import io
import os
import shutil
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent
OUTPUT_DIR = BACKEND_DIR / "outputs"
WORK_DIR = BACKEND_DIR / "work"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WORK_DIR.mkdir(parents=True, exist_ok=True)

TRIPOSR_PATH = Path(os.getenv("TRIPOSR_PATH", str(BACKEND_DIR / "TripoSR"))).resolve()
TRIPOSR_RUN = TRIPOSR_PATH / "run.py"
MC_RESOLUTION = int(os.getenv("TRIPOSR_MC_RESOLUTION", "192"))
DEVICE = os.getenv("TRIPOSR_DEVICE", "cuda:0")

app = FastAPI(title="AI 3D Maker Local", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs = {}
jobs_lock = threading.Lock()
gpu_lock = threading.Lock()


class ImageBody(BaseModel):
    image: str


class ReconstructBody(BaseModel):
    front: str


def decode_data_image(data: str) -> Image.Image:
    if "," in data and data.lstrip().startswith("data:"):
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def encode_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/health")
def health():
    ready = TRIPOSR_RUN.exists()
    cuda = False
    try:
        import torch
        cuda = bool(torch.cuda.is_available())
    except Exception:
        pass
    return {
        "ok": True,
        "ready": ready,
        "engine": "TripoSR",
        "cuda": cuda,
        "device": DEVICE if cuda else "cpu",
        "tripoSRPath": str(TRIPOSR_PATH),
    }


@app.post("/extract")
def extract(body: ImageBody):
    try:
        raw = body.image
        if "," in raw and raw.lstrip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        input_bytes = base64.b64decode(raw)

        try:
            from rembg import remove
        except Exception as exc:
            raise HTTPException(
                status_code=501,
                detail="rembgが未インストールです。setup_localを実行してください。"
            ) from exc

        output_bytes = remove(input_bytes)
        img = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
        return {"image": encode_png(img)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/reconstruct")
def reconstruct(body: ReconstructBody, request: Request):
    if not body.front:
        raise HTTPException(status_code=400, detail="正面画像が必要です")
    if not TRIPOSR_RUN.exists():
        raise HTTPException(
            status_code=503,
            detail=f"TripoSRが見つかりません: {TRIPOSR_PATH}"
        )

    job_id = uuid.uuid4().hex
    public_base = str(request.base_url).rstrip("/")
    with jobs_lock:
        jobs[job_id] = {"status": "queued", "progress": 1, "resultUrl": None, "error": None}

    threading.Thread(
        target=run_job,
        args=(job_id, body.front, public_base),
        daemon=True,
    ).start()
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        return dict(job)


def update_job(job_id: str, **changes):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(changes)


def run_job(job_id: str, image_data: str, public_base: str):
    job_dir = WORK_DIR / job_id
    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        input_path = job_dir / "input.png"
        decode_data_image(image_data).save(input_path)
        update_job(job_id, status="running", progress=10)

        out_dir = job_dir / "output"
        out_dir.mkdir(parents=True, exist_ok=True)

        with gpu_lock:
            update_job(job_id, progress=20)
            cmd = [
                sys.executable,
                str(TRIPOSR_RUN),
                str(input_path),
                "--output-dir", str(out_dir),
                "--model-save-format", "glb",
                "--mc-resolution", str(MC_RESOLUTION),
                "--device", DEVICE,
            ]
            env = os.environ.copy()
            result = subprocess.run(
                cmd,
                cwd=str(TRIPOSR_PATH),
                env=env,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                tail = (result.stderr or result.stdout or "")[-3000:]
                raise RuntimeError(tail or f"TripoSR exited with {result.returncode}")

        update_job(job_id, progress=90)
        generated = out_dir / "0" / "mesh.glb"
        if not generated.exists():
            raise RuntimeError("mesh.glbが生成されませんでした")

        final_name = f"{job_id}.glb"
        final_path = OUTPUT_DIR / final_name
        shutil.copy2(generated, final_path)

        update_job(
            job_id,
            status="completed",
            progress=100,
            resultUrl=f"{public_base}/models/{final_name}",
        )
    except Exception as exc:
        update_job(job_id, status="failed", progress=0, error=str(exc))
    finally:
        if os.getenv("KEEP_TRIPOSR_WORK", "0") != "1":
            shutil.rmtree(job_dir, ignore_errors=True)


app.mount("/models", StaticFiles(directory=str(OUTPUT_DIR)), name="models")
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
