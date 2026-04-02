/**
 * SSCC-18 (Serial Shipping Container Code) GS1 Utility
 * SSCC-18 Structure:
 * (00) - Application Identifier
 * Digit 1: Extension Digit (usually 0 for pallets)
 * Digits 2-8: GS1 Company Prefix (placeholder)
 * Digits 9-17: Serial Reference
 * Digit 18: Check Digit
 */

/**
 * Calculates the check digit for an SSCC-18 number (Modulo 10)
 * Digits 1-17
 */
export function calculateSsccCheckDigit(sscc17: string): number {
  if (sscc17.length !== 17) throw new Error("SSCC must be 17 digits before check digit");

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(sscc17[i], 10);
    // Alternate weighting: 3, 1, 3, 1... (starting from index 0)
    // GS1 logic: Position 1 is odd (3), Position 2 is even (1)
    const factor = (i % 2 === 0) ? 3 : 1;
    sum += digit * factor;
  }

  const nextMultipleOf10 = Math.ceil(sum / 10) * 10;
  return nextMultipleOf10 - sum;
}

/**
 * Generates a full 18-digit SSCC number
 * @param serial Serial Reference (up to 9 digits)
 * @param companyPrefix GS1 Company Prefix (up to 7-10 digits)
 * @param extensionDigit Usually 0
 */
export function generateSscc18(
  serial: number | string,
  companyPrefix: string = "8712345",
  extensionDigit: string = "0"
): string {
  const serialStr = String(serial).padStart(17 - companyPrefix.length - extensionDigit.length, "0");
  const sscc17 = `${extensionDigit}${companyPrefix}${serialStr}`;
  const checkDigit = calculateSsccCheckDigit(sscc17);
  return `${sscc17}${checkDigit}`;
}

/**
 * Standard Code 128 (Subset B) SVG Path Generator
 * Simplified for SSCC-18 barcodes (which only use digits)
 */
export function generateCode128Path(data: string, width: number = 300, height: number = 80): string {
    // This is a simplified placeholder function
    // In a real production app, we would use a more robust library like bwip-js or react-barcode
    // Given the constraints, we will provide a visual representation or stick to QR if necessary
    // But for the sake of the demo, I'll provide the logic for a basic barcode pattern.
    
    return data; // Placeholder
}
