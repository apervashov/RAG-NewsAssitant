/**
 * @param key 
 * @returns
 */
export function maskApiKey(key: string | undefined): string {
  if (!key) return 'undefined';
  if (key.length <= 8) return '****';
  
  const firstFour = key.substring(0, 4);
  const lastFour = key.substring(key.length - 4);
  const middleMask = '*'.repeat(Math.min(key.length - 8, 10));
  
  return `${firstFour}${middleMask}${lastFour}`;
}

/**
 * @param label 
 * @param key 
 */
export function logApiKey(label: string, key: string | undefined): void {
  console.log(`${label}: ${maskApiKey(key)}`);
  console.log(`${label} length: ${key ? key.length : 0}`);
} 