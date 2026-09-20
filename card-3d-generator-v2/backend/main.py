import base64
import io
import os
import sys
import threading
import traceback
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image

APP_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = APP_DIR / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TRELLIS_REPO_PATH = os.getenv("TRELLIS_REPO_PATH", "")
TRELLIS_MODEL = os.getenv("TRELLIS_MODEL", "microsoft/TRELLIS-image-large")
if TRELLIS_REPO_PATH:
    sys.path.insert(0, TRELLIS_REPO_PATH)

app = FastAPI(title="AI 3D Maker v2 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/models", StaticFiles(directory=str(OUTPUT_DIR)), name="models")

jobs = {}
jobs_lock = threading.Lock()
gpu_lock = threading.Lock()
_pipeline = None


class ImageBody(BaseModel):
    image: str


class MultiViewBody(BaseModel):
    front: str


class ReconstructBody(BaseModel):
    front: str
    left: Optional[str] = None
    right: Optional[str] = None
    back: Optional[str] = None
    seed: int = 1
    simplify: float = 0.95
    texture_size: int = 1024


def decode_data_image(data: str) -> Image.Image:
    if not data:
        raise ValueError("image is empty")
    if "," in data and data.lstrip().startswith("data:"):
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def encode_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return "data:image/png;base64," + b64


def get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    try:
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
    except Exception as exc:
        raise RuntimeError(
            "TRELLIS is not installed. Set TRELLIS_REPO_PATH and install the official TRELLIS environment."
        ) from exc

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU was not detected.")

    pipeline = TrellisImageTo3DPipeline.from_pretrained(TRELLIS_MODEL)
    pipeline.cuda()
    _pipeline = pipeline
    return _pipeline


@app.get("/health")
def health():
    gpu = False
    try:
        import torch
        gpu = bool(torch.cuda.is_available())
    except Exception:
        pass
    return {
        "ok": True,
        "backend": "trellis",
        "model": TRELLIS_MODEL,
        "cuda": gpu,
        "trellisRepoPath": TRELLIS_REPO_PATH or None,
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
                detail="rembg is not installed on the backend."
            ) from exc

        output_bytes = remove(input_bytes)
        img = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
        return {"image": encode_png(img)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/multiview")
def multiview(_: MultiViewBody):
    raise HTTPException(
        status_code=501,
        detail="Multi-view image generation is not connected yet. "
               "TRELLIS can generate 3D directly from one image, or accept manually supplied multiple views."
    )


@app.post("/reconstruct")
def reconstruct(body: ReconstructBody, request: Request):
    if not body.front:
        raise HTTPException(status_code=400, detail="front image is required")

    job_id = uuid.uuid4().hex
    public_base = str(request.base_url).rstrip("/")

    with jobs_lock:
        jobs[job_id] = {
            "status": "queued",
            "progress": 1,
            "resultUrl": None,
            "error": None,
        }

    thread = threading.Thread(
        target=run_reconstruct_job,
        args=(job_id, body, public_base),
        daemon=True,
    )
    thread.start()
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


def run_reconstruct_job(job_id: str, body: ReconstructBody, public_base: str):
    try:
        update_job(job_id, status="running", progress=5)

        images = []
        for value in [body.front, body.right, body.back, body.left]:
            if value:
                images.append(decode_data_image(value))

        update_job(job_id, progress=15)

        with gpu_lock:
            pipeline = get_pipeline()
            update_job(job_id, progress=25)

            kwargs = {
                "seed": int(body.seed),
                "sparse_structure_sampler_params": {
                    "steps": 12,
                    "cfg_strength": 7.5,
                },
                "slat_sampler_params": {
                    "steps": 12,
                    "cfg_strength": 3.0,
                },
            }

            if len(images) >= 2:
                outputs = pipeline.run_multi_image(images, **kwargs)
            else:
                outputs = pipeline.run(images[0], **kwargs)

            update_job(job_id, progress=78)

            from trellis.utils import postprocessing_utils
            glb = postprocessing_utils.to_glb(
                outputs["gaussian"][0],
                outputs["mesh"][0],
                simplify=float(body.simplify),
                texture_size=int(body.texture_size),
                verbose=False,
            )

            filename = f"{job_id}.glb"
            out_path = OUTPUT_DIR / filename
            glb.export(str(out_path))

            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass

        result_url = f"{public_base}/models/{filename}"
        update_job(
            job_id,
            status="completed",
            progress=100,
            resultUrl=result_url,
        )

    except Exception as exc:
        traceback.print_exc()
        update_job(
            job_id,
            status="failed",
            progress=0,
            error=str(exc),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
