import React from 'react';

export type UiIconName =
  | 'overview'
  | 'workspaces'
  | 'git'
  | 'connection'
  | 'activity'
  | 'team'
  | 'security'
  | 'recovery'
  | 'environment'
  | 'chevron-right'
  | 'external-link'
  | 'check'
  | 'arrow-right';

interface UiIconProps {
  readonly name: UiIconName;
  readonly size?: number;
  readonly className?: string;
}

export function UiIcon({ name, size = 20, className }: UiIconProps): React.ReactElement {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <path d="M3.5 10.5 12 3.75l8.5 6.75" />
          <path d="M5.75 9.5v10.25h12.5V9.5" />
          <path d="M9.25 19.75v-6.5h5.5v6.5" />
        </svg>
      );
    case 'workspaces':
      return (
        <svg {...common}>
          <path d="M3.5 7.75h6l1.8 2h9.2v8.75a1.75 1.75 0 0 1-1.75 1.75H5.25A1.75 1.75 0 0 1 3.5 18.5Z" />
          <path d="M3.5 9.75V6a1.75 1.75 0 0 1 1.75-1.75H9l1.6 1.8h8.15A1.75 1.75 0 0 1 20.5 7.8v1.95" />
        </svg>
      );
    case 'git':
      return (
        <svg {...common}>
          <circle cx="6" cy="5" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="9" cy="19" r="2" />
          <path d="M6 7v4.25A7.75 7.75 0 0 0 13.75 19H7" />
          <path d="M6 10.5a9.5 9.5 0 0 0 9.5-3.5H16" />
        </svg>
      );
    case 'connection':
      return (
        <svg {...common}>
          <path d="m9.25 14.75 5.5-5.5" />
          <path d="M7.1 16.9 5.7 18.3a3.65 3.65 0 0 1-5.15-5.16l3.1-3.1a3.65 3.65 0 0 1 5.16 0" transform="translate(3.15 -2.15)" />
          <path d="m16.9 7.1 1.4-1.4a3.65 3.65 0 0 1 5.15 5.16l-3.1 3.1a3.65 3.65 0 0 1-5.16 0" transform="translate(-2.6 1.1)" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <path d="M2.5 12h4l2.2-6.25 4.05 12.5 2.5-7h6.25" />
        </svg>
      );
    case 'team':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.75 19.25v-1.5A4.75 4.75 0 0 1 8.5 13h1A4.75 4.75 0 0 1 14.25 17.75v1.5" />
          <path d="M15.5 5.4a2.75 2.75 0 0 1 0 5.2" />
          <path d="M17 13.25a4.2 4.2 0 0 1 3.25 4.1v1.9" />
        </svg>
      );
    case 'security':
      return (
        <svg {...common}>
          <path d="M12 3.25 19 6v5.35c0 4.55-2.85 7.85-7 9.4-4.15-1.55-7-4.85-7-9.4V6Z" />
          <path d="M9.3 11.9 11 13.6l3.85-4" />
        </svg>
      );
    case 'recovery':
      return (
        <svg {...common}>
          <path d="M4.75 7.25V3.5" />
          <path d="M4.75 7.25H8.5" />
          <path d="M5.1 7.1A8.2 8.2 0 1 1 4 15" />
        </svg>
      );
    case 'environment':
      return (
        <svg {...common}>
          <path d="M7 3.5v5.25a5 5 0 0 0 10 0V3.5" />
          <path d="M5.25 3.5h3.5" />
          <path d="M15.25 3.5h3.5" />
          <path d="M12 13.75v3.5a3.25 3.25 0 1 0 3.25 3.25" />
          <circle cx="18.5" cy="20.5" r="1.5" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common}>
          <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
        </svg>
      );
    case 'external-link':
      return (
        <svg {...common}>
          <path d="M13.5 4.25h6.25v6.25" />
          <path d="m19.5 4.5-8.25 8.25" />
          <path d="M10.25 5.75H6.5a2.25 2.25 0 0 0-2.25 2.25v9.5a2.25 2.25 0 0 0 2.25 2.25H16a2.25 2.25 0 0 0 2.25-2.25v-3.75" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.2 12.15 2.45 2.45 5.15-5.4" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m14.5 7.5 4.5 4.5-4.5 4.5" />
        </svg>
      );
  }
}
