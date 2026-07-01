// Central icon library — all app icons live here.
// Style: stroke-only, viewBox 0 0 24 24, strokeWidth 1.5, currentColor.
// Never inline ad-hoc SVGs in components; add them here and import.

const svgProps = (size = 28) => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  style: {
    stroke: "currentColor",
    strokeWidth: 1.5,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  },
});

export function JobFilesIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M13 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9l-7-7z" />
      <path d="M13 2v7h7" />
    </svg>
  );
}

export function TasksIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );
}

export function CommentIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function CalendarIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M3 10h18M9 1v6M15 1v6" />
    </svg>
  );
}

export function ContactsIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function TimeTrackerIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2.1" />
    </svg>
  );
}

export function TimeDashboardIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 15v-3M12 15V9M17 15v-5" />
    </svg>
  );
}

export function ExpensesIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function CleanUpIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function ChickenScratchIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <ellipse cx="13" cy="15" rx="6" ry="5" />
      <circle cx="8.5" cy="7.5" r="3" />
      <path d="M5.5 7 L3 7.5 L5.5 8" />
      <path d="M7 4.5 Q8.5 2.5 10 4.5" />
      <path d="M19 12 Q22 8 20 5" />
    </svg>
  );
}

export function PencilIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function CameraIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function PaperclipIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function RefreshIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function CopyIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DownloadIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function ArrowRightIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

export function SunIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function MonitorIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function RemoteClaudeIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="2" y="3" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M6 9l3 2-3 2" />
      <path d="M13 13h3" />
    </svg>
  );
}

export function MicIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function MicOffIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7 7 0 0 0 19 12" />
      <path d="M5 10a7 7 0 0 0 12.29 4.71" />
      <path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function FractionCalculatorIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      {/* Calculator body */}
      <rect x="4" y="2" width="16" height="20" rx="2" />
      {/* Display screen */}
      <rect x="6" y="4.5" width="12" height="3.5" rx="0.5" />
      {/* Button grid: 3 columns x 3 rows, symmetric and balanced */}
      {/* Row 1 */}
      <line x1="7" y1="12" x2="9" y2="12" />
      <line x1="11" y1="12" x2="13" y2="12" />
      <line x1="15" y1="12" x2="17" y2="12" />
      {/* Row 2 */}
      <line x1="7" y1="15" x2="9" y2="15" />
      <line x1="11" y1="15" x2="13" y2="15" />
      <line x1="15" y1="15" x2="17" y2="15" />
      {/* Row 3 */}
      <line x1="7" y1="18" x2="9" y2="18" />
      <line x1="11" y1="18" x2="13" y2="18" />
      <line x1="15" y1="18" x2="17" y2="18" />
    </svg>
  );
}
