import type { ImgHTMLAttributes } from "react";

type MaiCoachLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  decorative?: boolean;
};

function logoAlt(defaultAlt: string, decorative?: boolean, alt?: string) {
  return decorative ? "" : alt ?? defaultAlt;
}

export function MaiCoachLogoFull({ alt, decorative, ...props }: MaiCoachLogoProps) {
  return (
    <img
      alt={logoAlt("MAI Coach — My AI Golf Coach", decorative, alt)}
      src="/brand/mai-coach/mai-coach-logo-full.svg"
      {...props}
    />
  );
}

export function MaiCoachLogoMark({ alt, decorative, ...props }: MaiCoachLogoProps) {
  return (
    <img
      alt={logoAlt("MAI Coach", decorative, alt)}
      src="/brand/mai-coach/mai-coach-logo-mark.svg"
      {...props}
    />
  );
}

export function MaiCoachLogoMonochrome({ alt, decorative, ...props }: MaiCoachLogoProps) {
  return (
    <img
      alt={logoAlt("MAI Coach — My AI Golf Coach", decorative, alt)}
      src="/brand/mai-coach/mai-coach-logo-monochrome.svg"
      {...props}
    />
  );
}
