export function Logo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M28 22 Q30 16 28 10" stroke="#E8590C" strokeWidth="2" strokeLinecap="round" opacity=".35">
        <animate attributeName="d" values="M28 22 Q30 16 28 10;M28 22 Q26 15 28 8;M28 22 Q30 16 28 10" dur="3s" repeatCount="indefinite" />
      </path>
      <path d="M40 20 Q42 13 40 6" stroke="#E8590C" strokeWidth="2.5" strokeLinecap="round" opacity=".5">
        <animate attributeName="d" values="M40 20 Q42 13 40 6;M40 20 Q38 12 40 4;M40 20 Q42 13 40 6" dur="2.5s" repeatCount="indefinite" />
      </path>
      <path d="M52 22 Q54 16 52 10" stroke="#E8590C" strokeWidth="2" strokeLinecap="round" opacity=".35">
        <animate attributeName="d" values="M52 22 Q54 16 52 10;M52 22 Q50 15 52 8;M52 22 Q54 16 52 10" dur="3.5s" repeatCount="indefinite" />
      </path>
      <path d="M12 36 C12 36 10 56 28 64 C36 68 44 68 52 64 C70 56 68 36 68 36Z" fill="#E8590C" />
      <ellipse cx="40" cy="36" rx="30" ry="8" fill="#D14E0A" />
      <ellipse cx="40" cy="36" rx="26" ry="5.5" fill="#E8590C" />
      <ellipse cx="40" cy="37" rx="22" ry="4" fill="#F5A060" opacity=".6" />
      <line x1="54" y1="18" x2="36" y2="44" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="60" y1="20" x2="42" y2="46" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="40" cy="66" rx="10" ry="2.5" fill="#C44408" />
    </svg>
  );
}
