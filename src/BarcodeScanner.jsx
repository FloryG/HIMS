import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const getDeviceLabel = (device, index) => {
  if (device.label && device.label.trim()) {
    return device.label;
  }
  return `Camera ${index + 1}`;
};

export default function BarcodeScanner({ onDetected, paused = false }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [vibrationOn, setVibrationOn] = useState(true);
  const lastDetectedRef = useRef({ value: null, time: 0 });
  const trackRef = useRef(null);
  const soundRef = useRef(true);
  const vibrationRef = useRef(true);
  const torchRef = useRef(false);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    vibrationRef.current = vibrationOn;
  }, [vibrationOn]);

  useEffect(() => {
    torchRef.current = torchOn;
  }, [torchOn]);

  const playBeep = () => {
    if (!soundRef.current) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio blocked by browser.", e);
    }
  };

  const tryAttachTrack = () => {
    const stream = videoRef.current?.srcObject;
    if (!stream || !stream.getVideoTracks) return false;
    const [track] = stream.getVideoTracks();
    if (!track) return false;
    trackRef.current = track;
    const caps = track.getCapabilities?.();
    const hasTorch = Boolean(caps && "torch" in caps);
    setTorchAvailable(hasTorch);
    if (!hasTorch) {
      setTorchOn(false);
    }
    return true;
  };

  const setTorch = async (enabled) => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled }] });
      setTorchOn(enabled);
    } catch (e) {
      console.warn("Torch not available.", e);
      setTorchAvailable(false);
    }
  };

  useEffect(() => {
    if (paused) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const codeReader = new BrowserMultiFormatReader(undefined, 250);
    let active = true;

    async function startScanner() {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!list.length) {
          setError("No camera found. Use manual entry.");
          setLoading(false);
          return;
        }

        setDevices(list);

        const fallbackDevice =
          list.find((d) => /back|rear|environment/i.test(d.label)) ||
          list[list.length - 1] ||
          list[0];

        const preferredId =
          selectedDeviceId && list.some((d) => d.deviceId === selectedDeviceId)
            ? selectedDeviceId
            : fallbackDevice.deviceId;

        if (preferredId !== selectedDeviceId) {
          setSelectedDeviceId(preferredId);
        }

        setTorchAvailable(false);
        setTorchOn(false);

        setError("");
        setLoading(false);

        codeReader.decodeFromVideoDevice(
          preferredId,
          videoRef.current,
          (result, err) => {
            if (!active) return;
            if (result) {
              const text = result.getText();
              const now = Date.now();
              const last = lastDetectedRef.current;
              if (text === last.value && now - last.time < 1500) {
                return;
              }
              lastDetectedRef.current = { value: text, time: now };
              playBeep();
              if (vibrationRef.current && navigator.vibrate) {
                navigator.vibrate(80);
              }
              onDetected(text);
            }
            if (err && err.name !== "NotFoundException") {
              console.warn("Decode error:", err);
            }
          }
        );

        for (let i = 0; i < 8 && active; i += 1) {
          if (tryAttachTrack()) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (e) {
        console.error(e);
        setError("Camera access denied or unavailable. Try manual entry.");
        setLoading(false);
      }
    }

    startScanner();

    return () => {
      active = false;
      if (trackRef.current && torchRef.current) {
        trackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
      trackRef.current = null;
      setTorchOn(false);
      setTorchAvailable(false);
      codeReader.reset();
    };
  }, [onDetected, paused, selectedDeviceId]);

  return (
    <div className="scanner-container">
      {loading && <p className="status">Loading camera...</p>}
      {paused && !loading && (
        <p className="status">Camera paused. Ready to scan another item.</p>
      )}
      {error && <p className="error">{error}</p>}
      <video ref={videoRef} className="scanner-video" autoPlay playsInline muted />

      <div className="scanner-controls">
        {devices.length > 1 && (
          <label className="scanner-control">
            <span>Camera</span>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getDeviceLabel(device, index)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="control-row">
          <button
            type="button"
            className={`control-btn ${soundOn ? "active" : ""}`}
            onClick={() => setSoundOn((prev) => !prev)}
          >
            Sound
          </button>
          <button
            type="button"
            className={`control-btn ${vibrationOn ? "active" : ""}`}
            onClick={() => setVibrationOn((prev) => !prev)}
          >
            Vibrate
          </button>
          {torchAvailable && (
            <button
              type="button"
              className={`control-btn ${torchOn ? "active" : ""}`}
              onClick={() => setTorch(!torchOn)}
            >
              Flash
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
