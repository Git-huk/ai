const fs = require("fs");
const axios = require("axios");
const { cmd } = require("../command");
const config = require("../config");

const DB_PATH = "./lib/wcg-database.json";
const STATS_PATH = "./lib/wcg-stats.json";

const timers = {};
const startTimers = {};
const cooldowns = {};

const WAIT_TIME = 30;
const MAX_PLAYERS = 20;

const modes = {
  easy: { turnTime: 40, baseLength: 3, lengthIncrementEveryRounds: 4 },
  medium: { turnTime: 30, baseLength: 3, lengthIncrementEveryRounds: 2 },
  hard: { turnTime: 25, baseLength: 4, lengthIncrementEveryRounds: 1 },
};

function load(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, "utf-8") || "{}");
}
function save(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

async function isValidWord(word) {
  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    return Array.isArray(res.data);
  } catch {
    return false;
  }
}

function getWordLengthForTurn(game) {
  const modeData = modes[game.mode] || modes.medium;
  const increments = Math.floor(game.roundsCompleted / modeData.lengthIncrementEveryRounds);
  return modeData.baseLength + increments;
}

function updateStats(player, win, wordCount, roundCount) {
  const stats = load(STATS_PATH);
  if (!stats[player]) stats[player] = { wins: 0, words: 0, rounds: 0 };
  if (win) stats[player].wins += 1;
  stats[player].words += wordCount;
  stats[player].rounds += roundCount;
  save(STATS_PATH, stats);
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

function isPatternRepeated(word) {
  return /^([a-zA-Z])\1+$/.test(word);
}

function isBot(user) {
  return user === config.BOT_NUMBER || user.endsWith("@g.us") === false;
}

function formatScoreboard(players) {
  return players.map((p, i) => `🥇 ${i + 1}. @${p.split("@")[0]}`).join("\n");
}

cmd({
  pattern: "wcg",
  desc: "Start word chain game",
  category: "game",
  filename: __filename
}, async (m, text, { isGroup }) => {
  const chatId = m.chat;
  const sender = m.sender;
  const args = text.split(" ");
  const mode = (args[0] || "medium").toLowerCase();

  if (!m.isGroup && isBot(sender)) {
    return m.reply("🔒 You can't control me in private chat, but you can still play if a game is active.");
  }

  if (!["easy", "medium", "hard"].includes(mode)) {
    return m.reply("⚠️ Invalid mode. Choose: easy, medium, hard.");
  }

  const db = load(DB_PATH);
  if (db[chatId]) return m.reply("⛔ A game is already running in this chat.");

  db[chatId] = {
    players: [sender],
    turn: 0,
    round: 1,
    roundsCompleted: 0,
    usedWords: [],
    lastWord: null,
    mode,
    started: false,
  };
  save(DB_PATH, db);

  m.reply(`🧠 Word Chain Game started in *${mode}* mode!\n⏳ You have ${WAIT_TIME}s to join.\n\nSend *join* to participate!`);

  startTimers[chatId] = setTimeout(() => {
    startGame(chatId, m);
  }, WAIT_TIME * 1000);
});

async function startGame(chatId, m) {
  const db = load(DB_PATH);
  const game = db[chatId];
  if (!game || game.players.length < 2) {
    delete db[chatId];
    save(DB_PATH, db);
    return m.reply("❌ Not enough players to start the game.");
  }

  game.started = true;
  game.turn = 1; // Start from second user, bot never starts
  game.roundsCompleted = 0;
  game.usedWords = [];
  game.lastWord = null;

  save(DB_PATH, db);
  m.reply(`🎮 Game started with ${game.players.length} players!\n${formatScoreboard(game.players)}`);
  nextTurn(chatId, m);
}

async function nextTurn(chatId, m) {
  const db = load(DB_PATH);
  const game = db[chatId];
  if (!game) return;

  clearTurnTimer(chatId);

  const currentPlayer = game.players[game.turn % game.players.length];
  const minLength = getWordLengthForTurn(game);
  const prefix = game.lastWord ? game.lastWord.slice(-1) : null;

  m.reply(`🕒 @${currentPlayer.split("@")[0]}'s turn!\n${prefix ? `Your word must start with *${prefix}*` : `Start with any word`}\n🔠 Minimum length: *${minLength}*`, {
    mentions: [currentPlayer]
  });

  timers[chatId] = setTimeout(() => {
    eliminatePlayer(chatId, currentPlayer, m, "⏱️ Time's up!");
  }, (modes[game.mode] || modes.medium).turnTime * 1000);
}

async function eliminatePlayer(chatId, player, m, reason) {
  const db = load(DB_PATH);
  const game = db[chatId];
  if (!game) return;

  game.players = game.players.filter(p => p !== player);
  m.reply(`❌ @${player.split("@")[0]} eliminated. ${reason}`, { mentions: [player] });

  if (game.players.length === 1) {
    const winner = game.players[0];
    m.reply(`🎉 @${winner.split("@")[0]} wins the game!\n🏆 GG!`, { mentions: [winner] });
    updateStats(winner, true, game.usedWords.length, game.roundsCompleted);
    delete db[chatId];
    clearTurnTimer(chatId);
    save(DB_PATH, db);
    return;
  }

  game.turn = game.turn % game.players.length;
  game.roundsCompleted++;
  save(DB_PATH, db);
  nextTurn(chatId, m);
}

cmd({
  on: "text"
}, async (m) => {
  const chatId = m.chat;
  const sender = m.sender;
  const text = m.text?.trim().toLowerCase();
  if (!text || text.length < 2) return;

  const db = load(DB_PATH);
  const game = db[chatId];
  if (!game || !game.started) return;

  const currentPlayer = game.players[game.turn % game.players.length];
  if (sender !== currentPlayer) return;

  if (!/^[a-z]+$/i.test(text)) {
    return m.reply("⚠️ Please send a valid English word with letters only.");
  }

  if (game.usedWords.includes(text)) {
    return m.reply("⚠️ Word already used! Try something new.");
  }

  if (isPatternRepeated(text)) {
    return m.reply("🚨 No cheating! Repeated patterns are not allowed.");
  }

  if (game.lastWord && text[0] !== game.lastWord.slice(-1)) {
    return m.reply(`❌ Your word must start with *${game.lastWord.slice(-1)}*`);
  }

  const minLength = getWordLengthForTurn(game);
  if (text.length < minLength) {
    return m.reply(`✏️ Word too short! Minimum: ${minLength} letters.`);
  }

  const isReal = await isValidWord(text);
  if (!isReal) return m.reply("❌ Not a real English word!");

  clearTurnTimer(chatId);
  game.usedWords.push(text);
  game.lastWord = text;
  game.turn = (game.turn + 1) % game.players.length;
  game.roundsCompleted++;
  save(DB_PATH, db);

  m.reply("✅ Nice word! Next player...");
  nextTurn(chatId, m);
});

cmd({
  pattern: "join",
  desc: "Join an active word chain game",
  category: "game",
  filename: __filename
}, async (m) => {
  const chatId = m.chat;
  const sender = m.sender;
  const db = load(DB_PATH);
  const game = db[chatId];

  if (!game || game.started) return;
  if (game.players.includes(sender)) return m.reply("🔁 You already joined.");
  if (game.players.length >= MAX_PLAYERS) return m.reply("😥 Game is full.");

  game.players.push(sender);
  save(DB_PATH, db);
  m.reply(`✅ @${sender.split("@")[0]} joined the game! (${game.players.length}/${MAX_PLAYERS})`, {
    mentions: [sender]
  });
});
