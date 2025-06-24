const fs = require("fs");
const axios = require("axios");
const { cmd } = require('../command');

const dbPath = "./lib/wcg-database.json";
const timers = {};
const startTimers = {};

function loadDB() {
  if (!fs.existsSync(dbPath)) return {};
  return JSON.parse(fs.readFileSync(dbPath, "utf-8") || "{}");
}

function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function isValidWord(word) {
  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    return Array.isArray(res.data);
  } catch {
    return false;
  }
}

function clearStartTimer(chatId) {
  if (startTimers[chatId]) {
    clearTimeout(startTimers[chatId]);
    delete startTimers[chatId];
  }
}

function clearTurnTimer(chatId) {
  if (timers[chatId]) {
    clearTimeout(timers[chatId]);
    delete timers[chatId];
  }
}

cmd({
  pattern: "wcg",
  desc: "Start a Word Chain Game",
  category: "game",
  filename: __filename
}, async (conn, mek, m, { from, reply, sender }) => {
  const db = loadDB();

  if (db[from] && !db[from].finished) {
    return reply("⚠️ A Word Chain game is already active. Send *join-wcg* to join!");
  }

  db[from] = {
    type: "wcg",
    players: [sender],
    words: [],
    turn: 0,
    waiting: true,
    finished: false,
    wordLimit: 3,
  };

  saveDB(db);

  reply(
    `🎮 *Word Chain Game Started!*\n👤 Player 1: @${sender.split("@")[0]}\n⏳ Waiting for more players (max 20)...\nSend *join-wcg* to join.\n\n⏰ The game will start automatically in 40 seconds.`,
    null,
    { mentions: [sender] }
  );

  clearStartTimer(from);
  startTimers[from] = setTimeout(() => {
    const db = loadDB();
    if (!db[from] || db[from].finished) return;
    const game = db[from];
    if (game.waiting) {
      if (game.players.length < 2) {
        conn.sendMessage(from, { text: "⚠️ Not enough players joined. Game cancelled." });
        delete db[from];
        saveDB(db);
        return;
      }
      game.waiting = false;
      game.turn = 0;
      const randomLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      game.requiredFirstLetter = randomLetter;

      saveDB(db);

      conn.sendMessage(from, {
        text: `⏳ Time's up! Game starting with ${game.players.length} player(s).\n🧠 *Word Chain Begins!*\n🎯 @${game.players[0].split("@")[0]} starts.\n🔤 First letter: *${randomLetter.toUpperCase()}*\n📌 Send an English word starting with *${randomLetter.toUpperCase()}* and at least *3 letters*. Good luck!`,
        mentions: game.players
      });

      clearStartTimer(from);

      clearTurnTimer(from);
      timers[from] = setTimeout(() => handleTimeout(conn, from), 40 * 1000);
    }
  }, 40 * 1000);
});

cmd({
  pattern: "join-wcg",
  desc: "Join a Word Chain Game",
  category: "game",
  filename: __filename
}, async (conn, mek, m, { from, sender, reply }) => {
  const db = loadDB();
  const game = db[from];

  if (!game || game.type !== "wcg") return reply("❌ No active Word Chain game to join.");
  if (!game.waiting) return reply("⚠️ Game already started, cannot join now.");
  if (game.players.includes(sender)) return reply("⚠️ You already joined the game.");
  if (game.players.length >= 20) return reply("⚠️ Player limit reached (20).");

  game.players.push(sender);
  saveDB(db);

  reply(
    `🙌 @${sender.split("@")[0]} joined the game! (${game.players.length} player(s) now)\n⏳ The game will start automatically 40 seconds after the first player started the game.`,
    null,
    { mentions: game.players }
  );
});

cmd({
  pattern: "leave-wcg",
  desc: "Leave the Word Chain Game",
  category: "game",
  filename: __filename
}, async (conn, mek, m, { from, sender, reply }) => {
  const db = loadDB();
  const game = db[from];
  if (!game || game.type !== "wcg") return reply("❌ No active Word Chain game to leave.");
  if (!game.players.includes(sender)) return reply("⚠️ You are not part of the current game.");

  // Remove player
  game.players = game.players.filter(p => p !== sender);

  // If no players left, cancel game
  if (game.players.length === 0) {
    delete db[from];
    saveDB(db);
    return reply("✅ You left the game. No players remain, game cancelled.");
  }

  // If it’s the current player’s turn, advance turn
  if (game.turn >= game.players.length) game.turn = 0;

  saveDB(db);
  reply(`✅ @${sender.split("@")[0]} left the game. ${game.players.length} player(s) remain.`, null, { mentions: game.players });

  // If game was waiting and now only one player left, cancel game
  if (game.waiting && game.players.length === 1) {
    delete db[from];
    saveDB(db);
    return conn.sendMessage(from, { text: "⚠️ Only one player remains. Game cancelled." });
  }
});

