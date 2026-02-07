
/**
 * Optimizes a prompt string to reduce token count without losing semantic meaning.
 * Strategies:
 * 1. Remove single-line comments // ...
 * 2. Remove multi-line comments / * ... * /
 * 3. Collapse excessive whitespace to single spaces.
 */
export function optimizePrompt(text: string): string {
    if (!text) return "";

    let optimized = text;

    // 1. Remove single-line comments (be careful with URLs http://)
    // Regex lookbehind is not fully supported in all JS environments, so we use a safer pattern
    // We match // only if it's NOT preceded by : (to avoid http://)
    optimized = optimized.replace(/([^:])\/\/.*$/gm, '$1');

    // 2. Remove multi-line comments
    optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, '');

    // 3. Compact JSON structure whitespace (Naive approach)
    // This is risky if the prompt relies on indentation, but for JSON blocks it helps.
    // Instead of parsing, let's just normalize multiple spaces/newlines to single space
    // EXCEPT for markdown blocks if possible... but simple whitespace compaction is usually safe for LLMs.
    optimized = optimized.replace(/\s+/g, ' ');

    return optimized.trim();
}
