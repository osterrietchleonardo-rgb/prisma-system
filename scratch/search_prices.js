const fs = require('fs');

const path = 'C:\\Users\\LENOVO\\.gemini\\antigravity\\brain\\0f043260-b3cf-45da-af42-d9b57afed825\\.system_generated\\steps\\920\\output.txt';

if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(content);
  for (const table of data.tables) {
    if (table.name.includes('credit') || table.name.includes('ai') || table.name.includes('transaction')) {
      console.log('Table:', table.name);
      console.log('Columns:', table.columns.map(c => `${c.name} (${c.data_type})`));
      console.log('=============================');
    }
  }
} else {
  console.log('File does not exist');
}
