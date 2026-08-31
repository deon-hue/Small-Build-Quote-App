// Test the scope splitting logic

const scopeText = `Single-storey rear extension to the existing detached dwelling at 9 Parkside, Maidenhead, with an approximate footprint of 4.2m wide × 4.0m deep, together with conversion of the attached integral garage to a utility room and full new kitchen fit-out to the existing kitchen area. Works commence with site setup including welfare facilities, hoarding, and temporary protection to the existing structure, followed by controlled demolition of the existing rear wall including removal of masonry, existing window/door openings, and making good as required; strip-out of the existing kitchen to include removal and disposal of all units and fixed furniture to a licensed waste facility — client to remove and recycle all appliances (fridge, freezer, washing machine, etc.) to a registered public waste/trade site prior to works commencing; a new opening to be formed through the existing cavity wall between the kitchen and garage with a masonry lintel over (Assumed: standard proprietary lintel — no structural steel required to this opening). Foundations to comprise reinforced concrete placement. Structural frame to include fabrication and installation of 203×203×46UC steel columns and beams (B1/B2) with welded connections.`;

console.log('Original text length:', scopeText.length);
console.log('Number of ". " sequences:', (scopeText.match(/\. /g) || []).length);

// Split by ". " and group into pairs
const sentences = scopeText.split('. ');
console.log('\nAfter split, number of parts:', sentences.length);

const paragraphs = [];
for (let i = 0; i < sentences.length; i += 2) {
  if (i + 1 < sentences.length) {
    paragraphs.push(sentences[i] + '. ' + sentences[i + 1] + '.');
  } else {
    paragraphs.push(sentences[i] + (scopeText.endsWith('.') ? '.' : ''));
  }
}

console.log('\nNumber of paragraphs created:', paragraphs.length);

paragraphs.forEach((p, i) => {
  console.log(`\n--- PARAGRAPH ${i + 1} (${p.length} chars) ---`);
  console.log(p.substring(0, 100) + '...');
});
