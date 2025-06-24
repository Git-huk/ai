// 🔥 PROFESSIONAL WORD CHAIN GAME PLUGIN WITH AI SUPPORT + WORD SUGGESTIONS

const fs = require("fs");
const axios = require("axios");
const { cmd } = require("../command");
const config = require("../config");
const prefix = config.PREFIX;

const DB_PATH = "./lib/wcg-database.json";
const STATS_PATH = "./lib/wcg-stats.json";

const MAX_PLAYERS = 20;
const JOIN_TIMEOUT = 50000;
const TURN_TIMEOUT = 30000;

const startTimers = {};
const turnTimers = {};

function load(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function clearTimer(timerMap, id) {
  if (timerMap[id]) {
    clearTimeout(timerMap[id]);
    delete timerMap[id];
  }
}
async function isValidWord(word) {
  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    return Array.isArray(res.data);
  } catch {
    return false;
  }
}
async function getSuggestion(lastLetter, minLen) {
  try {
    const res = await axios.get(`https://api.datamuse.com/words?sp=${lastLetter}*&max=10`);
    const suggestions = res.data.map(x => x.word).filter(w => w.length >= minLen);
    for (let word of suggestions) {
      if (await isValidWord(word)) return word;
    }
    return null;
  } catch {
    return null;
  }
}
function getNextTurn(game) {
  return (game.turn + 1) % game.players.length;
}
function getLetterConstraints(mode) {
  if (mode === "hard") return { minLen: 5 };
  if (mode === "medium") return { minLen: 4 };
  return { minLen: 3 };
}
function updateStats(player, win = false) {
  const stats = load(STATS_PATH);
  if (!stats[player]) stats[player] = { wins: 0, losses: 0, played: 0 };
  stats[player].played++;
  if (win) stats[player].wins++;
  else stats[player].losses++;
  save(STATS_PATH, stats);
}
function emojiRank(rank) {
  return ["🥇", "🥈", "🥉"][rank] || "🏅";
}

function startGame(from, conn, reply) {
  const db = load(DB_PATH);
  const game = db[from];
  const botNumber = conn.user.id;

  game.waiting = false;
  game.turn = 0;
  game.lastWord = "";
  game.aiEnabled = game.players.length === 1;

  if (game.players[0] === botNumber) {
    const idx = game.players.findIndex(p => p !== botNumber);
    if (idx !== -1) [game.players[0], game.players[idx]] = [game.players[idx], game.players[0]];
  }

  const currentPlayer = game.players[game.turn];
  reply(`🎮 *Game Started!*\nMode: *${game.mode.toUpperCase()}*\nPlayers: ${game.players.map(p => "@" + p.split("@")[0]).join(", ")}\n🎯 First Turn: @${currentPlayer.split("@")[0]}`, null, {
    mentions: game.players
  });

  beginTurn(from, conn, reply);
}

async function beginTurn(from, conn, reply) {
  const db = load(DB_PATH);
  const game = db[from];
  const currentPlayer = game.players[game.turn];
  const { minLen } = getLetterConstraints(game.mode);

  clearTimer(turnTimers, from);

  if (game.aiEnabled && currentPlayer === conn.user.id) {
    setTimeout(async () => {
      const nextWord = await getSuggestion(game.lastWord ? game.lastWord.slice(-1) : "a", minLen);
      if (!nextWord) {
        reply(`🤖 AI gives up. You win!`);
        updateStats(game.players.find(p => p !== conn.user.id), true);
        delete db[from];
        save(DB_PATH, db);
        return;
      }
      game.lastWord = nextWord;
      reply(`🤖 *AI:* ${nextWord.toUpperCase()}`);
      game.turn = getNextTurn(game);
      save(DB_PATH, db);
      beginTurn(from, conn, reply);
    }, 2000);
    return;
  }

  reply(`🎯 @${currentPlayer.split("@")[0]}'s turn!\nSend a word starting with: *${game.lastWord ? game.lastWord.slice(-1).toUpperCase() : "ANY"}* (min ${minLen} letters)\n⏳ *${TURN_TIMEOUT / 1000}s left*`, null, {
    mentions: [currentPlayer]
  });

  turnTimers[from] = setTimeout(() => {
    reply(`⏰ Time's up! @${currentPlayer.split("@")[0]} eliminated!`, null, {
      mentions: [currentPlayer]
    });
    game.players.splice(game.turn, 1);
    if (game.players.length === 1) {
      const winner = game.players[0];
      reply(`🏆 Winner: @${winner.split("@")[0]}!`, null, { mentions: [winner] });
      updateStats(winner, true);
      delete db[from];
    } else {
      if (game.turn >= game.players.length) game.turn = 0;
      save(DB_PATH, db);
      beginTurn(from, conn, reply);
    }
    save(DB_PATH, db);
  }, TURN_TIMEOUT);

  save(DB_PATH, db);
}

