
import { GoogleGenAI, Type } from "@google/genai";
import { LevelConfig, Reward } from "../types";

export const generateLevelTheme = async (level: number): Promise<LevelConfig> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Design level ${level} for an Ethiopian Genna arcade game. 
    The game should be challenging but fair.
    Provide:
    1. A unique level name and cultural description.
    2. Stats: targetScore (approx ${level * 2500}), spawnRate (0.3-0.7), speedMultiplier (balanced: 1.2-3.2).
    3. Visual Theme: A primary themeColor and a high-contrast accentColor (Hex codes).
    4. Custom Items: A list of 6 unique items relevant to this level's theme. 
       - 4 Positive items (high points).
       - 2 CURSED items (negative points, e.g., icons like fa-skull, fa-bomb, fa-poo-storm).
       Each item needs a FontAwesome icon, point value (negative for hazards), and color class.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          targetScore: { type: Type.INTEGER },
          spawnRate: { type: Type.NUMBER },
          speedMultiplier: { type: Type.NUMBER },
          themeColor: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                icon: { type: Type.STRING },
                points: { type: Type.INTEGER },
                color: { type: Type.STRING }
              },
              required: ["icon", "points", "color"]
            }
          }
        },
        required: ["name", "description", "targetScore", "spawnRate", "speedMultiplier", "themeColor", "accentColor", "items"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return {
      name: `Sanctuary ${level}`,
      description: "A mysterious realm of floating treasures.",
      targetScore: level * 2000,
      spawnRate: 0.6,
      speedMultiplier: 1.5 + (level * 0.2),
      themeColor: "#0a0a0f",
      accentColor: "#ef4444",
      items: [
        { icon: "fa-gift", points: 150, color: "text-red-500" },
        { icon: "fa-star", points: 300, color: "text-yellow-400" },
        { icon: "fa-skull", points: -600, color: "text-purple-600" },
        { icon: "fa-leaf", points: 100, color: "text-green-500" },
        { icon: "fa-bomb", points: -1200, color: "text-gray-500" },
        { icon: "fa-moon", points: 250, color: "text-indigo-400" }
      ]
    };
  }
};

export const getRewardDescription = async (level: number): Promise<Reward> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a traditional Ethiopian Genna gift for beating Level ${level}. Name, meaning, and FontAwesome icon.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          meaning: { type: Type.STRING },
          icon: { type: Type.STRING }
        },
        required: ["name", "meaning", "icon"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch {
    return { name: "Traditional Scarf", meaning: "Woven with the colors of peace and unity.", icon: "fa-scroll" };
  }
};

export const getGameSummary = async (score: number, items: string[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a short professional New Year blessing for score ${score}.`,
  });
  return response.text || "May your journey be filled with light!";
};
