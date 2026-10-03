"use client";

import { useRef, useState } from "react";
import { RotateCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductTypeKey } from "@/lib/merch/rules";

/**
 * Vector product mockups (no image files, works offline). Artwork is placed in
 * each product's print area via <image>, using a data URI or an upload URL.
 */

type Face = {
  /** Outline of the product. */
  body: string;
  /** Extra detail lines (seams, pocket, hood). */
  details?: string[];
  /** Where artwork goes: x, y, w, h. */
  print: [number, number, number, number];
};

const SHAPES: Record<ProductTypeKey, { front: Face; back: Face }> = {
  tshirt: {
    front: {
      body: "M95 40 L130 28 Q150 46 170 28 L205 40 L262 82 L238 122 L210 106 L210 292 L90 292 L90 106 L62 122 L38 82 Z",
      details: ["M130 28 Q150 58 170 28"],
      print: [110, 92, 80, 90],
    },
    back: {
      body: "M95 40 L130 28 Q150 34 170 28 L205 40 L262 82 L238 122 L210 106 L210 292 L90 292 L90 106 L62 122 L38 82 Z",
      print: [102, 70, 96, 110],
    },
  },
  hoodie: {
    front: {
      body: "M92 58 Q100 18 150 14 Q200 18 208 58 L262 96 L276 250 L246 256 L228 130 L222 296 L78 296 L72 130 L54 256 L24 250 L38 96 Z",
      details: [
        "M112 58 Q150 92 188 58",
        "M150 70 L150 150",
        "M104 216 L196 216 L206 270 L94 270 Z",
        "M144 70 L141 110",
        "M156 70 L159 110",
      ],
      print: [112, 116, 76, 82],
    },
    back: {
      body: "M92 58 Q100 18 150 14 Q200 18 208 58 L262 96 L276 250 L246 256 L228 130 L222 296 L78 296 L72 130 L54 256 L24 250 L38 96 Z",
      details: ["M100 60 Q150 36 200 60"],
      print: [100, 92, 100, 120],
    },
  },
  cap: {
    front: {
      body: "M60 190 Q60 70 150 64 Q240 70 240 190 Q150 176 60 190 Z M48 190 Q150 168 252 190 Q260 236 150 232 Q40 236 48 190 Z",
      details: ["M150 64 L150 180", "M100 82 Q120 130 118 182", "M200 82 Q180 130 182 182"],
      print: [110, 104, 80, 64],
    },
    back: {
      body: "M60 200 Q60 70 150 64 Q240 70 240 200 Q150 186 60 200 Z",
      details: ["M120 200 Q150 170 180 200"],
      print: [112, 96, 76, 60],
    },
  },
  tote: {
    front: {
      body: "M60 92 L240 92 L252 292 L48 292 Z",
      details: ["M100 92 Q100 22 132 22 Q150 22 150 50", "M200 92 Q200 22 168 22 Q150 22 150 50"],
      print: [86, 130, 128, 128],
    },
    back: {
      body: "M60 92 L240 92 L252 292 L48 292 Z",
      details: ["M100 92 Q100 22 132 22", "M200 92 Q200 22 168 22"],
      print: [86, 130, 128, 128],
    },
  },
  mug: {
    front: {
      body: "M70 70 L210 70 L206 268 Q140 284 74 268 Z M210 110 Q266 110 262 170 Q258 226 206 226 L207 204 Q238 202 240 170 Q242 132 209 132 Z",
      details: ["M70 70 Q140 88 210 70"],
      print: [92, 116, 96, 110],
    },
    back: {
      body: "M90 70 L230 70 L226 268 Q160 284 94 268 Z M90 110 Q34 110 38 170 Q42 226 94 226 L93 204 Q62 202 60 170 Q58 132 91 132 Z",
      details: ["M90 70 Q160 88 230 70"],
      print: [112, 116, 96, 110],
    },
  },
};

/** Relative luminance → outline color that stays visible on light and dark garments. */
function outlineFor(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.28)";
}

export function MockupFace({
  type,
  side,
  color,
  artwork,
  text,
  ink,
  className,
}: {
  type: ProductTypeKey;
  side: "front" | "back";
  color: string;
  artwork?: string | null;
  text?: string | null;
  ink?: string;
  className?: string;
}) {
  const face = SHAPES[type][side];
  const [x, y, w, h] = face.print;
  const stroke = outlineFor(color);
  const gid = `shade-${type}-${side}`;
  return (
    <svg viewBox="0 0 300 310" className={cn("size-full", className)} role="img" aria-label={`${type} ${side} preview`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <path d={face.body} fill={color} stroke={stroke} strokeWidth={2} strokeLinejoin="round" fillRule="evenodd" />
      <path d={face.body} fill={`url(#${gid})`} fillRule="evenodd" />
      {face.details?.map((d) => (
        <path key={d} d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      ))}
      {artwork && <image href={artwork} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />}
      {!artwork && text && (
        <text
          x={x + w / 2}
          y={y + h / 2}
          fill={ink ?? "#fff"}
          fontSize={Math.max(9, Math.min(22, (w / Math.max(4, text.length)) * 1.7))}
          fontWeight={800}
          fontFamily="Arial Black, Helvetica, sans-serif"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {text.slice(0, 24)}
        </text>
      )}
    </svg>
  );
}

/**
 * "3D-style" preview: drag (or use the arrow keys) to turn the product around.
 * Two faces with hidden backfaces on a CSS 3D stage.
 */
export function Mockup3D({
  type,
  color,
  front,
  back,
  className,
}: {
  type: ProductTypeKey;
  color: string;
  front: { artwork?: string | null; text?: string | null; ink?: string };
  back: { artwork?: string | null; text?: string | null; ink?: string };
  className?: string;
}) {
  const [angle, setAngle] = useState(-18);
  const drag = useRef<{ x: number; a: number } | null>(null);

  return (
    <div className={cn("grid gap-2", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Rotate preview"
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={Math.round(angle)}
        className="from-muted/70 to-background relative aspect-square cursor-grab touch-none overflow-hidden rounded-xl border bg-gradient-to-b select-none active:cursor-grabbing"
        style={{ perspective: "900px" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, a: angle };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && setAngle(drag.current.a + (e.clientX - drag.current.x) * 0.6)}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setAngle((a) => a - 15);
          if (e.key === "ArrowRight") setAngle((a) => a + 15);
        }}
      >
        <div
          className="absolute inset-[8%] transition-transform duration-75"
          style={{ transformStyle: "preserve-3d", transform: `rotateY(${angle}deg)` }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
            <MockupFace type={type} side="front" color={color} {...front} />
          </div>
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <MockupFace type={type} side="back" color={color} {...back} />
          </div>
        </div>
        {/* Floor shadow follows the turn, for depth. */}
        <div
          className="absolute bottom-[5%] left-1/2 h-3 -translate-x-1/2 rounded-full bg-black/15 blur-md"
          style={{ width: `${45 + 25 * Math.abs(Math.cos((angle * Math.PI) / 180))}%` }}
        />
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>Drag to rotate · ← → keys</span>
        <div className="flex gap-1">
          <button type="button" className="hover:text-foreground rounded px-1.5 py-0.5" onClick={() => setAngle(0)}>
            Front
          </button>
          <button type="button" className="hover:text-foreground rounded px-1.5 py-0.5" onClick={() => setAngle(180)}>
            Back
          </button>
          <button
            type="button"
            className="hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            onClick={() => setAngle((a) => a + 90)}
          >
            <RotateCwIcon className="size-3" /> Turn
          </button>
        </div>
      </div>
    </div>
  );
}
