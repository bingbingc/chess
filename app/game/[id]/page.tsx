'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChessGame from '@/components/ChessBoard';
import { supabase } from '@/lib/supabase';
import { Chess } from 'chess.js';
import { ArrowLeft, Share2 } from 'lucide-react';

export default function GamePage() {
    const { id: gameId } = useParams();
    const router = useRouter();
    const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const [loading, setLoading] = useState(true);
    const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
    const [gameStatus, setGameStatus] = useState('loading');
    const [moves, setMoves] = useState<string[]>([]);
    const [drawOfferedBy, setDrawOfferedBy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [replayMode, setReplayMode] = useState(false);
    const [replayMoves, setReplayMoves] = useState<string[]>([]);
    const [replayIndex, setReplayIndex] = useState(-1);

    const cleanupMoves = useCallback(async () => {
        if (!gameId || gameId === 'local-game') return;
        await supabase.from('moves').delete().eq('game_id', gameId);
    }, [gameId]);

    const handleMove = useCallback(async (move: { san: string; from: string; to: string; before: string; after: string }) => {
        if (!gameId || gameId === 'local-game' || replayMode) return;

        // Final guard: only assigned players can move their color
        if (!playerColor) return;

        const turn = moves.length % 2 === 0 ? 'white' : 'black';
        if (playerColor !== turn) return;

        const { error } = await supabase.from('moves').insert({
            game_id: gameId as string,
            move_number: moves.length + 1,
            notation: move.san,
            from_square: move.from,
            to_square: move.to,
            fen_before: move.before,
            fen_after: move.after,
        });

        if (error) {
            console.error('Error saving move:', error);
        } else {
            // Update game FEN in games table
            await supabase.from('games').update({
                fen: move.after,
                updated_at: new Date().toISOString()
            }).eq('id', gameId);
        }
    }, [gameId, moves.length, playerColor, replayMode]);

    useEffect(() => {
        const fetchGame = async () => {
            const { data: game } = await supabase
                .from('games')
                .select('*')
                .eq('id', gameId)
                .single();

            if (game) {
                setFen(game.fen);
                setGameStatus(game.status);
                setDrawOfferedBy(game.draw_offered_by);

                // Fetch moves history for this game
                const { data: movesData } = await supabase
                    .from('moves')
                    .select('notation')
                    .eq('game_id', gameId)
                    .order('move_number', { ascending: true });

                if (movesData) {
                    setMoves(movesData.map(m => m.notation));
                }

                // Determine player color and assign if spot is open
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    let assignedColor: 'white' | 'black' | null = null;
                    if (user.id === game.white_player_id) assignedColor = 'white';
                    else if (user.id === game.black_player_id) assignedColor = 'black';
                    else if (!game.white_player_id) {
                        await supabase.from('games').update({ white_player_id: user.id }).eq('id', gameId);
                        assignedColor = 'white';
                    } else if (!game.black_player_id) {
                        await supabase.from('games').update({ black_player_id: user.id }).eq('id', gameId);
                        assignedColor = 'black';
                    }
                    setPlayerColor(assignedColor);
                }
            }
            setLoading(false);
        };

        if (gameId) fetchGame();

        // Cleanup moves if the user closes the tab mid-game
        const handleBeforeUnload = () => {
            if (gameStatus === 'playing') {
                // We use sendBeacon or a synchronous-like fire-and-forget for cleanup
                // But since we are using Supabase, we'll try a simple delete
                // Note: this is best-effort
                if (gameId && gameId !== 'local-game') {
                    cleanupMoves();
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        // Subscribe to moves
        const channel = supabase
            .channel(`game:${gameId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'moves',
                    filter: `game_id=eq.${gameId}`,
                },
                (payload) => {
                    console.log('New move received:', payload.new);
                    setFen(payload.new.fen_after);
                    setMoves(prev => {
                        // Avoid duplicates if we are the one who made the move
                        if (prev[prev.length - 1] === payload.new.notation) return prev;
                        return [...prev, payload.new.notation];
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'games',
                    filter: `id=eq.${gameId}`,
                },
                (payload) => {
                    setGameStatus(payload.new.status);
                    setDrawOfferedBy(payload.new.draw_offered_by);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [gameId, gameStatus, cleanupMoves]);

    const handleResign = async () => {
        if (!gameId || gameId === 'local-game' || !playerColor) return;
        if (!confirm('Are you sure you want to resign?')) return;

        await supabase.from('games').update({
            status: 'finished',
            winner_id: playerColor === 'white' ? null : null // logic could be improved to set opponent
        }).eq('id', gameId);

        await cleanupMoves();
    };

    const handleOfferDraw = async () => {
        if (!gameId || gameId === 'local-game' || !playerColor) return;
        await supabase.from('games').update({ draw_offered_by: playerColor }).eq('id', gameId);
    };

    const handleAcceptDraw = async () => {
        if (!gameId || gameId === 'local-game') return;
        await supabase.from('games').update({
            status: 'draw',
            draw_offered_by: null
        }).eq('id', gameId);
        await cleanupMoves();
    };

    const handleDeclineDraw = async () => {
        if (!gameId || gameId === 'local-game') return;
        await supabase.from('games').update({ draw_offered_by: null }).eq('id', gameId);
    };

    const downloadHistoryJson = () => {
        const data = {
            game_id: gameId,
            moves: moves,
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess-game-${gameId}.json`;
        a.click();
    };

    const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (json.moves && Array.isArray(json.moves)) {
                    setReplayMoves(json.moves);
                    setReplayMode(true);
                    setReplayIndex(-1);
                    setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                }
            } catch {
                alert('Invalid JSON file');
            }
        };
        reader.readAsText(file);
    };

    const advanceReplay = () => {
        if (replayIndex < replayMoves.length - 1) {
            const nextIndex = replayIndex + 1;
            setReplayIndex(nextIndex);

            // Reconstruct FEN using a temporary chess instance
            const temp = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            for (let i = 0; i <= nextIndex; i++) {
                temp.move(replayMoves[i]);
            }
            setFen(temp.fen());
        }
    };

    const backReplay = () => {
        if (replayIndex >= 0) {
            const nextIndex = replayIndex - 1;
            setReplayIndex(nextIndex);
            const temp = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            for (let i = 0; i <= nextIndex; i++) {
                temp.move(replayMoves[i]);
            }
            setFen(temp.fen());
        }
    };

    const exitReplay = () => {
        setReplayMode(false);
        // Refresh state from DB
        router.refresh();
    };

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return <main><h1>Loading Game...</h1></main>;

    return (
        <main>
            <div className="glass-card" style={{ maxWidth: '1000px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <button onClick={() => router.push('/')} className="btn" style={{ background: 'transparent', padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', border: 'none', cursor: 'pointer' }}>
                        <ArrowLeft size={20} /> Back
                    </button>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: 0 }}>{replayMode ? 'Game Replay' : 'Online Match'}</h2>
                        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.8rem' }}>ID: {gameId}</p>
                    </div>
                    <span className={`status-badge ${replayMode ? 'replay' : gameStatus}`} style={{ padding: '0.4rem 0.8rem', borderRadius: '1rem', background: replayMode ? 'rgba(59, 130, 246, 0.2)' : (gameStatus === 'playing' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'), border: '1px solid currentColor', color: replayMode ? '#3b82f6' : (gameStatus === 'playing' ? '#22c55e' : '#f59e0b'), fontSize: '0.75rem', fontWeight: 700 }}>
                        {replayMode ? 'REPLAY' : gameStatus.toUpperCase()}
                    </span>
                </div>

                <div className="game-grid">
                    <div>
                        <ChessGame
                            initialFen={fen}
                            onMove={replayMode ? undefined : handleMove}
                            orientation={playerColor || 'white'}
                            playerColor={playerColor}
                        />
                    </div>

                    <div className="game-controls">
                        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: 0, height: '100%', background: 'rgba(0,0,0,0.2)' }}>
                            <h3>Game Info</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ opacity: 0.7 }}>Your Color:</span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{playerColor ? playerColor.toUpperCase() : 'SPECTATOR'}</span>
                                </div>

                                <button
                                    onClick={copyLink}
                                    className="btn"
                                    style={{ width: '100%', background: 'var(--secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {copied ? 'Copied!' : <><Share2 size={16} /> Copy Invite Link</>}
                                </button>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <button onClick={downloadHistoryJson} className="btn" style={{ flex: 1, fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }}>
                                        Export JSON
                                    </button>
                                    <label className="btn" style={{ flex: 1, fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', textAlign: 'center', cursor: 'pointer' }}>
                                        Import JSON
                                        <input type="file" accept=".json" onChange={handleJsonUpload} style={{ display: 'none' }} />
                                    </label>
                                </div>

                                {replayMode && (
                                    <div className="glass-card" style={{ padding: '1rem', background: 'var(--primary)', border: '1px solid var(--primary)' }}>
                                        <p style={{ textAlign: 'center', marginBottom: '1rem' }}>Replay Controls</p>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={backReplay} className="btn" style={{ flex: 1 }}>Prev</button>
                                            <button onClick={advanceReplay} className="btn" style={{ flex: 1 }}>Next</button>
                                            <button onClick={exitReplay} className="btn" style={{ flex: 1, background: '#ef4444' }}>Exit</button>
                                        </div>
                                        <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.8rem' }}>Move {replayIndex + 1} of {replayMoves.length}</p>
                                    </div>
                                )}

                                {gameStatus === 'playing' && playerColor && (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={handleResign} className="btn" style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444' }}>
                                            Resign
                                        </button>
                                        {!drawOfferedBy ? (
                                            <button onClick={handleOfferDraw} className="btn" style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#3b82f6' }}>
                                                Offer Draw
                                            </button>
                                        ) : drawOfferedBy !== playerColor ? (
                                            <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                                                <button onClick={handleAcceptDraw} className="btn" style={{ flex: 1, background: '#22c55e', color: 'white', fontSize: '0.8rem' }}>Accept 1/2</button>
                                                <button onClick={handleDeclineDraw} className="btn" style={{ flex: 1, background: '#ef4444', color: 'white', fontSize: '0.8rem' }}>Decline</button>
                                            </div>
                                        ) : (
                                            <div className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white', opacity: 0.5, cursor: 'not-allowed', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                Draw Offered...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '2rem' }}>
                                <h4 style={{ marginBottom: '1rem', opacity: 0.7 }}>Move History</h4>
                                <div className="move-history" style={{ maxHeight: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                    {(replayMode ? replayMoves.slice(0, replayIndex + 1) : moves).map((m, i) => (
                                        <div key={i} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.9rem' }}>
                                            {i % 2 === 0 ? <span style={{ opacity: 0.4, marginRight: '0.5rem' }}>{Math.floor(i / 2) + 1}.</span> : ''}
                                            <span style={{ fontWeight: 600 }}>{m}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
