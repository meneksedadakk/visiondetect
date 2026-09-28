"use client";

import {
  Activity,
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  CircleGauge,
  ImagePlus,
  LoaderCircle,
  Radio,
  ScanLine,
  Search,
  Square,
  Video,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LiveDetectionOverlay } from "@/components/live-detection-overlay";
import { buildStreamUrl } from "@/lib/api";
import { SingleFrameGate } from "@/lib/stream-control";
import type { DetectionResponse, ModelClass } from "@/types/detection";

type LiveCameraWorkspaceProps = {
  classes: ModelClass[];
  selectedClasses: string[];
  confidence: number;
  onSelectPhoto: () => void;
  onToggleClass: (className: string) => void;
  onSelectAllClasses: () => void;
  onConfidenceChange: (value: number) => void;
};

type StreamError = {
  error: { code: string; message: string };
};

const TARGET_FPS_OPTIONS = [1, 3, 5];

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Kamera izni reddedildi. Tarayıcı adres çubuğundaki kamera iznini açıp tekrar dene.";
    }
    if (error.name === "NotFoundError") {
      return "Bu cihazda kullanılabilir bir kamera bulunamadı.";
    }
    if (error.name === "NotReadableError") {
      return "Kamera başka bir uygulama tarafından kullanılıyor olabilir.";
    }
  }
  return "Kamera başlatılamadı. Tarayıcı ve cihaz izinlerini kontrol et.";
}

