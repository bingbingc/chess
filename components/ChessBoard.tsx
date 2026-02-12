'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import confetti from 'canvas-confetti';
import { CSSProperties } from 'react';

interface ChessGameProps {
    gameId: string;
    initialFen?: string;
    onMove?: (move: { san: string; from: string; to: string; before: string; after: string }) => void;
    orientation?: 'white' | 'black';
}

export default function ChessGame({ initialFen, onMove, orientation = 'white' }: Omit<ChessGameProps, 'gameId'>) {
    const [game, setGame] = useState(new Chess(initialFen));
    const [moveFrom, setMoveFrom] = useState<string | null>(null);
    const [rightClickedSquares, setRightClickedSquares] = useState<Record<string, CSSProperties | undefined>>({});
    const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({});
    const moveAudio = useRef<HTMLAudioElement | null>(null);
    const isLocal = !onMove;

    useEffect(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

        console.log('--- Supabase Auth Info ---');
        console.log('URL:', url);
        console.log('Key Format Check:', key.startsWith('ey') ? '✅ JWT (Standard)' : '❌ Not JWT');
        console.log('Key Length:', key.length);
        console.log('Key Prefix:', key.substring(0, 10));

        moveAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
    }, []);

    // Keep internal game state in sync with initialFen prop (for real-time updates)
    useEffect(() => {
        if (initialFen && initialFen !== (typeof game === 'string' ? game : game.fen())) {
            const newGame = new Chess(initialFen);
            setGame(newGame);
        }
    }, [initialFen]);

    // Play sound when the board changes
    useEffect(() => {
        if (game.history().length > 0) {
            if (moveAudio.current) {
                moveAudio.current.play().catch((err) => {
                    console.log('Audio play failed (likely browser restriction):', err);
                });
            }
        }
    }, [game]);


    const makeAMove = useCallback((move: { from: string; to: string; promotion?: string }) => {
        // Guard for online games: only allow moves if it's the player's turn
        if (!isLocal) {
            const turnColor = game.turn();
            const playerColor = orientation === 'white' ? 'w' : 'b';
            if (turnColor !== playerColor) return null;
        }

        try {
            const result = game.move(move);
            if (result) {
                setGame(new Chess(game.fen()));

                if (game.isCheckmate()) {
                    confetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 }
                    });
                }

                if (onMove) onMove(result);
            }
            return result;
        } catch {
            return null;
        }
    }, [game, onMove, isLocal, orientation]);

    function onDrop(sourceSquare: string, targetSquare: string) {
        const move = makeAMove({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q', // always promote to queen for simplicity
        });

        if (move === null) return false;
        return true;
    }

    function onSquareClick(square: string) {
        setRightClickedSquares({});

        // from square
        if (!moveFrom) {
            const hasPiece = game.get(square as Square);
            const canSelect = hasPiece && (isLocal ? hasPiece.color === game.turn() : hasPiece.color === (orientation === 'white' ? 'w' : 'b'));

            if (canSelect) {
                setMoveFrom(square);
                getMoveOptions(square);
            }
            return;
        }

        // to square
        const move = makeAMove({
            from: moveFrom,
            to: square,
            promotion: 'q',
        });

        if (move === null) {
            const hasPiece = game.get(square as Square);
            const canSelect = hasPiece && (isLocal ? hasPiece.color === game.turn() : hasPiece.color === (orientation === 'white' ? 'w' : 'b'));

            if (canSelect) {
                setMoveFrom(square);
                getMoveOptions(square);
            } else {
                setMoveFrom(null);
                setOptionSquares({});
            }
            return;
        }

        setMoveFrom(null);
        setOptionSquares({});
    }

    function getMoveOptions(square: string) {
        const moves = game.moves({
            square: square as Square,
            verbose: true,
        });
        if (moves.length === 0) {
            setOptionSquares({});
            return;
        }

        const newSquares: Record<string, CSSProperties> = {};
        moves.map((move) => {
            const pieceAtSquare = game.get(move.to);
            const pieceAtSource = game.get(square as Square);
            newSquares[move.to] = {
                background:
                    pieceAtSquare && pieceAtSource && pieceAtSquare.color !== pieceAtSource.color
                        ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
                        : 'radial-gradient(circle, rgba(0,0,0,.1) 35%, transparent 35%)',
                borderRadius: '50%',
            };
            return move;
        });
        newSquares[square] = {
            background: 'rgba(255, 255, 0, 0.4)',
        };
        setOptionSquares(newSquares);
    }

    function onSquareRightClick(square: string) {
        const colour = 'rgba(0, 0, 255, 0.4)';
        setRightClickedSquares({
            ...rightClickedSquares,
            [square]:
                rightClickedSquares[square] && rightClickedSquares[square].backgroundColor === colour
                    ? undefined
                    : { backgroundColor: colour },
        });
    }

    return (
        <div className="chessboard-container" style={{ width: 'min(100%, 600px)', margin: '0 auto' }}>
            <Chessboard
                options={{
                    position: game.fen(),
                    onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare, targetSquare || ''),
                    onSquareClick: ({ square }) => onSquareClick(square),
                    onSquareRightClick: ({ square }) => onSquareRightClick(square),
                    boardOrientation: orientation,
                    squareStyles: {
                        ...optionSquares,
                        ...rightClickedSquares,
                    } as Record<string, CSSProperties>
                }}
            />
            <div className="game-info">
                <p>Status: {game.isCheck() ? 'Check!' : ''} {game.isCheckmate() ? 'Checkmate!' : ''} {game.isDraw() ? 'Draw!' : ''}</p>
                <p>Turn: {game.turn() === 'w' ? 'White' : 'Black'}</p>
            </div>
        </div>
    );
}
