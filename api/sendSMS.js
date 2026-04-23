import twilio from "twilio";

export default async function handler(req, res) {
  const client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await client.messages.create({
      body: "🚨 Emergency!  detected.\nCheck location immediately.",
      from: process.env.TWILIO_PHONE,
      to: process.env.USER_PHONE,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}