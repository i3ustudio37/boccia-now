import Image from "next/image";
import { Activity, Check, CircleHelp, Clock3, Download, Hand, History, LoaderCircle, Menu, Pause, Play, Plus, RotateCcw, Square, Target, Upload, X, type LucideProps } from "lucide-react";

// Adapted from the supplied 5071 Logo and Icon contracts. Artwork is unmodified.
const icons = { menu: Menu, activity: Activity, check: Check, "circle-help": CircleHelp, "clock-3": Clock3, download: Download, hand: Hand, history: History, "loader-circle": LoaderCircle, pause: Pause, play: Play, plus: Plus, "rotate-ccw": RotateCcw, square: Square, target: Target, upload: Upload, x: X };

export function Icon({ name = "activity", size = 20, strokeWidth = 2, color = "currentColor", ...props }: LucideProps & { name?: keyof typeof icons }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" size={size} strokeWidth={strokeWidth} color={color} fill="none" {...props} />;
}

export function Logo({ variant = "horizontal", tone = "white", height = 28, className, alt = "5071" }: { variant?: "mark" | "horizontal"; tone?: "white" | "ink" | "crimson"; height?: number; className?: string; alt?: string }) {
  const width = Math.round(height * (variant === "horizontal" ? 751 / 219 : 563 / 674));
  return <Image src={`/5071/logo-${variant}-${tone}.png`} width={width} height={height} className={className} alt={alt} unoptimized priority style={{ height, width: "auto", display: "block" }} />;
}
