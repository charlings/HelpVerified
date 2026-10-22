/**
 * The only place image paths appear. `src` is the base path of the variants produced by
 * `bun --filter web images` (public/images/<key>-<width>.<ext>).
 */
export type ImageEntry = {
  src: string;
  alt: string;
  /** CSS object-position keeping the subject in frame when cropped. */
  focal: string;
  ratio: number;
  /** True until the owner confirms a licence for production use. */
  temporary: boolean;
};

export const imageWidths = [640, 1024, 1600, 2400] as const;

export const images = {
  nanny: {
    src: "/images/nanny",
    alt: "Nanny caring for two babies at home",
    focal: "45% 35%",
    ratio: 3 / 2,
    temporary: true,
  },
  driver: {
    src: "/images/driver",
    alt: "Smiling driver at the wheel of a car",
    focal: "45% 30%",
    ratio: 3 / 2,
    temporary: true,
  },
  cleaner: {
    src: "/images/cleaner",
    alt: "Domestic cleaner in gloves wiping a stair rail",
    focal: "50% 30%",
    ratio: 3 / 2,
    temporary: true,
  },
} as const satisfies Record<string, ImageEntry>;

export type ImageKey = keyof typeof images;