export function LiveCameraWorkspace({
  classes,
  selectedClasses,
  confidence,
  onSelectPhoto,
  onToggleClass,
  onSelectAllClasses,
  onConfidenceChange,
}: LiveCameraWorkspaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameGateRef = useRef(new SingleFrameGate());
  const responseTimeoutRef = useRef<number | null>(null);
  const shouldMonitorRef = useRef(false);
  const mountedRef = useRef(true);
  const fpsWindowRef = useRef({ startedAt: 0, frames: 0 });

  const [cameraReady, setCameraReady] = useState(false);
  const [requestingCamera, setRequestingCamera] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [targetFps, setTargetFps] = useState(3);
  const [actualFps, setActualFps] = useState(0);
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classQuery, setClassQuery] = useState("");

  const visibleClasses = useMemo(() => {
    const query = classQuery.trim().toLowerCase();
    if (!query) return classes;
    return classes.filter((item) =>
      item.class_name.toLowerCase().includes(query),
    );
  }, [classQuery, classes]);

  const counts = useMemo(() => {
    const totals = new Map<string, number>();
    result?.detections.forEach((detection) => {
      totals.set(
        detection.class_name,
        (totals.get(detection.class_name) ?? 0) + 1,
      );
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [result]);

  function clearResponseTimeout() {
    if (responseTimeoutRef.current !== null) {
      window.clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  }

  function stopMonitoring() {
    shouldMonitorRef.current = false;
    clearResponseTimeout();
    frameGateRef.current.release();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "Kullanici izlemeyi durdurdu.");
    }
    setConnecting(false);
    setMonitoring(false);
    setActualFps(0);
  }

  function stopCamera() {
    stopMonitoring();
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setResult(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shouldMonitorRef.current = false;
      if (responseTimeoutRef.current !== null) {
        window.clearTimeout(responseTimeoutRef.current);
      }
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState < WebSocket.CLOSING) socket.close(1000);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Bu tarayıcı kamera erişimini desteklemiyor.");
      return;
    }

    setRequestingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getVideoTracks()[0]?.addEventListener(
        "ended",
        () => {
          if (streamRef.current !== stream) return;
          stopMonitoring();
          streamRef.current = null;
          setCameraReady(false);
          setResult(null);
          setError("Kamera akışı cihaz veya tarayıcı tarafından sonlandırıldı.");
        },
        { once: true },
      );
      setCameraReady(true);
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (mountedRef.current) setError(cameraErrorMessage(cameraError));
    } finally {
      if (mountedRef.current) setRequestingCamera(false);
    }
  }

  function startMonitoring() {
    if (!cameraReady || connecting || monitoring) return;
    setError(null);
    setConnecting(true);
    setResult(null);
    setActualFps(0);
    shouldMonitorRef.current = true;
    fpsWindowRef.current = { startedAt: performance.now(), frames: 0 };

    let socket: WebSocket;
    try {
      socket = new WebSocket(buildStreamUrl(confidence, selectedClasses));
    } catch {
      shouldMonitorRef.current = false;
      setConnecting(false);
      setError("WebSocket adresi oluşturulamadı. Frontend ortam ayarını kontrol et.");
      return;
    }
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      if (!shouldMonitorRef.current) {
        socket.close(1000);
        return;
      }
      setConnecting(false);
      setMonitoring(true);
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) return;
      clearResponseTimeout();
      frameGateRef.current.release();
      try {
        const payload = JSON.parse(event.data as string) as
          | DetectionResponse
          | StreamError;
        if ("error" in payload) {
          setError(payload.error.message);
          return;
        }

        setResult(payload);
        setError(null);
        const now = performance.now();
        fpsWindowRef.current.frames += 1;
        const elapsed = now - fpsWindowRef.current.startedAt;
        if (elapsed >= 1000) {
          setActualFps(
            Number(
              ((fpsWindowRef.current.frames * 1000) / elapsed).toFixed(1),
            ),
          );
          fpsWindowRef.current = { startedAt: now, frames: 0 };
        }
      } catch {
        setError("Backend geçersiz bir WebSocket cevabı gönderdi.");
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setError("WebSocket bağlantısı kurulamadı. Backend'i kontrol et.");
    };

    socket.onclose = (event) => {
      if (socketRef.current !== socket) return;
      clearResponseTimeout();
      frameGateRef.current.release();
      socketRef.current = null;
      setConnecting(false);
      setMonitoring(false);
      if (shouldMonitorRef.current && event.code !== 1000) {
        setError(`Canlı bağlantı kesildi (kod ${event.code}). Tekrar başlatabilirsin.`);
      }
      shouldMonitorRef.current = false;
    };
  }

  useEffect(() => {
    if (!monitoring) return;

    const intervalId = window.setInterval(() => {
      const socket = socketRef.current;
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !canvas ||
        video.videoWidth === 0
      ) {
        return;
      }
      if (!frameGateRef.current.tryAcquire()) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        frameGateRef.current.release();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        async (blob) => {
          if (socketRef.current !== socket) return;
          if (!blob || socket.readyState !== WebSocket.OPEN) {
            frameGateRef.current.release();
            return;
          }
          const frame = await blob.arrayBuffer();
          if (
            socketRef.current !== socket ||
            socket.readyState !== WebSocket.OPEN
          ) {
            if (socketRef.current === socket) frameGateRef.current.release();
            return;
          }
          if (!shouldMonitorRef.current) {
            frameGateRef.current.release();
            return;
          }
          socket.send(frame);
          responseTimeoutRef.current = window.setTimeout(() => {
            if (
              socketRef.current !== socket ||
              !frameGateRef.current.isPending
            ) {
              return;
            }
            setError("Frame cevabı zaman aşımına uğradı. Bağlantı kapatıldı.");
            socket.close(1011, "Frame timeout");
          }, 15_000);
        },
        "image/jpeg",
        0.75,
      );
    }, 1000 / targetFps);

    return () => window.clearInterval(intervalId);
  }, [monitoring, targetFps]);

  return (
    <section className="mt-7 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-3 shadow-2xl shadow-black/20">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
            <button onClick={onSelectPhoto} className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/35 transition hover:text-white/65">
              <ImagePlus size={16} /> Fotoğraf yükle
            </button>
            <button className="flex items-center justify-center gap-2 rounded-lg bg-white/8 px-3 py-2.5 text-sm text-white shadow-sm">
              <Camera size={16} /> Canlı kamera
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-white/8 bg-black/15 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${cameraReady ? "bg-emerald-300/10 text-emerald-200" : "bg-white/5 text-white/35"}`}>
                  {cameraReady ? <Video size={19} /> : <CameraOff size={19} />}
                </span>
                <div><p className="text-xs font-medium">{cameraReady ? "Kamera hazır" : "Kamera kapalı"}</p><p className="mt-1 text-[10px] text-white/30">{cameraReady ? "Görüntü yerel olarak açık" : "İzin vermek için kamerayı aç"}</p></div>
              </div>
              {cameraReady && <button onClick={stopCamera} className="rounded-lg p-2 text-white/35 transition hover:bg-white/5 hover:text-white" aria-label="Kamerayı kapat"><XIcon /></button>}
            </div>
            {!cameraReady && <button onClick={startCamera} disabled={requestingCamera} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/8 px-3 py-2.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/12 disabled:opacity-50">{requestingCamera ? <LoaderCircle className="animate-spin" size={15} /> : <Camera size={15} />}{requestingCamera ? "İzin bekleniyor" : "Kamerayı aç"}</button>}
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-5">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Gönderim hızı</p><p className="mt-1 text-[11px] text-white/35">Sonuç gelmeden yeni frame gönderilmez.</p></div><Radio size={16} className="text-white/25" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2">{TARGET_FPS_OPTIONS.map((fps) => <button key={fps} onClick={() => setTargetFps(fps)} disabled={monitoring} className={`rounded-lg border px-3 py-2 font-mono text-[11px] transition disabled:cursor-not-allowed ${targetFps === fps ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/8 text-white/35 hover:border-white/20"}`}>{fps} FPS</button>)}</div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-5">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Güven eşiği</p><p className="mt-1 text-[11px] text-white/35">İzleme sırasında değiştirilemez.</p></div><span className="rounded-lg border border-emerald-300/15 bg-emerald-300/8 px-2.5 py-1.5 font-mono text-xs text-emerald-200">{Math.round(confidence * 100)}%</span></div>
          <input className="confidence-slider mt-5 w-full disabled:opacity-40" type="range" min="0.05" max="0.95" step="0.05" value={confidence} disabled={monitoring || connecting} onChange={(event) => onConfidenceChange(Number(event.target.value))} aria-label="Canlı kamera güven eşiği" />
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-5">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Nesne sınıfları</p><p className="mt-1 text-[11px] text-white/35">Akış başlamadan önce seç.</p></div><span className="font-mono text-[10px] text-white/30">{selectedClasses.length || "TÜMÜ"}</span></div>
          <label className="mt-4 flex items-center gap-2 rounded-lg border border-white/8 bg-black/15 px-3 py-2"><Search size={14} className="text-white/30" /><input value={classQuery} disabled={monitoring || connecting} onChange={(event) => setClassQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/25 disabled:opacity-40" placeholder="Sınıf ara..." /></label>
          <div className="class-scroll mt-3 flex max-h-36 flex-wrap content-start gap-2 overflow-y-auto pr-1">
            <button onClick={onSelectAllClasses} disabled={monitoring || connecting} aria-pressed={selectedClasses.length === 0} className={`rounded-full border px-2.5 py-1.5 text-[11px] transition disabled:opacity-40 ${selectedClasses.length === 0 ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100" : "border-white/8 text-white/40"}`}>Tüm sınıflar</button>
            {visibleClasses.map((item) => { const selected = selectedClasses.includes(item.class_name); return <button key={item.class_id} onClick={() => onToggleClass(item.class_name)} disabled={monitoring || connecting} aria-pressed={selected} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition disabled:opacity-40 ${selected ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100" : "border-white/8 text-white/40"}`}>{selected && <Check size={11} />}{item.class_name}</button>; })}
          </div>
        </div>

        {error && <div className="flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3.5 py-3 text-xs leading-5 text-rose-100" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={15} />{error}</div>}

        {monitoring ? <button onClick={stopMonitoring} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-300/15"><Square size={15} fill="currentColor" /> İzlemeyi durdur</button> : <button onClick={startMonitoring} disabled={!cameraReady || connecting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3.5 text-sm font-semibold text-[#07100e] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-35">{connecting ? <LoaderCircle className="animate-spin" size={17} /> : <Activity size={17} />}{connecting ? "Bağlanıyor" : "İzlemeyi başlat"}</button>}
      </div>

      <div className="space-y-4">
        <div className="relative min-h-[570px] overflow-hidden rounded-[22px] border border-white/8 bg-[#050b09] shadow-2xl shadow-black/25">
          <div className="absolute inset-0 technical-grid opacity-20" />
          <video ref={videoRef} className={`absolute inset-0 size-full object-contain ${cameraReady ? "opacity-100" : "opacity-0"}`} autoPlay muted playsInline />
          <LiveDetectionOverlay videoRef={videoRef} result={result} />
          {!cameraReady && <div className="relative grid min-h-[570px] place-items-center px-8 text-center"><div className="max-w-sm"><span className="mx-auto grid size-16 place-items-center rounded-full border border-white/10 bg-white/[0.025] text-white/25"><Camera size={27} strokeWidth={1.25} /></span><p className="mt-5 text-sm text-white/55">Canlı kamera bekleniyor</p><p className="mt-2 text-xs leading-5 text-white/30">Kamera yalnızca tarayıcı izniyle açılır. Yüz tanıma veya kimlik tespiti yapılmaz.</p></div></div>}
          <div className="pointer-events-none absolute left-5 top-5 rounded-md bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/60 backdrop-blur">VG / LIVE 01</div>
          <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 rounded-md bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/60 backdrop-blur"><span className={`size-1.5 rounded-full ${monitoring ? "animate-pulse bg-rose-400" : connecting ? "bg-amber-300" : cameraReady ? "bg-emerald-300" : "bg-white/30"}`} />{monitoring ? "Canlı analiz" : connecting ? "Bağlanıyor" : cameraReady ? "Kamera hazır" : "Kamera kapalı"}</div>
          <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <MetricCard icon={<Activity size={15} />} label="Gerçek FPS" value={monitoring ? actualFps.toFixed(1) : "—"} detail={`hedef ${targetFps} FPS`} />
          <MetricCard icon={<CircleGauge size={15} />} label="Inference" value={result ? `${Math.round(result.inference_ms)} ms` : "—"} detail="model işlem süresi" />
          <MetricCard icon={<ScanLine size={15} />} label="Nesne" value={result?.detections.length.toString() ?? "—"} detail={counts.length > 0 ? counts.slice(0, 2).map(([name, count]) => `${name} ${count}`).join(" · ") : "anlık algılama"} />
          <MetricCard icon={<Wifi size={15} />} label="Bağlantı" value={monitoring ? "Açık" : connecting ? "..." : "Kapalı"} detail={monitoring ? "tek frame akışı" : "WebSocket"} />
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/8 bg-[#0b1714] p-4"><div className="flex items-center justify-between text-white/30"><span className="font-mono text-[9px] uppercase tracking-[0.15em]">{label}</span>{icon}</div><p className="mt-3 text-xl font-medium tracking-tight">{value}</p><p className="mt-1 truncate text-[10px] text-white/30">{detail}</p></div>;
}

function XIcon() {
  return <CameraOff size={16} />;
}
