async function testEmbedding() {
  const apiKey = "YOUR_API_KEY_PLACEHOLDER"; // I'll search for it or use the one from env if I can pass it.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`;
  
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: "Hello" }] } })
    });
    const data = await resp.json();
    console.log("Dimensions:", data.embedding.values.length);
  } catch (error) {
    console.error("Embedding failed:", error);
  }
}

testEmbedding();
