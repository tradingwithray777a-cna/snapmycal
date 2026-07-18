const PROMPT = `You are a nutrition estimation assistant analyzing a photo of a meal.
Identify each distinct food item visible. For each item estimate:
- name (short, specific)
- portion (human readable, e.g. "150g" or "1 cup (240ml)")
- kcal (calories, integer)
- protein (grams, number)
- carb (grams, number)
- fat (grams, number)

Also estimate aggregate nutrients across the whole meal:
- fiber (grams)
- sugar (grams)
- sodium (milligrams)
- vitaminA (% daily value)
- vitaminC (% daily value)
- calcium (% daily value)
- iron (% daily value)

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{"items":[{"name":string,"portion":string,"kcal":number,"protein":number,"carb":number,"fat":number}],"extra":{"fiber":number,"sugar":number,"sodium":number,"vitaminA":number,"vitaminC":number,"calcium":number,"iron":number}}`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { image, mimeType } = JSON.parse(event.body || '{}');
    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing image (base64) in request body' }) };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY missing');
      return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server' }) };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } },
            ],
          }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error('Gemini API error', res.status, JSON.stringify(data));
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Gemini API error' }) };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Empty response from Gemini', JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: 'Empty response from Gemini' }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('Could not parse Gemini response as JSON', text);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not parse Gemini response as JSON', raw: text }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error('Unhandled error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown server error' }) };
  }
};
