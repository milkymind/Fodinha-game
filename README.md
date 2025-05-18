# Fodinha Card Game

A web-based implementation of the Brazilian card game "Fodinha" built with Next.js.

## About the Game

Fodinha is a traditional Brazilian card game also known as "Truco Mineiro Simplificado". Players make bets on how many tricks they'll win in each round, and lose lives when their bets don't match their performance.

### Basic Rules
- Players start with a fixed number of lives (usually 3)
- In the first round, each player receives 1 card
- In each subsequent round, the number of cards increases
- Players bet how many tricks they'll win
- Lose lives equal to the difference between your bet and actual tricks won
- First-round special rule: You can see other players' cards, but not your own!

## Deployment Options

### 1. Vercel (Recommended)

The easiest way to deploy this game:

1. Create a GitHub repository and push this code
2. Sign up at [vercel.com](https://vercel.com)
3. Connect your GitHub account
4. Import this repository
5. Click Deploy

The game will use in-memory storage when deployed on Vercel. Game states will reset when the Vercel instance restarts.

### 2. Self-hosting

For persistent storage, deploy to your own server:

1. Install Node.js on your server
2. Clone your repository
3. Run `npm install`
4. Build the app: `npm run build`
5. Start the server: `npm run start`

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm run start
```

## Game Features

- Create and join game lobbies
- Custom player names
- Real-time game state updates
- Visual card animations
- Round progress tracking
- First-round special rule implementation (hidden cards)
- Trick winner notifications

## Technologies

- Next.js
- React
- TypeScript
- lowdb (for data persistence)

## License

MIT