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
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      console.error('CLAUDE_API_KEY missing');
      return { statusCode: 500, body: JSON.stringify({ error: 'CLAUDE_API_KEY is not configured on the server' }) };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error('Non-JSON response from Claude, status', res.status, 'body:', rawText.slice(0, 500));
      return { statusCode: 502, body: JSON.stringify({ error: 'Claude returned a non-JSON response', status: res.status }) };
    }
    if (!res.ok) {
      console.error('Claude API error', res.status, JSON.stringify(data));
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Claude API error' }) };
    }

    const text = data.content?.[0]?.text;
    if (!text) {
      console.error('Empty response from Claude', JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: 'Empty response from Claude' }) };
    }

    let parsed;
    try {
      const cleaned = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Could not parse Claude response as JSON', text);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not parse Claude response as JSON', raw: text }) };
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
