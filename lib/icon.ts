import type { ComponentType, SVGProps } from "react";

/** Any icon component: a Heroicon, or anything else that renders an <svg>. */
export type Icon = ComponentType<SVGProps<SVGSVGElement>>;
