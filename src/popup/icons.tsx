// Single inline icon set — 1.75px stroke, 24px viewBox, sized via prop.

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export const IconWallet = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
    <circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconActivity = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);

export const IconGem = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3h12l4 6-10 12L2 9Z" />
    <path d="M2 9h20M9.5 3 8 9l4 12M14.5 3 16 9l-4 12" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

export const IconReceive = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 7 7 17M15 17H7V9" />
  </svg>
);

export const IconSwap = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h13M14 4l4 4-4 4" />
    <path d="M20 16H7M10 12l-4 4 4 4" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconChevronR = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconChevronD = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 9 7 7 7-7" />
  </svg>
);

export const IconBack = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 5l14 14M19 5 5 19" />
  </svg>
);

export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3 3.9M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconExternal = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.2 11.8 20 3M16 7l3 3M13 10l2 2" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18Z" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z" />
  </svg>
);

export const IconSeed = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="M7.5 9.5h.01M12 9.5h.01M16.5 9.5h.01M7.5 14.5h.01M12 14.5h.01M16.5 14.5h.01" strokeWidth="2.4" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
  </svg>
);

export const IconWarning = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 22 20H2Z" />
    <path d="M12 10v4.5M12 17.2v.01" strokeWidth="2.2" />
  </svg>
);

export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1" />
    <path d="M14 10a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1" />
  </svg>
);

/** SOLWALL sun-disc logomark. */
export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="SOLWALL">
    <defs>
      <radialGradient id="sw-sun" cx="42%" cy="36%" r="75%">
        <stop offset="0%" stopColor="#ffe1a0" />
        <stop offset="55%" stopColor="#f5b843" />
        <stop offset="100%" stopColor="#c47b13" />
      </radialGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="#171208" stroke="rgba(245,184,67,.35)" />
    <circle cx="16" cy="14.5" r="7.5" fill="url(#sw-sun)" />
    <rect x="6" y="21.5" width="20" height="1.6" rx="0.8" fill="rgba(245,184,67,.55)" />
    <rect x="9" y="24.8" width="14" height="1.3" rx="0.65" fill="rgba(245,184,67,.28)" />
  </svg>
);
