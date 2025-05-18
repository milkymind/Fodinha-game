# ♠️ Fodinha Card Game

A modern web implementation of the traditional Brazilian card game **Fodinha** (also known as *Oh Hell!* or *Truco Paulista*), built with Next.js and React.

---

## 🎮 How to Play Fodinha

Fodinha is a **round-based trick-taking card game** with betting mechanics and elimination by lives. It's strategic, social, and gets more intense as the rounds progress.

### 🧠 Objective
Predict the number of **tricks** (round wins) you'll win each round. Get it wrong, and you lose lives.

---

### 🃏 Game Rules

#### 🪙 Starting Conditions
- Each player starts with **3 lives**
- In round 1, each player receives **1 card**
- The number of cards **increases each round**, then decreases again (like a bell curve)
- A random card determines the **manilha** (trump suit) each round

#### 🔮 Betting Phase
- Before playing, players bet how many tricks they expect to win
- Bets are made one player at a time
- **The last player to bet cannot guess the exact number needed to equal all tricks combined** (to prevent balanced bets)

#### ♠️ Playing Cards
- Players take turns playing one card per trick
- The **highest card** wins the trick
- Manilha (trump) cards **beat all other cards**, regardless of suit
- If two cards tie in value, **both are cancelled**
- If a trick is cancelled and nobody wins it, the **next trick is worth double**

#### 🎯 Scoring & Lives
- After all tricks are played, compare the number of tricks each player won to their bet
- For each trick you miss your bet by, **you lose that many lives**
- A player with **0 lives is eliminated**
- The last remaining player wins

#### 👁️ Special First-Round Rule
- In round 1, **you cannot see your own card**
- However, you **can see all other players’ cards**

---

## 🚀 Deployment Options

### ✅ Option 1: Deploy to Vercel (Recommended)

1. Fork or clone this repository to your GitHub account
2. Sign up at [https://vercel.com](https://vercel.com)
3. Connect your GitHub account to Vercel
4. Import this project repository
5. Click **Deploy**

📦 Note: The game uses in-memory storage. This means game data resets if the Vercel instance restarts.

### 🖥️ Option 2: Run Locally

#### Requirements
- Node.js installed on your machine
  
#### Steps

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/fodinha-card-game.git
cd fodinha-card-game

# Install dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build

# Run production server
npm run start
```

---

## ✨ Game Features
- PokerStars-style visual interface
- Animated card dealing, flipping, and discarding
- Player HUDs with:
  - Player names
  - Current bets
  - Lives remaining
  - Round wins
- Real-time round progress tracking
- Manilha (trump card) system
- Trick winner resolution
- Card tie logic & double trick rule
- Hidden self-card in round 1
- Room-based matchmaking system (coming soon)

---

## ⚙️ Tech Stack
- Next.js – Framework for React and fullstack logic
- React – UI library
- TypeScript – Type safety
- Tailwind CSS – Styling and layout
- Framer Motion – Smooth animations
- lowdb – Lightweight file-based JSON database for storage

---

## 📄 License

MIT License. Feel free to fork, remix, and improve the game.

Made with ❤️ for fans of Brazilian card games and good old-fashioned mind games.