// Start command
cmd({
  pattern: "wcg(?:\\s+(easy|medium|hard))?",
  desc: "Start Word Chain Game",
  category: "game",
  use: `${prefix}wcg [mode]`,
  filename: __filename
}, async (m, conn, match) => {
  const mode = match[1] || "easy";
  const from = m.chat;
  const sender = m.sender;

  const db = load(DB_PATH);
  if (!db[from]) {
    db[from] = {
      mode,
      host: sender,
      players: [sender],
      waiting: true
    };
    const reply = m.reply;
    reply(`🎉 Word Chain Game started in *${mode.toUpperCase()}* mode!\nType *join* to enter.\n⏳ Game starts in ${JOIN_TIMEOUT / 1000}s.`);

    clearTimer(startTimers, from);
    startTimers[from] = setTimeout(() => {
      if (db[from].players.length === 0) {
        m.reply("❌ No players joined.");
        delete db[from];
        save(DB_PATH, db);
        return;
      }
      startGame(from, conn, m.reply);
    }, JOIN_TIMEOUT);
    save(DB_PATH, db);
  } else {
    m.reply("⚠️ A game is already active in this chat.");
  }
});

// Join command
cmd({ pattern: "join", desc: "Join Word Chain Game", filename: __filename }, async (m, conn) => {
  const from = m.chat;
  const db = load(DB_PATH);
  const game = db[from];
  if (!game || !game.waiting) return m.reply("❌ No game to join.");
  if (game.players.includes(m.sender)) return m.reply("⚠️ You're already in.");
  if (game.players.length >= MAX_PLAYERS) return m.reply("🚫 Game full.");
  game.players.push(m.sender);
  save(DB_PATH, db);
  m.reply(`✅ @${m.sender.split("@")[0]} joined!`, null, { mentions: [m.sender] });
});

// In-game message handler
cmd({ on: "text" }, async (m, conn) => {
  const from = m.chat;
  const db = load(DB_PATH);
  const game = db[from];
  const text = m.body?.trim().toLowerCase();
  const sender = m.sender;

  if (!game || game.waiting || game.players[game.turn] !== sender || !text) return;

  const { minLen } = getLetterConstraints(game.mode);

  if (!/^[a-zA-Z]+$/.test(text)) return m.reply("⚠️ Only letters allowed.");
  if (text.length < minLen) return m.reply(`❗ Word must be at least ${minLen} letters.`);
  if (game.lastWord && text[0] !== game.lastWord.slice(-1)) return m.reply(`❌ Word must start with *${game.lastWord.slice(-1)}*`);

  if (!(await isValidWord(text))) {
    return m.reply("❌ Invalid word. Try again!");
  }

  m.reply(`✅ Word *${text.toUpperCase()}* accepted!`);
  game.lastWord = text;
  game.turn = getNextTurn(game);
  save(DB_PATH, db);
  beginTurn(from, conn, m.reply);
});

// Stats
cmd({ pattern: "wcg-stats", desc: "Your WCG stats", filename: __filename }, async (m) => {
  const stats = load(STATS_PATH);
  const userStats = stats[m.sender];
  if (!userStats) return m.reply("No stats yet. Play a game!");
  const { wins, losses, played } = userStats;
  m.reply(`📊 *Your Stats*\nPlayed: ${played}\nWins: ${wins}\nLosses: ${losses}`);
});

// Leaderboard
cmd({ pattern: "leaderboard", desc: "WCG Leaderboard", filename: __filename }, async (m) => {
  const stats = load(STATS_PATH);
  const sorted = Object.entries(stats).sort((a, b) => b[1].wins - a[1].wins).slice(0, 10);
  if (!sorted.length) return m.reply("No data yet.");
  const list = sorted.map(([id, s], i) => `${emojiRank(i)} @${id.split("@")[0]} - ${s.wins} Wins`).join("\n");
  m.reply(`🏆 *Leaderboard*\n\n${list}`, null, {
    mentions: sorted.map(([id]) => id)
  });
});
