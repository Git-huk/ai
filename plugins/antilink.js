const { cmd } = require("../command");
const {
  enableLinkDetection,
  disableLinkDetection,
  getLinkDetectionMode
} = require("../lib/linkDetection");

cmd({
  pattern: "antilinkop",
  desc: "Interactive menu to configure anti-link settings",
  category: "security",
  filename: __filename
}, async (conn, mek, m, {
  from, isGroup, isAdmins, isBotAdmins, isCreator, reply
}) => {
  if (!isGroup) return reply("*❌ This command can only be used in groups!*");
  if (!isBotAdmins) return reply("*❌ I must be an admin to use this feature!*");
  if (!isAdmins && !isCreator) return reply("*❌ You must be a group admin or bot owner to use this!*");

  const current = getLinkDetectionMode(from) || "off";

  const menuText =
    `> *ANTILINK SETTINGS*\n` +
    `> Current Mode: *${current.toUpperCase()}*\n\n` +
    `*Reply with one of the following:*\n\n` +
    `1. 🗑️ Delete only\n` +
    `2. ⚠️ Warn (3 strikes → kick)\n` +
    `3. 🚫 Kick instantly\n` +
    `4. ❌ Turn off\n\n` +
    `╭───────────────\n│  🛡 X-BOT MODERATION\n╰───────────────◆`;

  const sent = await conn.sendMessage(from, {
    image: { url: "https://i.postimg.cc/rFV2pJW5/IMG-20250603-WA0017.jpg" },
    caption: menuText
  }, { quoted: mek });

  const msgId = sent.key.id;

  const handler = async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedId !== msgId) return;

    const response =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    const options = {
      "1": "delete",
      "2": "warn",
      "3": "kick",
      "4": "off"
    };

    const chosen = options[response.trim()];
    if (!chosen) {
      await conn.sendMessage(from, { text: "❌ Invalid option. Reply with 1, 2, 3 or 4." }, { quoted: msg });
      return;
    }

    if (chosen === "off") {
      disableLinkDetection(from);
      await conn.sendMessage(from, {
        text: "❌ Antilink has been *disabled* in this group.",
      }, { quoted: msg });
    } else {
      enableLinkDetection(from, chosen);
      await conn.sendMessage(from, {
        text: `✅ Antilink is now set to *${chosen.toUpperCase()}* mode.`,
      }, { quoted: msg });
    }

    conn.ev.off("messages.upsert", handler);
  };

  conn.ev.on("messages.upsert", handler);
  setTimeout(() => conn.ev.off("messages.upsert", handler), 600_000);
});
