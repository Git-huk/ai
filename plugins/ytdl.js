const fetch = require("node-fetch");
const config = require('../config');
const { getConfig, setConfig } = require('../lib/configdb');
const axios = require("axios");
const { fetchJson } = require("../lib/functions");
const { ytsearch } = require('@dark-yasiya/yt-dl.js');
const cheerio = require("cheerio");
const { cmd, commands } = require('../command');
const yts = require('yt-search');

cmd({
  pattern: "music",
  react: "🎶",
  desc: "Download YouTube song",
  category: "download",
  use: '.play <query>',
  filename: __filename
}, async (conn, mek, m, { from, reply, q }) => {
  try {
    if (!q) return reply("🎵 Please provide a song name or YouTube link.", null, );

    const yt = await ytsearch(q);
    if (!yt.results.length) return reply("❌ No results found!", null, );

    const song = yt.results[0];
    const cacheKey = `song:${song.title.toLowerCase()}`;
    const cachedData = getConfig(cacheKey);
    let downloadUrl = null;

    if (!cachedData) {
      const apiUrl = `https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(song.url)}`;
      const res = await fetch(apiUrl);
      const data = await res.json();

      if (!data?.result?.download_url) return reply("⛔ Download failed.", null, );

      downloadUrl = data.result.downloadUrl;

      setConfig(cacheKey, JSON.stringify({
        url: downloadUrl,
        title: song.title,
        thumb: song.thumbnail,
        artist: song.author.name,
        duration: song.timestamp,
        views: song.views,
        yt: song.url,
        ago: song.ago
      }));
    } else {
      const parsed = JSON.parse(cachedData);
      downloadUrl = parsed.url;
    }

    const caption = `*MUSIC DOWNLOADER*
╭───────────────◆
│⿻ *Title:* ${song.title}
│⿻ *Quality:* mp3/audio (128kbps)
│⿻ *Duration:* ${song.timestamp}
│⿻ *Viewers:* ${song.views}
│⿻ *Uploaded:* ${song.ago}
│⿻ *Artist:* ${song.author.name}
╰────────────────◆
⦿ *Direct Yt Link:* ${song.url}

Reply With:
*1* To Download Audio 🎶
*2* To Download Audio Document 📄

╭────────────────◆
│ *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀᴠɪᴅx*
╰─────────────────◆`;

    const sentMsg = await conn.sendMessage(from, {
      image: { url: song.thumbnail },
      caption}, { quoted: mek });

    const messageID = sentMsg.key.id;

    const handler = async (msgData) => {
      try {
        const msg = msgData.messages[0];
        if (!msg?.message || !msg.key?.remoteJid) return;

        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        const quotedId = quotedMsg?.stanzaId;

        // فقط ریپلای به همون بنر
        if (quotedId !== messageID) return;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const songCache = getConfig(cacheKey);
        if (!songCache) return reply("⚠️ Song cache not found.", null, );

        const songData = JSON.parse(songCache);

        if (text.trim() === "1") {
          await conn.sendMessage(from, {
            audio: { url: songData.url },
            mimetype: "audio/mpeg",
            ptt: false}, { quoted: msg });
        } else if (text.trim() === "2") {
          await conn.sendMessage(from, {
            document: { url: songData.url },
            mimetype: "audio/mpeg",
            fileName: `${songData.title}.mp3`}, { quoted: msg });
        } else {
          await conn.sendMessage(from, {
            text: "❌ Invalid option. Reply with 1 or 2."}, { quoted: msg });
        }

        conn.ev.off("messages.upsert", handler);
      } catch (err) {
        console.error("Reply Handler Error:", err);
      }
    };

    conn.ev.on("messages.upsert", handler);
    setTimeout(() => conn.ev.off("messages.upsert", handler), 10 * 60 * 1000); // 10 min

  } catch (err) {
    console.error(err);
    reply("🚫 An error occurred.", null, );
  }
});
