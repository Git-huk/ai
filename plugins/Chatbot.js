const axios = require('axios');
const { cmd } = require('../command');
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");

let AI_STATE = {
    IB: "false", // Inbox
    GC: "false"  // Group
};

cmd({
    pattern: "chatbot",
    alias: ["xylo"],
    desc: "Enable or disable AI chatbot responses",
    category: "ai",
    filename: __filename,
    react: "🤖"
}, async (conn, mek, m, { from, args, isOwner, reply }) => {
    if (!isOwner) return reply("❌ Only the bot owner can use this command.");

    const mode = args[0]?.toLowerCase();
    const target = args[1]?.toLowerCase();

    if (mode === "on") {
        if (!target || target === "all") {
            AI_STATE.IB = "true";
            AI_STATE.GC = "true";
        } else if (target === "pm") {
            AI_STATE.IB = "true";
        } else if (target === "gc") {
            AI_STATE.GC = "true";
        }
        await setConfig("AI_STATE", JSON.stringify(AI_STATE));
        return reply("✅ Xylo AI enabled for " + (target || "all") + " chats.");
    } else if (mode === "off") {
        if (!target || target === "all") {
            AI_STATE.IB = "false";
            AI_STATE.GC = "false";
        } else if (target === "pm") {
            AI_STATE.IB = "false";
        } else if (target === "gc") {
            AI_STATE.GC = "false";
        }
        await setConfig("AI_STATE", JSON.stringify(AI_STATE));
        return reply("❌ Xylo AI disabled for " + (target || "all") + " chats.");
    } else {
        return reply(`🤖 *Xylo AI Control Panel*\n\n` +
            `📥 PM: ${AI_STATE.IB === "true" ? "✅ On" : "❌ Off"}\n` +
            `👥 Group: ${AI_STATE.GC === "true" ? "✅ On" : "❌ Off"}\n\n` +
            `Usage:\n${config.PREFIX}chatbot on|off all|pm|gc`);
    }
});

// Load AI state on startup
(async () => {
    const saved = await getConfig("AI_STATE");
    if (saved) AI_STATE = JSON.parse(saved);
})();

cmd({
    on: "body"
}, async (conn, m, store, {
    from,
    body,
    isGroup,
    sender,
    reply
}) => {
    try {
        if (!body || m.key.fromMe || body.startsWith(config.PREFIX)) return;

        // Only respond if AI is enabled
        const allowed = isGroup ? AI_STATE.GC === "true" : AI_STATE.IB === "true";
        if (!allowed) return;

        // Only reply if message is replying to bot
        const quoted = m?.message?.extendedTextMessage?.contextInfo?.participant;
        const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
        if (quoted !== botJid) return;

        // Time/date shortcut
        const lower = body.toLowerCase();
        if (lower.includes("time") || lower.includes("date")) {
            const now = new Date();
            const current = now.toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            });
            return reply(`🕒 Current Time in Nigeria:\n${current}`);
        }

        // 🔗 Call AI backend
        const { data } = await axios.post('https://xylo-ai.onrender.com/ask', {
            userId: sender,
            message: body
        });

        if (data?.reply) {
            await conn.sendMessage(from, { text: data.reply }, { quoted: m });
        } else {
            reply("⚠️ No reply from Xylo.");
        }
    } catch (err) {
        console.error("AI Chat Error:", err.message);
        reply("⚠️ Xylo AI error occurred.");
    }
});
