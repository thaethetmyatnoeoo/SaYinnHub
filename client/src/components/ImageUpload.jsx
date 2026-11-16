import { t as tr } from "../i18n";
import React, { useRef, useState } from "react";
import { imageUrl, api } from "../api";

export function ImageUpload({
  label,
  value,
  onChange,
  purpose,
  onBusy = () => {},
}) {
  const [preview, P] = useState(""),
    [busy, B] = useState(false),
    [error, E] = useState("");
  const input = useRef();
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    E("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      E("Choose PNG, JPEG, or WebP, up to 2 MB.");
      e.target.value = "";
      return;
    }
    B(true);
    onBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Unable to read image."));
        r.readAsDataURL(file);
      });
      P(data);
      const result = await api("/images", { purpose, data });
      onChange(result.url);
    } catch (err) {
      E(err.message);
    } finally {
      B(false);
      P("");
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="image-upload">
      <label>
        <span>{label}</span>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      {(value || preview) && (
        <div className="image-preview">
          <img
            src={
              preview || imageUrl(value.startsWith("/") ? value : "/" + value)
            }
            alt={label + " preview"}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onChange("")}
          >
            {tr("Remove image")}
          </button>
        </div>
      )}
      <small>
        {busy
          ? tr("Uploading…")
          : tr(
              "PNG, JPEG or WebP · up to 2 MB. Select another file to replace.",
            )}
      </small>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
