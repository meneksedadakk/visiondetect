"use client";

import {
  AlertCircle,
  Camera,
  Check,
  ChevronRight,
  CircleGauge,
  FileImage,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DetectionCanvas } from "@/components/detection-canvas";
import { LiveCameraWorkspace } from "@/components/live-camera-workspace";
import {
  analyzeImage,
  ApiError,
  getClasses,
  getModelInfo,
} from "@/lib/api";
import type {
  DetectionResponse,
  ModelClass,
  ModelInfo,
} from "@/types/detection";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return "Backend'e ulaşılamadı. FastAPI sunucusunun 8000 portunda çalıştığını kontrol et.";
  }
  return "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.";
}

function modelStateLabel(model: ModelInfo | null, loading: boolean) {
  if (loading) return "Model hazırlanıyor";
  if (!model) return "Bağlantı yok";
  if (model.status === "ready") return "Model hazır";
  if (model.status === "not_loaded") return "Model beklemede";
  if (model.status === "dependency_missing") return "Bağımlılık eksik";
  return "Model hatası";
}

export function AnalysisWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"image" | "camera">("image");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0.35);
  const [classes, setClasses] = useState<ModelClass[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classQuery, setClassQuery] = useState("");
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      setBootLoading(true);
      setSystemError(null);
      try {
        const initialModel = await getModelInfo();
        if (!mounted) return;
        setModel(initialModel);

        const modelClasses = await getClasses();
        if (!mounted) return;
        setClasses(modelClasses);
        const defaults = ["person", "car"].filter((name) =>
          modelClasses.some((item) => item.class_name === name),
        );
        setSelectedClasses(defaults);
        setModel(await getModelInfo());
      } catch (error) {
        if (mounted) setSystemError(readableError(error));
      } finally {
        if (mounted) setBootLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const visibleClasses = useMemo(() => {
    const normalized = classQuery.trim().toLowerCase();
    if (!normalized) return classes;
    return classes.filter((item) =>
      item.class_name.toLowerCase().includes(normalized),
    );
  }, [classQuery, classes]);

  const counts = useMemo(() => {
    if (!result) return [];
    const totals = new Map<string, number>();
    result.detections.forEach((detection) => {
      totals.set(
        detection.class_name,
        (totals.get(detection.class_name) ?? 0) + 1,
      );
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [result]);

  function acceptFile(candidate: File) {
    setAnalysisError(null);
    if (!ALLOWED_TYPES.has(candidate.type)) {
      setAnalysisError("Yalnızca JPEG veya PNG görselleri yükleyebilirsin.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setAnalysisError("Görsel 10 MB dosya boyutu sınırını aşıyor.");
      return;
    }
    setFile(candidate);
    setImageUrl(URL.createObjectURL(candidate));
    setResult(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0];
    if (candidate) acceptFile(candidate);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const candidate = event.dataTransfer.files?.[0];
    if (candidate) acceptFile(candidate);
  }

  function clearFile() {
    setFile(null);
    setImageUrl(null);
    setResult(null);
    setAnalysisError(null);
  }

  function toggleClass(className: string) {
    setSelectedClasses((current) =>
      current.includes(className)
        ? current.filter((name) => name !== className)
        : [...current, className],
    );
    setResult(null);
  }

  async function runAnalysis() {
    if (!file) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const nextResult = await analyzeImage({
        file,
        confidence,
        classes: selectedClasses,
      });
      setResult(nextResult);
      getModelInfo().then(setModel).catch(() => undefined);
    } catch (error) {
      setAnalysisError(readableError(error));
    } finally {
      setAnalyzing(false);
    }
  }

  const stateLabel = modelStateLabel(model, bootLoading);
  const modelReady = model?.status === "ready";

  return (
    <div className="min-h-screen bg-[#07100e] text-[#edf5f0]">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/8 bg-[#091411] px-5 py-7 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-300">
              <ShieldCheck size={21} strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em]">VisionGuard</p>
              <p className="font-mono text-[10px] tracking-[0.16em] text-white/40">YOLO OBJECT DETECTION</p>
            </div>
          </div>

          <nav className="mt-12 space-y-2" aria-label="Ana menü">
            <a className="flex items-center gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/10 px-3.5 py-3 text-sm text-emerald-100" href="#analysis">
              <ScanLine size={18} />
              Analiz
              <ChevronRight className="ml-auto" size={15} />
            </a>
          </nav>

          <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs text-white/55">
              <span className={`size-2 rounded-full ${model ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" : "bg-rose-300"}`} />
              {model ? "Backend bağlı" : "Backend bağlantısı yok"}
            </div>
            <p className="mt-2 truncate font-mono text-[10px] text-white/30">
              {model?.model ?? "127.0.0.1:8000"}
            </p>
          </div>
        </aside>

        <main id="analysis" className="min-w-0 flex-1 px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/8 pb-7">
            <div>
              <div className="mb-4 flex items-center gap-3 lg:hidden">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300"><ShieldCheck size={19} /></span>
                <span className="text-sm font-semibold">VisionGuard</span>
              </div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">Analiz / {mode === "image" ? "Fotoğraf" : "Canlı kamera"}</p>
              <h1 className="text-3xl font-medium tracking-[-0.04em] sm:text-4xl">{mode === "image" ? "Görseli incele" : "Canlı alanı izle"}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">{mode === "image" ? "Bir görüntü yükle, nesne sınıflarını seç ve YOLO sonuçlarını doğrudan görsel üzerinde incele." : "Kamerayı aç, hedef sınıfları seç ve sonuçları kontrollü WebSocket akışıyla anlık izle."}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">
              {bootLoading ? <LoaderCircle className="animate-spin text-amber-200" size={13} /> : <span className={`size-1.5 rounded-full ${modelReady ? "bg-emerald-300" : "bg-amber-300"}`} />}
              {stateLabel}
              {model && <span className="text-white/25">· {model.device}</span>}
            </div>
          </header>

          {systemError && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-100" role="alert">
              <AlertCircle className="mt-0.5 shrink-0" size={17} />
              <span>{systemError}</span>
            </div>
          )}

          <section className={`${mode === "image" ? "grid" : "hidden"} mt-7 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]`}>
            <div className="space-y-4">
              <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-3 shadow-2xl shadow-black/20">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
                  <button onClick={() => setMode("image")} className="flex items-center justify-center gap-2 rounded-lg bg-white/8 px-3 py-2.5 text-sm text-white shadow-sm">
                    <ImagePlus size={16} /> Fotoğraf yükle
                  </button>
                  <button onClick={() => setMode("camera")} className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/45 transition hover:text-white/70">
                    <Camera size={16} /> Canlı kamera
                  </button>
                </div>

                {!file ? (
                  <div
                    className={`mt-3 grid min-h-60 place-items-center rounded-2xl border border-dashed px-7 text-center transition-colors ${dragging ? "border-emerald-200/60 bg-emerald-300/10" : "border-emerald-200/20 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.08),transparent_60%)]"}`}
                    onDragEnter={() => setDragging(true)}
                    onDragLeave={() => setDragging(false)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={onDrop}
                  >
                    <div>
                      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-emerald-200"><Upload size={23} strokeWidth={1.6} /></span>
                      <p className="mt-5 text-sm font-medium">Görseli buraya bırak</p>
                      <p className="mt-1.5 text-xs leading-5 text-white/35">JPEG veya PNG · en fazla 10 MB</p>
                      <button onClick={() => inputRef.current?.click()} className="mt-5 rounded-lg bg-emerald-300 px-4 py-2.5 text-xs font-semibold text-[#07100e] transition hover:bg-emerald-200">Dosya seç</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200"><FileImage size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{file.name}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/30">{formatBytes(file.size)} · hazır</p>
                    </div>
                    <button onClick={clearFile} className="rounded-lg p-2 text-white/35 transition hover:bg-white/5 hover:text-white" aria-label="Görseli kaldır"><X size={16} /></button>
                  </div>
                )}
                <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={onFileChange} />
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-5">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Güven eşiği</p><p className="mt-1 text-[11px] text-white/35">Düşük değer daha fazla aday gösterir.</p></div>
                  <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/8 px-2.5 py-1.5 font-mono text-xs text-emerald-200">{Math.round(confidence * 100)}%</span>
                </div>
                <input className="confidence-slider mt-5 w-full" type="range" min="0.05" max="0.95" step="0.05" value={confidence} onChange={(event) => { setConfidence(Number(event.target.value)); setResult(null); }} aria-label="Güven eşiği" />
                <div className="mt-2 flex justify-between font-mono text-[9px] text-white/25"><span>5%</span><span>95%</span></div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#0b1714] p-5">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Nesne sınıfları</p><p className="mt-1 text-[11px] text-white/35">Boş seçim tüm sınıfları tarar.</p></div>
                  <span className="font-mono text-[10px] text-white/30">{selectedClasses.length || "TÜMÜ"}</span>
                </div>
                <label className="mt-4 flex items-center gap-2 rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                  <Search size={14} className="text-white/30" />
                  <input value={classQuery} onChange={(event) => setClassQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/25" placeholder="Sınıf ara..." />
                </label>
                <div className="class-scroll mt-3 flex max-h-40 flex-wrap content-start gap-2 overflow-y-auto pr-1">
                  <button onClick={() => { setSelectedClasses([]); setResult(null); }} aria-pressed={selectedClasses.length === 0} className={`rounded-full border px-2.5 py-1.5 text-[11px] transition ${selectedClasses.length === 0 ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100" : "border-white/8 text-white/40 hover:border-white/20"}`}>Tüm sınıflar</button>
                  {bootLoading && Array.from({ length: 8 }).map((_, index) => <span key={index} className="h-7 w-16 animate-pulse rounded-full bg-white/5" />)}
                  {visibleClasses.map((item) => {
                    const selected = selectedClasses.includes(item.class_name);
                    return <button key={item.class_id} onClick={() => toggleClass(item.class_name)} aria-pressed={selected} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition ${selected ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100" : "border-white/8 text-white/40 hover:border-white/20 hover:text-white/65"}`}>{selected && <Check size={11} />}{item.class_name}</button>;
                  })}
                </div>
              </div>

              {analysisError && <div className="flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3.5 py-3 text-xs leading-5 text-rose-100" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={15} /> {analysisError}</div>}

              <button onClick={runAnalysis} disabled={!file || analyzing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3.5 text-sm font-semibold text-[#07100e] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-35">
                {analyzing ? <><LoaderCircle className="animate-spin" size={17} /> Analiz ediliyor</> : <><Sparkles size={17} /> Analizi başlat</>}
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative min-h-[570px] overflow-hidden rounded-[22px] border border-white/8 bg-[#050b09] shadow-2xl shadow-black/25">
                {!imageUrl ? (
                  <><div className="absolute inset-0 technical-grid opacity-30" /><div className="relative grid min-h-[570px] place-items-center px-8 text-center"><div className="max-w-sm"><span className="mx-auto grid size-16 place-items-center rounded-full border border-white/10 bg-white/[0.025] text-white/25"><ScanLine size={27} strokeWidth={1.25} /></span><p className="mt-5 text-sm text-white/55">Analiz yüzeyi hazır</p><p className="mt-2 text-xs leading-5 text-white/30">Yüklediğin görüntü ve algılanan nesnelerin kutuları burada gösterilecek.</p></div></div></>
                ) : <DetectionCanvas imageUrl={imageUrl} result={result} />}
                <div className="pointer-events-none absolute left-5 top-5 rounded-md bg-black/45 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/55 backdrop-blur">VG / CANVAS 01</div>
                <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 rounded-md bg-black/45 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/55 backdrop-blur"><span className={`size-1.5 rounded-full ${analyzing ? "animate-pulse bg-amber-300" : result ? "bg-emerald-300" : "bg-white/30"}`} />{analyzing ? "İşleniyor" : result ? "Analiz tamamlandı" : imageUrl ? "Görsel hazır" : "Beklemede"}</div>
                {analyzing && <div className="absolute inset-0 grid place-items-center bg-[#06100d]/65 backdrop-blur-[2px]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-emerald-300" size={28} /><p className="mt-3 text-xs text-white/65">YOLO görüntüyü inceliyor</p></div></div>}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-[#0b1714] p-4"><div className="flex items-center justify-between text-white/30"><span className="font-mono text-[9px] uppercase tracking-[0.15em]">Nesne</span><ScanLine size={15} /></div><p className="mt-3 text-2xl font-medium tracking-tight">{result?.detections.length ?? "—"}</p><p className="mt-1 text-[11px] text-white/30">toplam algılama</p></div>
                <div className="rounded-2xl border border-white/8 bg-[#0b1714] p-4"><div className="flex items-center justify-between text-white/30"><span className="font-mono text-[9px] uppercase tracking-[0.15em]">Inference</span><CircleGauge size={15} /></div><p className="mt-3 text-2xl font-medium tracking-tight">{result ? Math.round(result.inference_ms) : "—"}<span className="ml-1 text-xs text-white/30">{result && "ms"}</span></p><p className="mt-1 text-[11px] text-white/30">model işlem süresi</p></div>
                <div className="rounded-2xl border border-white/8 bg-[#0b1714] p-4"><div className="flex items-center justify-between text-white/30"><span className="font-mono text-[9px] uppercase tracking-[0.15em]">Dağılım</span>{result && <button onClick={() => setResult(null)} className="pointer-events-auto" aria-label="Sonucu temizle"><RotateCcw size={14} /></button>}</div>{counts.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{counts.slice(0, 4).map(([name, count]) => <span key={name} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-white/55">{name} · {count}</span>)}</div> : <><p className="mt-3 text-2xl font-medium tracking-tight">—</p><p className="mt-1 text-[11px] text-white/30">sınıf bazında sayım</p></>}</div>
              </div>
            </div>
          </section>
          {mode === "camera" && (
            <LiveCameraWorkspace
              classes={classes}
              selectedClasses={selectedClasses}
              confidence={confidence}
              onSelectPhoto={() => setMode("image")}
              onToggleClass={toggleClass}
              onSelectAllClasses={() => {
                setSelectedClasses([]);
                setResult(null);
              }}
              onConfidenceChange={(value) => {
                setConfidence(value);
                setResult(null);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
