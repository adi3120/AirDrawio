import { useEffect, useRef, useState } from 'react';
import type { DiagramExportFormat } from '../export/diagramExport';
import { Icon } from './Icon';

interface ExportMenuProps {
  disabled?: boolean;
  busy?: boolean;
  onExport(format: DiagramExportFormat): void;
}

const exportOptions: Array<{
  format: DiagramExportFormat;
  label: string;
  description: string;
}> = [
  { format: 'drawio', label: 'Draw.io', description: 'Editable diagram' },
  { format: 'png', label: 'PNG', description: 'Lossless image' },
  { format: 'jpeg', label: 'JPEG', description: 'Smaller image' },
];

export function ExportMenu({ disabled, busy, onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`export-menu ${open ? 'is-open' : ''}`}>
      <button
        className="export-menu__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="download" /> {busy ? 'Exporting…' : 'Export'} <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="export-menu__popover" role="menu" aria-label="Export diagram">
          <span>Download diagram</span>
          {exportOptions.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport(option.format);
              }}
            >
              <Icon name={option.format === 'drawio' ? 'file' : 'image'} />
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
