import type { ComponentType, SVGProps } from "react";
import type { ActivityCategory } from "../types/activity";

type IconProps = SVGProps<SVGSVGElement>;

const baseSvgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function StarIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} fill="currentColor" stroke="none" {...props}>
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.6l-5.9 3.1 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function LearningIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

function MentorshipIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SpeakingIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function CommunityIcon(props: IconProps) {
  return (
    <svg {...baseSvgProps} {...props}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export const categoryIconMap: Record<
  ActivityCategory,
  ComponentType<IconProps>
> = {
  Learning: LearningIcon,
  Mentorship: MentorshipIcon,
  Speaking: SpeakingIcon,
  Community: CommunityIcon,
};
