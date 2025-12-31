
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateLevelTheme, getGameSummary, getRewardDescription } from './services/geminiService';
import { FallingObject, GameState, PlayerStats, LevelConfig, Reward, FloatingText } from './types';

// Sound Manager using Web Audio API for zero-dependency SFX
const SoundManager = (() => {
  let ctx: AudioContext | null = null;

  const init = () => {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  };

  const playTone = (freq: number, type: OscillatorType, duration: number, volume: number, decay = true) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    if (decay) {
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  return {
    init,
    catch: (points: number, isBonus: boolean) => {
      init();
      const baseFreq = 400 + (Math.min(points, 1000) / 2);
      if (isBonus) {
        playTone(baseFreq, 'triangle', 0.4, 0.2);
        playTone(baseFreq * 1.5, 'triangle', 0.6, 0.1);
      } else {
        playTone(baseFreq, 'sine', 0.2, 0.2);
      }
    },
    hazard: () => {
      init();
      playTone(150, 'sawtooth', 0.3, 0.15);
      playTone(110, 'square', 0.4, 0.1);
    },
    victory: () => {
      init();
      const now = ctx!.currentTime;
      [440, 554.37, 659.25, 880].forEach((f, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.frequency.setValueAtTime(f, now + i * 0.1);
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.5);
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.6);
      });
    },
    boxOpen: () => {
      init();
      for (let i = 0; i < 10; i++) {
        playTone(800 + Math.random() * 2000, 'sine', 0.5 + Math.random(), 0.05);
      }
    }
  };
})();

