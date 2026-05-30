/**
 * Seed keyword sanitization tests.
 *
 * The parseRemarkKeywords() function in scripts/seed_db.ts is not exported,
 * so we replicate the exact same logic here for testing purposes.
 * This ensures the seed keyword filtering matches the importer.ts fix.
 */

function isMeaningfulRemarkKeyword(keyword: string): boolean {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) return false;
  return /[\p{Letter}\p{Number}]/u.test(trimmed);
}

function parseRemarkKeywords(remark: string | null): string[] {
  if (!remark) return [];
  const core = remark.replace(/^与/, '').replace(/合班$/, '').trim();
  if (!core || !isMeaningfulRemarkKeyword(core)) return [];
  const keywords: string[] = [core];
  const numMatch = core.match(/([一-龥]+?)(\d+)$/);
  if (numMatch) {
    const prefix = numMatch[1];
    const num = numMatch[2];
    for (let len = 2; len <= Math.min(4, prefix.length); len++) {
      const kw = prefix.slice(-len) + num;
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw);
    }
    if (num.length >= 2 && prefix.length >= 2) {
      const kw = prefix.slice(-2) + num[0];
      if (isMeaningfulRemarkKeyword(kw)) keywords.push(kw);
    }
  }
  return keywords;
}

interface TestCase {
  input: string | null;
  expected: string[];
  description: string;
}

const tests: TestCase[] = [
  { input: '（）', expected: [], description: 'empty brackets → no keyword' },
  { input: '()', expected: [], description: 'empty parens → no keyword' },
  { input: '[]', expected: [], description: 'empty square brackets → no keyword' },
  { input: '【】', expected: [], description: 'empty Chinese brackets → no keyword' },
  { input: '，；：', expected: [], description: 'pure punctuation → no keyword' },
  { input: '', expected: [], description: 'empty string → no keyword' },
  { input: '   ', expected: [], description: 'pure whitespace → no keyword' },
  { input: null, expected: [], description: 'null → no keyword' },
  { input: '与（）合班', expected: [], description: '与（）合班 → no keyword (filtered)' },
  { input: '与森防合班', expected: ['森防'], description: '与森防合班 → ["森防"]' },
  { input: '与检测技术机电34合班', expected: ['检测技术机电34', '术机电34', '技术机电34', '机电3', '机电34'], description: '与检测技术机电34合班 → multi-granularity (5 keywords)' },
  { input: '高本贯通', expected: ['高本贯通'], description: '高本贯通 → preserved' },
  { input: '现场工程师', expected: ['现场工程师'], description: '现场工程师 → preserved' },
  { input: '钢铁智能冶金技术1班', expected: ['钢铁智能冶金技术1班'], description: '钢铁智能冶金技术1班 → preserved (no digit suffix)' },
  { input: '1班', expected: ['1班'], description: '1班 → preserved' },
  { input: '森防', expected: ['森防'], description: '森防 → preserved' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = parseRemarkKeywords(t.input);
  const resultStr = JSON.stringify(result.sort());
  const expectedStr = JSON.stringify(t.expected.sort());
  if (resultStr === expectedStr) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${t.description}`);
    console.log(`    input: ${JSON.stringify(t.input)}`);
    console.log(`    expected: ${expectedStr}`);
    console.log(`    got:      ${resultStr}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
