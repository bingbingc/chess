'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import confetti from 'canvas-confetti';

interface ChessGameProps {
    gameId: string;
    initialFen?: string;
    onMove?: (move: any) => void;
    orientation?: 'white' | 'black';
}

export default function ChessGame({ gameId, initialFen, onMove, orientation = 'white' }: ChessGameProps) {
    const [game, setGame] = useState(new Chess(initialFen));
    const [moveFrom, setMoveFrom] = useState<string | null>(null);
    const [rightClickedSquares, setRightClickedSquares] = useState<any>({});
    const [moveSquares, setMoveSquares] = useState<any>({});
    const [optionSquares, setOptionSquares] = useState<any>({});
    const moveAudio = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        moveAudio.current = new Audio('https://images.vchess.club/move.mp3');
    }, []);

    function safeGameMutate(modify: (arg: Chess) => void) {
        setGame((g) => {
            const update = new Chess(g.fen());
            modify(update);
            return update;
        });
    }

    const makeAMove = useCallback((move: any) => {
        try {
            const result = game.move(move);
            if (result) {
                setGame(new Chess(game.fen()));
                if (moveAudio.current) moveAudio.current.play().catch(() => { });

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
        } catch (e) {
            return null;
        }
    }, [game, onMove]);

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
            const hasPiece = game.get(square as any);
            if (hasPiece && hasPiece.color === (orientation === 'white' ? 'w' : 'b')) {
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
            const hasPiece = game.get(square as any);
            if (hasPiece && hasPiece.color === (orientation === 'white' ? 'w' : 'b')) {
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
            square: square as any,
            verbose: true,
        });
        if (moves.length === 0) {
            setOptionSquares({});
            return;
        }

        const newSquares: any = {};
        moves.map((move: any) => {
            const pieceAtSquare = game.get(move.to);
            const pieceAtSource = game.get(square as any);
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
                        ...moveSquares,
                        ...optionSquares,
                        ...rightClickedSquares,
                    }
                }}
            />
            <div className="game-info">
                <p>Status: {game.isCheck() ? 'Check!' : ''} {game.isCheckmate() ? 'Checkmate!' : ''} {game.isDraw() ? 'Draw!' : ''}</p>
                <p>Turn: {game.turn() === 'w' ? 'White' : 'Black'}</p>
            </div>
        </div>
    );
}
