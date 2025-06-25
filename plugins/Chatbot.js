const axios = require('axios');
const { cmd } = require('../command');
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");
const fs = require('fs');
const path = require('path');
const { downloadTempMedia, cleanupTemp } = require("../lib/media-utils");

const simulateTyping = async (conn, jid, ms = 1500) => {
  await conn.sendPresenceUpdate('composing', jid);
  await new Promise(resolve => setTimeout(resolve, ms));
  await conn.sendPresenceUpdate('paused', jid);
};

let AI_STATE = { IB: "false", GC: "false" };

// Load AI config
(async () => {
  const saved = await getConfig("AI_STATE");
  if (saved) AI_STATE = JSON.parse(saved);
})();

// AI Control Menu
cmd({
  pattern: "chatbot",
  alias: ["xylo"],
  react: "🤖",
  desc: "Control Xylo AI Chatbot mode",
  category: "ai",
  filename: __filename
}, async (conn, mek, m, { from, args, isOwner, reply }) => {
  if (!isOwner) return reply("Only the bot owner can use this command.");

  if (!args[0]) {
    const text = `> *Xylo AI Mode Settings*\n
> PM: ${AI_STATE.IB === "true" ? "Enabled" : "Disabled"}
> Group: ${AI_STATE.GC === "true" ? "Enabled" : "Disabled"}\n
Reply with:
1. Enable PM only
2. Enable Groups only
3. Enable All
4. Disable All`;

    const sentMsg = await conn.sendMessage(from, {
      image: { url: "https://i.postimg.cc/rFV2pJW5/IMG-20250603-WA0017.jpg" },
      caption: text
    }, { quoted: mek });

    const messageID = sentMsg.key.id;

    const handler = async (msgData) => {
      try {
        const receivedMsg = msgData.messages?.[0];
        if (!receivedMsg?.message || !receivedMsg.key.remoteJid) return;

        const stanzaId = receivedMsg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (stanzaId !== messageID) return;

        const replyText = receivedMsg.message?.conversation ||
                          receivedMsg.message?.extendedTextMessage?.text || "";

        const sender = receivedMsg.key.remoteJid;
        let responseText = "";

        if (replyText === "1") {
          AI_STATE.IB = "true"; AI_STATE.GC = "false";
          responseText = "Xylo AI enabled for PM only.";
        } else if (replyText === "2") {
          AI_STATE.IB = "false"; AI_STATE.GC = "true";
          responseText = "Xylo AI enabled for groups only.";
        } else if (replyText === "3") {
          AI_STATE.IB = "true"; AI_STATE.GC = "true";
          responseText = "Xylo AI enabled for all chats.";
        } else if (replyText === "4") {
          AI_STATE.IB = "false"; AI_STATE.GC = "false";
          responseText = "Xylo AI disabled for all chats.";
        } else {
          await conn.sendMessage(sender, {
            text: "Invalid option. Please reply with 1, 2, 3 or 4."
          }, { quoted: receivedMsg });
          return;
        }

        await setConfig("AI_STATE", JSON.stringify(AI_STATE));
        await conn.sendMessage(sender, { text: responseText }, { quoted: receivedMsg });
        conn.ev.off("messages.upsert", handler);
      } catch (e) {
        console.error("AI menu error:", e);
      }
    };

    conn.ev.on("messages.upsert", handler);
    setTimeout(() => conn.ev.off("messages.upsert", handler), 600000);
    return;
  }

  // Argument fallback
  const modeArg = args[0].toLowerCase();
  if (["pm", "gc", "all", "off"].includes(modeArg)) {
    AI_STATE.IB = ["pm", "all"].includes(modeArg) ? "true" : "false";
    AI_STATE.GC = ["gc", "all"].includes(modeArg) ? "true" : "false";
    await setConfig("AI_STATE", JSON.stringify(AI_STATE));
    return reply(`Xylo AI mode updated to: ${modeArg.toUpperCase()}`);
  } else {
    return reply("Invalid mode. Use: `.chatbot pm`, `.chatbot gc`, `.chatbot all`, `.chatbot off`");
  }
});

// AI Chat Response Handler
cmd({
  on: "body"
}, async (conn, m, store, { from, body, isGroup, sender, reply }) => {
  try {
    if (m.key.fromMe || body?.startsWith(config.PREFIX)) return;

    const allowed = isGroup ? AI_STATE.GC === "true" : AI_STATE.IB === "true";
    if (!allowed) return;

    const botJid = conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const contextInfo = m.message?.extendedTextMessage?.contextInfo || {};
    const mentionedJids = contextInfo?.mentionedJid || [];
    const isMentioned = mentionedJids.includes(botJid);
    const isReplyToBot = contextInfo?.participant === botJid;
    const isAudio = !!m.message.audioMessage;

    const shouldRespond =
      !isGroup ||
      isMentioned ||
      isReplyToBot ||
      body.toLowerCase().includes("say it") ||
      body.toLowerCase().startsWith("draw ");

    if (!shouldRespond) return;

    let promptText = body;

    // Image generation
    if (body.toLowerCase().startsWith("draw ")) {
      const prompt = body.slice(5).trim();
      const { data: draw } = await axios.post('https://xylo-ai.onrender.com/draw', { prompt });
      const imgPath = await downloadTempMedia(draw.imageUrl, 'xylo_img.jpg');
      await conn.sendMessage(from, {
        image: fs.readFileSync(imgPath),
        caption: "Generated by Xylo"
      }, { quoted: m });
      cleanupTemp(imgPath);
      return;
    }

    if (isAudio) {
      const audioPath = await conn.downloadAndSaveMediaMessage(m, "./tmp/voice.ogg");
      promptText = "Hello";
      fs.unlinkSync(audioPath);
    }

    await simulateTyping(conn, from, Math.floor(Math.random() * 1500) + 1000);

    const { data } = await axios.post("https://xylo-ai.onrender.com/ask", {
      userId: sender.split("@")[0],
      message: promptText
    });

    if (!data?.reply) return reply("No reply from Xylo.");

    await conn.sendMessage(from, { text: data.reply }, { quoted: m });

    if (isAudio || body.toLowerCase().includes("say it")) {
      const { data: voiceData } = await axios.post("https://xylo-ai.onrender.com/voice", {
        text: data.reply
      });

      const filePath = path.join(__dirname, '../tmp/xylo_voice.mp3');
      const writer = fs.createWriteStream(filePath);
      const stream = await axios.get(voiceData.audioUrl, { responseType: "stream" });
      stream.data.pipe(writer);

      await new Promise((res, rej) => {
        writer.on("finish", res);
        writer.on("error", rej);
      });

      await conn.sendMessage(from, {
        audio: fs.readFileSync(filePath),
        mimetype: "audio/mp4",
        ptt: true
      }, { quoted: m });

      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Xylo AI error:", err);
    reply("Xylo AI error occurred.");
  }
});
