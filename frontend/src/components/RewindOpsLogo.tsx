interface RewindOpsLogoProps {
  size?: number;
  className?: string;
}

export function RewindOpsLogo({ size = 32, className = "" }: RewindOpsLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
    >
      {/* Shield outline */}
      <path
        d="M20 3C20 3 6 8 6 8V18C6 27.5 12 33.5 20 37C28 33.5 34 27.5 34 18V8L20 3Z"
        fill="none"
        stroke="#8b7bef"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Left rewind triangle */}
      <path d="M11 20L19 13V27L11 20Z" fill="#8b7bef" />
      {/* Right rewind triangle */}
      <path d="M20 20L28 13V27L20 20Z" fill="#8b7bef" />
    </svg>
  );
}
