import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "buffer";

const app = express();
app.use(express.json({ limit: "100mb" }));

// ✅ Endpoint de teste
app.get("/", (req, res) => {
  res.send("✅ Servidor de mixagem ativo! Use POST /mix");
});

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro ao baixar ${url}`);
  const fileStream = fs.createWriteStream(outputPath);
  await new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

// 🔊 Endpoint principal
app.post("/mix", async (req, res) => {
  try {
    const { voiceBase64, musicUrl, musicVolume = 0.25 } = req.body;

    if (!voiceBase64 || !musicUrl) {
      return res
        .status(400)
        .json({ error: "Envie voiceBase64 e musicUrl obrigatoriamente." });
    }

    const id = uuidv4();
    const voicePath = `/tmp/voice-${id}.mp3`;
    const musicPath = `/tmp/music-${id}.mp3`;
    const outputPath = `/tmp/output-${id}.mp3`;

    // Salva voz
    const voiceBuffer = Buffer.from(voiceBase64, "base64");
    fs.writeFileSync(voicePath, voiceBuffer);

    // Baixa música
    await downloadFile(musicUrl, musicPath);

    // Mistura com ffmpeg
    ffmpeg()
      .input(voicePath)
      .input(musicPath)
      .complexFilter(
        `[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first[a]`,
        ["a"]
      )
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .on("end", () => {
        const outputBuffer = fs.readFileSync(outputPath);
        const base64 = outputBuffer.toString("base64");
        res.json({ success: true, audioBase64: base64 });

        // limpa arquivos temporários
        [voicePath, musicPath, outputPath].forEach((f) => {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });
      })
      .on("error", (err) => {
        console.error("❌ Erro no ffmpeg:", err.message);
        res.status(500).json({ error: "Erro ao processar áudio" });
      })
      .save(outputPath);
  } catch (err) {
    console.error("❌ Erro geral:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🟢 Porta Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
