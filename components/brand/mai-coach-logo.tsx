import type { ImgHTMLAttributes } from "react";

export type BrandLogoVariant = "full" | "compact" | "stacked" | "mark" | "circle" | "email";

type BrandAsset = {
  alt: string;
  height: number;
  src: string;
  width: number;
};

export const BRAND_LOGO_ASSETS: Record<BrandLogoVariant, BrandAsset> = {
  full: {
    alt: "MAI Coach — My AI Golf Coach",
    height: 401,
    src: "/brand/mai-coach/mai-coach-full-horizontal-v2.png",
    width: 1200,
  },
  compact: {
    alt: "MAI Coach — My AI Golf Coach",
    height: 212,
    src: "/brand/mai-coach/mai-coach-compact-horizontal-v2.png",
    width: 760,
  },
  stacked: {
    alt: "MAI Coach — My AI Golf Coach",
    height: 354,
    src: "/brand/mai-coach/mai-coach-stacked-v2.png",
    width: 720,
  },
  mark: {
    alt: "MAI Coach",
    height: 551,
    src: "/brand/mai-coach/mai-coach-mark-v2.png",
    width: 640,
  },
  circle: {
    alt: "MAI Coach",
    height: 512,
    src: "/brand/mai-coach/mai-coach-mark-circle-v2.png",
    width: 512,
  },
  email: {
    alt: "MAI Coach — My AI Golf Coach",
    height: 179,
    src: "/brand/mai-coach/mai-coach-email-v2.png",
    width: 640,
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
