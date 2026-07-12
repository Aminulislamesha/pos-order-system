/**
 * Helper file to handle auto-aliasing normalization logic.
 */

// Normalizes a string by replacing synonymous terms and splitting into a sorted array of words
export function normalizeProductString(input: string): string[] {
  let normalized = input.toLowerCase();

  // 1. Substitute core product names
  normalized = normalized.replace(/\bsolid color formal pants?\b/g, 'type_formal_pant');
  normalized = normalized.replace(/\bladies formal pants?\b/g, 'type_formal_pant');
  
  normalized = normalized.replace(/\bwide legged formal pants?\b/g, 'type_wide_leg');
  normalized = normalized.replace(/\bwide leg formal pants?\b/g, 'type_wide_leg');

  normalized = normalized.replace(/\bhigh waist office pants? for women\b/g, 'type_office_pant');
  normalized = normalized.replace(/\boffice pants? for women\b/g, 'type_office_pant');

  // 2. Expand sizes
  normalized = normalized.replace(/\bl\b/g, 'large');
  normalized = normalized.replace(/\bm\b/g, 'medium');
  normalized = normalized.replace(/\bxxl\b/g, '2xl');
  
  // 3. Normalize colors
  normalized = normalized.replace(/\bnavy blue\b/g, 'navy');
  normalized = normalized.replace(/\boffice black\b/g, 'black');
  
  // 4. Remove delimiters (dash, slash, comma) and split by whitespace
  normalized = normalized.replace(/[-/,]/g, ' ');

  // 5. Split into words, remove empty strings, and sort alphabetically
  const words = normalized.split(/\s+/).filter(word => word.trim().length > 0);
  words.sort();

  return words;
}

// Checks if the unmapped name loosely matches an existing product
// Both the unmapped string and the product string must resolve to the exact same sorted word array.
export function matchAliasToProduct(rawAlias: string, products: { id: string, name: string }[]): string | null {
  const aliasTokens = normalizeProductString(rawAlias);
  const aliasSignature = aliasTokens.join('|');

  for (const product of products) {
    const productTokens = normalizeProductString(product.name);
    const productSignature = productTokens.join('|');

    if (aliasSignature === productSignature) {
      return product.id; // Match found! Return canonical Product ID
    }
  }

  return null; // No match found
}
