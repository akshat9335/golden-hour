import twilio from "twilio";

export default async function handler(req, res) {
  try {
    const { lat, lng, userName } = req.body; // 👈 name bhi le

    const client = twilio(
      process.env.TWILIO_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;

    await client.messages.create({
      body: `🚨 Emergency reported by ${userName}
       \nLocation: ${mapsLink}`,
      from: process.env.TWILIO_PHONE,
      to: process.env.USER_PHONE,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}