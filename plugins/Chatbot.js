const axios = require('axios');
const { cmd } = require('../command');
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");
const fs = require('fs');
const path = require('path');
const { downloadTempMedia, cleanupTemp } = require("../lib/media-utils");

const simulateTyping = async (conn, jid, ms = 2000) => {
  await conn.sendPresenceUpdate('composing', jid);
  await new Promise(resolve => setTimeout(resolve, ms));
  await conn.sendPresenceUpdate('paused', jid);
};

let AI_STATE = { IB: "false", GC: "false" };

// Load config on startup
(async () => {
  const saved = await getConfig("AI_STATE");
  if (saved) AI_STATE = JSON.parse(saved);
})();

// Smart reply-menu style chatbot control
cmd({
  pattern: "chatbot",
  alias: ["xylo"],
  react: "🤖",
  desc: "Control Xylo AI Chatbot mode",
  category: "ai",
  filename: __filename
}, async (conn, mek, m, { from, args, isOwner, reply }) => {
  if (!isOwner) return reply("❌ Only the bot owner can use this command.");

  if (!args[0]) {
    const text = `> *𝐗𝐲𝐥𝐨 𝐀𝐈 𝐂𝐡𝐚𝐭𝐛𝐨𝐭 𝐌𝐨𝐝𝐞𝐬*\n
> PM Status: ${AI_STATE.IB === "true" ? "✅ Enabled" : "❌ Disabled"}
> Group Status: ${AI_STATE.GC === "true" ? "✅ Enabled" : "❌ Disabled"}\n
Reply with:
*1.* Enable for PM Only
*2.* Enable for Groups Only
*3.* Enable for All
*4.* Disable All

╭─────────────
│ *𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝙳𝚊𝚟𝚒𝚍 𝚇*
╰──────────────◆`;

    const sentMsg = await conn.sendMessage(from, {
      image: { url: "https://i.postimg.cc/rFV2pJW5/IMG-20250603-WA0017.jpg" },
      caption: text
    }, { quoted: mek });

    const messageID = sentMsg.key.id;

    const handler = async (msgData) => {
      try {
        const receivedMsg = msgData.messages?.[0];
        if (!receivedMsg?.message || !receivedMsg.key?.remoteJid) return;

        const stanzaId = receivedMsg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (stanzaId !== messageID) return;

        const replyText = receivedMsg.message?.conversation ||
                          receivedMsg.message?.extendedTextMessage?.text || "";

        const sender = receivedMsg.key.remoteJid;
        let statusText = "";

        if (replyText === "1") {
          AI_STATE.IB = "true"; AI_STATE.GC = "false";
          statusText = "✅ Xylo AI enabled for *PM only*.";
        } else if (replyText === "2") {
          AI_STATE.IB = "false"; AI_STATE.GC = "true";
          statusText = "✅ Xylo AI enabled for *Groups only*.";
        } else if (replyText === "3") {
          AI_STATE.IB = "true"; AI_STATE.GC = "true";
          statusText = "✅ Xylo AI enabled for *All chats*.";
        } else if (replyText === "4") {
          AI_STATE.IB = "false"; AI_STATE.GC = "false";
          statusText = "❌ Xylo AI disabled for all chats.";
        } else {
          await conn.sendMessage(sender, {
            text: "❌ Invalid option. Please reply with 1, 2, 3 or 4."
          }, { quoted: receivedMsg });
          return;
        }

        await setConfig("AI_STATE", JSON.stringify(AI_STATE));

        await conn.sendMessage(sender, {
          text: statusText
        }, { quoted: receivedMsg });

        conn.ev.off("messages.upsert", handler);
      } catch (err) {
        console.error("Chatbot reply-menu error:", err);
      }
    };

    conn.ev.on("messages.upsert", handler);

    // Auto cleanup after 10 minutes
    setTimeout(() => conn.ev.off("messages.upsert", handler), 10 * 60 * 1000);
    return;
  }

  // Text argument version fallback
  const modeArg = args[0]?.toLowerCase();
  if (["pm", "gc", "all", "off"].includes(modeArg)) {
    if (modeArg === "pm") {
      AI_STATE.IB = "true"; AI_STATE.GC = "false";
    } else if (modeArg === "gc") {
      AI_STATE.IB = "false"; AI_STATE.GC = "true";
    } else if (modeArg === "all") {
      AI_STATE.IB = "true"; AI_STATE.GC = "true";
    } else if (modeArg === "off") {
      AI_STATE.IB = "false"; AI_STATE.GC = "false";
    }
    await setConfig("AI_STATE", JSON.stringify(AI_STATE));
    return reply(`✅ Xylo AI mode updated to: *${modeArg.toUpperCase()}*`);
  } else {
    return reply("❌ Invalid mode. Use: `.chatbot pm`, `.chatbot gc`, `.chatbot all`, `.chatbot off`");
  }
});

// 🤖 AI Chat Handler
cmd({
  on: "body"
}, async (conn, m, store, { from, body, isGroup, sender, reply }) => {
  try {
    if (m.key.fromMe || body?.startsWith(config.PREFIX)) return;

    const allowed = isGroup ? AI_STATE.GC === "true" : AI_STATE.IB === "true";
    if (!allowed) return;

    const botJid = conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const isMentioned = body.toLowerCase().includes("say it") ||
                        m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botJid) ||
                        m?.message?.extendedTextMessage?.contextInfo?.participant === botJid;

    const isAudio = !!m.message.audioMessage;
    if (!isAudio && !isMentioned && isGroup) return;

    let promptText = body;

    // 🖼️ Draw image
    if (body.toLowerCase().startsWith("draw ")) {
      const prompt = body.slice(5).trim();
      const { data: draw } = await axios.post('https://xylo-ai.onrender.com/draw', { prompt });
      const imgPath = await downloadTempMedia(draw.imageUrl, 'xylo_img.jpg');
      await conn.sendMessage(from, {
        image: fs.readFileSync(imgPath),
        caption: "🖼️ Generated by 𝕏ʏʟᴏ"
      }, { quoted: m });
      cleanupTemp(imgPath);
      return;
    }

    // 🧠 Voice prompt (transcription skipped)
    if (isAudio) {
      const audioPath = await conn.downloadAndSaveMediaMessage(m, "./tmp/voice.ogg");
      promptText = "Hello"; // fallback text
      fs.unlinkSync(audioPath);
    }

    // ⌨️ Typing simulation
    await simulateTyping(conn, from, Math.floor(Math.random() * 1500) + 1500);

    // 🧠 Get AI response
    const { data } = await axios.post("https://xylo-ai.onrender.com/ask", {
      userId: sender.split("@")[0],
      message: promptText
    });

    if (!data?.reply) return reply("⚠️ No reply from Xylo.");

    await conn.sendMessage(from, { text: data.reply, ai: true }, { quoted: m });

    // 🔊 Voice response if requested
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
    console.error("Chatbot error:", err);
    reply("⚠️ Error occurred while using Xylo AI.");
  }
});
