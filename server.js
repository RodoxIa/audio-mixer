import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "buffer";

const app = express();
app.use(express.json({ limit: "100mb" }));

async function downloadFile(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao baixar arquivo: ${res.statusText}`);
  const fileStream = fs.createWriteStream(path);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

// 🔊 Endpoint principal de mistura
app.post("/mix", async (req, res) => {
  const { voiceUrl, voiceBase64, musicUrl, musicVolume = 0.25 } = req.body;

  // validação básica
  if ((!voiceUrl && !voiceBase64) || !musicUrl) {
    return res.status(400).json({
      error: "Faltam parâmetros: é necessário enviar voiceUrl ou voiceBase64 e musicUrl.",
    });
  }

  const id = uuidv4();
  const voicePath = `/tmp/voice-${id}.mp3`;
  const musicPath = `/tmp/music-${id}.mp3`;
  const outputPath = `/tmp/output-${id}.mp3`;

  try {
    // Salva o áudio principal (voz)
    if (voiceBase64) {
      const voiceBuffer = Buffer.from(voiceBase64, "base64");
      fs.writeFileSync(voicePath, voiceBuffer);
    } else {
      await downloadFile(voiceUrl, voicePath);
    }

    // Baixa a música de fundo
    await downloadFile(musicUrl, musicPath);

    // Usa ffmpeg para misturar
    ffmpeg()
      .input(voicePath)
      .input(musicPath)
      .complexFilter(
        `[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`,
        ["a"]
      )
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .on("end", () => {
        const fileBuffer = fs.readFileSync(outputPath);
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(fileBuffer);

        // limpa arquivos temporários
        [voicePath, musicPath, outputPath].forEach((f) => {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });
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

app.get("/", (_, res) => res.send("🎧 API de mistura de áudio ativa e funcionando!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
