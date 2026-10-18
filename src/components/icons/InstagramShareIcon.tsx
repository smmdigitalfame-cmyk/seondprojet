import { SVGProps } from "react";

/**
 * Instagram DM/share icon — vector traced directly from the uploaded
 * reference PNG via potrace. Fills with `currentColor`.
 */
const InstagramShareIcon = ({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="285 165 230 230"
    aria-hidden="true"
    {...props}
  >
    <g transform="translate(0,540) scale(0.1,-0.1)" fill="currentColor" stroke="currentColor" strokeWidth="60" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3260 3611 c-138 -42 -213 -187 -155 -301 9 -19 130 -146 269 -281 l251 -246 94 -383 c61 -246 102 -393 116 -413 60 -90 208 -105 289 -29 34 33 39 40 330 511 128 207 289 464 356 571 179 284 174 273 174 350 0 106 -53 179 -155 215 -46 16 -1517 22 -1569 6z m1555 -118 c35 -19 57 -50 62 -90 4 -35 -7 -57 -157 -298 -89 -143 -268 -431 -397 -640 -294 -476 -273 -447 -330 -443 -36 2 -50 9 -64 28 -15 21 -195 729 -187 735 2 1 166 91 366 200 377 205 404 225 384 270 -24 51 -34 47 -429 -169 l-377 -205 -225 218 c-124 121 -234 228 -244 239 -42 47 -14 136 50 157 43 15 1521 12 1548 -2z" />
    </g>
  </svg>
);

export default InstagramShareIcon;
