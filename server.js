import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json({ limit: "50mb" }));

async function downloadFile(url, path) {
  const res = await fetch(url);
  const fileStream = fs.createWriteStream(path);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

app.post("/mix", async (req, res) => {
  const { voiceUrl, musicUrl, musicVolume = 0.25 } = req.body;

  if (!voiceUrl || !musicUrl)
    return res.status(400).json({ error: "Faltam parâmetros: voiceUrl e musicUrl são obrigatórios." });

  const id = uuidv4();
  const voicePath = `/tmp/voice-${id}.mp3`;
  const musicPath = `/tmp/music-${id}.mp3`;
  const outputPath = `/tmp/output-${id}.mp3`;

  try {
    await downloadFile(voiceUrl, voicePath);
    await downloadFile(musicUrl, musicPath);

    ffmpeg()
      .input(voicePath)
      .input(musicPath)
      .complexFilter(`[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`, ["a"])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .on("end", () => {
        const fileBuffer = fs.readFileSync(outputPath);
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(fileBuffer);
        fs.unlinkSync(voicePath);
        fs.unlinkSync(musicPath);
        fs.unlinkSync(outputPath);
      })
      .on("error", (err) => {
        console.error("Erro no ffmpeg:", err);
        res.status(500).json({ error: err.message });
      })
      .save(outputPath);
  } catch (err) {
    console.error("Erro geral:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (_, res) => res.send("🎧 API de mistura de áudio ativa!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rodando na porta ${PORT}`));