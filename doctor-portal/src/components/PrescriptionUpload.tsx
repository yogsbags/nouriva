import { useRef, useState } from 'react';

type Props = {
  disabled?: boolean;
  onUpload: (files: File[]) => Promise<void>;
};

const MAX_FILES = 5;

export default function PrescriptionUpload({ disabled, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= MAX_FILES) break;
      const ok =
        file.type.startsWith('image/') ||
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');
      if (ok) next.push(file);
    }
    setFiles(next);
    setError(null);
  }

  async function handleSubmit() {
    if (!files.length || disabled) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(files);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div
        className={`dropzone${dragOver ? ' dragover' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Tap or drop prescription files</p>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>PDF or image · up to {MAX_FILES} files</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <>
          <ul className="file-list">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`}>{f.name}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setFiles([]);
                if (inputRef.current) inputRef.current.value = '';
              }}
              disabled={uploading}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={disabled || uploading}
              onClick={handleSubmit}
            >
              {uploading ? 'Analyzing & syncing…' : 'Analyze & sync to patient app'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
