"use client";

import { useId } from "react";

const STAR_PATH =
  "M9.04894 4.92705C9.3483 4.00574 10.6517 4.00574 10.9511 4.92705L11.5716 6.83688C11.7055 7.2489 12.0894 7.52786 12.5227 7.52786H14.5308C15.4995 7.52786 15.9023 8.76748 15.1186 9.33688L13.494 10.5172C13.1435 10.7719 12.9968 11.2232 13.1307 11.6353L13.7512 13.5451C14.0506 14.4664 12.9961 15.2325 12.2124 14.6631L10.5878 13.4828C10.2373 13.2281 9.7627 13.2281 9.41221 13.4828L7.78761 14.6631C7.0039 15.2325 5.94942 14.4664 6.24877 13.5451L6.86932 11.6353C7.00319 11.2232 6.85653 10.7719 6.50604 10.5172L4.88144 9.33688C4.09773 8.76748 4.50051 7.52786 5.46923 7.52786H7.47735C7.91057 7.52786 8.29453 7.2489 8.4284 6.83688L9.04894 4.92705Z";

const FILLED = "#E0EA5E";
const EMPTY = "rgba(255,255,255,0.15)";

// Letterboxd ratings come in half-star steps; a half star is the filled
// glyph clipped to its left half, drawn over the dim placeholder.
export default function StarRating({
  rating,
  size = 20,
}: {
  rating: number;
  /** Row height in px; width scales with it so stars never distort. Default 20 matches the canvas/hover-popover size. */
  size?: number;
}) {
  // useId's raw value contains characters that are invalid inside SVG
  // url(#...) references, so strip it down to safe ones.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const value = Math.round(rating * 2) / 2;

  return (
    <svg
      width={84 * (size / 20)}
      height={size}
      viewBox="0 0 84 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* clip-path on a transformed element resolves in that element's
            local coordinates, so this rect is in glyph space: the star is
            centered at x=10 within its cell. One clip serves every star. */}
        <clipPath id={`${uid}-half`}>
          <rect x={0} y={0} width={10} height={20} />
        </clipPath>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const level = value - i; // >= 1 full, 0.5 half, <= 0 empty
        const transform = `translate(${i * 16}, 0)`;
        return (
          <g key={i}>
            <path d={STAR_PATH} transform={transform} fill={level >= 1 ? FILLED : EMPTY} />
            {level === 0.5 && (
              <path
                d={STAR_PATH}
                transform={transform}
                fill={FILLED}
                clipPath={`url(#${uid}-half)`}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
