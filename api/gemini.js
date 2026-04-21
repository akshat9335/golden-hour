export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { prompt, imageURL } = req.body;

    let body;

    if (imageURL) {
      body = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                file_data: {
                  mime_type: "image/jpeg",
                  file_uri: imageURL,
                },
              },
            ],
          },
        ],
      };
    } else {
      body = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
} 