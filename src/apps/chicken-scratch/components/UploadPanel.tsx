import { useRef, useState } from "react";
import { CameraIcon, PaperclipIcon, PencilIcon } from "../../../icons";
import { DEFAULT_MODEL, MODEL_OPTIONS } from "../models";
import "./UploadPanel.css";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onImage: (base64: string, mimeType: string, fileName: string, model: string) => void;
}

export function UploadPanel({ onImage }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      alert("Image too large — please use a photo under 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const comma = dataUrl.indexOf(",");
      const base64 = dataUrl.slice(comma + 1);
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
      onImage(base64, mimeType, file.name, model);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="upload-panel">
      <div className="cs-control">
        <label className="cs-control-label" htmlFor="cs-model">Model</label>
        <select id="cs-model" value={model} onChange={(e) => setModel(e.target.value)}>
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="upload-zone">
        <span className="upload-icon" aria-hidden="true"><PencilIcon size={40} /></span>
        <p>Take a photo or attach an image of handwriting or a sketch</p>
        <div className="upload-buttons">
          <button className="btn-camera" onClick={() => cameraRef.current?.click()}>
            <CameraIcon size={16} /> Camera
          </button>
          <button className="btn-file" onClick={() => fileRef.current?.click()}>
            <PaperclipIcon size={16} /> Attach File
          </button>
        </div>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
