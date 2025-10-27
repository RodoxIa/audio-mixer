import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "buffer";

const app = express();

// ✅ Aumentamos o limite do body para aceitar Base64 grande
app.use(express.json({ limit: "100mb" }));

// Função utilitária para baixar arquivo externo
async function downloadFile(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao baixar arquivo: ${res.statusText}`);
  const fileStream = fs.createWriteStream(outputPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

// 🔊 Endpoint principal de mistura
app.post("/mix", async (req, res) => {
  try {
    const { voiceUrl, voiceBase64, musicUrl, musicVolume = 0.25 } = req.body;

    // Validação básica
    if ((!voiceUrl && !voiceBase64) || !musicUrl) {
      return res.status(400).json({
        error: "Faltam parâmetros: é necessário enviar voiceUrl ou voiceBase64 e musicUrl.",
      });
    }

    const id = uuidv4();
    const voicePath = `/tmp/voice-${id}.mp3`;
    const musicPath = `/tmp/music-${id}.mp3`;
    const outputPath = `/tmp/output-${id}.mp3`;

    // 🔹 Salva o áudio da voz (base64 ou URL)
    if (voiceBase64) {
      // Garante que é uma string
      const base64Str = typeof voiceBase64 === "string"
        ? voiceBase64
        : JSON.stringify(voiceBase64);

      try {
        const voiceBuffer = Buffer.from(base64Str, "base64");
        fs.writeFileSync(voicePath, voiceBuffer);
      } catch (err) {
        console.error("Erro ao decodificar Base64:", err);
        return res.status(400).json({ error: "Base64 inválido para o áudio da voz." });
      }
    } else {
      await downloadFile(voiceUrl, voicePath);
    }

    // 🔹 Baixa a música de fundo
    await downloadFile(musicUrl, musicPath);

    // 🔹 Usa ffmpeg para misturar as faixas
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
        try {
          const outputBuffer = fs.readFileSync(outputPath);
          const outputBase64 = outputBuffer.toString("base64");

          res.json({
            success: true,
            message: "Áudio mesclado com sucesso!",
            audioBase64: outputBase64,
          });
        } catch (err) {
          console.error("Erro ao ler arquivo final:", err);
          res.status(500).json({ error: "Falha ao processar o áudio final." });
        } finally {
          // limpa temporários
          [voicePath, musicPath, outputPath].forEach((f) => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          });
        }
      })
      .on("error", (err) => {
        console.error("Erro no ffmpeg:", err);
        res.status(500).json({ error: `Erro no ffmpeg: ${err.message}` });
      })
      .save(outputPath);
  } catch (err) {
    console.error("Erro geral:", err);
    res.status(500).json({ error: "Erro interno no servidor." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
