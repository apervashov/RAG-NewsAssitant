require('dotenv').config();
const path = require('path');
const fs = require('fs');


function maskApiKey(key) {
  if (!key) return 'undefined';
  if (key.length <= 8) return '****';
  
  const firstFour = key.substring(0, 4);
  const lastFour = key.substring(key.length - 4);
  const middleMask = '*'.repeat(Math.min(key.length - 8, 10));
  
  return `${firstFour}${middleMask}${lastFour}`;
}

const envFilePath = path.resolve(process.cwd(), '.env');
console.log(`Looking for .env file at: ${envFilePath}`);
console.log(`File exists: ${fs.existsSync(envFilePath)}`);

if (fs.existsSync(envFilePath)) {
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  console.log('.env file content:');
  console.log('----------------------------------------');
  console.log(envContent);
  console.log('----------------------------------------');
}

console.log('Checking environment variables:');
console.log('===============================');
console.log('GOOGLE_API_KEY:', maskApiKey(process.env.GOOGLE_API_KEY));
console.log('GOOGLE_API_KEY length:', process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.length : 0);
console.log('Environment GOOGLE_API_KEY raw value:', process.env.GOOGLE_API_KEY);
console.log('===============================');

if (!process.env.GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_API_KEY is not set!');
  process.exit(1);
}

console.log('API Key is set correctly!'); 