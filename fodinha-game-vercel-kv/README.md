# ♠️ Fodinha Card Game

A multiplayer online implementation of the Brazilian card game "Fodinha".

## Deployment Instructions for Vercel

This game uses Vercel KV (Redis) for persistently storing game state across serverless function invocations. Follow these steps for a successful deployment:

### 1. Set Up Vercel KV

To use Vercel KV (required for production):

1. Install Vercel CLI: `npm i -g vercel`
2. Login to Vercel: `vercel login`
3. Enable Vercel KV in your project:
   ```
   vercel kv add
   ```
4. Follow the prompts to create a new KV database
5. Link your local project to Vercel: `vercel link`

### 2. Environment Variables

Make sure these environment variables are configured in your Vercel dashboard:

- `KV_URL` - Connection URL for Vercel KV
- `KV_REST_API_URL` - REST API URL for Vercel KV
- `KV_REST_API_TOKEN` - API token for write access
- `KV_REST_API_READ_ONLY_TOKEN` - API token for read-only access

### 3. Deploy to Vercel

Deploy your project to Vercel:

```
vercel --prod
```

## Local Development

For local development, the game uses a file-based database (db.json):

```
npm install
npm run dev
```

## Game Rules

Fodinha is played with a standard deck of 40 cards (A, 2, 3, 4, 5, 6, 7, J, Q, K). The game starts with a single card hand, which increases by one card each hand until players are eliminated.

### Basic Gameplay:

1. Players start with 3 lives
2. The dealer is randomly selected at the start
3. Players make bets on how many rounds they'll win in each hand
4. The sum of all bets cannot equal the number of cards dealt
5. Players lose a life if they don't win the exact number of rounds they bet
6. The last player with lives remaining wins

### Card Values (Highest to Lowest):
3, 2, A, K, J, Q, 7, 6, 5, 4

### Suits Tiebreaker (Highest to Lowest):
♣ (Clubs), ♥ (Hearts), ♠ (Spades), ♦ (Diamonds)

## Troubleshooting

If you experience any issues with games disappearing or state not persisting:

1. Make sure Vercel KV is properly set up
2. Check that your environment variables are correctly configured
3. Verify the Redis database has been created and is accessible

For any other issues, refer to the API logs in the Vercel dashboard.

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
- However, you **can see all other players' cards**

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
