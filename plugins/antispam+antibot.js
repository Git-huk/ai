const { cmd } = require('../command');
const config = require('../config'); // dynamic config import

let spamCache = {};
global.warnings = global.warnings || {};

// 🛡️ Utility: Safe Get/Set Defaults
if (!config.ANTISPAM_MODE) config.ANTISPAM_MODE = "off";
if (!config.ANTIBOT_MODE) config.ANTIBOT_MODE = "off";

// 📛 ANTISPAM MENU
cmd({
  pattern: "antispam",
  desc: "Configure Anti-Spam system",
  category: "security",
  filename: __filename
}, async (conn, mek, m, { from, isCreator, reply }) => {
  if (!isCreator) return reply("_❗ Only the owner can use this command._");

  const text = `> *ANTISPAM SETTINGS*\n> Current Mode: *${config.ANTISPAM_MODE.toUpperCase()}*\n\nReply with:\n1. Warn (3 warns → kick)\n2. Delete messages only\n3. Kick instantly\n4. Turn Off`;

  const sent = await conn.sendMessage(from, {
    image: { url: "https://i.postimg.cc/rFV2pJW5/IMG-20250603-WA0017.jpg" },
    caption: text
  }, { quoted: mek });

  const msgId = sent.key.id;

  const handler = async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedId !== msgId) return;

    const input = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const modeMap = { "1": "warn", "2": "delete", "3": "kick", "4": "off" };
    const selected = modeMap[input];

    if (!selected) return reply("❌ Invalid option. Choose 1-4.");

    config.ANTISPAM_MODE = selected;
    await conn.sendMessage(from, { text: `✅ ANTISPAM set to *${selected.toUpperCase()}*` }, { quoted: msg });

    conn.ev.off("messages.upsert", handler);
  };

  conn.ev.on("messages.upsert", handler);
  setTimeout(() => conn.ev.off("messages.upsert", handler), 600_000);
});

// 🤖 ANTIBOT MENU
cmd({
  pattern: "antibot",
  desc: "Configure Anti-Bot system",
  category: "security",
  filename: __filename
}, async (conn, mek, m, { from, isCreator, reply }) => {
  if (!isCreator) return reply("_❗ Only the owner can use this command._");

  const text = `> *ANTIBOT SETTINGS*\n> Current Mode: *${config.ANTIBOT_MODE.toUpperCase()}*\n\nReply with:\n1. Warn (3 warns → kick)\n2. Delete join alert\n3. Kick instantly\n4. Turn Off`;

  const sent = await conn.sendMessage(from, {
    image: { url: "https://i.postimg.cc/rFV2pJW5/IMG-20250603-WA0017.jpg" },
    caption: text
  }, { quoted: mek });

  const msgId = sent.key.id;

  const handler = async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedId !== msgId) return;

    const input = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const modeMap = { "1": "warn", "2": "delete", "3": "kick", "4": "off" };
    const selected = modeMap[input];

    if (!selected) return reply("❌ Invalid option. Choose 1-4.");

    config.ANTIBOT_MODE = selected;
    await conn.sendMessage(from, { text: `✅ ANTIBOT set to *${selected.toUpperCase()}*` }, { quoted: msg });

    conn.ev.off("messages.upsert", handler);
  };

  conn.ev.on("messages.upsert", handler);
  setTimeout(() => conn.ev.off("messages.upsert", handler), 600_000);
});

// 🚨 ANTISPAM LOGIC
cmd({ on: "body", filename: __filename }, async (conn, m, store, {
  from, sender, isGroup, isAdmins, isBotAdmins
}) => {
  if (!isGroup || isAdmins || !isBotAdmins) return;

  const mode = config.ANTISPAM_MODE || "off";
  if (mode === "off") return;

  const now = Date.now();
  const key = `${from}_${sender}`;
  spamCache[key] = spamCache[key] || { count: 0, last: now };
  const timeDiff = now - spamCache[key].last;

  spamCache[key].count = timeDiff < 4000 ? spamCache[key].count + 1 : 1;
  spamCache[key].last = now;

  if (spamCache[key].count < 5) return;

  if (mode === "delete") {
    await conn.sendMessage(from, { delete: m.key });
  } else if (mode === "warn") {
    global.warnings[sender] = (global.warnings[sender] || 0) + 1;
    const warns = global.warnings[sender];

    await conn.sendMessage(from, {
      text: `⚠️ *Spam Warning ${warns}/3* — @${sender.split('@')[0]}`,
      mentions: [sender]
    });

    if (warns >= 3) {
      await conn.groupParticipantsUpdate(from, [sender], "remove");
      delete global.warnings[sender];
    }
  } else if (mode === "kick") {
    await conn.groupParticipantsUpdate(from, [sender], "remove");
  }

  delete spamCache[key];
  setTimeout(() => delete spamCache[key], 30_000);
});

// 🧠 ANTIBOT LOGIC
cmd({
  on: "group-participants.update",
  filename: __filename,
  dontAddCommandList: true
}, async (conn, update) => {
  const { id, participants, action } = update;
  if (action !== "add") return;

  const mode = config.ANTIBOT_MODE || "off";
  if (mode === "off") return;

  for (const user of participants) {
    if (!/^\d{13,}@s\.whatsapp\.net$/.test(user)) continue;

    if (mode === "delete") {
      await conn.sendMessage(id, {
        text: `🚨 Bot join message deleted for @${user.split('@')[0]}`,
        mentions: [user]
      });
    } else if (mode === "warn") {
      global.warnings[user] = (global.warnings[user] || 0) + 1;
      const warns = global.warnings[user];

      await conn.sendMessage(id, {
        text: `🤖 *Bot Warning ${warns}/3* — @${user.split('@')[0]}`,
        mentions: [user]
      });

      if (warns >= 3) {
        await conn.groupParticipantsUpdate(id, [user], 'remove');
        delete global.warnings[user];
      }
    } else if (mode === "kick") {
      await conn.groupParticipantsUpdate(id, [user], 'remove');
    }
  }
});
