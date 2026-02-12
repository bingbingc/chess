'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChessGame from '@/components/ChessBoard';
import { supabase } from '@/lib/supabase';
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

                // Determine player color based on user session
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    if (user.id === game.white_player_id) setPlayerColor('white');
                    else if (user.id === game.black_player_id) setPlayerColor('black');
                }
            }
            setLoading(false);
        };

        if (gameId) fetchGame();

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
        };
    }, [gameId]);

    const handleMove = useCallback(async (move: { san: string; from: string; to: string; before: string; after: string }) => {
        // Only persist move if it's an online game and it's the player's turn (simplified check)
        if (!gameId || gameId === 'local-game') return;

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
            await supabase.from('games').update({ fen: move.after }).eq('id', gameId);
        }
    }, [gameId, moves.length]);

    const handleResign = async () => {
        if (!gameId || gameId === 'local-game' || !playerColor) return;
        if (!confirm('Are you sure you want to resign?')) return;

        await supabase.from('games').update({
            status: 'finished',
            winner_id: playerColor === 'white' ? null : null // Should ideally set the opponent ID
        }).eq('id', gameId);
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
    };

    const handleDeclineDraw = async () => {
        if (!gameId || gameId === 'local-game') return;
        await supabase.from('games').update({ draw_offered_by: null }).eq('id', gameId);
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
                        <h2 style={{ margin: 0 }}>Online Match</h2>
                        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.8rem' }}>ID: {gameId}</p>
                    </div>
                    <span className={`status-badge ${gameStatus}`} style={{ padding: '0.4rem 0.8rem', borderRadius: '1rem', background: gameStatus === 'playing' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)', border: '1px solid currentColor', color: gameStatus === 'playing' ? '#22c55e' : '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>
                        {gameStatus.toUpperCase()}
                    </span>
                </div>

                <div className="game-grid">
                    <div>
                        <ChessGame
                            initialFen={fen}
                            onMove={handleMove}
                            orientation={playerColor || 'white'}
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
                                    {moves.map((m, i) => (
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
