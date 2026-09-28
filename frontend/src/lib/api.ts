import type {
  DetectionResponse,
  ModelClass,
  ModelInfo,
} from "@/types/detection";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? API_BASE_URL.replace(/^http/, "ws");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = {
  detail?:
    | string
    | {
        message?: string;
        unsupported_classes?: string[];
      };
};

export function messageFromErrorBody(body: ErrorBody): string {
  if (typeof body.detail === "string") {
    return body.detail;
  }
  if (body.detail?.message) {
    const classes = body.detail.unsupported_classes?.join(", ");
    return classes ? `${body.detail.message} (${classes})` : body.detail.message;
  }
  return "Sunucu isteği tamamlayamadı.";
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `İstek başarısız oldu (${response.status}).`;
    try {
      message = messageFromErrorBody((await response.json()) as ErrorBody);
    } catch {
      // JSON olmayan bir hata cevabında güvenli genel mesajı koru.
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getModelInfo(): Promise<ModelInfo> {
  const response = await fetch(`${API_BASE_URL}/api/model`, {
    cache: "no-store",
  });
  return readJson<ModelInfo>(response);
}

export async function getClasses(): Promise<ModelClass[]> {
  const response = await fetch(`${API_BASE_URL}/api/classes`, {
    cache: "no-store",
  });
  return readJson<ModelClass[]>(response);
}

type AnalyzeImageInput = {
  file: File;
  confidence: number;
  classes: string[];
};

export async function analyzeImage({
  file,
  confidence,
  classes,
}: AnalyzeImageInput): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("confidence", confidence.toString());
  if (classes.length > 0) {
    formData.append("classes", classes.join(","));
  }

  const response = await fetch(`${API_BASE_URL}/api/detections/image`, {
    method: "POST",
    body: formData,
  });
  return readJson<DetectionResponse>(response);
}

export function buildStreamUrl(confidence: number, classes: string[]): string {
  const url = new URL("/api/detections/stream", WS_BASE_URL);
  url.searchParams.set("confidence", confidence.toString());
  if (classes.length > 0) {
    url.searchParams.set("classes", classes.join(","));
  }
  return url.toString();
}