const BONUS_TYPES = [
  { icon: 'fa-clock', points: 0, color: 'text-cyan-400', effect: 'TIME', label: '+5s', isBonus: true },
  { icon: 'fa-bolt', points: 0, color: 'text-white', effect: 'CLEAR', label: 'COMBO BURST!', isBonus: true }
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [objects, setObjects] = useState<FallingObject[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [levelConfig, setLevelConfig] = useState<LevelConfig | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [stats, setStats] = useState<PlayerStats>({
    score: 0,
    level: 1,
    giftsFound: 0,
    timeRemaining: 30,
    missedCount: 0
  });
  
  const [combo, setCombo] = useState(0);
  const [particles, setParticles] = useState<{id: number, left: number, size: number, duration: number}[]>([]);
  const comboTimeoutRef = useRef<number | null>(null);

  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [flashRed, setFlashRed] = useState(false);
  const [isBoxOpening, setIsBoxOpening] = useState(false);

  const gameLoopRef = useRef<number>(null!);
  const lastSpawnRef = useRef<number>(0);

  useEffect(() => {
    const p = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 5 + Math.random() * 10
    }));
    setParticles(p);
  }, []);

  const spawnObject = useCallback(() => {
    if (!levelConfig || gameState !== GameState.PLAYING) return;
    
    const isBonusSpawn = Math.random() < 0.12;
    const type = isBonusSpawn 
      ? BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)]
      : levelConfig.items[Math.floor(Math.random() * levelConfig.items.length)];

    const isHazard = (type as any).points < 0;

    const newObj: FallingObject = {
      id: Math.random().toString(36).substr(2, 9),
      type: type.icon,
      icon: type.icon,
      points: type.points,
      x: 12 + Math.random() * 76,
      y: -10,
      speed: (0.12 + Math.random() * 0.15) * levelConfig.speedMultiplier * (1 + (30 - stats.timeRemaining) / 100),
      size: isHazard ? 55 : ((type as any).isBonus ? 50 : 45),
      isCaught: false,
      color: type.color,
      isBonus: (type as any).isBonus || isHazard
    };
    setObjects(prev => [...prev, newObj]);
  }, [levelConfig, gameState, stats.timeRemaining]);

  const updateGame = useCallback((time: number) => {
    if (gameState !== GameState.PLAYING) return;

    if (time - lastSpawnRef.current > (levelConfig?.spawnRate || 1.0) * 1000) {
      spawnObject();
      lastSpawnRef.current = time;
    }

    setObjects(prev => {
      const updated: FallingObject[] = [];
      for (const obj of prev) {
        if (obj.isCaught) {
          updated.push(obj);
          continue;
        }

        const nextY = obj.y + obj.speed;
        if (nextY >= 105) {
          if (!obj.isBonus && obj.points > 0) {
            setFlashRed(true);
            setCombo(0); 
            setStats(s => ({ ...s, score: Math.max(0, s.score - 50), missedCount: s.missedCount + 1 }));
            setTimeout(() => setFlashRed(false), 80);
          }
          continue;
        }
        updated.push({ ...obj, y: nextY });
      }
      return updated;
    });

    gameLoopRef.current = requestAnimationFrame(updateGame);
  }, [gameState, levelConfig, spawnObject]);

  const checkLevelOutcome = useCallback(() => {
    if (stats.score >= (levelConfig?.targetScore || 0)) {
      handleWon();
    } else {
      setGameState(GameState.LOST);
    }
  }, [stats.score, levelConfig]);

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      gameLoopRef.current = requestAnimationFrame(updateGame);
      const timer = setInterval(() => {
        setStats(prev => {
          if (prev.timeRemaining <= 1) return { ...prev, timeRemaining: 0 };
          return { ...prev, timeRemaining: prev.timeRemaining - 1 };
        });
      }, 1000);
      return () => {
        cancelAnimationFrame(gameLoopRef.current);
        clearInterval(timer);
      };
    }
  }, [gameState, updateGame]);

  useEffect(() => {
    if (gameState === GameState.PLAYING && stats.timeRemaining === 0) {
      checkLevelOutcome();
    }
  }, [stats.timeRemaining, gameState, checkLevelOutcome]);

  const handleWon = async () => {
    setGameState(GameState.WON);
    SoundManager.victory();
    setIsLoading(true);
    const rewardData = await getRewardDescription(stats.level);
    setReward(rewardData);
    setIsLoading(false);
    
    setTimeout(() => {
      setGameState(GameState.REWARD);
      setIsBoxOpening(false);
    }, 1200);
  };

  const startLevelIntro = async (levelNum: number) => {
    setIsLoading(true);
    const config = await generateLevelTheme(levelNum);
    setLevelConfig(config);
    setObjects([]);
    setFloatingTexts([]);
    setCombo(0);
    setStats(prev => ({ 
      ...prev, 
      level: levelNum, 
      timeRemaining: 30,
      missedCount: 0 
    }));
    setIsLoading(false);
    setGameState(GameState.LEVEL_INTRO);
  };

  const handleStartGame = () => {
    SoundManager.init();
    setStats({ score: 0, level: 1, giftsFound: 0, timeRemaining: 30, missedCount: 0 });
    startLevelIntro(1);
  };

  const addFloatingText = (text: string, x: number, y: number, color: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setFloatingTexts(prev => [...prev, { id, text, x, y, color }]);
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(t => t.id !== id));
    }, 800);
  };

  const handleCatch = (obj: FallingObject) => {
    if (obj.isCaught) return;
    setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, isCaught: true } : o));

    const isHazard = obj.points < 0;

    if (isHazard) {
      SoundManager.hazard();
      setCombo(0);
      setFlashRed(true);
      setStats(prev => ({ ...prev, score: Math.max(0, prev.score + obj.points) }));
      addFloatingText(`${obj.points}`, obj.x, obj.y, 'text-red-500');
      setTimeout(() => setFlashRed(false), 200);
    } else {
      SoundManager.catch(obj.points, !!obj.isBonus);
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
      setCombo(prev => prev + 1);
      comboTimeoutRef.current = window.setTimeout(() => setCombo(0), 1200);

      const multiplier = Math.floor(combo / 4) + 1;
      let pointsToAdd = obj.points * multiplier;
      let label = `+${pointsToAdd}`;
      let color = obj.color;

      if (obj.isBonus) {
        const bonusType = BONUS_TYPES.find(b => b.icon === obj.icon);
        if (bonusType?.effect === 'TIME') {
          setStats(s => ({ ...s, timeRemaining: s.timeRemaining + 5 }));
          label = '+5s';
        } else if (bonusType?.effect === 'CLEAR') {
          const standardItems = objects.filter(o => !o.isCaught && o.points > 0);
          const bonusPoints = standardItems.length * 100 * multiplier;
          pointsToAdd += bonusPoints;
          label = `BURST!`;
          setObjects(prev => prev.map(o => (!o.isCaught && o.points > 0) ? { ...o, isCaught: true } : o));
        }
      }

      setStats(prev => ({ 
        ...prev, 
        score: prev.score + pointsToAdd, 
        giftsFound: prev.giftsFound + (obj.isBonus ? 0 : 1) 
      }));

      addFloatingText(multiplier > 1 ? `${label} x${multiplier}` : label, obj.x, obj.y, color);
    }

    setTimeout(() => {
      setObjects(prev => prev.filter(o => o.id !== obj.id));
    }, 250);
  };

  const finalizeGame = async () => {
    setIsLoading(true);
    const blessing = await getGameSummary(stats.score, []);
    setSummary(blessing);
    setGameState(GameState.SUMMARY);
    setIsLoading(false);
  };

  const handleOpenBox = () => {
    if (isBoxOpening) return;
    setIsBoxOpening(true);
    SoundManager.boxOpen();
  };

  const scoreProgress = levelConfig ? Math.min(100, (stats.score / levelConfig.targetScore) * 100) : 0;
  const isTargetMet = levelConfig && stats.score >= levelConfig.targetScore;

  const meshStyle = levelConfig ? {
    backgroundImage: `linear-gradient(45deg, ${levelConfig.themeColor} 0%, ${levelConfig.accentColor}22 50%, ${levelConfig.themeColor} 100%)`
  } : {
    backgroundImage: `linear-gradient(45deg, #020204 0%, #ef444411 50%, #020204 100%)`
  };

  return (
    <div className={`relative h-[100dvh] w-full overflow-hidden transition-all duration-300 text-white font-sans ${flashRed ? 'bg-red-950/60' : ''}`}>
      <div className="bg-mesh" style={meshStyle}></div>
      
      {particles.map(p => (
        <div 
          key={p.id} 
          className="particle" 
          style={{ 
            left: `${p.left}%`, 
            width: `${p.size}px`, 
            height: `${p.size}px`, 
            bottom: '-10px',
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.id * -0.5}s`
          }} 
        />
      ))}

      {gameState === GameState.PLAYING && (
        <div className="fixed top-0 left-0 w-full px-4 py-2 pt-[var(--safe-area-inset-top)] flex flex-col gap-2 z-50 glass border-b border-white/5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div 
                className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter"
                style={{ backgroundColor: levelConfig?.accentColor || '#ef4444' }}
              >
                L{stats.level}
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-wider text-white/40 font-bold">Goal: {levelConfig?.targetScore.toLocaleString()}</span>
                <h1 className={`text-xl font-black tabular-nums transition-all ${isTargetMet ? 'text-green-400' : 'text-white'}`}>
                  {stats.score.toLocaleString()}
                </h1>
              </div>
            </div>
            
            <div className="flex gap-4 items-center">
              {combo > 1 && (
                <div className="flex flex-col items-center combo-active">
                  <p className="text-xl font-black text-yellow-400 italic">x{Math.floor(combo / 4) + 1}</p>
                </div>
              )}
              <div className="text-right">
                <p className={`text-2xl font-black tabular-nums ${stats.timeRemaining < 7 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                  {stats.timeRemaining}s
                </p>
              </div>
            </div>
          </div>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ease-out ${isTargetMet ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : ''}`} 
              style={{ 
                width: `${scoreProgress}%`,
                backgroundColor: !isTargetMet ? levelConfig?.accentColor : undefined 
              }}
            ></div>
          </div>
        </div>
      )}

      <main className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center">
        {gameState === GameState.START && (
          <div className="flex flex-col items-center space-y-8 animate-fadeIn w-full">
            <div className="relative group">
              <div className="absolute inset-0 bg-red-600 blur-[40px] opacity-10"></div>
              <div className="p-8 rounded-full bg-red-600/5 mb-4 ring-1 ring-red-600/20 animate-pulse relative z-10">
                  <i className="fas fa-gift text-6xl text-red-500"></i>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-5xl sm:text-7xl font-black italic tracking-tighter uppercase leading-[0.9] text-white">
                GENNA<br/><span className="text-red-600">ARCADE</span>
              </h2>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                MODERN ETHIOPIAN HOLIDAY
              </p>
            </div>
            <button 
              onClick={handleStartGame}
              className="w-full max-w-xs py-5 bg-white text-black font-black text-xl uppercase italic tracking-tighter shadow-2xl active:scale-95 transition-transform"
            >
              Begin Ceremony
            </button>
          </div>
        )}

        {gameState === GameState.LEVEL_INTRO && levelConfig && (
          <div className="flex flex-col items-center space-y-6 animate-fadeIn w-full max-w-sm">
            <div className="bg-black/80 border border-white/10 p-8 rounded-lg backdrop-blur-3xl w-full shadow-2xl">
              <p className="font-black uppercase tracking-[0.5em] text-[8px] mb-6 opacity-40" style={{ color: levelConfig.accentColor }}>LEVEL {stats.level}</p>
              <h2 className="text-4xl font-black mb-4 uppercase italic tracking-tighter">{levelConfig.name}</h2>
              <p className="text-gray-400 mb-8 text-sm leading-relaxed font-light italic">"{levelConfig.description}"</p>
              
              <div className="bg-white/5 p-6 rounded mb-8 grid grid-cols-2 gap-6 border border-white/5">
                <div className="text-left">
                  <p className="text-[8px] uppercase tracking-wider text-white/30 font-bold mb-1">QUOTA</p>
                  <p className="text-2xl font-black" style={{ color: levelConfig.accentColor }}>{levelConfig.targetScore.toLocaleString()}</p>
                </div>
                <div className="text-right border-l border-white/5 pl-6">
                  <p className="text-[8px] uppercase tracking-wider text-white/30 font-bold mb-1">TIME</p>
                  <p className="text-2xl font-black text-white">30s</p>
                </div>
              </div>
              
              <button 
                onClick={() => { SoundManager.init(); setGameState(GameState.PLAYING); }}
                className="w-full py-5 rounded font-black text-xl active:scale-95 transition-all shadow-lg uppercase italic tracking-tighter"
                style={{ backgroundColor: levelConfig.accentColor }}
              >
                Start Trial
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="absolute inset-0 pt-[var(--safe-area-inset-top)] pb-[var(--safe-area-inset-bottom)]">
            {objects.map(obj => (
              <button
                key={obj.id}
                onClick={() => handleCatch(obj)}
                disabled={obj.isCaught}
                className={`absolute gift-button flex items-center justify-center ${obj.color} ${obj.isCaught ? 'animate-pop' : 'active:scale-90'} ${obj.points < 0 ? 'hazard-glitch' : ''} ${obj.isBonus && obj.points >= 0 ? 'bonus-glow' : ''}`}
                style={{ left: `${obj.x}%`, top: `${obj.y}%`, fontSize: `${obj.size}px` }}
              >
                <i className={`fas ${obj.icon}`}></i>
              </button>
            ))}

            {floatingTexts.map(ft => (
              <div 
                key={ft.id}
                className={`absolute pointer-events-none font-black text-2xl z-[60] animate-floatUp italic ${ft.color}`}
                style={{ left: `${ft.x}%`, top: `${ft.y}%` }}
              >
                {ft.text}
              </div>
            ))}
          </div>
        )}

        {gameState === GameState.WON && (
          <div className="flex flex-col items-center space-y-4 animate-fadeIn">
             <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mb-4 shadow-2xl animate-bounce">
                <i className="fas fa-check text-4xl text-white"></i>
             </div>
             <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">LEVEL UP</h2>
             <p className="text-green-500 font-bold text-[10px] uppercase tracking-widest">Validation Complete</p>
          </div>
        )}

        {gameState === GameState.REWARD && reward && (
          <div className="flex flex-col items-center space-y-10 w-full max-w-sm animate-fadeIn">
            {!isBoxOpening ? (
              <>
                 <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">GIFT FOUND</h2>
                 <div className="relative group cursor-pointer" onClick={handleOpenBox}>
                    <div className="absolute inset-0 bg-white blur-[100px] opacity-10"></div>
                    <div 
                      className="w-48 h-48 rounded flex items-center justify-center shadow-2xl relative z-10 animate-pulse border border-white/10"
                      style={{ background: `linear-gradient(135deg, ${levelConfig?.accentColor || '#ef4444'} 0%, #000 100%)` }}
                    >
                        <i className="fas fa-box text-7xl text-white/90"></i>
                        <div className="absolute top-1/2 left-0 w-full h-4 bg-white/10 -translate-y-1/2"></div>
                        <div className="absolute top-0 left-1/2 w-4 h-full bg-white/10 -translate-x-1/2"></div>
                    </div>
                 </div>
                 <p className="text-white/20 font-black uppercase tracking-[0.4em] text-[8px] animate-bounce">Tap to unveil</p>
              </>
            ) : (
              <div className="space-y-10 w-full animate-fadeIn">
                <div 
                  className="w-48 h-48 bg-black/40 border-[1px] rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl transition-transform"
                  style={{ borderColor: levelConfig?.accentColor }}
                >
                    <i className={`fas ${reward.icon} text-7xl`} style={{ color: levelConfig?.accentColor }}></i>
                </div>
                <div className="space-y-4">
                    <h2 className="text-4xl font-black uppercase italic tracking-tighter text-white">{reward.name}</h2>
                    <p className="text-lg text-gray-500 font-light italic leading-snug">
                        "{reward.meaning}"
                    </p>
                </div>
                <button 
                    onClick={() => startLevelIntro(stats.level + 1)}
                    className="w-full py-5 bg-white text-black font-black text-xl uppercase italic tracking-tighter active:scale-95 transition-transform"
                >
                    Next Realm
                </button>
              </div>
            )}
          </div>
        )}

        {gameState === GameState.LOST && (
          <div className="flex flex-col items-center space-y-10 w-full max-w-sm animate-fadeIn">
             <div className="w-24 h-24 bg-red-700 rounded-full flex items-center justify-center mb-4 shadow-2xl border-2 border-red-500">
                <i className="fas fa-skull text-4xl text-white"></i>
             </div>
             <div className="space-y-2">
               <h2 className="text-5xl font-black italic uppercase tracking-tighter text-red-600">FAILED</h2>
               <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Quota unmet: {levelConfig?.targetScore.toLocaleString()} pts</p>
             </div>
             <div className="flex flex-col gap-4 w-full">
                <button 
                    onClick={() => startLevelIntro(stats.level)}
                    className="w-full py-5 bg-white text-black font-black text-xl uppercase italic tracking-tighter active:scale-95"
                >
                    Retry Trial
                </button>
                <button 
                    onClick={finalizeGame}
                    className="text-white/20 font-black uppercase tracking-[0.3em] text-[10px] py-2"
                >
                    Abandon Quest
                </button>
             </div>
          </div>
        )}

        {gameState === GameState.SUMMARY && (
          <div className="flex flex-col items-center space-y-12 w-full max-w-sm animate-fadeIn">
            <div className="space-y-4">
              <i className="fas fa-quote-left text-3xl text-white/5 block mx-auto"></i>
              <h2 className="text-2xl italic font-serif leading-tight text-white">"{summary}"</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-8 bg-black/40 p-8 rounded border border-white/5 w-full shadow-2xl backdrop-blur-xl">
                <div className="text-center">
                    <p className="text-[8px] text-white/30 uppercase tracking-[0.3em] mb-2 font-black">TREASURES</p>
                    <p className="text-5xl font-black text-white italic">{stats.giftsFound}</p>
                </div>
                <div className="text-center border-l border-white/5 pl-8">
                    <p className="text-[8px] text-white/30 uppercase tracking-[0.3em] mb-2 font-black">MERIT</p>
                    <p className="text-5xl font-black text-yellow-500 italic">{stats.score.toLocaleString()}</p>
                </div>
            </div>
            
            <button 
              onClick={() => setGameState(GameState.START)}
              className="text-white/30 font-black uppercase tracking-[0.4em] text-[8px] border-b border-transparent active:text-white transition-colors"
            >
              Restart New Ceremony
            </button>
          </div>
        )}

        {isLoading && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center">
            <div 
              className="w-16 h-16 border-[2px] border-white/5 border-t-white rounded-full animate-spin mb-6"
              style={{ borderTopColor: levelConfig?.accentColor }}
            ></div>
            <p className="text-[8px] font-black tracking-[0.8em] uppercase animate-pulse" style={{ color: levelConfig?.accentColor || '#fff' }}>
              GENERATING REALITY...
            </p>
          </div>
        )}
      </main>

      <div 
        className="fixed bottom-0 left-0 w-full h-[1px] opacity-20 transition-colors duration-1000 mb-[var(--safe-area-inset-bottom)]"
        style={{ backgroundColor: levelConfig?.accentColor || '#ef4444' }}
      ></div>
    </div>
  );
};

export default App;
