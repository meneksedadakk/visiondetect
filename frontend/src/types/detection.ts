export type Detection = {
  class_id: number;
  class_name: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DetectionResponse = {
  frame_width: number;
  frame_height: number;
  inference_ms: number;
  detections: Detection[];
};

export type ModelInfo = {
  model: string;
  device: string;
  loaded: boolean;
  status: "ready" | "not_loaded" | "dependency_missing" | "error";
  last_error: string;
};

export type ModelClass = {
  class_id: number;
  class_name: string;
};
