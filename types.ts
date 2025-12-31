
export interface FallingObject {
  id: string;
  type: string;
  icon: string;
  points: number;
  x: number;
  y: number;
  speed: number;
  size: number;
  isCaught: boolean;
  color: string;
  isBonus?: boolean;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

export interface LevelItem {
  icon: string;
  points: number;
  color: string;
}

export interface LevelConfig {
  name: string;
  description: string;
  targetScore: number;
  spawnRate: number;
  speedMultiplier: number;
  themeColor: string; // Primary BG color (Hex)
  accentColor: string; // UI/Highlight color (Hex)
  items: LevelItem[];   // Unique items for this level
}

export interface PlayerStats {
  score: number;
  level: number;
  giftsFound: number;
  timeRemaining: number;
  missedCount: number;
}

export interface Reward {
  name: string;
  meaning: string;
  icon: string;
}

export enum GameState {
  START = 'START',
  LEVEL_INTRO = 'LEVEL_INTRO',
  PLAYING = 'PLAYING',
  WON = 'WON',
  REWARD = 'REWARD',
  LOST = 'LOST',
  SUMMARY = 'SUMMARY'
}
