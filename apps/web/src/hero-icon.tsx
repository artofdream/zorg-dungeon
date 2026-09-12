import type { HeroType } from "@zorg/engine";
import { HERO_TYPES, heroIconSrc } from "./hero-icons.js";

type IconSize = "sm" | "md" | "lg";

const SIZE_PX: Record<IconSize, number> = { sm: 22, md: 28, lg: 40 };

interface HeroIconProps {
  type: HeroType;
  size?: IconSize;
  /** When true, hide from AT because nearby text already names the type. */
  decorative?: boolean;
  className?: string;
}

export function HeroIcon({ type, size = "md", decorative = false, className }: HeroIconProps) {
  const px = SIZE_PX[size];
  return (
    <img
      className={`hero-icon hero-icon-${size}${className ? ` ${className}` : ""}`}
      src={heroIconSrc(type)}
      width={px}
      height={px}
      alt={decorative ? "" : type}
      aria-hidden={decorative ? true : undefined}
    />
  );
}

interface HeroTypeRowProps {
  types: readonly HeroType[];
  size?: IconSize;
  labelled?: boolean;
}

export function HeroTypeRow({ types, size = "sm", labelled = false }: HeroTypeRowProps) {
  if (types.length === 0) return null;
  return (
    <span className="hero-type-row" aria-label={labelled ? types.join(", ") : undefined}>
      {types.map((type) => (
        <span key={type} className="hero-type-chip">
          <HeroIcon type={type} size={size} decorative={labelled} />
          {labelled ? <span>{type}</span> : null}
        </span>
      ))}
    </span>
  );
}

/** Optional Maker legend — names the five figurines without changing rules. */
export function HeroFigurineLegend() {
  return (
    <div className="hero-legend" aria-label="Hero figurines">
      <p className="hint">Figurines</p>
      <HeroTypeRow types={HERO_TYPES} size="sm" labelled />
    </div>
  );
}
