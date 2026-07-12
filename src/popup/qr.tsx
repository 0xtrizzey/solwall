// Branded QR render — dark modules on the wallet's ivory, rounded dots.

import qrcode from "qrcode-generator";
import { useMemo } from "react";

export function QrCode({ value, size = 208 }: { value: string; size?: number }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const cell = size / (n + 4); // 2-module quiet zone
    const dots: string[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        const x = (c + 2) * cell;
        const y = (r + 2) * cell;
        dots.push(`M${x.toFixed(2)},${y.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`);
      }
    }
    return { path: dots.join(""), n };
  }, [value, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="qr" role="img" aria-label="Address QR code">
      <rect width={size} height={size} rx={16} fill="#f2ede3" />
      <path d={svg.path} fill="#171208" />
    </svg>
  );
}
