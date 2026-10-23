// "6-4 3-6 [10-7]" → [{a:6,b:4},{a:3,b:6},{a:10,b:7,mtb:true}]
// "7-6(5)" → {a:7,b:6,tb:5}
export function parseScore(score) {
  if (typeof score !== "string") return [];
  const out = [];
  const re = /(\[)?\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*(\])?(?:\s*\((\d{1,2})\))?/g;
  let m;
  while ((m = re.exec(score))) {
    out.push({ a: +m[2], b: +m[3], mtb: !!(m[1] || m[4]), tb: m[5] != null ? +m[5] : null });
  }
  return out;
}
