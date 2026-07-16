"""Optional Roboflow Supervision geometry service for Spyda V2.

This service refines candidate regions supplied by Spyda. Semantic detection
still belongs to OCR and multimodal models; Supervision is used here for
geometry operations and remains behind Spyda's Vision Adapter contract.
"""

import base64
import os
from typing import Any

import cv2
import numpy as np
import supervision as sv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


class Bounds(BaseModel):
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)


class Candidate(BaseModel):
    id: str
    sourceObjectId: str | None = None
    kind: str
    label: str
    bounds: Bounds
    rotation: float = 0
    confidence: float | None = None
    evidence: list[str] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    imageDataUrl: str
    canvas: dict[str, Any] = Field(default_factory=dict)
    candidates: list[Candidate] = Field(default_factory=list)


app = FastAPI(title="Spyda Vision Adapter", version="1.0.0")


def decode_image(data_url: str) -> np.ndarray:
    encoded = data_url.split(",", 1)[-1]
    image = cv2.imdecode(np.frombuffer(base64.b64decode(encoded), np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Image could not be decoded")
    return image


def as_xyxy(bounds: Bounds, width: int, height: int) -> np.ndarray:
    x1 = bounds.x / 100 * width
    y1 = bounds.y / 100 * height
    x2 = (bounds.x + bounds.width) / 100 * width
    y2 = (bounds.y + bounds.height) / 100 * height
    return np.array([x1, y1, x2, y2], dtype=np.float32)


def iou(first: np.ndarray, second: np.ndarray) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[2], second[2])
    bottom = min(first[3], second[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    union = max(1, (first[2] - first[0]) * (first[3] - first[1]) + (second[2] - second[0]) * (second[3] - second[1]) - intersection)
    return float(intersection / union)


def percent_bounds(box: np.ndarray, width: int, height: int) -> dict[str, float]:
    return {
        "x": round(float(box[0] / width * 100), 3),
        "y": round(float(box[1] / height * 100), 3),
        "width": round(float((box[2] - box[0]) / width * 100), 3),
        "height": round(float((box[3] - box[1]) / height * 100), 3),
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "adapter": "roboflow-supervision", "supervision": sv.__version__}


@app.post("/v1/analyze")
def analyze(payload: AnalyzeRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    expected_token = os.getenv("SPYDA_VISION_SERVICE_TOKEN", "")
    if expected_token and authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Invalid vision service token")

    image = decode_image(payload.imageDataUrl)
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour_boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w * h < width * height * 0.00008:
            continue
        contour_boxes.append([x, y, x + w, y + h])

    if contour_boxes:
        detections = sv.Detections(xyxy=np.asarray(contour_boxes, dtype=np.float32)).with_nms(threshold=0.7)
        boxes = detections.xyxy
    else:
        boxes = np.empty((0, 4), dtype=np.float32)

    refined = []
    for candidate in payload.candidates:
        original = as_xyxy(candidate.bounds, width, height)
        best_box = original
        best_iou = 0.0
        for box in boxes:
            score = iou(original, box)
            if score > best_iou:
                best_box = box
                best_iou = score
        use_refined = best_iou >= 0.18
        final_box = best_box if use_refined else original
        refined.append({
            **candidate.model_dump(exclude={"bounds"}),
            "bounds": percent_bounds(final_box, width, height),
            "confidence": max(candidate.confidence or 0, round(best_iou, 3)) if use_refined else candidate.confidence,
            "evidence": [*candidate.evidence, "supervision-contour-refinement" if use_refined else "supervision-candidate-preserved"],
        })

    return {
        "schemaVersion": "1.0",
        "adapter": "roboflow-supervision",
        "image": {"width": width, "height": height},
        "detections": refined,
        "warnings": [] if boxes.size else ["No useful contour regions were found; candidate geometry was preserved."],
    }
