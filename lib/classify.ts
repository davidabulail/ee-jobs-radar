// Classifier: turns a raw job title + location into two booleans.
// Both must be true for the posting to count as an alert-worthy match.
//
// Why this lives in its own file: the rules WILL drift over time as we
// see false positives/negatives in real postings. Keeping it isolated
// makes it cheap to tweak without touching any scraper code.

// Phrases that strongly indicate a Summer 2027 internship.
// Note: companies write the same thing in many ways, so we check several patterns.
const SUMMER_2027_PATTERNS: RegExp[] = [
  /\bsummer\s*2027\b/i,
  /\bsummer\s*['‘’`]27\b/i,
  /\b2027\s*summer\b/i,
  /\b2027\s*intern/i,
  /\bintern.{0,30}2027\b/i,
  /\bsu\s*27\b/i,
];

// Phrases that suggest the role is electrical-engineering-relevant.
// We're INTENTIONALLY broad here. Better to surface a borderline EE role
// (RF, FPGA, power, embedded, hardware) than to miss one.
// We're explicit about excluding pure-software titles below.
const EE_INCLUDE_PATTERNS: RegExp[] = [
  /\belectrical\b/i,
  /\belectronic\b/i,
  /\bee\b/i,
  /\bhardware\b/i,
  /\bcircuit/i,
  /\bpcb\b/i,
  /\bfpga\b/i,
  /\basic\b/i,
  /\brf\b/i,
  /\bradio\s*frequency\b/i,
  /\bsignal\s*integrity\b/i,
  /\bpower\s*(electronics|engineer|systems)\b/i,
  /\bmotor\s*control\b/i,
  /\bembedded\b/i,
  /\bfirmware\b/i,
  /\bvlsi\b/i,
  /\banalog\b/i,
  /\bdigital\s*design\b/i,
  /\bmixed[-\s]?signal\b/i,
  /\bdsp\b/i,
  /\bsemiconductor\b/i,
  /\bintegrated\s*circuit/i,
  /\bphysical\s*design\b/i,
  /\bverification\b/i, // chip verification, common EE intern role
  /\bsensor/i,
  /\bavionics\b/i,
  /\bcontrol\s*systems\b/i,
  /\bradar\b/i,
  /\bcommunications\s*engineer/i,
  /\bsatcom\b/i,
  /\bantenna\b/i,
  /\bphotonics\b/i,
  /\boptoelectronic/i,
  /\bgrid\b/i,
  /\bbattery\b/i,
  /\benergy\s*storage\b/i,
];

// Titles that LOOK like they might match (e.g. "Software Engineer Intern")
// but are NOT EE roles. Excluding them dramatically reduces noise.
const EE_EXCLUDE_PATTERNS: RegExp[] = [
  /\bsoftware\s*(engineer|developer)\b/i, // pure SWE roles
  /\bdata\s*(scientist|engineer|analyst)\b/i,
  /\bmachine\s*learning\b/i,
  /\bml\s*engineer\b/i,
  /\bproduct\s*manager\b/i,
  /\bbusiness\b/i,
  /\bfinance\b/i,
  /\bmarketing\b/i,
  /\blegal\b/i,
  /\bhr\b/i,
  /\baccounting\b/i,
  /\bsupply\s*chain\b/i,
  /\bquality\s*(engineer|assurance|control)\b/i,
  /\bhuman\s*resources\b/i,
  /\bhigh\s*school\b/i, // Lockheed lists HS interns; we want college-level
];

export function isSummer2027(title: string): boolean {
  return SUMMER_2027_PATTERNS.some((re) => re.test(title));
}

export function isEE(title: string): boolean {
  // If any exclude pattern fires AND no include pattern fires, drop it.
  // If an include pattern fires, keep it even if exclude also matches
  // (e.g. "Embedded Software Engineer" is still EE-relevant for hardware folks).
  const include = EE_INCLUDE_PATTERNS.some((re) => re.test(title));
  if (include) return true;
  const exclude = EE_EXCLUDE_PATTERNS.some((re) => re.test(title));
  // Fallback: if it's an "intern"/"internship" title with no exclude hit and
  // no include hit, surface it as borderline. Better false-positive than missed.
  // The trailing \b is critical — without it `\bintern` matches "International"
  // (word-boundary at the start, not the end), which previously flagged
  // accounting/finance roles as EE.
  return !exclude && /\bintern(s|ship|ships|ing)?\b/i.test(title);
}