cmd({
  pattern: "status-wcg",
  desc: "Check Word Chain Game status",
  category: "game",
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
  const db = loadDB();
  const game = db[from];
  if (!game || game.type !== "wcg") return reply("❌ No active Word Chain game.");

  let status = `🎮 *Word Chain Game Status*\n`;
  status += `Players (${game.players.length}):\n`;
  for (let i = 0; i < game.players.length; i++) {
    status += `- ${i === game.turn ? "👉 " : ""}@${game.players[i].split("@")[0]}\n`;
  }
  status += `Words used (${game.words.length}): ${game.words.join(", ") || "None"}\n`;
  status += game.waiting ? "⏳ Waiting for players to join...\n" : `🕹️ Game in progress. Next turn: @${game.players[game.turn].split("@")[0]}\n`;
  status += `Minimum word length: ${game.wordLimit}\n`;
  reply(status, null, { mentions: game.players });
});

cmd({
  pattern: ".*",
  dontAddCommandList: true,
  fromMe: false,
  filename: __filename
}, async (conn, mek, m, { from, sender, body, reply }) => {
  const text = (body || "").trim().toLowerCase();
  const db = loadDB();
  const game = db[from];
  if (!game || game.type !== "wcg" || game.finished || game.waiting) return;

  const currentPlayer = game.players[game.turn];
  if (currentPlayer !== sender) return; // Not your turn

  if (!/^[a-z]{2,}$/.test(text)) return reply("⚠️ Only alphabetic English words are allowed.");
  if (text.length < game.wordLimit) return reply(`📏 Word must be at least *${game.wordLimit}* letters.`);
  if (game.words.includes(text)) return reply("♻️ Word already used!");
  if (!(await isValidWord(text))) return reply("❌ Not a valid English word!");

  if (game.words.length > 0) {
    const lastWord = game.words[game.words.length - 1];
    if (lastWord[lastWord.length - 1] !== text[0]) {
      return reply(`🔁 Word must start with *${lastWord[lastWord.length - 1].toUpperCase()}*`);
    }
  } else {
    if (text[0] !== game.requiredFirstLetter) {
      return reply(`🔤 First word must start with *${game.requiredFirstLetter.toUpperCase()}*`);
    }
  }

  game.words.push(text);
  game.turn = (game.turn + 1) % game.players.length;
  game.wordLimit = Math.min(game.wordLimit + 1, 7);
  game.lastMoveTime = Date.now();

  clearTurnTimer(from);
  timers[from] = setTimeout(() => handleTimeout(conn, from), 40 * 1000);

  saveDB(db);

  reply(
    `✅ *${text}* accepted!\n🧮 Words used: *${game.words.length}*\n🔠 Next word must start with *${text[text.length - 1].toUpperCase()}*\n➡️ @${game.players[game.turn].split("@")[0]}, your turn!\n📏 Min word length: *${game.wordLimit}*\n⏳ You have 40 seconds.`,
    null,
    { mentions: game.players }
  );
});

async function handleTimeout(conn, from) {
  const db = loadDB();
  if (!db[from]) return;
  const game = db[from];
  if (game.finished) return;

  const loser = game.players[game.turn];
  game.players.splice(game.turn, 1);

  await conn.sendMessage(from, {
    text: `⌛ *Timeout!*\n@${loser.split("@")[0]} did not respond and was eliminated.`,
    mentions: [loser]
  });

  if (game.players.length === 1) {
    game.finished = true;
    await conn.sendMessage(from, {
      text: `🏆 *Game Over!*\n🎉 Winner: @${game.players[0].split("@")[0]}`,
      mentions: game.players
    });
    clearTurnTimer(from);
    clearStartTimer(from);
    delete db[from];
    saveDB(db);
    return;
  }

  if (game.turn >= game.players.length) game.turn = 0;

  const lastWord = game.words[game.words.length - 1];
  const nextLetter = lastWord[lastWord.length - 1];

  clearTurnTimer(from);
  timers[from] = setTimeout(() => handleTimeout(conn, from), 40 * 1000);

  saveDB(db);

  await conn.sendMessage(from, {
    text: `➡️ It's @${game.players[game.turn].split("@")[0]}'s turn\n🔠 Word must start with *${nextLetter.toUpperCase()}*\n📏 Minimum length: *${game.wordLimit}*\n⏳ You have 40 seconds.`,
    mentions: [game.players[game.turn]]
  });
}
