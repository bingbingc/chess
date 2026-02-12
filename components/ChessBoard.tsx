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
    playerColor?: 'white' | 'black' | null;
}

export default function ChessGame({ initialFen, onMove, orientation = 'white', playerColor }: Omit<ChessGameProps, 'gameId'>) {
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
        if (initialFen && initialFen !== game.fen()) {
            const newGame = new Chess(initialFen);
            setGame(newGame);
        }
    }, [initialFen, game]);

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
            const pColor = playerColor === 'white' ? 'w' : 'b';
            if (turnColor !== pColor) return null;
        }

        try {
            let result = game.move(move);

            // King Movement Variant: If standard move fails, check if it's a King moving to an adjacent square
            if (!result) {
                const piece = game.get(move.from as Square);
                if (piece && piece.type === 'k') {
                    // Manually calculate distance
                    const fromPos = move.from;
                    const toPos = move.to;
                    const fromCol = fromPos.charCodeAt(0);
                    const fromRow = parseInt(fromPos[1]);
                    const toCol = toPos.charCodeAt(0);
                    const toRow = parseInt(toPos[1]);

                    const colDiff = Math.abs(fromCol - toCol);
                    const rowDiff = Math.abs(fromRow - toRow);

                    if (colDiff <= 1 && rowDiff <= 1) {
                        // This is an adjacent move. Manually update FEN to permit "suicidal" moves
                        const tempGame = new Chess(game.fen());
                        const pieceToMove = tempGame.remove(move.from as Square);
                        if (pieceToMove) {
                            tempGame.put(pieceToMove, move.to as Square);
                            // Toggle turn manually
                            const fenParts = tempGame.fen().split(' ');
                            fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
                            // Reset half-move clock and increment full-move if black moved
                            fenParts[4] = '0';
                            if (pieceToMove.color === 'b') {
                                fenParts[5] = (parseInt(fenParts[5]) + 1).toString();
                            }
                            const nextFen = fenParts.join(' ');

                            // Load the artificial state
                            game.load(nextFen);
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            result = {
                                color: pieceToMove.color,
                                from: move.from as Square,
                                to: move.to as Square,
                                piece: pieceToMove.type,
                                flags: 'n',
                                san: `K${move.to}`,
                                before: move.from,
                                after: nextFen
                            } as any;
                        }
                    }
                }
            }

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
    }, [game, onMove, isLocal, playerColor]);

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

            // Online mode: only allow selection if player matches piece color
            const canSelect = hasPiece && (
                isLocal
                    ? hasPiece.color === game.turn()
                    : (playerColor && hasPiece.color === (playerColor === 'white' ? 'w' : 'b'))
            );

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
            const canSelect = hasPiece && (
                isLocal
                    ? hasPiece.color === game.turn()
                    : (playerColor && hasPiece.color === (playerColor === 'white' ? 'w' : 'b'))
            );

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

        const piece = game.get(square as Square);
        const newSquares: Record<string, CSSProperties> = {};

        // standard moves
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

        // King Movement Variant: Show adjacent squares as valid even if under attack
        if (piece && piece.type === 'k') {
            const col = square.charCodeAt(0);
            const row = parseInt(square[1]);

            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    if (i === 0 && j === 0) continue;
                    const nextCol = col + i;
                    const nextRow = row + j;

                    if (nextCol >= 97 && nextCol <= 104 && nextRow >= 1 && nextRow <= 8) {
                        const targetSquare = String.fromCharCode(nextCol) + nextRow;
                        const targetPiece = game.get(targetSquare as Square);

                        // Can move if square is empty or has opponent piece
                        if (!targetPiece || targetPiece.color !== piece.color) {
                            if (!newSquares[targetSquare]) {
                                newSquares[targetSquare] = {
                                    background: targetPiece
                                        ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
                                        : 'radial-gradient(circle, rgba(0,0,0,.1) 35%, transparent 35%)',
                                    borderRadius: '50%',
                                };
                            }
                        }
                    }
                }
            }
        }

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
