const fs = require("fs");
const { cmd, commands } = require('../command');
const config = require('../config');
const axios = require('axios');
const prefix = config.PREFIX;
const AdmZip = require("adm-zip");
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, sleep, fetchJson } = require('../lib/functions2');
const { writeFileSync } = require('fs');
const path = require('path');
const { getAnti, setAnti } = require('../data/antidel');
const { exec } = require('child_process');
const FormData = require('form-data');
const { setConfig, getConfig } = require("../lib/configdb");
const {sleepp} = require('../lib/functions')
const { Octokit } = require("@octokit/rest");

cmd({
  pattern: "deletechat",
  desc: "Delete all deletable messages in a chat",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, {
  reply,
  isOwner
}) => {
  if (!isOwner) return reply("❌ Only owner can use this command.");

  const jid = m.chat;

  try {
    const messages = await conn.loadMessages(jid, 100);
    const deletable = messages.messages.filter(msg =>
      msg?.key?.id &&
      msg.key.remoteJid &&
      (msg.key.fromMe || msg.key.participant)
    );

    if (!deletable.length) return reply("❎ No deletable messages found.");

    for (const msg of deletable) {
      try {
        await conn.sendMessage(msg.key.remoteJid, {
          delete: {
            id: msg.key.id,
            remoteJid: msg.key.remoteJid,
            fromMe: msg.key.fromMe || false,
            participant: msg.key.participant || msg.key.remoteJid
          }
        });
      } catch (e) {
        console.log("❌ Failed to delete one message:", e.message);
      }
    }

    await reply(`✅ Deleted ${deletable.length} messages.`);
  } catch (err) {
    console.error("❌ deletechat error:", err);
    reply("⚠️ Something went wrong.");
  }
});



cmd({
  pattern: "showmenu",
  hidden: true
}, async (conn, mek, m, { args, from }) => {
  const category = args[0];
  const cmdsInCat = commands.filter(cmd => cmd.category === category);

  if (!cmdsInCat.length) {
    return conn.sendMessage(from, { text: `❌ No commands found in '${category}'` }, { quoted: m });
  }

  let text = `📂 *Commands in ${category.toUpperCase()}*\n\n`;

  for (const cmd of cmdsInCat) {
    text += `➤ ${cmd.pattern}\n`;
  }

  await conn.sendMessage(from, { text }, { quoted: m });
});

cmd({
  pattern: "btn",
  desc: "Show smart button menu",
  category: "tools",
  filename: __filename
}, async (conn, mek, m, { from }) => {

  const picUrl = "https://i.postimg.cc/G3k8H6gC/IMG-20250603-WA0017.jpg";

  const filtered = commands.filter(cmd =>
    !["menu", "xbot", "misc"].includes(cmd.category)
  );

  const categories = [...new Set(filtered.map(cmd => cmd.category))];

  const sections = categories.map((cat, index) => {
    const section = {
      rows: [
        {
          header: 'Menu',
          title: cat.charAt(0).toUpperCase() + cat.slice(1),
          description: `${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
          id: `${prefix}showmenu ${cat}`
        }
      ]
    };

    if (index === 0) {
      section.title = "Select a menu";
      section.highlight_label = '𝐦𝐨𝐝𝐞𝐫𝐚𝐭𝐢𝐨𝐧 𝐦𝐞𝐧𝐮';
    }

    return section;
  });

  // اگر پیام دکمه‌ای هست، همینجا هندل کن
  const buttonText = m.text?.toLowerCase();
  if (buttonText === `${prefix}Ping` || buttonText === `${prefix}ping`) {
    const start = new Date().getTime();

    const reactionEmojis = ['🔥', '⚡', '🚀', '💨', '🎯', '🎉', '🌟', '💥', '🕐', '🔹'];
    const textEmojis = ['💎', '🏆', '⚡️', '🚀', '🎶', '🌠', '🌀', '🔱', '🛡️', '✨'];

    const reactionEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
    let textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];
    while (textEmoji === reactionEmoji) {
      textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];
    }

    await conn.sendMessage(from, {
      react: { text: textEmoji, key: mek.key }
    });

    const end = new Date().getTime();
    const responseTime = (end - start) / 1000;

    const text = `> *XBOT-MD SPEED: ${responseTime.toFixed(2)}ms ${reactionEmoji}*`;

    return await conn.sendMessage(from, {
      text: text
    }, { quoted: mek });
  }

  if (buttonText === "Alive" || buttonText === `${prefix}alive`) {
    return await conn.sendMessage(from, {
      text: "*✅ I am alive and ready to serve you!*"
    }, { quoted: mek });
  }

  // اگر دستور دکمه نبود، منوی دکمه‌ای را بفرست
  await conn.sendMessage(from, {
    image: { url: picUrl },
    caption: "📋 *Main Menu*\n\nSelect a category from the menu below.",
    footer: "> New menu - 2025",
    buttons: [
      {
        buttonId: `${prefix}ping`,
        buttonText: { displayText: 'PING' },
        type: 1
      },
      {
        buttonId: `${prefix}alive`,
        buttonText: { displayText: 'ALIVE' },
        type: 1
      },
      {
        buttonId: `${prefix}flow-menu`,
        buttonText: { displayText: '📋 Show Categories' },
        type: 4,
        nativeFlowInfo: {
          name: 'single_select',
          paramsJson: JSON.stringify({
            title: 'Select Menu',
            sections: sections
          })
        }
      }
    ],
    headerType: 4,
    viewOnce: true
  }, { quoted: m });
});

