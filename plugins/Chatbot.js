const axios = require('axios');
const { cmd, commands } = require('../command');
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");

// Default AI states
let AI_STATE = {
    IB: "false", // Inbox chats
    GC: "false"  // Group chats
};

cmd({
    pattern: "chatbot",
    alias: ["xylo"],
    desc: "Enable or disable AI chatbot responses",
    category: "ai",
    filename: __filename,
    react: "✅"
}, async (conn, mek, m, { from, args, isOwner, reply, prefix }) => {
    if (!isOwner) return reply("Command reserved for owner only*");
    const commandPrefix = config.PREFIX;

    const mode = args[0]?.toLowerCase();
    const target = args[1]?.toLowerCase();

    if (mode === "on") {
        if (!target || target === "all") {
            AI_STATE.IB = "true";
            AI_STATE.GC = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for both inbox and group chats*");
        } else if (target === "pm") {
            AI_STATE.IB = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for inbox chats*");
        } else if (target === "gc") {
            AI_STATE.GC = "true";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now enabled for group chats*");
        }
    } else if (mode === "off") {
        if (!target || target === "all") {
            AI_STATE.IB = "false";
            AI_STATE.GC = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for both inbox and group chats*");
        } else if (target === "pm") {
            AI_STATE.IB = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for inbox chats*");
        } else if (target === "gc") {
            AI_STATE.GC = "false";
            await setConfig("AI_STATE", JSON.stringify(AI_STATE));
            return reply("*Xylo is now disabled for group chats*");
        }
    } else {
        return reply(`*Ai command assist*

*CURRENT MODE* IB-: ${AI_STATE.IB === "true" ? "ON" : "OFF"}
*CURRENT MODE* GC-: ${AI_STATE.GC === "true" ? "ON" : "OFF"}
            
> ${commandPrefix}chatbot on all - Enable AI in all chats
> ${commandPrefix}chatbot on pm - Enable AI in inbox only
> ${commandPrefix}chatbot on gc - Enable AI in groups only
*Disable Settings ❌*
> ${commandPrefix}chatbot off all - Disable AI in all chats
> ${commandPrefix}chatbot off pm - Disable AI in inbox only
> ${commandPrefix}chatbot off gc - Disable AI in groups only`);
    }
});

// Initialize AI state on startup
(async () => {
    const savedState = await getConfig("AI_STATE");
    if (savedState) AI_STATE = JSON.parse(savedState);
})();

// AI Chatbot by DavidX — now powered by your own backend
cmd({
    on: "body"
}, async (conn, m, store, {
    from,
    body,
    sender,
    isGroup,
    isBotAdmins,
    isAdmins,
    reply,
    quotedMsg
}) => {
    try {
        // Only reply to messages that reply to the bot
        if (!m?.message?.extendedTextMessage?.contextInfo?.participant) return;

        const repliedTo = m.message.extendedTextMessage.contextInfo.participant;
        const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
        if (repliedTo !== botJid) return;

        // Respect AI enable state
        const isInbox = !isGroup;
        if ((isInbox && AI_STATE.IB !== "true") || (isGroup && AI_STATE.GC !== "true")) return;

        // Skip if it's a command or from bot
        if (!body || m.key.fromMe || body.startsWith(config.PREFIX)) return;

        // Special case: date or time
        const lowerBody = body.toLowerCase();
        if (lowerBody.includes('time') || lowerBody.includes('date')) {
            const now = new Date();
            const options = { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                timeZone: 'Africa/Lagos', timeZoneName: 'short'
            };
            const currentDateTime = now.toLocaleDateString('en-US', options);
            return reply(`📅 *Current Date & Time (Nigeria)*:\n${currentDateTime}`);
        }

        // Send message to your Render backend AI
        const res = await axios.post('https://xylo-ai.onrender.com/ask', {
            userId: sender,
            message: body
        });

        const aiReply = res.data.reply || "❌ AI didn't respond.";
        await conn.sendMessage(from, { text: aiReply }, { quoted: m });

    } catch (err) {
        console.error("AI Chatbot Error:", err.message);
        reply("❌ AI error. Please try again later.");
    }
});
