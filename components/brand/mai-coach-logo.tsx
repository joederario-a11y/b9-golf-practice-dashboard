import type { ImgHTMLAttributes } from "react";

export type BrandLogoVariant = "full" | "fullLight" | "noTagline" | "noTaglineLight" | "compact" | "compactLight" | "stacked" | "mark" | "circle" | "email";

type BrandAsset = {
  alt: string;
  height: number;
  src: string;
  width: number;
};

export const BRAND_LOGO_ASSETS: Record<BrandLogoVariant, BrandAsset> = {
  full: {
    alt: "MAI Coach — AI Golf Coaching",
    height: 339,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-dark-v3.png",
    width: 1248,
  },
  fullLight: {
    alt: "MAI Coach — AI Golf Coaching",
    height: 339,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-light-v3.png",
    width: 1248,
  },
  noTagline: {
    alt: "MAI Coach",
    height: 230,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-no-tagline-dark-v3.png",
    width: 1140,
  },
  noTaglineLight: {
    alt: "MAI Coach",
    height: 230,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-no-tagline-light-v3.png",
    width: 1140,
  },
  compact: {
    alt: "MAI Coach",
    height: 164,
    src: "/brand/mai-coach/mai-coach-logo-compact-v3.png",
    width: 792,
  },
  compactLight: {
    alt: "MAI Coach",
    height: 230,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-no-tagline-light-v3.png",
    width: 1140,
  },
  stacked: {
    alt: "MAI Coach — AI Golf Coaching",
    height: 339,
    src: "/brand/mai-coach/mai-coach-logo-horizontal-dark-v3.png",
    width: 1248,
  },
  mark: {
    alt: "MAI Coach",
    height: 640,
    src: "/brand/mai-coach/mai-coach-mark-v3.png",
    width: 640,
  },
  circle: {
    alt: "MAI Coach",
    height: 512,
    src: "/brand/mai-coach/mai-coach-pwa-512-v3.png",
    width: 512,
  },
  email: {
    alt: "MAI Coach — AI Golf Coaching",
    height: 142,
    src: "/brand/mai-coach/mai-coach-logo-email-v3.png",
    width: 676,
  },
};

type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  decorative?: boolean;
  priority?: boolean;
  variant: BrandLogoVariant;
};

function logoAlt(defaultAlt: string, decorative?: boolean, alt?: string) {
  return decorative ? "" : alt ?? defaultAlt;
}

export function BrandLogo({ alt, decorative, priority, style, variant, ...props }: BrandLogoProps) {
  const asset = BRAND_LOGO_ASSETS[variant];
  return (
    <img
      alt={logoAlt(asset.alt, decorative, alt)}
      decoding="async"
      fetchPriority={priority ? "high" : props.fetchPriority}
      height={asset.height}
      loading={priority ? "eager" : props.loading ?? "lazy"}
      src={asset.src}
      style={{
        aspectRatio: `${asset.width} / ${asset.height}`,
        objectFit: "contain",
        ...style,
      }}
      width={asset.width}
      {...props}
    />
  );
}

type MaiCoachLogoProps = Omit<BrandLogoProps, "variant">;

export function MaiCoachLogoFull(props: MaiCoachLogoProps) {
  return <BrandLogo variant="full" {...props} />;
}

export function MaiCoachLogoCompact(props: MaiCoachLogoProps) {
  return <BrandLogo variant="compact" {...props} />;
}

export function MaiCoachLogoStacked(props: MaiCoachLogoProps) {
  return <BrandLogo variant="stacked" {...props} />;
}

export function MaiCoachLogoMark({ alt, decorative, ...props }: MaiCoachLogoProps) {
  return <BrandLogo alt={alt} decorative={decorative} variant="mark" {...props} />;
}

export function MaiCoachLogoCircle(props: MaiCoachLogoProps) {
  return <BrandLogo variant="circle" {...props} />;
}

export function MaiCoachLogoMonochrome(props: MaiCoachLogoProps) {
  return <BrandLogo variant="full" {...props} />;
}
