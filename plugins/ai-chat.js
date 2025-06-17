const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const config = require("../config");
const { setConfig, getConfig } = require("../lib/configdb");
const prefix = config.PREFIX;


cmd({
  pattern: "gpt",
  alias: ["x", "gpt4", "bing"],
  desc: "Chat with an AI model",
  category: "ai",
  react: "🤖",
  filename: __filename,
}, async (conn, mek, m, { from, args, q, reply, react }) => {
  try {
    if (!q) return reply(`Please provide a message for the AI.\nExample: ${prefix}ai Hello`);

    const dbPath = "./lib/ai-database.json";

    // Load database
    let db = {};
    if (fs.existsSync(dbPath)) {
      try {
        db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      } catch {
        db = {};
      }
    }

    const lowerQ = q.toLowerCase();

    // === Time & Date Queries ===
    const timeTriggers = [
      /\bwhat(?:'s|\s+is)?\s+(the\s+)?time\b/i,
      /\bcurrent\s+time\b/i,
      /\btime\s+now\b/i,
      /\bnow\s+time\b/i,
      /\btime\s+in\s+[a-z]+\b/i,
      /\bnow\s+in\s+[a-z]+\b/i,
      /\bcurrent\s+date\b/i,
      /\bdate\s+now\b/i,
      /\bwhat(?:'s|\s+is)?\s+(the\s+)?date\b/i,
      /\btoday'?s?\s+date\b/i,
    ];

    const conceptKeywords = ["what is", "define", "explain", "tell me about"];
    const timeKeywords = ["time", "date"];
    const timezoneMap = {
      afghanistan: "Asia/Kabul",
      pakistan: "Asia/Karachi",
      india: "Asia/Kolkata",
      nigeria: "Africa/Lagos",
      usa: "America/New_York",
      uk: "Europe/London",
      germany: "Europe/Berlin",
      japan: "Asia/Tokyo",
    };

    const isTimeRequest = timeTriggers.some((r) => r.test(lowerQ));
    const hasTimeKeyword = timeKeywords.some((k) => lowerQ.includes(k));
    const isConceptual = conceptKeywords.some((k) => lowerQ.includes(k));
    const matchedCountry = Object.keys(timezoneMap).find((c) => lowerQ.includes(c));
    const country = matchedCountry || "nigeria";

    if (isTimeRequest || (hasTimeKeyword && matchedCountry)) {
      const tz = timezoneMap[country];
      const now = new Date().toLocaleString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      return reply(`🕒 Current time in *${country.charAt(0).toUpperCase() + country.slice(1)}*: ${now}`);
    }

    if (hasTimeKeyword && isConceptual) {
      const concept = timeKeywords.find((k) => lowerQ.includes(k));
      const explanations = {
        time: "🕒 *Time* is the ongoing, continuous progression that helps us understand events and changes in our lives.",
        date: "📅 *Date* is a specific day within a calendar system used to organize and reference moments in time.",
      };
      return reply(explanations[concept] || "Let me explain that for you.");
    }

    // === Save & Recall User Info (names, favorites, etc) ===
    const infoPatterns = [
      { key: "myName", regex: /my name is ([\w\s]+)/i, friendlyName: "your name" },
      { key: "friendName", regex: /my friend(?:'s)? name is ([\w\s]+)/i, friendlyName: "your friend's name" },
      { key: "favoriteColor", regex: /my favorite color is ([\w\s]+)/i, friendlyName: "your favorite color" },
      { key: "hobby", regex: /my hobby is ([\w\s]+)/i, friendlyName: "your hobby" },
    ];

    let savedFields = [];

    for (const pattern of infoPatterns) {
      const match = q.match(pattern.regex);
      if (match && match[1]) {
        db[pattern.key] = match[1].trim();
        savedFields.push(pattern.friendlyName);
      }
    }

    if (savedFields.length > 0) {
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
      // Friendly confirmation message
      return reply(
        `Got it! I've updated ${savedFields.join(" and ")} in my memory.\nFeel free to ask me anytime!`
      );
    }

    // === Asking for saved info ===
    const askPatterns = [
      { key: "myName", questions: [/what(?:'s| is)? my name/i], responsePrefix: "Your name is" },
      { key: "friendName", questions: [/what(?:'s| is)? my friend's name/i], responsePrefix: "Your friend's name is" },
      { key: "favoriteColor", questions: [/what(?:'s| is)? my favorite color/i], responsePrefix: "Your favorite color is" },
      { key: "hobby", questions: [/what(?:'s| is)? my hobby/i], responsePrefix: "Your hobby is" },
    ];

    for (const item of askPatterns) {
      if (item.questions.some((rx) => rx.test(q))) {
        if (db[item.key]) {
          return reply(`${item.responsePrefix}: ${db[item.key]}`);
        } else {
          return reply(`I don't know ${item.responsePrefix.toLowerCase()} yet. You can tell me by saying, for example, "My ${item.key.replace(/([A-Z])/g, ' $1').toLowerCase()} is ..."`);
        }
      }
    }

    // === If no special case, send to GPT API ===
    const apiUrl = `https://lance-frank-asta.onrender.com/api/gpt?q=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl);

    if (!data || !data.message)
      return reply("🤖 Sorry, I couldn't get a response from the AI. Please try again later.");

    return reply(
      `🤖 ${data.message}\n\n╭─────────────────◆\n│ *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀᴠɪᴅx*\n╰─────────────────◆`
    );
  } catch (e) {
    console.error("Error in AI command:", e);
    reply("⚠️ Oops! Something went wrong while contacting the AI.");
  }
});



cmd({
    pattern: "openai",
    alias: ["chatgpt", "gpt3", "open-gpt"],
    desc: "Chat with OpenAI",
    category: "ai",
    react: "🧠",
    filename: __filename
},
async (conn, mek, m, { from, args, q, reply, react }) => {
    try {
        if (!q) return reply("Please provide a message for OpenAI.\nExample: `.openai Hello`");

        const apiUrl = `https://vapis.my.id/api/openai?q=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data || !data.result) {
            await react("❌");
            return reply("OpenAI failed to respond. Please try again later.");
        }

        await reply(`🧠 *OpenAI Response:*\n\n${data.result}`);
        await react("✅");
    } catch (e) {
        console.error("Error in OpenAI command:", e);
        await react("❌");
        reply("An error occurred while communicating with OpenAI.");
    }
});

cmd({
    pattern: "deepseek",
    alias: ["deep", "seekai"],
    desc: "Chat with DeepSeek AI",
    category: "ai",
    react: "🧠",
    filename: __filename
},
async (conn, mek, m, { from, args, q, reply, react }) => {
    try {
        if (!q) return reply("Please provide a message for DeepSeek AI.\nExample: `.deepseek Hello`");

        const apiUrl = `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data || !data.answer) {
            await react("❌");
            return reply("DeepSeek AI failed to respond. Please try again later.");
        }

        await reply(`🧠 *DeepSeek AI Response:*\n\n${data.answer}`);
        await react("✅");
    } catch (e) {
        console.error("Error in DeepSeek AI command:", e);
        await react("❌");
        reply("An error occurred while communicating with DeepSeek AI.");
    }
});


