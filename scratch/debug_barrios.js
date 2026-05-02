const xlsx = require('xlsx');

async function debugBarrios() {
  const url = "https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/04/P_M_IN_T1_26.xlsx";
  console.log("Fetching:", url);
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed: " + res.status);
    const buffer = await res.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Total rows:", rows.length);
    console.log("First 20 rows:");
    rows.slice(0, 20).forEach((row, i) => {
      console.log(`${i}:`, JSON.stringify(row));
    });

    const dataRows = rows.slice(8);
    const sample = dataRows.slice(0, 5);
    console.log("Sample data rows (after slice 8):", JSON.stringify(sample));
    
    const parsed = dataRows
      .filter(row => row[0] && typeof row[0] === 'string' && row[0].length > 1 && !row[0].includes("Promedio"))
      .map(row => ({
        barrio: row[0],
        precio: row[1]
      }));
      
    console.log("Parsed barrios count:", parsed.length);
    if (parsed.length > 0) {
      console.log("First 5 parsed:", parsed.slice(0, 5));
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

debugBarrios();
