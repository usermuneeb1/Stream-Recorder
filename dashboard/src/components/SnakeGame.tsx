import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Play, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };
const BASE_SPEED = 150;

export const SnakeGame: React.FC = () => {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [food, setFood] = useState({ x: 15, y: 15 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('snake_high_score') || '0'));
  
  const gameBoardRef = useRef<HTMLDivElement>(null);

  const generateFood = useCallback((currentSnake: {x: number, y: number}[]) => {
    let newFood: { x: number, y: number };
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      // Make sure food doesn't spawn on snake
      if (!currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y)) {
        break;
      }
    }
    return newFood;
  }, []);

  const resetGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setFood(generateFood(INITIAL_SNAKE));
    setScore(0);
    setGameOver(false);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling when playing
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }

      setDirection(prev => {
        switch (e.key) {
          case 'ArrowUp':
          case 'w':
          case 'W':
            return prev.y === 1 ? prev : { x: 0, y: -1 };
          case 'ArrowDown':
          case 's':
          case 'S':
            return prev.y === -1 ? prev : { x: 0, y: 1 };
          case 'ArrowLeft':
          case 'a':
          case 'A':
            return prev.x === 1 ? prev : { x: -1, y: 0 };
          case 'ArrowRight':
          case 'd':
          case 'D':
            return prev.x === -1 ? prev : { x: 1, y: 0 };
          default:
            return prev;
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || gameOver) return;

    const moveSnake = () => {
      setSnake(prevSnake => {
        const head = prevSnake[0];
        const newHead = {
          x: head.x + direction.x,
          y: head.y + direction.y
        };

        // Check wall collision
        if (
          newHead.x < 0 || 
          newHead.x >= GRID_SIZE || 
          newHead.y < 0 || 
          newHead.y >= GRID_SIZE
        ) {
          setGameOver(true);
          setIsPlaying(false);
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('snake_high_score', score.toString());
          }
          return prevSnake;
        }

        // Check self collision
        if (prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
          setGameOver(true);
          setIsPlaying(false);
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('snake_high_score', score.toString());
          }
          return prevSnake;
        }

        const newSnake = [newHead, ...prevSnake];

        // Check food collision
        if (newHead.x === food.x && newHead.y === food.y) {
          setScore(s => s + 10);
          setFood(generateFood(newSnake));
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    };

    const speed = Math.max(50, BASE_SPEED - (Math.floor(score / 50) * 10));
    const gameLoop = setInterval(moveSnake, speed);
    
    return () => clearInterval(gameLoop);
  }, [isPlaying, gameOver, direction, food, score, highScore, generateFood]);

  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden group border border-brand-500/10">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-purple-500/5 dark:from-brand-500/10 dark:to-purple-500/10 opacity-50" />
      
      <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
        
        {/* Game Board */}
        <div className="relative">
          <div 
            ref={gameBoardRef}
            className="w-64 h-64 sm:w-80 sm:h-80 bg-dark-100 dark:bg-dark-900 rounded-2xl overflow-hidden border-2 border-dark-200 dark:border-dark-800 shadow-inner grid relative"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`
            }}
          >
            {/* Grid background pattern */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(to right, #3f3f46 1px, transparent 1px), linear-gradient(to bottom, #3f3f46 1px, transparent 1px)',
              backgroundSize: `calc(100% / ${GRID_SIZE}) calc(100% / ${GRID_SIZE})`
            }}/>

            {!isPlaying && !gameOver && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <Trophy className="text-yellow-500 mb-4" size={48} />
                <button 
                  onClick={resetGame}
                  className="btn-primary py-2 px-6 rounded-xl flex items-center gap-2 transform hover:scale-105 transition-all shadow-lg shadow-brand-500/30"
                >
                  <Play size={18} fill="currentColor" /> Play Snake
                </button>
                <p className="text-xs text-white/70 mt-4">Use Arrow Keys or WASD</p>
              </div>
            )}

            {gameOver && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-md">
                <h3 className="text-2xl font-bold text-white mb-2 font-display">Game Over</h3>
                <p className="text-brand-400 font-medium mb-6">Score: {score}</p>
                <button 
                  onClick={resetGame}
                  className="bg-white text-black py-2 px-6 rounded-xl flex items-center gap-2 font-semibold transform hover:scale-105 transition-all"
                >
                  <RotateCcw size={18} /> Play Again
                </button>
              </div>
            )}

            {/* Food */}
            <div 
              className="z-10 animate-pulse flex items-center justify-center"
              style={{
                gridColumnStart: food.x + 1,
                gridRowStart: food.y + 1,
                transform: 'scale(1.2)'
              }}
            >
              <div className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,1)] relative">
                <div className="absolute -top-1 right-1 w-1 h-2 bg-green-500 rounded-full rotate-45" />
              </div>
            </div>

            {/* Snake */}
            {snake.map((segment, index) => {
              const isHead = index === 0;
              const opacity = Math.max(0.3, 1 - (index / snake.length));
              
              return (
                <div 
                  key={index}
                  className={`${isHead ? 'bg-indigo-500 z-10' : 'bg-indigo-400'} rounded-md`}
                  style={{
                    gridColumnStart: segment.x + 1,
                    gridRowStart: segment.y + 1,
                    transform: isHead ? 'scale(1.15)' : 'scale(0.9)',
                    opacity: isHead ? 1 : opacity,
                    boxShadow: isHead ? '0 0 15px rgba(99,102,241,0.8)' : 'none',
                    transition: 'all 0.1s linear'
                  }}
                >
                  {isHead && (
                    <div className="w-full h-full relative">
                      {/* Snake Eyes */}
                      <div className={`absolute w-1.5 h-1.5 bg-white rounded-full ${direction.x === 1 ? 'right-0.5 top-0.5' : direction.x === -1 ? 'left-0.5 top-0.5' : direction.y === 1 ? 'bottom-0.5 right-0.5' : 'top-0.5 right-0.5'}`}>
                        <div className="absolute inset-0.5 bg-black rounded-full" />
                      </div>
                      <div className={`absolute w-1.5 h-1.5 bg-white rounded-full ${direction.x === 1 ? 'right-0.5 bottom-0.5' : direction.x === -1 ? 'left-0.5 bottom-0.5' : direction.y === 1 ? 'bottom-0.5 left-0.5' : 'top-0.5 left-0.5'}`}>
                        <div className="absolute inset-0.5 bg-black rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Score Board */}
        <div className="flex-1 text-center md:text-left">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-block bg-dark-100 dark:bg-dark-800 px-4 py-2 rounded-xl mb-6 border border-dark-200 dark:border-dark-700"
          >
            <span className="text-sm font-medium text-dark-500 uppercase tracking-wider">Mini Game</span>
          </motion.div>
          <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">Take a Break</h2>
          <p className="text-dark-500 mb-8 max-w-sm mx-auto md:mx-0">
            Waiting for a stream to archive or a workflow to finish? Play a quick round of classic Snake. 
          </p>
          
          <div className="flex flex-row justify-center md:justify-start gap-6">
            <div>
              <p className="text-xs text-dark-500 uppercase font-bold tracking-wider mb-1">Current Score</p>
              <p className="text-3xl font-display font-bold text-brand-600 dark:text-brand-400">{score}</p>
            </div>
            <div className="w-px h-12 bg-dark-200 dark:bg-dark-800" />
            <div>
              <p className="text-xs text-dark-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                <Trophy size={12} className="text-yellow-500" /> High Score
              </p>
              <p className="text-3xl font-display font-bold">{highScore}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
