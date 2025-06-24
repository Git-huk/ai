const { getLinkDetectionMode } = require("../linkDetection");
const { incrementWarning, resetWarning } = require("../warnings");

const setupLinkDetection = (sock) => {
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const message of messages) {
      const groupJid = message.key.remoteJid;
      if (!groupJid.endsWith("@g.us") || message.key.fromMe) continue;

      const mode = getLinkDetectionMode(groupJid);
      if (!mode || mode === "off") return;

      const msgText =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        "";

      const linkRegex =
        /(?:https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9]+\.[a-zA-Z]{2,}/gi;
      if (!linkRegex.test(msgText)) return;

      const participant = message.key.participant || message.participant;

      const groupMetadata = await sock.groupMetadata(groupJid);
      const isAdmins = groupMetadata.participants.some(
        (member) => member.id === participant && member.admin
      );

      if (isAdmins) {
        console.log(`✅ Ignoring admin: ${participant}`);
        return;
      }

      // ✅ Delete the message (always)
      await sock.sendMessage(groupJid, { delete: message.key });

      if (mode === "delete") {
        await sock.sendMessage(groupJid, {
          text:
            `🛡️ *ANTILINK: Message Deleted*\n` +
            `@${participant.split("@")[0]}, links are not allowed.`,
          mentions: [participant],
        });
        return;
      }

      if (mode === "warn") {
        const count = incrementWarning(groupJid, participant);
        await sock.sendMessage(groupJid, {
          text:
            `⚠️ *ANTILINK VIOLATION*\n` +
            `> @${participant.split("@")[0]} sent a link.\n\n` +
            `*Warning ${count}/3*\n` +
            `_You will be removed after 3 warnings._\n\n` +
            `╭─────────────\n` +
            `│  🛡 X-BOT SYSTEM\n` +
            `╰─────────────◆`,
          mentions: [participant],
        });

        if (count >= 3) {
          await sock.groupParticipantsUpdate(groupJid, [participant], "remove");
          await sock.sendMessage(groupJid, {
            text:
              `🚫 @${participant.split("@")[0]} was *removed* for repeated link violations.\n` +
              `╭─────────────\n│  ⚠ ENFORCED\n╰─────────────◆`,
            mentions: [participant],
          });
          resetWarning(groupJid, participant);
        }
      } else if (mode === "kick") {
        await sock.groupParticipantsUpdate(groupJid, [participant], "remove");
        await sock.sendMessage(groupJid, {
          text:
            `🚨 *ANTILINK ENFORCED*\n` +
            `@${participant.split("@")[0]} was removed *immediately* for sending a link.`,
          mentions: [participant],
        });
      }
    }
  });
};

module.exports = { setupLinkDetection };
