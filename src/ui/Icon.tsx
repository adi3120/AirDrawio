import type { SVGProps } from 'react';

export type IconName =
  | 'pointer'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'connector'
  | 'text'
  | 'hand'
  | 'undo'
  | 'redo'
  | 'mic'
  | 'settings'
  | 'bug'
  | 'camera'
  | 'eye'
  | 'eyeOff'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'trash'
  | 'spark'
  | 'chevron'
  | 'chevronDown'
  | 'download'
  | 'file'
  | 'image';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const path = (() => {
    switch (name) {
      case 'pointer':
        return <path d="m7 3 10.5 9.5-5.2.7-2.8 4.7L7 3Z" />;
      case 'rectangle':
        return <rect x="4" y="6" width="16" height="12" rx="2" />;
      case 'ellipse':
        return <ellipse cx="12" cy="12" rx="8" ry="6" />;
      case 'arrow':
        return <><path d="M4 17 17 7" /><path d="M11 6h7v7" /></>;
      case 'connector':
        return <><rect x="2.5" y="14.5" width="6" height="6" rx="1" /><rect x="15.5" y="3.5" width="6" height="6" rx="1" /><path d="M8.5 16c4 0 3-9 7-9" /><path d="m12.8 5.2 2.7 1.8-2.3 2.4" /></>;
      case 'text':
        return <><path d="M5 5h14" /><path d="M12 5v14" /><path d="M8 19h8" /></>;
      case 'hand':
        return <path d="M8.5 11V6.5a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v5m0-2a1.5 1.5 0 0 1 3 0v3c0 5-3 8-8 8h-1c-3 0-5-1.5-6.5-4L3.5 14.5A1.7 1.7 0 0 1 6 12l2.5 2V11Z" />;
      case 'undo':
        return <><path d="m9 7-5 5 5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></>;
      case 'redo':
        return <><path d="m15 7 5 5-5 5" /><path d="M19 12h-8a6 6 0 0 0-6 6" /></>;
      case 'mic':
        return <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></>;
      case 'settings':
        return <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 2-.7Z" /></>;
      case 'bug':
        return <><rect x="7" y="7" width="10" height="13" rx="5" /><path d="m9 7-1-3m7 3 1-3M4 10h3m10 0h3M4 15h3m10 0h3M9 12h6" /></>;
      case 'camera':
        return <><path d="M3 7h4l1.5-2h7L17 7h4v12H3V7Z" /><circle cx="12" cy="13" r="4" /></>;
      case 'eye':
        return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>;
      case 'eyeOff':
        return <><path d="m3 3 18 18" /><path d="M10.6 6.1c.5-.1.9-.1 1.4-.1 6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.9M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8" /></>;
      case 'zoomIn':
        return <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6M10 7v6" /></>;
      case 'zoomOut':
        return <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6" /></>;
      case 'fit':
        return <><path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" /></>;
      case 'trash':
        return <><path d="M4 7h16M9 3h6l1 4H8l1-4Zm-2 4 1 14h8l1-14M10 11v6m4-6v6" /></>;
      case 'spark':
        return <><path d="m12 2 1.3 4.7L18 8l-4.7 1.3L12 14l-1.3-4.7L6 8l4.7-1.3L12 2Z" /><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" /></>;
      case 'chevron':
        return <path d="m9 18 6-6-6-6" />;
      case 'chevronDown':
        return <path d="m6 9 6 6 6-6" />;
      case 'download':
        return <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M4 19h16" /></>;
      case 'file':
        return <><path d="M6 2h8l4 4v16H6V2Z" /><path d="M14 2v5h5M9 12h6m-6 4h6" /></>;
      case 'image':
        return <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3 2.5-2 5 4" /></>;
    }
  })();

  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {path}
    </svg>
  );
}
